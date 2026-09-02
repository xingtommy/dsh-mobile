/**
 * Details: one conversation's task overview (status, id, workspace), its tool
 * calls with expandable args/results, and the management actions (rename,
 * cancel). Reached from the chat header; back returns to the chat.
 */
import { useEffect, useMemo, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { formatRelativeTime, pathBasename } from './mobileFormat.ts'
import { MobileMessageItem } from './MobileMessageItem.tsx'
import type { MobilePageProps } from './MobileShell.tsx'
import { goBack } from './useMobileNav.ts'
import { useSnapshot } from './useSnapshot.ts'
import css from './MobileDetailsPage.module.css'

interface Props extends MobilePageProps {
  sessionId: string
}

/** The task-details page of the page stack. */
export function MobileDetailsPage(props: Props) {
  const { t, sessionId, binding, openSession, conversation } = props
  const sessions = props.useSessions(s => s)
  const face = binding(sessionId)
  const snap = useSnapshot(face)
  const chat = useSnapshot(conversation(sessionId as SessionId))
  const activeLocale = useSnapshot(props.locale)?.active ?? 'zh'
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')

  // Same deep-link guard as the chat page: select the session if a direct
  // details link landed before it was staged.
  useEffect(() => {
    if (face === undefined && sessions.byId[sessionId as SessionId] !== undefined) {
      openSession(sessionId)
    }
  }, [face, sessionId, openSession, sessions])

  const summary = sessions.byId[sessionId as SessionId]
  const title = summary?.displayTitle ?? sessionId
  const running = snap?.running === true || summary?.running === true
  const updatedAt = summary?.updatedAt ?? 0

  const { settled, runningCalls } = useMemo(() => {
    const settledTools = (chat?.legacy.nodes ?? [])
      .filter((node): node is ToolResultNode => node.kind === 'tool-result')
    return { settled: settledTools, runningCalls: chat?.legacy.runningCalls ?? [] }
  }, [chat])

  const commitRename = (): void => {
    const next = name.trim()
    if (next !== '' && face !== undefined) void face.rename(next)
    setRenaming(false)
  }

  const cancelTurn = (): void => {
    if (face !== undefined) void face.cancel()
  }

  const toolCount = settled.length + runningCalls.length

  return (
    <div className={css.page}>
      <header className={css.header}>
        <button className={css.backButton} aria-label={t('back')} onClick={() => goBack()}>‹</button>
        <h1 className={css.headerTitle}>{t('details.title')}</h1>
        <span className={css.headerSpacer} />
      </header>

      <main className={css.body}>
        <section className={css.card}>
          <div className={css.overview}>
            <span className={`${css.statusPill}${running ? ` ${css.statusRunning}` : ''}`}>
              {running ? t('status.running') : t('status.completed')}
            </span>
            <h2 className={css.title}>{title}</h2>
          </div>
          <dl className={css.meta}>
            <div>
              <dt>{t('details.sessionId')}</dt>
              <dd className={css.mono}>{sessionId}</dd>
            </div>
            {summary?.cwd !== undefined && (
              <div>
                <dt>{t('details.workspace')}</dt>
                <dd>{pathBasename(summary.cwd)}</dd>
              </div>
            )}
            {updatedAt > 0 && (
              <div>
                <dt>{t('details.updated')}</dt>
                <dd>{formatRelativeTime(updatedAt, activeLocale)}</dd>
              </div>
            )}
          </dl>
          <div className={css.actions}>
            {renaming ? (
              <div className={css.renameRow}>
                <input
                  className={css.renameInput}
                  autoFocus
                  value={name}
                  placeholder={t('details.rename.placeholder')}
                  onChange={event => setName(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') commitRename() }}
                />
                <button className={css.smallButton} aria-label={t('details.rename')} onClick={commitRename}>✓</button>
                <button className={css.smallButton} aria-label={t('back')} onClick={() => setRenaming(false)}>✕</button>
              </div>
            ) : (
              <button className={css.actionButton} onClick={() => { setName(title); setRenaming(true) }}>
                {t('details.rename')}
              </button>
            )}
            {running && <button className={css.actionButton} onClick={cancelTurn}>{t('details.cancel')}</button>}
          </div>
        </section>

        <section className={css.section}>
          <h3 className={css.sectionTitle}>{t('message.tool')} · {toolCount}</h3>
          {toolCount === 0 ? (
            <p className={css.empty}>{t('details.empty')}</p>
          ) : (
            <div className={css.tools}>
              {runningCalls.map(call => <MobileMessageItem key={call.callId} runningCall={call} t={t} />)}
              {settled.map(node => <MobileMessageItem key={node.seq} node={node} t={t} />)}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
