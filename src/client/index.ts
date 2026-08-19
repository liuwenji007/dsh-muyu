/**
 * Wooden-fish overlay, browser half: one `shell.overlay` list entry and a
 * `settings.section` page. Prefs persist in the exclusive store, not Host yaml.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { POSE_SRC, STICK_SRC, ADD_SRC } from './assets/poses.ts'
import { MuyuWidget, type MuyuInjected } from './MuyuWidget.tsx'
import { MuyuSettings } from './MuyuSettings.tsx'
import { createMuyuStore } from './stores.ts'
import { en, zh, type MuyuKey } from './locales.ts'

export { createMuyuStore } from './stores.ts'
export { Prefs } from '../config.ts'

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
 * Client plugin body: register dictionaries, the overlay, and the settings page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const handle = createMuyuStore()
  const store = () => handle

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-muyu: dictionaries')

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'muyu',
    order: 50,
    locale: NS,
    store,
    inject: (): MuyuInjected => ({
      poseSrc: POSE_SRC,
      stickSrc: STICK_SRC,
      addSrc: ADD_SRC,
    }),
  }, MuyuWidget))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'muyu',
    order: 80,
    locale: NS,
    label: 'settings.nav',
    store,
  }, MuyuSettings))
}
