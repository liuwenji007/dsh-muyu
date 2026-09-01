# dsh-muyu

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)
[![npm version](https://img.shields.io/npm/v/dsh-muyu)](https://www.npmjs.com/package/dsh-muyu)
[![npm downloads](https://img.shields.io/npm/dm/dsh-muyu)](https://www.npmjs.com/package/dsh-muyu)

[中文](README.md) | English

Harness is still preview. Capacity feels tight, the API sometimes crawls, and a loop can die mid-turn. Waiting those minutes gets under your skin — so here is a sulky little blue whale in the corner. Knock her once for a merit while you wait. Hope the compute farms catch up and the prices come down. When she is busy she knocks herself; AFK merit, goof off a little.

Wooden-fish overlay in the lower-right of the Web client. Knock the head for merit; while the model is thinking or streaming she knocks on her own. Merit stays in this browser — never the session log, never an extra request. Swap the art if you want.

| Manual | Auto |
| --- | --- |
| ![tap](docs/tap.gif) | ![auto-tap](docs/auto-tap.gif) |

## Play

- Click the head: +1 merit. Enough knocks in a row and she bumps.
- While the current session is busy: auto-knocks also score (about 1 merit per second by default).
- Switch session: the plaque shows that session's count (0 if unseen); pose resets.
- Plaque is censer or board (default censer). Exact digits through 9999, then `Nk`.
- `prefers-reduced-motion` skips the hop and the floating +1.

Tune feel and packs in **Settings → Wooden fish**. **Library** to import/switch; **Edit** to align; remote URL for hosted packs.

Community skins: **[dsh-muyu-skins](https://github.com/liuwenji007/dsh-muyu-skins)** (import zip → Library → Use).

## Install

You need a working `dsh web` (DeepSeek Harness).

**Requires dsh ≥ 0.1.0-rc.8 (recommend 0.1.1-rc.2).** `dsh-muyu` **0.1.5+** needs `@deepseek-ai/dsh-client-store` in the host module table.

Upgrade in pairs — the market will not block a mismatched bump:

| Host | This plugin | Result |
| --- | --- | --- |
| new (has `dsh-client-store`) | ≥ 0.1.5 | OK |
| new | ≤ 0.1.4 | `dsh-client-runtime/client` missed the module table |
| old (only `dsh-client-runtime/client`) | ≤ 0.1.4 | OK |
| old | ≥ 0.1.5 | `dsh-client-store` missed the module table |

**Do not bump only the fish to 0.1.5 on an old dsh** — upgrade the host first, then the plugin; or pin `dsh-muyu@0.1.4` until you can.

Check the host first:

```bash
dsh --version
# if too old: npm i -g @deepseek-ai/dsh@latest
```

### From npm (recommended)

```bash
dsh plugin --profile web add dsh-muyu
dsh --profile web
```

Already installed: update from Plugin Market, or `dsh plugin --profile web add dsh-muyu@latest`, then restart Web. The published tarball already contains `lib/`, so `allowBuilds` is usually unnecessary.

### From GitHub

```bash
dsh plugin --profile web add github:liuwenji007/dsh-muyu
dsh --profile web
```

pnpm ≥10 may block a git dependency's `prepare`. After the first failure, add the package key pnpm printed to that profile's `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  dsh-muyu: true
```

Then `add` again. Prefer pinning a commit: `github:liuwenji007/dsh-muyu#<sha>`.

### Local link (development)

```bash
cd /abs/path/to/dsh-muyu
pnpm install
dsh plugin --profile web add link:/abs/path/to/dsh-muyu
dsh --profile web
```

### Verify and remove

- Working: the fish is in the corner, or `dsh --profile web --dump-config` lists this package. A page refresh is not enough — restart `dsh web` / `dsh --profile web`.
- Remove: `dsh plugin --profile web remove dsh-muyu`, then restart. Remove does **not** wipe browser merit or library packs; reinstall restores them. To erase everything, use **Settings → Wooden fish → Data → Clear all wooden-fish data**.

### Troubleshooting

| If | Then |
| --- | --- |
| `dsh-client-runtime/client` or `dsh-client-store` missed the module table | Host/plugin mismatch: new host needs **≥ 0.1.5**; on an old host upgrade **dsh ≥ 0.1.0-rc.8** then the plugin (or pin `dsh-muyu@0.1.4`); Market update or `add dsh-muyu@…`, restart Web |
| two overlays | The Web bundle may already ship `ui-muyu`. In the profile `cordis.patch.yml`, set `- id: ui-muyu` / `disabled: true` |
| git install hits `allowBuilds` | See “From GitHub” above |
| prefer a tarball | `pnpm pack`, then `dsh plugin add ./dsh-muyu-0.1.0.tgz` |

## Settings

| Field | Default | Meaning |
| --- | --- | --- |
| Show overlay | on | Off hides the sprite; the settings page stays |
| Plaque | censer | Censer or wooden board |
| First auto-knock after busy | 1000 ms | |
| Auto-knock interval | 1000 ms | |
| Big-bump combo | 5 | Release at or above this plays big bump, then recover (or small bump if that sprite is missing) |
| Art source | built-in | Built-in / workshop / library / URL |
| Library | (empty) | Imported zips / packs saved from the workshop; switch, rename, delete |
| Local workshop | (empty) | Folder or PNGs to align; export an aligned pack or save into the library |
| Pack URL | (empty) | Hosted directory or `.zip` URL; optional `layout.json` |
| Export aligned pack | — | Under the workshop; bakes pose crops and writes `layout.json` so others can import and use it |

Files in that folder or zip: `idle.png`, `auto-hit.png`, `manual-hit.png`, `bump.png`, `bump-big.png`, `stick.png`, `board.png`, `censer.png`, `add.png`. Optional `bump-recover.png` and `layout.json`. Aligned packs bake pose crops into the PNGs; `layout.json` mainly carries hotzone / stick / float / plaque placement. Changes apply immediately — no reinstall.

**Settings → Wooden fish → Export template** downloads the official filenames zip; after aligning, use **Export aligned pack** under the workbench to share. A zip URL needs CORS on the host.

The workshop and library are separate: importing a zip adds a library entry and does not wipe files you are editing.

Bump hold and auto-hit pose length stay matched to the default art — edit `ART_TUNABLES` in [`src/config.ts`](src/config.ts) and `pnpm run build`. Stick hotspot and hotzone are tunable in the workbench / `layout.json`.

## Notes

- Merit lives in this browser's `localStorage` (`dsh.muyu.merit`), capped at the 100 most recently knocked sessions. Workshop drafts and library packs live in IndexedDB (`dsh.muyu.art`), separate from the URL field. Deleting a chat in the Host does not prune it. Private mode or quota failure only disables persistence on this page. After reinstall, if **meaningful** old data is found (merit knocked, prefs changed, or a non-empty library), you get a one-time prompt; choosing Keep using stores `dsh.muyu.dataPrompt`.
- No dragging, so it does not cover the side panel.
- You can also replace files under `src/client/assets/` and rebuild to ship a new default skin.

## This repo

```bash
pnpm install
pnpm test
pnpm run build
```

MIT
