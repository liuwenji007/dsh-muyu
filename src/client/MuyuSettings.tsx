/**
 * Settings section: feel prefs + optional custom art base URL.
 * Writes the exclusive store; does not touch Host yaml or settingsScope.
 */
import { resolveMuyuPrefs, type MuyuPrefs } from '../config.ts'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createMuyuStore } from './stores.ts'
import css from './MuyuSettings.module.css'

/** Composed settings-page props. */
export type MuyuSettingsProps =
  & PropsStore<ReturnType<typeof createMuyuStore>>
  & PropsLocale<'muyu'>

/**
 * Wooden-fish prefs form.
 * @param props - store and locale.
 */
export function MuyuSettings({ useStore, actions, t }: MuyuSettingsProps) {
  const prefs = useStore(s => s.prefs ?? resolveMuyuPrefs())

  const patch = (next: MuyuPrefs) => {
    try {
      resolveMuyuPrefs({ ...prefs, ...next })
    } catch {
      return
    }
    actions.setPrefs(next)
  }

  const onNumber = (key: 'autoDelayMs' | 'autoIntervalMs' | 'comboThreshold') => (
    event: { currentTarget: { value: string } },
  ) => {
    const n = Number(event.currentTarget.value)
    if (!Number.isFinite(n)) return
    patch({ [key]: n })
  }

  return (
    <form className={css.page} onSubmit={(event) => { event.preventDefault() }}>
      <h2 className={css.title}>{t('settings.title')}</h2>

      <section className={css.section} aria-label={t('settings.section.feel')}>
        <h3 className={css.sectionTitle}>{t('settings.section.feel')}</h3>

        <label className={`${css.field} ${css.inline}`}>
          <input
            className={css.check}
            type="checkbox"
            checked={prefs.enabled}
            onChange={(event) => { patch({ enabled: event.currentTarget.checked }) }}
          />
          <span className={css.label}>{t('settings.enabled')}</span>
        </label>
        <p className={css.hint}>{t('settings.enabled.hint')}</p>

        <label className={css.field}>
          <span className={css.label}>{t('settings.plaque')}</span>
          <select
            className={css.select}
            value={prefs.plaque}
            onChange={(event) => {
              const value = event.currentTarget.value
              if (value === 'board' || value === 'censer') patch({ plaque: value })
            }}
          >
            <option value="censer">{t('settings.plaque.censer')}</option>
            <option value="board">{t('settings.plaque.board')}</option>
          </select>
        </label>

        <label className={css.field}>
          <span className={css.label}>{t('settings.autoDelayMs')}</span>
          <div className={css.controlRow}>
            <input
              className={`${css.input} ${css.inputNarrow}`}
              type="number"
              min={0}
              step={1}
              value={prefs.autoDelayMs}
              onChange={onNumber('autoDelayMs')}
            />
            <span className={css.suffix}>{t('settings.ms')}</span>
          </div>
        </label>

        <label className={css.field}>
          <span className={css.label}>{t('settings.autoIntervalMs')}</span>
          <div className={css.controlRow}>
            <input
              className={`${css.input} ${css.inputNarrow}`}
              type="number"
              min={1}
              step={1}
              value={prefs.autoIntervalMs}
              onChange={onNumber('autoIntervalMs')}
            />
            <span className={css.suffix}>{t('settings.ms')}</span>
          </div>
        </label>

        <label className={css.field}>
          <span className={css.label}>{t('settings.comboThreshold')}</span>
          <input
            className={`${css.input} ${css.inputNarrow}`}
            type="number"
            min={1}
            step={1}
            value={prefs.comboThreshold}
            onChange={onNumber('comboThreshold')}
          />
        </label>
      </section>

      <section className={css.section} aria-label={t('settings.section.art')}>
        <h3 className={css.sectionTitle}>{t('settings.section.art')}</h3>
        <label className={css.field}>
          <span className={css.label}>{t('settings.artBaseUrl')}</span>
          <input
            className={css.input}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder={t('settings.artBaseUrl.placeholder')}
            value={prefs.artBaseUrl ?? ''}
            onChange={(event) => { patch({ artBaseUrl: event.currentTarget.value }) }}
          />
        </label>
        <p className={css.hint}>{t('settings.artBaseUrl.hint')}</p>
      </section>
    </form>
  )
}
