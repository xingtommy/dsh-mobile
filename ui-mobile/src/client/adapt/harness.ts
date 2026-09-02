/**
 * Harness-contract adapter (ui-mobile).
 *
 * THE ONLY module in this plugin that names `@deepseek-ai/dsh-client-*` harness
 * types and the session face. Every harness touch in ui-mobile routes through
 * here so that a harness version change is a single-file edit. Follow the
 * data-access ladder in dsh's packages/client/AGENTS.md — framework hooks,
 * then a declared store, then inject callbacks — and keep each export's
 * contract basis documented.
 *
 * Contract notes (against dsh packages/client/AGENTS.md / the slot-type-chain
 * standard):
 *  - `ctx.sessions.binding(id)` and `SessionFace` are part of the exported
 *    `ISessions`/`SessionFace` contract, so reading the session face and
 *    calling `prompt`/`cancel`/`updateQueue`/`loadOlder` is sanctioned.
 *  - `ConversationSnapshot.pending` / `.queue` are read reactively through the
 *    per-session snapshot (`useSnapshot`); they are the session face's live
 *    data. The reactive read is done here so the rest of the plugin is pure
 *    presentation over plain data.
 *  - Known open contract gap (needs dsh upstream): answering an ask-user
 *    question currently reuses ui-mobile's own wire encoding rather than the
 *    `conversation.composer` chain, because the mobile shell does not dispatch
 *    that conversation-scoped slot.
 */
import type {
  PendingInteraction,
  QueuedMessage,
  RunningToolCall,
  SessionFace,
} from '@deepseek-ai/dsh-client-runtime/client'

/** The narrow session-face facade the mobile pages use (contract `SessionFace`). */
export interface HarnessSession {
  /** Load an older page of the conversation window (contract: `SessionFace.loadOlder`). */
  loadOlder(): void
  /** Send a prompt; `mode` is `'queue' | 'steer'` (contract: `SessionFace.prompt`). */
  prompt(content: readonly { type: 'text'; text: string }[], mode: 'queue' | 'steer'): void
  /** Cancel the running turn (contract: `SessionFace.cancel`). */
  cancel(): void
  /** Mutate one queued item: edit / remove / steer (contract: `SessionFace.updateQueue`). */
  updateQueue(
    itemId: string,
    action: { kind: 'edit'; content: readonly { type: 'text'; text: string }[] } | { kind: 'remove' } | { kind: 'steer' },
  ): Promise<{ ok: boolean; error: { code: string; message: string } }>
}

/** Sanitized conversation snapshot fields the mobile pages read. */
export interface HarnessSnapshot {
  readonly nodes: readonly unknown[]
  readonly partial: unknown
  readonly runningCalls: readonly RunningToolCall[]
  readonly running: boolean
  readonly promptError: unknown
  readonly openState: unknown
  readonly hasMore: boolean
  readonly removed: boolean
  readonly pending: readonly PendingInteraction[]
  readonly queue: readonly QueuedMessage[]
}

/** Downcast a session face to the facade (the face is the contract `SessionFace`). */
export function toHarnessSession(face: SessionFace): HarnessSession {
  return face as unknown as HarnessSession
}
