# Darktide Armoury Exchange Extension

## [Chrome Extension](https://chrome.google.com/webstore/detail/armoury-exchange/hcjihmkcnjkfkaeebhnpjcnnibpoolgc) | [Firefox Addon](https://addons.mozilla.org/en-GB/firefox/addon/armoury-exchange/)

## Usage

1. Install the extension in the browser of your choice, either through the official store or from the source to get the latest versions earlier
2. Navigate to the official Darktide accounts page: https://accounts.atoma.cloud

## Installing from source

1. Download the source
   - Clone this repo and follow the Development steps
   - [Download the auto-generated latest build](https://github.com/danreeves/dt-exchange/releases/tag/latest) from the releases page
2. Follow the instructions for your browser:
   - [Chrome/Opera/Edge](https://developer.chrome.com/docs/extensions/mv3/getstarted/development-basics/#load-unpacked)
   - [Firefox](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Your_first_WebExtension#installing)

## Development

Dependencies: node & npm

1. `npm install`
2. `npm start`
3. The `src/` directory is now being bundled into the `extension/` directory on change

## Server notifications

Runs outside the browser, polls the shops, and posts new matches to a Discord webhook.

1. `cp server.config.example.json server.config.json`
2. Fill in `user` — on https://accounts.atoma.cloud open DevTools Console and run
   `copy(JSON.parse(localStorage.getItem('user')))`, then paste the result as the
   `user` value. The server auto-refreshes ~5 minutes before expiry and writes the
   new tokens back to `server.config.json`.
3. Fill in `discordWebhook` and `rules` (the same JSON as the extension's rule-based
   filters — see `docs/rule-based-filtering.md`).
4. `npm run server`

It notifies once per new matching offer (state in `seen.json`), and polls every
`pollIntervalMs` milliseconds. `dryRun: true` (or `DRY_RUN=1`) logs matches without
posting to Discord.

To run it always-on, build once (`npm run server:build` produces a self-contained
`server.mjs`) and run it under a systemd user service (or cron). Example unit,
`~/.config/systemd/user/dt-exchange.service`:

```ini
[Unit]
Description=Darktide Armoury Exchange notifier
After=network-online.target

[Service]
ExecStart=/usr/bin/node /path/to/dt-exchange/server.mjs
WorkingDirectory=/path/to/dt-exchange
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
```

Enable with `systemctl --user enable --now dt-exchange.service` (and
`loginctl enable-linger` so it runs without a login session).

### Contributors

- [Dan Reeves](https://github.com/danreeves)
- [Coconutcoo](https://github.com/Coconutcoo)
- [errnoh](https://github.com/errnoh)
- [Chris Bitler](https://github.com/Chris-Bitler)
- [CautemocSg](https://github.com/CautemocSg)
- [Duncan Krassikoff](https://github.com/dkrassikoff)
