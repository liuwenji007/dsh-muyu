/**
 * Wooden-fish overlay, browser half: one `shell.overlay` list entry.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { resolveMuyuConfig, type MuyuConfig } from '../config.ts'
import { POSE_SRC, STICK_SRC, PLAQUE_SRC, ADD_SRC } from './assets/poses.ts'
import { MuyuWidget, type MuyuInjected } from './MuyuWidget.tsx'
import { createMuyuStore } from './stores.ts'
import { en, zh, type MuyuKey } from './locales.ts'

export { createMuyuStore } from './stores.ts'
export { Config } from '../config.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Wooden-fish overlay copy. */
    muyu: MuyuKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'muyu'

/** Required services: the slot registry and overlay copy. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register dictionaries and the overlay entry.
 * @param ctx - client root context.
 * @param config - overlay tunables (schema defaults applied).
 */
export function apply(ctx: ClientContext, config: MuyuConfig = {}): void {
  const tunables = resolveMuyuConfig(config)
  if (!tunables.enabled) return

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-muyu: dictionaries')

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'muyu',
    order: 50,
    locale: NS,
    store: createMuyuStore,
    inject: (): MuyuInjected => ({
      tunables,
      poseSrc: POSE_SRC,
      stickSrc: STICK_SRC,
      plaqueSrc: PLAQUE_SRC[tunables.plaque],
      addSrc: ADD_SRC,
    }),
  }, MuyuWidget))
}
