/**
 * Web wooden-fish overlay, node half. The empty apply exists so the plugin
 * appears in the host Loader; the browser half ships via exports["./client"].
 * User prefs are not Host yaml — they live in the browser store.
 */
export {
  ART_TUNABLES, Config, Prefs, resolveMuyuConfig, resolveMuyuPrefs,
} from './config.ts'
export type {
  MuyuArtTunables, MuyuConfig, MuyuPrefs, ResolvedMuyuConfig, ResolvedMuyuPrefs,
} from './config.ts'

/** Host plugin body — no host-side behavior for this overlay. */
export function apply(): void {}
