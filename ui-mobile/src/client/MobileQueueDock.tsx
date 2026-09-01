/**
 * Mobile queue dock: the transient inbox the composer fills while the agent
 * is busy. Rows mirror the desktop queue dock — per queued row: edit in place
 * (text rows only), remove, and steer-send (running only). Mutations go
 * through the session face's updateQueue, the same queue protocol the
 * desktop dock drives.
 */
import { useState } from 'react'
import type { QueuedMessage, SessionFace } from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import css from './MobileQueueDock.module.css'

interface Props {
  queue: readonly QueuedMessage[]
  running: boolean
  face: SessionFace
  t: TranslateNS<'mobile'>
}

export function MobileQueueDock(props: Props) {
  const { queue, running, face, t } = props
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const startEdit = (item: QueuedMessage): void => {
    if (item.text === null) return
    setEditingId(item.id)
    setDraft(item.text)
    setError(null)
  }

  const saveEdit = (item: QueuedMessage): void => {
    const content = draft.trim()
    if (content === '') return
    void face.updateQueue(item.id, { kind: 'edit', content: [{ type: 'text', text: content }] })
      .then(result => {
        if (result.ok) setEditingId(null)
        else setError(result.error.message)
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
  }

  const remove = (item: QueuedMessage): void => {
    void face.updateQueue(item.id, { kind: 'remove' }).catch(() => { /* the resolved frame drops the row */ })
  }

  const steer = (item: QueuedMessage): void => {
    if (!running) return
    void face.updateQueue(item.id, { kind: 'steer' })
      .then(result => {
        if (!result.ok && result.error.code === 'steer-unavailable') setError(t('queue.steerUnavailable'))
      })
      .catch(() => { /* the resolved frame drops the row */ })
  }

  const mutating = (item: QueuedMessage): boolean => item.placement === 'queued'

  return (
    <div className={css.dock}>
      <div className={css.title}>{t('queue.title')}</div>
      <div className={css.rows}>
        {queue.map(item => (
          <div key={item.id} className={css.row}>
            {editingId === item.id
              ? (
                <>
                  <textarea
                    className={css.editInput}
                    rows={2}
                    value={draft}
                    onChange={event => setDraft(event.target.value)}
                  />
                  <div className={css.actions}>
                    <button className={css.linkButton} onClick={() => { setEditingId(null); setError(null) }}>
                      {t('queue.cancel')}
                    </button>
                    <button className={css.primaryButton} disabled={draft.trim() === ''} onClick={() => saveEdit(item)}>
                      {t('queue.save')}
                    </button>
                  </div>
                </>
              )
              : (
                <>
                  <div className={css.preview}>{item.preview}</div>
                  {mutating(item) && (
                    <div className={css.actions}>
                      {item.text !== null && (
                        <button className={css.linkButton} onClick={() => startEdit(item)}>{t('queue.edit')}</button>
                      )}
                      <button className={css.linkButton} onClick={() => remove(item)}>{t('queue.remove')}</button>
                      <button
                        className={css.primaryButton}
                        disabled={!running}
                        title={t('queue.steerUnavailable')}
                        onClick={() => steer(item)}
                      >
                        {t('queue.steer')}
                      </button>
                    </div>
                  )}
                </>
              )}
          </div>
        ))}
      </div>
      {error !== null && <div className={css.error} role="status">{error}</div>}
    </div>
  )
}
