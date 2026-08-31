/**
 * Pending-interaction takeover: the mobile counterpart of the desktop composer
 * chain. While the session face snapshot carries pending approval/question
 * waits, this panel renders above the composer so the phone can answer them
 * (the desktop chain occupies `conversation.composer`, a slot the mobile shell
 * does not dispatch). The wire encodings mirror the desktop domain faces
 * exactly: ui-user-questions' PendingQuestion answer batch and
 * ui-conversation's PendingApproval allow-once/reject decision.
 */
import { useState, type ChangeEvent } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PendingInteraction, RunningToolCall } from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import css from './MobilePendingPanel.module.css'

type MobileT = TranslateNS<'mobile'>

/** Extract the shell command from a paired running call (bash-family args carry `command`). */
function commandOf(call: RunningToolCall | undefined): string | undefined {
  if (call === undefined) return undefined
  try {
    const args = JSON.parse(call.argsRaw) as Record<string, unknown>
    return typeof args.command === 'string' ? args.command : undefined
  } catch {
    return undefined
  }
}

/** Split the conventional recommendation suffix without changing the answer value. */
function parseRecommendedLabel(label: string): { label: string; recommended: boolean } {
  const suffix = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐）))\s*$/i
  return suffix.test(label)
    ? { label: label.replace(suffix, ''), recommended: true }
    : { label, recommended: false }
}

/** One question card's per-question draft. */
interface DraftAnswer {
  selected: string[]
  custom: string
  skipped: boolean
}

interface PanelProps {
  pending: readonly PendingInteraction[]
  runningCalls: readonly RunningToolCall[]
  t: MobileT
}

/**
 * All pending interactions, oldest last. Zero pending renders nothing, so the
 * page mounts this unconditionally.
 */
export function MobilePendingPanel(props: PanelProps) {
  if (props.pending.length === 0) return null
  return (
    <div className={css.root}>
      {props.pending.map(wait => wait.kind === 'approval'
        ? <ApprovalCard
            key={wait.key}
            wait={wait}
            command={commandOf(props.runningCalls.find(call => call.callId === wait.payload.callId))}
            t={props.t}
          />
        : <QuestionCard key={wait.key} wait={wait} t={props.t} />)}
    </div>
  )
}

// ---- approval ----

function ApprovalCard(props: {
  wait: Extract<PendingInteraction, { kind: 'approval' }>
  command?: string | undefined
  t: MobileT
}) {
  const [answered, setAnswered] = useState(false)
  const answer = (outcome: 'allowed-once' | 'rejected'): void => {
    setAnswered(true)
    void props.wait.respond({
      ok: true,
      value: { sessionId: props.wait.sessionId, approvalId: props.wait.payload.approvalId, outcome },
    }).catch(() => { setAnswered(false) })
  }
  return (
    <div className={css.card} data-pending-key={props.wait.key}>
      <div className={css.strip}><span className={css.dot} />{props.t('pending.approval.waiting')}</div>
      <div className={css.body}>
        <div className={css.headline}>
          {props.wait.payload.reason ?? props.t('pending.approval.escalation', { toolName: props.wait.payload.toolName })}
        </div>
        {props.command !== undefined && <div className={css.command}>{props.command}</div>}
      </div>
      <div className={css.actions}>
        <button className={`${css.button} ${css.outline}`} disabled={answered} onClick={() => answer('rejected')}>
          {props.t('pending.approval.reject')}
        </button>
        <button className={`${css.button} ${css.primary}`} disabled={answered} onClick={() => answer('allowed-once')}>
          {props.t('pending.approval.allow')}
        </button>
      </div>
    </div>
  )
}

// ---- question ----

function QuestionCard(props: {
  wait: Extract<PendingInteraction, { kind: 'question' }>
  t: MobileT
}) {
  const questions = props.wait.payload.questions
  const [drafts, setDrafts] = useState<DraftAnswer[]>(() => questions.map(() => ({
    selected: [], custom: '', skipped: false,
  })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const answered = (item: DraftAnswer): boolean => item.selected.length > 0 || item.custom.trim() !== ''
  const completed = (item: DraftAnswer): boolean => answered(item) || item.skipped

  const updateDraft = (index: number, update: (current: DraftAnswer) => DraftAnswer): void => {
    setDrafts(current => current.map((item, itemIndex) => itemIndex === index ? update(item) : item))
    setError(null)
  }

  const choose = (index: number, label: string, multiSelect: boolean): void => {
    updateDraft(index, current => {
      if (multiSelect) {
        const selected = current.selected.includes(label)
          ? current.selected.filter(item => item !== label)
          : [...current.selected, label]
        return { ...current, selected, skipped: false }
      }
      return { selected: [label], custom: '', skipped: false }
    })
  }

  const draftCustom = (index: number, multiSelect: boolean, event: ChangeEvent<HTMLTextAreaElement>): void => {
    const value = event.target.value
    updateDraft(index, current => ({
      ...current,
      selected: multiSelect ? current.selected : [],
      custom: value,
      skipped: false,
    }))
  }

  const skipQuestion = (index: number): void => {
    const next = drafts.map((item, itemIndex) => itemIndex === index
      ? { selected: [], custom: '', skipped: true }
      : item)
    setDrafts(next)
    setError(null)
    if (next.every(completed)) submitDrafts(next)
  }

  const submit = (): void => {
    const missing = drafts.findIndex(item => !completed(item))
    if (missing >= 0) { setError(props.t('pending.question.incomplete')); return }
    submitDrafts(drafts)
  }

  const submitDrafts = (values: DraftAnswer[]): void => {
    setBusy(true)
    void props.wait.respond({
      ok: true,
      value: {
        sessionId: props.wait.sessionId,
        answer: {
          answers: questions.map((item, itemIndex) => {
            const value = values[itemIndex] as DraftAnswer
            if (value.skipped) return { id: item.id, selected: [] }
            const custom = value.custom.trim()
            return {
              id: item.id,
              selected: custom === '' || item.multiSelect === true ? value.selected : [],
              ...(custom === '' ? {} : { custom }),
            }
          }),
        },
      },
    }).catch((cause: unknown) => {
      setBusy(false)
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }

  const cancelFlow = (): void => {
    setBusy(true)
    void props.wait.respond({
      ok: false,
      error: { code: 'cancelled', message: 'the user closed this question request', details: {} },
    }).catch(() => { setBusy(false) })
  }

  return (
    <div className={css.card} data-pending-key={props.wait.key}>
      <div className={`${css.strip} ${css.stripQuestion}`}>
        <span className={css.dot} />{props.t('pending.question.title')}
      </div>
      <div className={css.body}>
        {questions.map((question, index) => {
          const draft = drafts[index] as DraftAnswer
          const multi = question.multiSelect === true
          return (
            <section key={question.id} className={css.question}>
              {question.header !== undefined && <div className={css.eyebrow}>{question.header}</div>}
              <div className={css.qTitle}>{question.question}</div>
              {question.detail !== undefined && (
                <div className={css.qDetail}><MarkdownText text={question.detail} /></div>
              )}
              <div className={css.options} role={multi ? 'group' : 'radiogroup'}>
                {(question.options ?? []).map((option, optionIndex) => {
                  const selected = draft.selected.includes(option.label)
                  const display = parseRecommendedLabel(option.label)
                  return (
                    <button
                      type="button"
                      key={`${option.label}-${String(optionIndex)}`}
                      className={clsxOption(selected, multi)}
                      role={multi ? 'checkbox' : 'radio'}
                      aria-checked={selected}
                      disabled={busy}
                      onClick={() => choose(index, option.label, multi)}
                    >
                      <span className={css.optionLabel}>
                        {display.label}
                        {display.recommended && <span className={css.badge}>{props.t('pending.question.recommended')}</span>}
                      </span>
                      {option.description !== undefined && (
                        <span className={css.optionDescription}>{option.description}</span>
                      )}
                    </button>
                  )
                })}
                <textarea
                  className={css.custom}
                  rows={1}
                  value={draft.custom}
                  disabled={busy}
                  placeholder={props.t('pending.question.custom')}
                  onChange={event => draftCustom(index, multi, event)}
                />
              </div>
              <div className={css.questionActions}>
                <button
                  type="button" className={`${css.button} ${css.outline}`}
                  disabled={busy || draft.skipped}
                  onClick={() => skipQuestion(index)}
                >
                  {props.t('pending.question.skip')}
                </button>
              </div>
            </section>
          )
        })}
      </div>
      <div className={css.actions}>
        <button className={`${css.button} ${css.outline}`} disabled={busy} onClick={cancelFlow}>
          {props.t('pending.question.cancel')}
        </button>
        <button className={`${css.button} ${css.primary}`} disabled={busy} onClick={submit}>
          {busy ? props.t('pending.question.submitting') : props.t('pending.question.submit')}
        </button>
      </div>
      {error !== null && <div className={css.error} role="status">{error}</div>}
    </div>
  )
}

// clsx is a direct dependency; a local join keeps this file's imports flat.
function clsxOption(selected: boolean, multi: boolean): string {
  return [css.option, selected && (multi ? css.optionChecked : css.optionSelected)].filter(Boolean).join(' ')
}
