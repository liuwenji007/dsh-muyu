/**
 * Shell overlay entry: data-restore prompt (always mountable) + wooden-fish widget.
 */
import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { MuyuDataPrompt } from './MuyuDataPrompt.tsx'
import { MuyuWidget } from './MuyuWidget.tsx'
import { shouldShowDataPrompt } from './muyu-data.ts'
import type { createMuyuStore } from './stores.ts'

export type MuyuOverlayProps =
  & PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createMuyuStore>>
  & PropsLocale<'muyu'>

/**
 * Overlay wrapper that shows the legacy-data prompt even when the fish is hidden.
 * @param props - forwarded overlay props.
 */
export function MuyuOverlay(props: MuyuOverlayProps) {
  const [promptOpen, setPromptOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void shouldShowDataPrompt().then((show) => {
      if (!cancelled) setPromptOpen(show)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <>
      {promptOpen && (
        <MuyuDataPrompt
          useStore={props.useStore}
          actions={props.actions}
          t={props.t}
          onClose={() => { setPromptOpen(false) }}
        />
      )}
      <MuyuWidget {...props} />
    </>
  )
}
