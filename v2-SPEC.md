# v2 migration spec — ui-mobile for `dsh-v0.1.2-alpha.3`

alpha.3 restructured the client layer. This is the concrete map the rewrite follows.
Each row: current v1 (0.1.1) dependency/type → its alpha.3 home. **Verify each new
contract by reading the package's `/client` exports before wiring (alpha is moving).**

## Package / type map

| v1 (0.1.1) | alpha.3 replacement |
|---|---|
| `@deepseek-ai/dsh-client-runtime` (session service + types) | **removed as a package**. Session controller → `@deepseek-ai/dsh-api-session-controller` (`ISessions`/`SessionBinding`/`SessionListState`/`SessionSnapshot`/`UseProjection`); React adapter → `@deepseek-ai/dsh-client-ui-session` (`UseSessions`/`UseSession`/`SessionSnapshotSelector`/`SessionPendingInteraction`/`SessionPendingInteractionSnapshot`). Store engine → `@deepseek-ai/dsh-client-store` (`defineStore`/`StoreHandle`/`ObservableSnapshot`/`PropsStore`/`SnapshotSelectorHook`). |
| `ConversationSnapshot` (runtime `sessions/conversation.ts`) | `@deepseek-ai/dsh-client-ui-conversation` → `src/client/contract/snapshot.ts` |
| `PendingInteraction` (runtime `sessions/pending.ts` union) | `@deepseek-ai/dsh-client-ui-session` `SessionPendingInteraction` (declaration-merged `SessionPendingInteractionMap`); domain packages contribute (approval → `ui-approval`, question → `ui-user-questions`). |
| `SessionFace.prompt/cancel/loadOlder/updateQueue` | v1 drove the session face directly; alpha.3 exposes these via the Session Controller (`dsh-api-session-controller`) + ui-session hooks. Re-type the adapter facade against `SessionSnapshot`/controller actions. |
| `ctx.sessions` (`ISessions`) | session controller service; re-type via `@deepseek-ai/dsh-api-session-controller/client` `ISessions`. |
| `conversation.composer` chain / queue / `renderSlotChain` | still in `ui-conversation` (owner slot + snapshot in `contract/snapshot.ts`); confirm the composer chain + queue still exist under the new contracts (read `ui-conversation/src/client/contract/slots.ts`). |

## File-by-file migration

1. **`ui-mobile-v2/package.json`**
   - peer/devDeps: drop `@deepseek-ai/dsh-client-runtime`; add `@deepseek-ai/dsh-api-session-controller`, `@deepseek-ai/dsh-client-store`, `@deepseek-ai/dsh-client-ui-session` (workspace:^).
   - `dsh.client.inject`: add the new packages that must load before ui-mobile (`dsh-client-ui-session`, `dsh-client-ui-slots`, ...).
2. **`adapt/harness.ts`**
   - `HarnessSession` façade: re-type against `SessionSnapshot` / the session controller actions instead of the removed `SessionFace`.
   - `HarnessSnapshot.pending/queue`: `pending` → `SessionPendingInteraction`; `queue` → read from the ui-conversation snapshot contract, not the removed runtime conversation snapshot.
   - `answerApproval`/`answerQuestion`/`cancelQuestion`: keep the wire encodings, but type the carriers via `ui-approval`/`ui-user-questions` new contracts.
3. **`MobileChatPage.tsx`** — session face + snapshot reads → `useSession`/`useSessions` (ui-session hooks) / controller; composer/queue/steer → ui-conversation new contracts.
4. **`MobileQueueDock.tsx` / `MobilePendingPanel.tsx`** — re-wire to the new pending/queue types and slot/services.
5. **CSS / presentation** — unchanged (presentation layer).

## Verification

- CI matrix (v2 branch) guards `dsh-v0.1.2-alpha.3` (`build:lib` + `tsc -b packages/client/ui-mobile`).
- Local note: the working checkout stays on rc.2; alpha.3 work is on the `v2` branch and verified by the alpha.3 CI.

## Open items (read before wiring)
- `ui-conversation` composer chain + queue contract in alpha.3 (did `conversation.composer`/queue survive the restructure?).
- `ui-approval` / `ui-user-questions` carrier shapes under the `SessionPendingInteractionMap` merge model.

## Round-2 confirmed: alpha.3 session/conversation split

Confirmed against `dsh-v0.1.2-alpha.3` source:

- **`SessionSnapshot`** (session lifecycle + queue + submission state) lives in
  `@deepseek-ai/dsh-api-session-controller` (`packages/api/session-controller/src/client/contract/snapshot.ts`).
  `queue: QueuedMessage[]` moved here; **`pending` is GONE** — replaced by
  `pendingSubmissions` (local prompt-submission echoes, a different concept).
  Other fields: `running`, `subagent`, `removed`, `openState`, `openError`,
  `hasMore`, `loadingOlder`, `promptError`, `blank`, `lastAgentError`,
  `promptAttempted`, `awaitingFirstTurn`.
- **`QueuedMessage`** type also moved to `dsh-api-session-controller` (was runtime).
- **Conversation content** (`nodes` / `partial` / `runningCalls`) is a SEPARATE
  snapshot in `@deepseek-ai/dsh-client-ui-conversation` → `src/client/contract/snapshot.ts`
  (SessionSnapshot deliberately excludes Conversation target data).
- **Pending interactions** (ask-user / approval) are NOT a snapshot field: they are
  `@deepseek-ai/dsh-client-ui-session`'s `useSessionPendingInteraction`
  (global `SnapshotSelectorHook<SessionPendingInteractionSnapshot>` =
  `Map<SessionId, SessionPendingInteraction>`), fed by a declaration-merged
  `SessionPendingInteractionMap` (domain packages publish via
  `PendingInteractionPublisher`).
- **Prop scope**: `useSession` / `sessionId` / `useProjection` are
  `SessionStandardProps` (session-scoped slot props only); `useSessions` /
  `useSessionPendingInteraction` are `GlobalStandardProps`. A root-scoped shell
  gets the global ones; per-session snapshot reads need the session scope or the
  session-controller binding.

### Consequence for the rewrite
The mobile v1 read `snap.pending`/`snap.queue`/`snap.nodes` off ONE runtime
conversation snapshot. Alpha.3 splits this across three homes (session snapshot
for queue/state, ui-conversation snapshot for chat content, ui-session pending
interactions), so `adapt/harness.ts` and the three pages must be restructured —
not just retyped. This is the substantive v2 work; each step is verified by the
alpha.3 CI on the `v2` branch.

## Round-3 confirmed: type homes for the mobile imports

Resolved against `dsh-v0.1.2-alpha.3` source (the exact import retarget table):

| v1 symbol (from `@deepseek-ai/dsh-client-runtime/client`) | alpha.3 home |
|---|---|
| `SessionFace` | `@deepseek-ai/dsh-api-session-controller` (`src/client/contract/session.ts`) |
| `ConversationNode` / `RunningToolCall` | `@deepseek-ai/dsh-client-ui-conversation` (`src/client/contract/conversation.ts` / `records.ts`) |
| `SessionId` | `@deepseek-ai/dsh-session/types` (`Branded<'SessionId'>`) |
| `WorkspaceId` | `@deepseek-ai/dsh-workspace` |
| `PendingInteraction` | `@deepseek-ai/dsh-client-ui-session` (`SessionPendingInteraction`, declaration-merged map) |
| `QueuedMessage` | `@deepseek-ai/dsh-api-session-controller` (`contract/snapshot.ts`) |
| `ConnectionHandle` | changed — **no `.api`** in alpha.3 (`MobileChatMenu` `connection.api.sessions.*` breaks) |
| `ConversationSnapshot` (nodes/partial/runningCalls) | `@deepseek-ai/dsh-client-ui-conversation` (`contract/snapshot.ts`) |

Local verification loop is ready (alpha.3 worktree + `build:lib:host` done):
`pnpm exec tsc -b packages/client/ui-mobile` lists the exact remaining errors; the
error catalog is dominated by the `dsh-client-runtime` module import (6 files) plus
the downstream `{}`/implicit-any cascade, and the alpha.3 `ConnectionHandle.api`
change.
