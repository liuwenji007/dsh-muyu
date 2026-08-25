/**
 * Settings section: feel prefs, local working pack, and remote URL/zip.
 * Writes the exclusive store; does not touch Host yaml or settingsScope.
 */
import { useEffect, useRef, useState } from 'react'
import { resolveMuyuPrefs, type MuyuPrefs } from '../config.ts'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { downloadBuiltinArtPack } from './art-pack.ts'
import { ArtWorkbench } from './ArtWorkbench.tsx'
import { initPoseLayout, type ArtFit, type ArtStage } from './art-fit.ts'
import {
  ART_PACK_MAX_ZIP_BYTES, collectArtPack, collectArtPackFromZip,
} from './art-files.ts'
import { clearArtPack, loadArtPack, saveArtPack, saveArtPackLayout, type StoredArtPack } from './art-idb.ts'
import type { ArtPackFile } from './art-pack.ts'
import type { createMuyuStore } from './stores.ts'
import css from './MuyuSettings.module.css'

/** Composed settings-page props. */
export type MuyuSettingsProps =
  & PropsStore<ReturnType<typeof createMuyuStore>>
  & PropsLocale<'muyu'>

type ImportStatus = 'idle' | 'ok' | 'fail' | 'missing' | 'empty'

const ART_SOURCE_KEYS = [
  ['builtin', 'settings.artSource.builtin'],
  ['local', 'settings.artSource.local'],
  ['url', 'settings.artSource.url'],
  ['zip', 'settings.artSource.zip'],
] as const

/** Copy FileList before clearing the input — the list is live and would go empty. */
function snapshotFiles(list: FileList | null): File[] {
  return list === null ? [] : Array.from(list)
}

function filesFromPicked(files: readonly File[]): Array<{ name: string; blob: Blob }> {
  return files.map((file) => ({
    name: file.webkitRelativePath !== '' ? file.webkitRelativePath : file.name,
    blob: file,
  }))
}

function bindDirectoryInput(el: HTMLInputElement | null): void {
  if (el === null) return
  el.webkitdirectory = true
  el.multiple = true
}

/**
 * Wooden-fish prefs form.
 * @param props - store and locale.
 */
export function MuyuSettings({ useStore, actions, t }: MuyuSettingsProps) {
  const prefs = useStore(s => s.prefs ?? resolveMuyuPrefs())
  const [exportStatus, setExportStatus] = useState<'idle' | 'done' | 'fail'>('idle')
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle')
  const [missingNames, setMissingNames] = useState<string[]>([])
  const [localNames, setLocalNames] = useState<string[]>([])
  const [localPack, setLocalPack] = useState<StoredArtPack | null>(null)
  const [zipNames, setZipNames] = useState<string[]>([])
  const skipLocalReload = useRef(false)

  const patch = (next: MuyuPrefs) => {
    try {
      resolveMuyuPrefs({ ...prefs, ...next })
    } catch {
      return
    }
    actions.setPrefs(next)
  }

  const bumpRev = (next: MuyuPrefs) => {
    patch({ ...next, artPackRev: prefs.artPackRev + 1 })
  }

  useEffect(() => {
    if (skipLocalReload.current) {
      skipLocalReload.current = false
      return
    }
    let cancelled = false
    void Promise.all([loadArtPack('local'), loadArtPack('zip')]).then(async ([local, zip]) => {
      if (cancelled) return
      let nextLocal = local
      if (nextLocal !== null && (nextLocal.stage === undefined || nextLocal.fits === undefined)) {
        const layout = await initPoseLayout(nextLocal.files)
        nextLocal = await saveArtPackLayout('local', layout) ?? { ...nextLocal, ...layout }
      }
      if (cancelled) return
      setLocalPack(nextLocal)
      setLocalNames(nextLocal?.names ?? [])
      setZipNames(zip?.names ?? [])
    }).catch(() => {
      if (!cancelled) {
        setLocalPack(null)
        setLocalNames([])
        setZipNames([])
      }
    })
    return () => { cancelled = true }
  }, [prefs.artPackRev])

  const onNumber = (key: 'autoDelayMs' | 'autoIntervalMs' | 'comboThreshold') => (
    event: { currentTarget: { value: string } },
  ) => {
    const n = Number(event.currentTarget.value)
    if (!Number.isFinite(n)) return
    patch({ [key]: n })
  }

  const onExport = () => {
    try {
      downloadBuiltinArtPack()
      setExportStatus('done')
    } catch {
      setExportStatus('fail')
    }
  }

  const applyCollected = async (
    slot: 'local' | 'zip',
    collected: ReturnType<typeof collectArtPack>,
  ) => {
    if (!collected.ok) {
      setMissingNames(collected.missingRequired)
      setImportStatus('missing')
      return
    }
    try {
      const layout = slot === 'local' ? await initPoseLayout(collected.files) : undefined
      await saveArtPack(slot, collected.files, layout)
      if (slot === 'local') {
        setLocalNames(collected.names)
        setLocalPack({
          files: collected.files,
          names: collected.names,
          savedAt: Date.now(),
          stage: layout?.stage,
          fits: layout?.fits,
        })
      }
      else setZipNames(collected.names)
      bumpRev({ artSource: slot })
      setMissingNames([])
      setImportStatus('ok')
    } catch {
      setImportStatus('fail')
    }
  }

  const onLocalChange = (event: { currentTarget: HTMLInputElement }) => {
    const picked = snapshotFiles(event.currentTarget.files)
    event.currentTarget.value = ''
    if (picked.length === 0) {
      setImportStatus('empty')
      return
    }
    void applyCollected('local', collectArtPack(filesFromPicked(picked)))
  }

  const onZipChange = (event: { currentTarget: HTMLInputElement }) => {
    const file = snapshotFiles(event.currentTarget.files)[0]
    event.currentTarget.value = ''
    if (file === undefined) {
      setImportStatus('empty')
      return
    }
    if (file.size > ART_PACK_MAX_ZIP_BYTES) {
      setImportStatus('fail')
      return
    }
    void (async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        await applyCollected('zip', await collectArtPackFromZip(bytes))
      } catch {
        setImportStatus('fail')
      }
    })()
  }

  const onClearLocal = () => {
    void (async () => {
      try {
        await clearArtPack('local')
        setLocalNames([])
        setLocalPack(null)
        bumpRev({ artSource: prefs.artSource === 'local' ? 'builtin' : prefs.artSource })
        setImportStatus('idle')
      } catch {
        setImportStatus('fail')
      }
    })()
  }

  const onClearZip = () => {
    void (async () => {
      try {
        await clearArtPack('zip')
        setZipNames([])
        bumpRev({ artSource: prefs.artSource === 'zip' ? 'builtin' : prefs.artSource })
        setImportStatus('idle')
      } catch {
        setImportStatus('fail')
      }
    })()
  }

  const onCommitLayout = (layout: { stage: ArtStage; fits: Partial<Record<ArtPackFile, ArtFit>> }) => {
    setLocalPack(prev => prev === null ? prev : { ...prev, ...layout })
    skipLocalReload.current = true
    void saveArtPackLayout('local', layout).then(() => {
      bumpRev({})
    }).catch(() => {
      skipLocalReload.current = false
      setImportStatus('fail')
    })
  }

  const importHint = importStatus === 'ok'
    ? t('settings.artImport.ok')
    : importStatus === 'fail'
      ? t('settings.artImport.fail')
      : importStatus === 'missing'
        ? `${t('settings.artImport.missing')} ${missingNames.join(', ')}`
        : importStatus === 'empty'
          ? t('settings.artImport.empty')
          : ''

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
        <fieldset className={css.sourceList}>
          <legend className={css.label}>{t('settings.artSource')}</legend>
          {ART_SOURCE_KEYS.map(([source, key]) => (
            <label key={source} className={`${css.field} ${css.inline}`}>
              <input
                className={css.check}
                type="radio"
                name="muyu-art-source"
                checked={prefs.artSource === source}
                onChange={() => { patch({ artSource: source }) }}
              />
              <span className={css.label}>{t(key)}</span>
            </label>
          ))}
        </fieldset>
        <p className={css.hint}>{t('settings.artSource.hint')}</p>
      </section>

      <section className={css.section} aria-label={t('settings.section.artLocal')}>
        <h3 className={css.sectionTitle}>{t('settings.section.artLocal')}</h3>
        <p className={css.hint}>{t('settings.artLocal.hint')}</p>
        <div className={css.actions}>
          <label className={css.fileButton}>
            <input
              className={css.fileInput}
              type="file"
              multiple
              ref={bindDirectoryInput}
              onChange={onLocalChange}
            />
            {t('settings.artLocal.folder')}
          </label>
          <label className={css.fileButton}>
            <input
              className={css.fileInput}
              type="file"
              accept=".png,image/png"
              multiple
              onChange={onLocalChange}
            />
            {t('settings.artLocal.files')}
          </label>
          <button
            className={css.button}
            type="button"
            disabled={localNames.length === 0}
            onClick={onClearLocal}
          >
            {t('settings.artLocal.clear')}
          </button>
        </div>
        <p className={css.hint}>
          {localNames.length === 0
            ? t('settings.artLocal.empty')
            : `${t('settings.artLocal.loaded')} ${localNames.join(', ')}`}
        </p>
        {importHint !== '' && (
          <p className={importStatus === 'ok' ? css.status : `${css.status} ${css.statusError}`}>
            {importHint}
          </p>
        )}
        {localPack !== null && localPack.stage !== undefined && (
          <ArtWorkbench pack={localPack} t={t} onCommitLayout={onCommitLayout} />
        )}
      </section>

      <section className={css.section} aria-label={t('settings.section.artRemote')}>
        <h3 className={css.sectionTitle}>{t('settings.section.artRemote')}</h3>
        <p className={css.hint}>{t('settings.artRemote.hint')}</p>
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
            onChange={(event) => {
              const artBaseUrl = event.currentTarget.value
              patch({
                artBaseUrl,
                artSource: artBaseUrl.trim() === '' && prefs.artSource === 'url'
                  ? 'builtin'
                  : artBaseUrl.trim() === ''
                    ? prefs.artSource
                    : 'url',
              })
            }}
          />
        </label>
        <p className={css.hint}>{t('settings.artBaseUrl.hint')}</p>
        <div className={css.actions}>
          <label className={css.fileButton}>
            <input
              className={css.fileInput}
              type="file"
              accept=".zip,application/zip"
              onChange={onZipChange}
            />
            {t('settings.artZip')}
          </label>
          <button
            className={css.button}
            type="button"
            disabled={zipNames.length === 0}
            onClick={onClearZip}
          >
            {t('settings.artZip.clear')}
          </button>
          <button className={css.button} type="button" onClick={onExport}>
            {t('settings.artExport')}
          </button>
        </div>
        <p className={css.hint}>{t('settings.artZip.hint')}</p>
        <p className={css.hint}>
          {zipNames.length === 0
            ? t('settings.artZip.empty')
            : `${t('settings.artZip.loaded')} ${zipNames.join(', ')}`}
        </p>
        <p className={css.hint}>{t('settings.artExport.hint')}</p>
        {importHint !== '' && (
          <p className={importStatus === 'ok' ? css.status : `${css.status} ${css.statusError}`}>
            {importHint}
          </p>
        )}
        {exportStatus === 'done' && (
          <p className={css.status}>{t('settings.artExport.done')}</p>
        )}
        {exportStatus === 'fail' && (
          <p className={`${css.status} ${css.statusError}`}>{t('settings.artExport.fail')}</p>
        )}
      </section>
    </form>
  )
}
