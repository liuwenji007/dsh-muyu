/**
 * One-time modal when persisted muyu data is found after install/reinstall.
 */
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { acknowledgeDataPrompt, clearAllMuyuData } from './muyu-data.ts'
import type { createMuyuStore } from './stores.ts'
import css from './MuyuSettings.module.css'

export type MuyuDataPromptProps =
  & PropsStore<ReturnType<typeof createMuyuStore>>
  & PropsLocale<'muyu'>
  & {
    onClose: () => void
  }

/**
 * Ask whether to keep or wipe leftover browser data.
 * @param props - store actions, locale, and close callback.
 */
export function MuyuDataPrompt({ actions, t, onClose }: MuyuDataPromptProps) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const onKeep = () => {
    if (busy) return
    acknowledgeDataPrompt('kept')
    onClose()
  }

  const onFresh = () => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    void (async () => {
      try {
        await clearAllMuyuData()
        actions.resetAll()
        onClose()
      } catch {
        setFailed(true)
        setBusy(false)
      }
    })()
  }

  return (
    <div
      className={css.dialogBackdrop}
      role="presentation"
      onClick={() => { if (!busy) onKeep() }}
    >
      <div
        className={css.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="muyu-data-prompt-title"
        onClick={(event) => { event.stopPropagation() }}
      >
        <div className={css.dialogHead}>
          <h4 className={css.dialogTitle} id="muyu-data-prompt-title">
            {t('dataPrompt.title')}
          </h4>
          <p className={css.dialogBody}>{t('dataPrompt.body')}</p>
        </div>
        {failed && (
          <div className={css.dialogContent}>
            <p className={css.dialogWarn} role="alert">{t('dataPrompt.fail')}</p>
          </div>
        )}
        <div className={css.dialogActions}>
          <Button variant="primary" size="sm" type="button" disabled={busy} onClick={onKeep}>
            {t('dataPrompt.keep')}
          </Button>
          <button className={css.dangerBtn} type="button" disabled={busy} onClick={onFresh}>
            {busy ? t('dataPrompt.busy') : t('dataPrompt.fresh')}
          </button>
        </div>
      </div>
    </div>
  )
}
