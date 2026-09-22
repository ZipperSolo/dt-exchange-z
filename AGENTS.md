# AGENTS.md

## What this is

Darktide Armoury Exchange — a browser extension (Chrome MV3 + Firefox) that renders
your Warhammer 40k: Darktide in-game shops (Armoury Exchange and Melk's
Requisitorium) inside the official accounts page, and highlights items matching
user-defined rule-based filters (blessing/perk/stat/rating criteria).

## Stack

- TypeScript (extends `@tsconfig/strictest`), React 19, SWR, `webextension-polyfill`
- Build: esbuild via `bin/build.mjs` — bundles `src/bundle.tsx` + `src/background.ts` into `extension/`
- Test: vitest
- Format: oxfmt — **tabs, no semicolons**

## Commands

```sh
npm install
npm start          # build in watch mode
npm run build      # bundle + zip per-browser builds into builds/
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run fmt        # oxfmt .
npm run server     # build + run the notification server (needs server.config.json)
```

## How it works

1. **Injection** — `src/bundle.tsx` is a content script on
   `https://accounts.atoma.cloud/*` (run_at `document_start`). A MutationObserver
   waits for the "Account Details" panel, clones it, and mounts the React app inside.
2. **Auth is not handled here.** `getFatSharkUser()` (in `src/utils.ts`) reads the
   FatShark session from `localStorage.user` — `{ AccessToken, RefreshToken,
ExpiresIn, Sub, ... }` — set by accounts.atoma.cloud's own login. The extension
   never logs in and never refreshes tokens; it just uses the `AccessToken` verbatim.
   (The server does refresh — see the gotcha below.)
3. **API** — `createFetcher(user)` adds `Authorization: Bearer <AccessToken>` and
   fetches against `https://bsp-td-prod.atoma.cloud`:
   - `/web/:sub/summary` — account + characters
   - `/store/storefront/{credits|marks}_store_{archetype}?accountId=:sub&personal=true&characterId={id}` — shop offers
   - `/master-data/meta/items` then its `playerItems.href` — item master data
4. **Filtering** — rule JSON (see `docs/rule-based-filtering.md`) is stored in
   localStorage, evaluated per offer by `filterFunc` in `src/filter.ts`; `Store.tsx`
   calls it and writes the result to `offer.description.overrides.filter_match`.

## Key files

| Path                                                                   | Role                                                                  |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/bundle.tsx`                                                       | entry; DOM injection; mounts `<App/>`                                 |
| `src/background.ts`                                                    | toolbar button → opens the dashboard                                  |
| `src/components/App.tsx`, `Layout.tsx`                                 | top-level UI                                                          |
| `src/components/Store.tsx`                                             | fetch + render; calls `filterFunc`                                    |
| `src/components/RuleBasedFilters/`                                     | rule editor UI + JSON↔form conversion                                 |
| `src/components/Item/utils.ts`                                         | resolves blessing/perk description strings                            |
| `src/utils.ts`                                                         | `createFetcher`, `getFatSharkUser`, small helpers                     |
| `src/hooks/use*.ts`                                                    | SWR wrappers around the API                                           |
| `src/types.ts`                                                         | API + filter-rule types                                               |
| `src/filter.ts`                                                        | shared rule matching (`filterFunc`), used by both UI and server       |
| `src/server.ts`                                                        | Node server: polls shops, matches rules, posts new matches to Discord |
| `bin/build-server.mjs`                                                 | bundles `src/server.ts` → `server.mjs`                                |
| `server.config.example.json`                                           | template for `server.config.json` (gitignored)                        |
| `src/localisation.json`, `trait_templates.json`, `buff_templates.json` | bundled game data for names/descriptions                              |
| `bin/build.mjs`                                                        | esbuild config; merges manifests and zips per-browser builds          |
| `manifests/*.json`                                                     | per-browser manifest overrides over `extension/manifest.json`         |

## Conventions & gotchas

- **Formatting is tabs, no semicolons** (oxfmt). `.editorconfig` says 2-space and is
  stale — trust `npm run fmt`.
- TypeScript is `@tsconfig/strictest` with `exactOptionalPropertyTypes: false`.
- `localisation` is a `Proxy`: missing keys resolve to `"<scope.key>"` instead of
  throwing. Don't assume every id exists.
- `filterFunc` is pure (returns the match index); `Store.tsx` writes that into
  `offer.description.overrides.filter_match`.
- `data/items.json` is **not** used at runtime (master data is fetched from the API);
  treat it as a possibly-stale dump.
- The extension has no token refresh — it relies on the page session staying
  logged in. The server (`src/server.ts`) does auto-refresh: `GET
https://login.shr-prod-identity.fatshark.services/queue/refresh` with
  `Authorization: Bearer <RefreshToken>`, ~5 min before `RefreshAt`, then persists
  the rotated tokens back to `server.config.json`.
- `src/filter.ts` is the single source of truth for rule matching; change it in one
  place only.
- Curio primary stat lives in `offer.description.overrides.traits[0]` (innate trait),
  not `base_stats`. Its `value` = `baseItemLevel / 100`. Displayed max rolls map to
  `baseItemLevel`: 17% Toughness = 80, 21% Health = 80, +3 Stamina = 75+.
- Tests are minimal (`src/*.test.ts`); no UI tests.
