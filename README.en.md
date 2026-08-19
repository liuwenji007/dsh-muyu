# dsh-muyu

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

Tune feel and art in **Settings → Wooden fish** (on/off, plaque, auto-knock timing, combo threshold, custom art base URL).

## Install

You need a working `dsh web` (DeepSeek Harness).

### From npm (recommended)

```bash
dsh plugin --profile web add dsh-muyu
dsh --profile web
```

Restart the Web client; the fish should appear in the lower-right. The published tarball already contains `lib/`, so `allowBuilds` is usually unnecessary.

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
- Remove: `dsh plugin --profile web remove dsh-muyu`, then restart.

### Troubleshooting

| If | Then |
| --- | --- |
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
| Big-bump combo | 5 | Release at or above this plays big bump, then small |
| Custom art base URL | (empty) | CDN/static folder URL; blank keeps packaged sprites |

Files under that prefix: `idle.png`, `auto-hit.png`, `manual-hit.png`, `bump.png`, `bump-big.png`, `stick.png`, `board.png`, `censer.png`, `add.png`. Changes apply immediately — no reinstall.

Bump hold, auto-hit pose length, and the stick hotspot stay matched to the default art. Edit `ART_TUNABLES` in [`src/config.ts`](src/config.ts) and `pnpm run build`.

## Notes

- Merit lives in this browser's `localStorage` (`dsh.muyu.merit`), capped at the 100 most recently knocked sessions. Deleting a chat in the Host does not prune it. Private mode or quota failure only disables persistence on this page.
- No dragging, so it does not cover the side panel.
- You can also replace files under `src/client/assets/` and rebuild to ship a new default skin.

## This repo

```bash
pnpm install
pnpm test
pnpm run build
```

MIT
