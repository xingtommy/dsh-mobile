/**
 * Harness-contract adapter (ui-mobile).
 *
 * THE ONLY module in this plugin that names `@deepseek-ai/dsh-client-*` harness
 * types and the session face. Every harness touch in ui-mobile routes through
 * here so that a harness version change is a single-file edit.
 *
 * Contract notes (alpha.3 — @deepseek-ai/dsh-api-session-controller / ui-session):
 *  - `ctx.sessions.binding(id)` resolves a `SessionBinding` whose `.session` is
 *    the `SessionFace` (`ISession & ObservableSnapshot<SessionSnapshot>`), so
 *    reading its snapshot (queue/state) and calling `prompt`/`cancel`/
 *    `updateQueue`/`loadOlder`/`rename`/`command` is sanctioned.
 *  - Conversation content (nodes/partial/runningCalls) is a SEPARATE ui-chat
 *    view target (`ctx.uiConversation.binding(sessionId).target('chat')`); the
 *    mobile pages read its `legacy` slice to keep the message flow rendering
 *    unchanged.
 *  - Pending interactions are NOT a snapshot field; they come from ui-session's
 *    `useSessionPendingInteraction` (a `Map<SessionId, SessionPendingInteraction>`).
 *    Answering routes through the domain carrier (PendingApproval / PendingQuestion).
 */
import type { SessionFace, SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  ConversationNode, PartialAssistant, RunningToolCall,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionPendingInteraction } from '@deepseek-ai/dsh-client-ui-session/client'
import type { PendingApproval } from '@deepseek-ai/dsh-client-ui-approval/client'
import type { PendingQuestion } from '@deepseek-ai/dsh-client-ui-user-questions/client'

/** A pending approval carrier (kind `'approval'`). */
export type ApprovalWait = PendingApproval
/** A pending question carrier (kind `'question'`). */
export type QuestionWait = PendingQuestion

/** Deliver an approval decision (contract: `PendingApproval.answer`). */
export async function answerApproval(
  wait: ApprovalWait,
  outcome: 'allowed-once' | 'rejected',
): Promise<void> {
  await wait.answer(outcome)
}

/**
 * Deliver a question answer batch. `answers` mirrors the desktop PendingQuestion
 * wire shape (per question: id, selected labels, optional custom free text).
 */
export async function answerQuestion(
  wait: QuestionWait,
  answers: readonly { id: string; selected: string[]; custom?: string }[],
): Promise<void> {
  await wait.answer({
    answers: answers.map(answer => ({
      id: answer.id,
      selected: answer.selected,
      ...(answer.custom === undefined ? {} : { custom: answer.custom }),
    })),
  })
}

/** Cancel a pending question request (the host resolves the tool call as cancelled). */
export async function cancelQuestion(wait: QuestionWait): Promise<void> {
  await wait.cancel()
}

/** The narrow session-face facade the mobile pages use (contract `ISession` verbs). */
export interface HarnessSession {
  /** Load an older page of the conversation window (contract: `ISession.loadOlder`). */
  loadOlder(): void
  /** Send a prompt; `mode` is `'queue' | 'steer'` (contract: `ISession.prompt`). */
  prompt(content: readonly { type: 'text'; text: string }[], mode: 'queue' | 'steer'): void
  /** Cancel the running turn (contract: `ISession.cancel`). */
  cancel(): void
  /** Mutate one queued item: edit / remove / steer (contract: `ISession.updateQueue`). */
  updateQueue(
    itemId: string,
    action: { kind: 'edit'; content: readonly { type: 'text'; text: string }[] } | { kind: 'remove' } | { kind: 'steer' },
  ): Promise<{ ok: boolean; error: { code: string; message: string } }>
}

/** Downcast a session face to the facade (the face is the contract `SessionFace`). */
export function toHarnessSession(face: SessionFace): HarnessSession {
  return face as unknown as HarnessSession
}

// ---------------------------------------------------------------------------
// Read-side types: the alpha.3 split means the mobile pages compose these from
// a SessionSnapshot (lifecycle + queue), a ChatSnapshot legacy slice (nodes/
// partial/runningCalls), and the ui-session pending map. They are kept here so
// every page reads through the adapter.
// ---------------------------------------------------------------------------

/** Lifecycle + queue window read from the SessionFace snapshot. */
export interface HarnessSessionView {
  readonly running: boolean
  readonly promptError: SessionSnapshot['promptError']
  readonly openState: SessionSnapshot['openState']
  readonly hasMore: boolean
  readonly removed: boolean
  readonly queue: SessionSnapshot['queue']
}

/** Conversation content window read from the ui-chat `chat` view target. */
export interface HarnessConversationView {
  readonly nodes: readonly ConversationNode[]
  readonly partial: PartialAssistant | null
  readonly runningCalls: readonly RunningToolCall[]
}

/** Pending-interaction window read from `useSessionPendingInteraction`. */
export type HarnessPendingInteractions = readonly SessionPendingInteraction[]
