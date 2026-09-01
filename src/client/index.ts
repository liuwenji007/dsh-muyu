/**
 * Wooden-fish overlay, browser half: one `shell.overlay` list entry and a
 * `settings.section` page. Prefs persist in the exclusive store, not Host yaml.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { MuyuOverlay } from './MuyuOverlay.tsx'
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

type LocaleFace = {
  language?: string
  locale?: string
  t?: (ns: string, key: string) => string
  text?: (ns: string, key: string) => string
}

/**
 * Nav label that follows the live UI language.
 * @param ctx - client context with an optional locale service.
 */
function sectionLabel(ctx: ClientContext): string {
  const locale = ctx.get('locale') as LocaleFace | undefined
  const translated = locale?.t?.(NS, 'settings.nav') ?? locale?.text?.(NS, 'settings.nav')
  if (typeof translated === 'string' && translated !== '' && translated !== 'settings.nav') {
    return translated
  }
  const lang = locale?.language ?? locale?.locale ?? ''
  return lang.toLowerCase().startsWith('en') ? en['settings.nav'] : zh['settings.nav']
}

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
  }, MuyuOverlay))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'muyu',
    order: 80,
    locale: NS,
    label: () => sectionLabel(ctx),
    store,
  }, MuyuSettings))
}
