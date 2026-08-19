# dsh-muyu

English | [中文](README.zh.md)

Wooden-fish overlay for the DeepSeek Harness Web client: one `shell.overlay` list entry that pins a knockable whale sprite in the lower-right corner, with a stick cursor on the head hot zone and a per-session merit plaque. The character is a single sprite layer; the stick is never composited into the pose art. Knocks and merit stay in the browser store and never enter the session log.

Busy wait uses the current session's `running` bit from `useSessions` (the same `host/session-status` fact InputBar reads). After `autoDelayMs` the overlay auto-knocks once per `autoIntervalMs` until the session is idle: each auto-knock flashes `autoHit` for `autoHitMs` then returns to idle, and awards one merit. Auto-knocks do not raise combo or play bump. A pointer-down on the head awards one merit and one combo; release below `comboThreshold` plays the small bump, and a combo at or above the threshold plays big bump then small bump. Bump hold grows with the elapsed time of that manual combo, and each stage is capped at `bumpMaxMs` or `bumpBigMaxMs`. Recovery does not yield to auto-knock; a further press cancels recovery and keeps combo. Switching the current session resets pose and combo and shows that session's plaque (0 when unseen). The plaque prints the exact count through 9999 and `Nk` from 10000 up. `plaque` selects the wooden board or the incense censer (default censer). A knock that awards merit also floats `add.png` upward from the character.

Replace files in `src/client/assets/` and point [`poses.ts`](src/client/assets/poses.ts) at the new files; tsdown inlines `png`/`webp`/`gif`/`svg` imports as `data:` URLs inside the client bundle. `prefers-reduced-motion` still swaps sprites and skips the plaque hop and the floating +1.

`/client` exports are `apply` / `inject`, `Prefs`, and `createMuyuStore`.

This package is a **bundle** (`dsh.bundle` plus `dsh.client`). Installing it into a Web profile appends it to `dsh.profile.bundles`. Suggested GitHub topics: `dsh`, `dsh-plugin`, `deepseek-harness`.

## Install

```bash
pnpm install   # runs prepare and emits lib/index.js plus lib/client.js
dsh plugin --profile web add link:/abs/path/to/dsh-muyu
dsh --profile web
```

From GitHub after you publish the repo:

```bash
dsh plugin --profile web add github:<account>/dsh-muyu
```

pnpm ≥10 refuses a git dependency's `prepare` until it is allowlisted. After the first `add` fails, copy the package key pnpm printed into that profile's `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  dsh-muyu: true
```

Then re-run `add`. Treat that allowance as permission to execute the package at install time; pin a commit (`github:<account>/dsh-muyu#<sha>`) so a later push cannot change what runs.

From npm after `pnpm publish` (the tarball already contains `lib/`), users do not need `allowBuilds`:

```bash
dsh plugin --profile web add dsh-muyu
```

A `pnpm pack` tarball also works: `dsh plugin add ./dsh-muyu-0.1.0.tgz`.

If the Web bundle already ships an in-tree `ui-muyu` row, this package inserts a second overlay. Disable the in-tree row in the profile's `cordis.patch.yml`:

```yaml
- id: ui-muyu
  disabled: true
```

Harness is still pre-release: most `@deepseek-ai/dsh-*` peers are not on npm. Third-party installs use a source `dsh` checkout plus the `link:` form above until those packages are tagged.

## Config

Open **Settings → Wooden fish**. Prefs persist in the same browser store as merit (`localStorage` key `dsh.muyu.merit`). Host yaml `config` does not reach the browser fiber and is not the way to change feel.

| Field | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | When false, the overlay does not paint; the settings page stays |
| `plaque` | `censer` | Merit plaque art: `censer` or `board` |
| `autoDelayMs` | `1000` | Busy wait before the first auto-knock (ms) |
| `autoIntervalMs` | `1000` | Auto-knock interval while busy (ms) |
| `comboThreshold` | `5` | Manual knocks since idle that release into the big bump |

Bump hold, auto-hit pose length, and the stick-cursor hotspot are art constants in [`src/config.ts`](src/config.ts) (`ART_TUNABLES`). They stay matched to the shipped sprites; change them there and rebuild.

## Model Experience

None, as this overlay is a browser-only toy: knocks and merit never enter the session log, prompt, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Swap art in `poses.ts`** — replace files in `src/client/assets/` and point [`poses.ts`](src/client/assets/poses.ts) at them; that is an import-path change, not a slot change.
- **Merit is browser-local** — the exclusive store keeps per-session counts in `localStorage` under `dsh.muyu.merit`, capped at the 100 most recently awarded session ids (LRU on write). Deleted conversations are not removed when the Host session list changes. Reload and plugin-fiber remount rehydrate that map. A missing session id shows 0. Quota or private-mode storage failure disables persistence for this page only. Nothing is written to the session log.
- **No dragging** — the sprite stays in the lower-right corner so it does not cover the Cordis panel.

## Development

```bash
pnpm install
pnpm test
pnpm run build
```

`prepare` emits `lib/` from `src/` without a sibling harness checkout. The browser half is a CJS factory for the Cordis module table (`window.__ModuleLoader__.load`); PNG and CSS Modules land inside `lib/client.js`.

## Publishing

1. Push this directory to a public GitHub repository and add topics `dsh`, `dsh-plugin`, `deepseek-harness`.
2. After Harness has a tagged npm release, pin `peerDependencies` to that range and run `pnpm publish --access public`.
3. Post the install command in Harness Discussions (Show and tell). There is no official plugin marketplace; discovery is npm search, GitHub topics, and community lists.

## License

MIT
