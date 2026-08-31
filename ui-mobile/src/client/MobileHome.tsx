/**
 * Home: workspace filter chips, the session list, and the New Session entry —
 * the landing page of the mobile shell, plus the door to settings.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessionId, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import { formatRelativeTime, pathBasename } from './mobileFormat.ts'
import { navigateChat, navigateSettings } from './useMobileNav.ts'
import type { MobilePageProps } from './MobileShell.tsx'
import { useSnapshot } from './useSnapshot.ts'
import css from './MobileHome.module.css'

/** Home page of the page stack. */
export function MobileHome(props: MobilePageProps) {
  const { t, useSessions, useWorkspaces, openSession, startSession } = props
  const sessions = useSessions(s => s)
  const workspaces = useWorkspaces(s => s)
  const activeLocale = useSnapshot(props.locale)?.active ?? 'zh'
  const [filter, setFilter] = useState<WorkspaceId | 'all'>('all')
  // A create request in flight (spinner on the FAB). `startSession` is a
  // fire-and-forget wire round-trip: over a slow link it can take seconds, so
  // the tap must show feedback instead of looking dead.
  const [creating, setCreating] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const pendingCreate = useRef(false)
  const dispatchedCreate = useRef(false)

  const rows = useMemo(() => {
    const selected = filter === 'all'
      ? undefined
      : workspaces.items.find(workspace => workspace.workspaceId === filter)
    return sessions.ids
      .map(id => sessions.byId[id])
      .filter((row): row is NonNullable<typeof row> => row !== undefined && !row.blank && row.origin !== 'subagent')
      .filter(row => selected === undefined || selected.sessionIds.includes(row.id))
      .sort((left, right) => right.updatedAt - left.updatedAt)
  }, [sessions, workspaces, filter])

  const openChat = (id: SessionId): void => {
    pendingCreate.current = false
    dispatchedCreate.current = false
    setCreating(false)
    setHint(null)
    openSession(id)
    navigateChat(id)
  }

  // After New Session resolves, the current selection flips to the fresh id —
  // follow it straight into the conversation page (unless the user acted first).
  const current = sessions.current
  useEffect(() => {
    if (!pendingCreate.current || current === undefined) return
    pendingCreate.current = false
    dispatchedCreate.current = false
    setCreating(false)
    setHint(null)
    navigateChat(current)
  }, [current])

  // Dispatch the create exactly once, and only once the workspace/session
  // baselines are ready: `startSession` resolves its target from the recency
  // projection, which is undefined before the registry loads — calling it early
  // clears the selection and the tap looks dead. A tap that landed early waits
  // here for readiness; with no workspace at all it reports that instead.
  useEffect(() => {
    if (!creating || !workspaces.baselinesReady || dispatchedCreate.current) return
    dispatchedCreate.current = true
    if (workspaces.items.length === 0) {
      pendingCreate.current = false
      setCreating(false)
      setHint(t('home.noWorkspace'))
      return
    }
    // `startSession` reuses an eligible blank session in the target workspace.
    // When the initial selection already opened that blank, the reuse resolves
    // without flipping `current`, so the follow-the-current effect below never
    // fires and the tap would look dead — navigate straight into the blank
    // here. A titled current session is left alone: reuse flips `current` and
    // the effect below follows it (no brief stop on the titled page).
    if (sessions.current !== undefined && sessions.byId[sessions.current]?.blank === true) {
      navigateChat(sessions.current)
    }
    startSession()
  }, [creating, workspaces.baselinesReady, workspaces.items.length, sessions.current, sessions.byId, startSession, t])

  // Creation over a slow link must never leave the button stuck spinning if it
  // fails silently (startSession reports failures on the list state, not here).
  useEffect(() => {
    if (!creating) return
    const timer = window.setTimeout(() => {
      pendingCreate.current = false
      dispatchedCreate.current = false
      setCreating(false)
    }, 20000)
    return () => window.clearTimeout(timer)
  }, [creating])

  const create = (): void => {
    setHint(null)
    pendingCreate.current = true
    dispatchedCreate.current = false
    setCreating(true)
  }

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div className={css.brand}>
          <span className={css.brandMark}>DS</span>
          <div>
            <h1 className={css.brandTitle}>DeepSeek</h1>
            <p className={css.subtitle}>{t('home.subtitle')}</p>
          </div>
        </div>
        <button
          className={css.iconButton}
          aria-label={t('settings.title')}
          onClick={() => navigateSettings()}
        >⚙</button>
      </header>

      {hint !== null && <div className={css.hint} role="status">{hint}</div>}

      {workspaces.items.length > 0 && (
        <nav className={css.chips} aria-label={t('section.workspaces')}>
          <button
            className={`${css.chip}${filter === 'all' ? ` ${css.chipActive}` : ''}`}
            onClick={() => setFilter('all')}
          >{t('workspace.all')}</button>
          {workspaces.items.map(workspace => (
            <button
              key={workspace.workspaceId}
              className={`${css.chip}${filter === workspace.workspaceId ? ` ${css.chipActive}` : ''}`}
              onClick={() => setFilter(workspace.workspaceId)}
            >{workspace.title || pathBasename(workspace.path)}</button>
          ))}
        </nav>
      )}

      <main className={css.list}>
        <h2 className={css.sectionTitle}>{t('section.sessions')}</h2>
        {rows.length === 0 ? (
          <div className={css.empty}>
            <p>{t('empty.sessions')}</p>
            <button className={css.primaryButton} onClick={create} disabled={creating}>{t('session.new')}</button>
          </div>
        ) : rows.map(row => (
          <button key={row.id} className={css.row} onClick={() => openChat(row.id)}>
            <span
              className={`${css.dot}${row.running ? ` ${css.dotRunning}` : row.completed === true ? ` ${css.dotDone}` : ''}`}
            />
            <span className={css.rowBody}>
              <span className={css.rowTitle}>{row.displayTitle}</span>
              <span className={css.rowMeta}>
                {row.running ? t('status.running') : row.completed === true ? t('status.completed') : ''}
                {row.running || row.completed === true ? ' · ' : ''}
                {formatRelativeTime(row.updatedAt, activeLocale)}
              </span>
            </span>
          </button>
        ))}
      </main>

      <button
        className={`${css.fab}${creating ? ` ${css.fabBusy}` : ''}`}
        aria-label={t('session.new')}
        onClick={create}
        disabled={creating}
      >{creating ? <span className={css.spinner} /> : '+'}</button>
    </div>
  )
}
