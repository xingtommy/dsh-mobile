/**
 * Chat: one conversation, full screen. Header carries the back button and the
 * title (tap to open details); the message flow renders the finalized nodes
 * plus the streaming partial and running tool calls; the composer sends,
 * stops, and surfaces send errors. A deep link into `#/mobile/chat/<id>` lands
 * here directly once the session's scope is listed.
 */
import { useEffect, useRef, useState } from 'react'
import type { ConversationNode, PendingInteraction, QueuedMessage, RunningToolCall, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { MobilePageProps } from './MobileShell.tsx'
import { MobileChatMenu } from './MobileChatMenu.tsx'
import { MobileMessageItem } from './MobileMessageItem.tsx'
import { MobilePendingPanel } from './MobilePendingPanel.tsx'
import { MobileQueueDock } from './MobileQueueDock.tsx'
import { goBack, navigateDetails } from './useMobileNav.ts'
import { useSnapshot } from './useSnapshot.ts'
import css from './MobileChatPage.module.css'

interface Props extends MobilePageProps {
  sessionId: string
}

const EMPTY_NODES: readonly ConversationNode[] = []
const EMPTY_CALLS: readonly RunningToolCall[] = []
const EMPTY_PENDING: readonly PendingInteraction[] = []
const EMPTY_QUEUE: readonly QueuedMessage[] = []

/** One conversation page of the page stack. */
export function MobileChatPage(props: Props) {
  const { t, sessionId, binding, openSession } = props
  // Re-renders on list changes so a deep link resolves once the scope is minted.
  const sessions = props.useSessions(s => s)
  const face = binding(sessionId)
  const snap = useSnapshot(face)
  const [text, setText] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const nearBottomRef = useRef(true)

  // A deep link straight into this page (`#/mobile/chat/<id>`) may land before
  // the session is staged — select it so the history window actually opens.
  useEffect(() => {
    if (face === undefined && sessions.byId[sessionId as SessionId] !== undefined) {
      openSession(sessionId)
    }
  }, [face, sessionId, openSession, sessions])

  const title = sessions.byId[sessionId as SessionId]?.displayTitle ?? sessionId
  const nodes = snap?.nodes ?? EMPTY_NODES
  const partial = snap?.partial ?? null
  const runningCalls = snap?.runningCalls ?? EMPTY_CALLS
  const running = snap?.running === true
  const promptError = snap?.promptError ?? null
  const openState = snap?.openState
  const hasMore = snap?.hasMore === true
  const pendingInteractions = snap?.pending ?? EMPTY_PENDING
  const queueItems = snap?.queue ?? EMPTY_QUEUE

  const onScroll = (): void => {
    const el = scrollerRef.current
    if (el === null) return
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  // Keep the view pinned to the newest message while the user is at the bottom.
  useEffect(() => {
    const el = scrollerRef.current
    if (el !== null && nearBottomRef.current) el.scrollTop = el.scrollHeight
  })

  const loadOlder = (): void => {
    if (face !== undefined) void face.loadOlder()
  }

  const send = (): void => {
    const content = text.trim()
    if (content === '' || face === undefined) return
    // While running a send queues into the inbox; steer a specific queued
    // message from the queue dock's per-row 插话发送 instead.
    void face.prompt([{ type: 'text', text: content }], 'queue')
    setText('')
  }

  const stop = (): void => {
    if (face !== undefined) void face.cancel()
  }

  const composerDisabled = face === undefined || openState !== 'open' || snap?.removed === true

  return (
    <div className={css.page}>
      <header className={css.header}>
        <button className={css.backButton} aria-label={t('back')} onClick={() => goBack()}>‹</button>
        <button className={css.headerTitle} onClick={() => navigateDetails(sessionId)}>
          <span className={css.title}>{title}</span>
          <span className={css.titleMeta}>{running ? t('status.running') : t('chat.details')}</span>
        </button>
        <button className={css.iconButton} aria-label={t('chat.menu')} onClick={() => setMenuOpen(true)}>⋯</button>
      </header>

      {face === undefined || snap === undefined ? (
        <div className={css.unknown}>{t('session.unknown')}</div>
      ) : (
        <main className={css.messages} ref={scrollerRef} onScroll={onScroll}>
          {hasMore && (
            <button className={css.loadOlder} onClick={loadOlder}>{t('chat.loadOlder')}</button>
          )}
          {nodes.map(node => <MobileMessageItem key={node.seq} node={node} t={t} />)}
          {partial !== null && <MobileMessageItem partial={partial} t={t} />}
          {runningCalls.map(call => <MobileMessageItem key={call.callId} runningCall={call} t={t} />)}
          {promptError !== null && <div className={css.error}>{promptError.error.message}</div>}
        </main>
      )}

      {snap !== undefined && pendingInteractions.length > 0 && (
        <MobilePendingPanel pending={pendingInteractions} runningCalls={runningCalls} t={t} />
      )}

      {snap !== undefined && queueItems.length > 0 && face !== undefined && (
        <MobileQueueDock queue={queueItems} running={running} face={face} t={t} />
      )}

      {face !== undefined && openState === 'open' && (
        <footer className={css.composer}>
          {running
            ? (
              <>
                <textarea
                  className={`${css.input} ${css.inputFull}`}
                  rows={1}
                  placeholder={t('chat.input.placeholder')}
                  value={text}
                  disabled={composerDisabled}
                  onChange={event => setText(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      send()
                    }
                  }}
                />
                <div className={css.actionRow}>
                  <button className={css.sendButton} disabled={text.trim() === ''} onClick={send}>{t('chat.send')}</button>
                  <button className={css.stopButton} onClick={stop}>{t('chat.stop')}</button>
                </div>
              </>
            )
            : (
              <>
                <textarea
                  className={css.input}
                  rows={1}
                  placeholder={t('chat.input.placeholder')}
                  value={text}
                  disabled={composerDisabled}
                  onChange={event => setText(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      send()
                    }
                  }}
                />
                <button className={css.sendButton} disabled={text.trim() === ''} onClick={send}>{t('chat.send')}</button>
              </>
            )}
        </footer>
      )}

      {menuOpen && (
        <MobileChatMenu
          t={t}
          sessionId={sessionId}
          face={face}
          connection={props.connection}
          onClose={() => setMenuOpen(false)}
          onDetails={() => navigateDetails(sessionId)}
        />
      )}
    </div>
  )
}
