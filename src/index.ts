/**
 * Web wooden-fish overlay, node half. The empty apply exists so the plugin
 * appears in the host Loader; the browser half ships via exports["./client"].
 */
export { Config, resolveMuyuConfig } from './config.ts'
export type { MuyuConfig, ResolvedMuyuConfig } from './config.ts'

/** Host plugin body — no host-side behavior for this overlay. */
export function apply(): void {}
