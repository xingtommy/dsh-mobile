# v2 line ¡ª target: DeepSeek Harness `dsh-v0.1.2-alpha.3`

The 0.1.2 client layer **removed `@deepseek-ai/dsh-client-runtime`** (no references
remain) and split client presentation/services into domain packages:

| removed | replaced by |
|---|---|
| `@deepseek-ai/dsh-client-runtime` | `@deepseek-ai/dsh-client-store` (session/snapshot store layer) |
| ¡ª | `@deepseek-ai/dsh-client-ui-chat` / `ui-session` / `ui-approval` / `ui-schedule` |

v2 REQUIRES a client-side rewrite of ui-mobile: swap the runtime imports/types
(`SessionFace`, `PendingInteraction`, `ConversationSnapshot`, the `sessions` /
`workspaces` service faces) for their `dsh-client-store` equivalents and the new
`ui-*` domain packages, then re-wire the queue / pending / steer surfaces to the
new slot & service contracts.

STATUS: **in progress ¡ª this branch is RED against alpha.3 until the rewrite
lands.** The v1 line (`main`, tag `v1.0.0`) targets `dsh-v0.1.1-rc.2` and stays
green; the two lines are independent.

## Migrate checklist
- [ ] package.json: replace `dsh-client-runtime` deps with `dsh-client-store` + new `ui-*`
- [ ] adapt/harness.ts: retype SessionFace / PendingInteraction / ConversationSnapshot to the new store types
- [ ] MobileChatPage / MobileQueueDock / MobilePendingPanel: re-route to new slots/services
- [ ] `pnpm run build:lib` (host then client) + `tsc -b packages/client/ui-mobile` green on alpha.3
