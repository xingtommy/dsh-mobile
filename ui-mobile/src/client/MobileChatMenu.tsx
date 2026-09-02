/**
 * The conversation menu: a bottom sheet opened from the chat header's `⋯`
 * button. Root pane offers Details / Model / Access; Model and Access swap the
 * sheet to their pickers. Model selection reads the session's shared model
 * directory (`ctx.modelDirectories`) and submits through `ModelDirectory.select`;
 * Access switches through the same `/permission <preset>` command the desktop
 * chip submits — so both work from the public phone without any core change.
 */
import { useEffect, useState } from 'react'
import type { SessionFace } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ModelDirectory, ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { useSnapshot } from './useSnapshot.ts'
import css from './MobileChatMenu.module.css'

/** The host-computed permissions projection (absent on permission-less hosts). */
interface AccessProjection {
  options: Array<{ value: string; name: string; description?: string }>
  currentValue: string
}

/** One sheet pane. */
type Pane = 'root' | 'model' | 'access'

const FULL_ACCESS = 'danger-full-access'

/** Localized label for the known access presets; host-configured names pass through. */
function accessLabel(t: TranslateNS<'mobile'>, value: string): string {
  switch (value) {
    case 'read-only': return t('permission.readOnly')
    case 'workspace-write': return t('permission.workspaceWrite')
    case FULL_ACCESS: return t('permission.fullAccess')
    default: return value
  }
}

/** The sheet owns a shadow copy of the shared model-directory state. */
type ModelState = ModelDirectoryState

export interface MobileChatMenuProps {
  t: TranslateNS<'mobile'>
  /** The owning session's id (route string). */
  sessionId: string
  /** The session's outward face; undefined before the session is staged. */
  face: SessionFace | undefined
  /** The per-session model directory; undefined before the session is staged. */
  modelDirectory: ModelDirectory | undefined
  /** Close the sheet. */
  onClose(): void
  /** Jump to the conversation's details page. */
  onDetails(): void
}

/** The conversation menu bottom sheet. */
export function MobileChatMenu(props: MobileChatMenuProps) {
  const { t, face, modelDirectory, onClose, onDetails } = props
  const [pane, setPane] = useState<Pane>('root')
  const [busy, setBusy] = useState(false)
  const [model, setModel] = useState<ModelState>({ status: 'idle', current: null, routable: null, groups: [], failures: [], error: null })
  const [accessError, setAccessError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  const dir = useSnapshot(modelDirectory === undefined ? undefined : modelDirectory.store)

  // Live access projection (updates when the permission changes elsewhere).
  const access = useSnapshot<unknown>(face?.projections.faceOf('permissions')) as AccessProjection | undefined

  // Mirror the shared directory state into the sheet's own copy.
  useEffect(() => {
    if (dir === undefined) return
    setModel(dir)
  }, [dir])

  const commitModel = (selection: Parameters<ModelDirectory['select']>[0]): void => {
    if (modelDirectory === undefined) return
    setBusy(true)
    setModel(s => ({ ...s, error: null }))
    void modelDirectory.select(selection)
      .then(() => { onClose() })
      .catch((err: unknown) => {
        setBusy(false)
        setModel(s => ({ ...s, error: err instanceof Error ? err.message : String(err) }))
      })
  }

  const commitAccess = async (value: string): Promise<void> => {
    if (face === undefined) return
    setBusy(true)
    setAccessError(null)
    try {
      const result = await face.command(`/permission ${value}`)
      if (result.ok && result.value.matched) {
        onClose()
        return
      }
      setAccessError(t('permission.commitError', { message: result.ok ? 'unmatched' : result.error.message }))
      setBusy(false)
    } catch (err) {
      setAccessError(t('permission.commitError', { message: err instanceof Error ? err.message : String(err) }))
      setBusy(false)
    }
  }

  const pickAccess = (value: string): void => {
    if (access === undefined || value === access.currentValue) return
    if (value === FULL_ACCESS) {
      setConfirm(value)
      return
    }
    void commitAccess(value)
  }

  const backToRoot = (): void => { setPane('root') }
  const openModel = (): void => { setPane('model') }
  const openAccess = (): void => { setPane('access') }

  return (
    <div className={css.overlay} role="dialog" aria-label={t('chat.menu')} onClick={onClose}>
      <div className={css.sheet} onClick={event => event.stopPropagation()}>
        {pane === 'root' && (
          <>
            <div className={css.handle} />
            <button type="button" className={css.row} onClick={() => { onDetails(); onClose() }}>
              <span>{t('chat.menu.details')}</span><span className={css.chevron} aria-hidden="true">›</span>
            </button>
            <button type="button" className={css.row} onClick={openModel}>
              <span>{t('chat.menu.model')}</span><span className={css.chevron} aria-hidden="true">›</span>
            </button>
            <button type="button" className={css.row} onClick={openAccess}>
              <span>{t('chat.menu.permission')}</span><span className={css.chevron} aria-hidden="true">›</span>
            </button>
          </>
        )}

        {pane === 'model' && (
          <>
            <header className={css.paneHeader}>
              <button type="button" className={css.back} aria-label={t('back')} onClick={backToRoot}>‹</button>
              <span className={css.paneTitle}>{t('model.picker.title')}</span>
              <span className={css.headerSpacer} />
            </header>
            {model.status === 'idle' && <div className={css.status}>{t('model.loading')}</div>}
            {model.status === 'loading' && <div className={css.status}>{t('model.loading')}</div>}
            {model.status === 'error' && (
              <div className={css.status}>
                <span className={css.error}>{model.error ?? t('model.loadError')}</span>
              </div>
            )}
            {model.status === 'ready' && (
              <div className={css.list}>
                {model.groups.length === 0 && <div className={css.status}>{t('model.empty')}</div>}
                {model.groups.map(group => (
                  <section key={group.id} className={css.group}>
                    <div className={css.groupTitle}>{group.name}</div>
                    {group.models.map(m => {
                      const selected = model.current?.provider === group.id && model.current.model === m.id
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={`${css.row}${selected ? ` ${css.selected}` : ''}`}
                          disabled={busy}
                          onClick={() => commitModel({
                            provider: group.id,
                            model: m.id,
                            ...m.reasoning?.defaultEffort === undefined ? {} : { reasoningEffort: m.reasoning.defaultEffort },
                          })}
                        >
                          <span className={css.optionCopy}>
                            <span className={css.modelName}>{m.name}</span>
                            {m.description !== undefined && <span className={css.modelDesc}>{m.description}</span>}
                          </span>
                          {selected && <span className={css.check} aria-hidden="true">✓</span>}
                        </button>
                      )
                    })}
                  </section>
                ))}
                {model.failures.length > 0 && model.failures.map(f => (
                  <div key={f.id} className={css.status}>{f.name}: {f.message}</div>
                ))}
                {model.error !== null && <div className={css.error}>{model.error}</div>}
              </div>
            )}
          </>
        )}

        {pane === 'access' && (
          <>
            <header className={css.paneHeader}>
              <button type="button" className={css.back} aria-label={t('back')} onClick={backToRoot}>‹</button>
              <span className={css.paneTitle}>{t('permission.title')}</span>
              <span className={css.headerSpacer} />
            </header>
            {confirm === null ? (
              <>
                {access === undefined || access.options.length === 0 ? (
                  <div className={css.status}>{t('model.empty')}</div>
                ) : (
                  <div className={css.list}>
                    {access.options.map(option => {
                      const selected = option.value === access.currentValue
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`${css.row}${selected ? ` ${css.selected}` : ''}`}
                          disabled={busy}
                          onClick={() => pickAccess(option.value)}
                        >
                          <span className={css.optionCopy}>
                            <span className={css.modelName}>{accessLabel(t, option.value)}</span>
                            {option.description !== undefined && <span className={css.modelDesc}>{option.description}</span>}
                          </span>
                          {selected && <span className={css.check} aria-hidden="true">✓</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
                {accessError !== null && <div className={css.error}>{accessError}</div>}
              </>
            ) : (
              <div className={css.confirm}>
                <div className={css.confirmTitle}>{t('permission.confirm.title')}</div>
                <p className={css.confirmBody}>{t('permission.confirm.body')}</p>
                <div className={css.confirmActions}>
                  <button type="button" className={css.cancelButton} disabled={busy} onClick={() => setConfirm(null)}>
                    {t('permission.confirm.cancel')}
                  </button>
                  <button
                    type="button"
                    className={css.enableButton}
                    disabled={busy}
                    onClick={() => { void commitAccess(confirm) }}
                  >
                    {t('permission.confirm.enable')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
