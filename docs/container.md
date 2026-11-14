# Running the notifier in a container

The browser extension is not containerizable — it ships as a Chrome/Firefox
package. This is about the **server** (`src/server.ts`): the always-on poller that
matches shop offers against `server.config.json` rules and posts to Discord.

`Dockerfile` builds it multi-stage: `node:22-bookworm-slim` runs `npm ci` and
`npm run server:build` (esbuild needs a glibc host), then only the generated
`server.mjs` is copied into `node:22-alpine`. The bundle has no native
dependencies, so the runtime layer is just node plus one file (~175 MB).

## What the container needs from the host

Two files, both slowly rewritten at runtime, so both must be bind mounts and not
image layers:

- `server.config.json` — live FatShark tokens (the server writes the rotated pair
  back here every ~25 minutes) plus rules and the Discord webhook. Treat it as a
  secret: it is gitignored and must never be baked into an image.
- `seen.json` — the set of currently listed offers already notified. Losing it
  causes a re-notification burst for anything currently matching.

The container runs as uid/gid `1000:100` by default to match a typical Linux user
and keep the bind mount writable. Override at build time with
`--build-arg APP_UID=$(id -u) --build-arg APP_GID=$(id -g)`.

There is no exposed port. The process only makes outbound HTTPS calls.

## Build

```sh
docker build -t dt-exchange:local .                                  # or: npm run container:build
podman build --format docker -t dt-exchange:local .                  # podman: keeps the HEALTHCHECK
```

podman's default OCI image format silently drops `HEALTHCHECK` (build warns about
it). Use `--format docker`, or pass `--health-cmd "node /app/healthcheck.mjs"`
at `podman run` time — `compose.yaml` and `infra/dt-exchange-container.service`
already declare it explicitly.

## Configure

```sh
mkdir -p ~/dt-exchange
cp server.config.example.json ~/dt-exchange/server.config.json
chmod 600 ~/dt-exchange/server.config.json
# fill in "user" (from accounts.atoma.cloud localStorage) and "discordWebhook"
```

`user.RefreshAt` must be a past timestamp (or `0`) so the first poll refreshes the
tokens; `server.config.example.json` already ships `0`.

## Run

Podman (rootless, host user mapped in so the config stays writable):

```sh
podman run -d --name dt-exchange --replace \
  --userns=keep-id \
  -v ~/dt-exchange:/data:Z \
  -e CONFIG_FILE=/data/server.config.json \
  --restart unless-stopped \
  dt-exchange:local
```

Compose (either engine):

```sh
DT_EXCHANGE_DATA=$HOME/dt-exchange npm run container:up
npm run container:logs
```

Smoke-test without touching Discord — matches are logged, nothing is posted:

```sh
podman run --rm --userns=keep-id -v ~/dt-exchange:/data:Z \
  -e CONFIG_FILE=/data/server.config.json -e DRY_RUN=1 dt-exchange:local
```

## Health

`HEALTHCHECK` runs `scripts/container-healthcheck.mjs`. Because there is no port,
liveness is the same signal the runbook uses: `saveSeen()` rewrites `seen.json`
after the summary and every storefront fetch succeed, so a state file that keeps
advancing means polls are working. The check reports healthy while the file was
written within three poll intervals, and also while the container is younger than
`HEALTHCHECK_GRACE_SEC` (default 180s) so the first cycle isn't a false alarm.

```sh
podman healthcheck run dt-exchange
podman inspect -f '{{.State.Health.Status}}' dt-exchange
```

Empty `seen.json` (`[]`) is not a fault: it only holds *currently listed* matches.

## Migrating an existing systemd deployment

The deployed host currently runs the bundle directly under a systemd user unit
(`/home/jrz/dt-exchange/server.mjs`, `WorkingDirectory=/home/jrz/dt-exchange`).
Cutting over is a straight swap — point the container at the *same* data
directory so the live tokens carry over:

```sh
systemctl --user disable --now dt-exchange
podman run -d --name dt-exchange --replace --userns=keep-id \
  -v /home/jrz/dt-exchange:/data:Z \
  -e CONFIG_FILE=/data/server.config.json --restart unless-stopped dt-exchange:local
podman logs --tail 20 dt-exchange
```

**Never run both at once.** The two instances would share one `RefreshToken`, and
FatShark rotates it on use — the second refresh invalidates the first instance's
pair and the loser logs `token refresh failed: HTTP 401` until restarted. Stop the
unit before starting the container, and vice versa.

### The unit is NixOS-declared on the deployed host

On `mini`, `/etc/systemd/user/dt-exchange.service` is a symlink into
`/nix/store`, so `systemctl --user disable --now dt-exchange` only holds until the
next `nixos-rebuild switch` recreates and starts it — which would silently bring
back the second instance and the token fight above. Mask it instead, which writes
`~/.config/systemd/user/dt-exchange.service` → `/dev/null` and outranks `/etc`
across rebuilds:

```sh
systemctl --user disable --now dt-exchange
systemctl --user mask dt-exchange
```

Remove the unit from the Nix configuration when convenient; until then the mask is
what keeps a rebuild from resurrecting it. `podman-restart.service` is enabled on
the host, so a container started with `--restart unless-stopped` comes back after
a reboot without any unit of its own.

Rollback is the same command in reverse:

```sh
podman rm -f dt-exchange && systemctl --user start dt-exchange
```

### Keeping systemd as the supervisor

If the container should still be started by systemd rather than `--restart`
(so boot ordering and `RequiresMountsFor` keep working), use the same shape as the
other podman services on the host — see `infra/dt-exchange-container.service` for a
unit that runs `podman run` in the foreground with `podman stop` on shutdown.
