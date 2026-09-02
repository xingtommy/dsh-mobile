# dsh-mobile — HAIND OFF / PROJECT STATE (handoff for a fresh session)

> This is the complete state of the `dsh-mobile` project as of the v2 rewrite being
> **started but not finished**. A new session should read this first, then act on the
> `v2` work. Everything below is current and verified unless marked TODO.

## ⚡ FIRST — read these before anything else (new session got stuck here)

1. **git is blocked by the DSH file sandbox by default.** `git.exe` fails with
   `Access is denied` (even `git --version`). This is **expected**, not a broken install.
   **Every denied git command must be retried once with `sandbox_permissions:
   danger-full-access` + a one-sentence justification.** Example:
   ```
   git checkout v2            # → Access is denied
   git checkout v2            # retry with sandbox_permissions: danger-full-access, justification:
                              #   "需要一个 git 可用的沙箱来切换 v2 分支并提交，git 必须能运行"
   ```
   If the session's approval policy is `never` (escalation disabled), git **cannot run**:
   then do the **edits + local verification only** in the alpha.3 worktree (git-less) and
   hand the dsh-mobile repo commits to a git-capable session/machine, or reconfigure the
   session to allow git.

2. **The `v2` branch must be checked out to see the v2 work.** `HANDOFF.md` (this file) is
   on `main` and contains the full plan (see §3). But the actual migrated files
   (`ui-mobile/package.json`, `ui-mobile/tsconfig.json`), `v2-SPEC.md`, and `v2-ROADMAP.md`
   live on the **`v2` branch**. After git works, run `git checkout v2`. (Plan info is inline
   in §3 even on `main`; the committed file state needs the branch.)

3. **Workspace recommendation:** use `G:\xing\YYE\check_104` — it contains BOTH the repo
   (`dsh-mobile`, source + commits) and the alpha.3 worktree (`alpha3-worktree`, local
   verification). One workspace root avoids cross-root sandbox friction.

4. **Environment gotchas:**
   - pnpm must be invoked as **`pnpm.cmd`** (ExecutionPolicy blocks `pnpm.ps1`).
   - PowerShell 5.1 strips inner double quotes when passing args to native exes → avoid
     inline `node -e '...'`; use file scripts (`scripts/compat-patch.mjs`).
   - **Never touch `G:\xing\deepseek-harness`** (the v1 checkout, stable line). All v2 work
     is in the `dsh-mobile` repo + `alpha3-worktree`.

---

## 1. What this project is

`dsh-mobile` (repo <https://github.com/xingtommy/dsh-mobile>, owner `xingtommy`) is an
**overlay** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`).
It adds a phone-optimized mobile UI + a PIN access gateway. It is split into two
independent lines because the harness client layer was restructured between versions:

| Line | Branch / tag | Targets harness | Status |
|---|---|---|---|
| **v1** | `main`, tag `v1.0.0` | `dsh-v0.1.1-rc.2` | ✅ **done, tested, using it** |
| **v2** | `v2` branch | `dsh-v0.1.2-alpha.3` | 🚧 **code rewrite IN PROGRESS** |

Both carry the same two pieces:
- **`ui-mobile/`** — a dsh **client plugin** (`@deepseek-ai/dsh-client-ui-mobile`): a
  full-screen mobile page-stack shell that shadows the desktop frame on small viewports
  (≤767px or `#/mobile`).
- **`gateway/`** — `dsh-gateway.mjs`, a zero-dependency PIN + compression reverse proxy in
  front of `dsh web`, for public phone access over an NPS TCP tunnel.
- **`scripts/compat-patch.mjs`** — injects `ui-mobile` into a harness checkout as a
  workspace member (mirrors INSTALL.md §1-2; used by CI and the local worktree).

---

## 2. v1 (works, do not break it)

`main` @ `v1.0.0`, targeting `dsh-v0.1.1-rc.2`. All mobile features work and were
verified on a phone.

### Features (all implemented + working)
- Mobile shell (root-slot shadow on small viewport / `#/mobile` / `__DSH_MOBILE__`).
- Home (workspace chips, session list, new session), chat page (message list + composer),
  task details, settings (theme/language/about).
- Session menu: model picker, permission switching (`/permission` command + confirm).
- **Queue dock** (排队中): per-row **编辑 / 删除 / 插话发送**, driven by the same
  `updateQueue` protocol as the desktop (placement `queued` rows only).
- **Interject** (`插话`): while running the composer is input(full width) + 发送 + 停止;
  sending while running goes `queue` mode; per-message steer via the queue dock.
- **Pending interactions** (ask-user questions + tool approvals) answerable on the phone
  (MobilePendingPanel). Verified end-to-end (a question was answered from the phone).
- **Markdown** rendering for assistant messages (shared `MarkdownText` primitive).
- **Archived-session filtering** (hidden from the mobile list, matching the desktop).
- **Gateway-PIN card** in desktop Settings → Plugins → 可配置 (`settings.plugin.item` slot).
- `dsh.client.inject` includes `@deepseek-ai/dsh-client-ui-settings-plugins` (fixed a slot
  "not declared" loader failure).

### Bugs fixed during v1 (all in commits on `main`)
Injectable `ui-settings-plugins` ordering; archived-session leak in mobile list; queue/
steer mode toggle cleanup (the "排队" toggle was removed — queue is default, steer via dock);
markdown plain-text rendering; ask/approval wire encodings centralized in `adapt/harness.ts`;
`ConnectionHandle`/`MarkdownText`/`settingsNamespace` changes are **v2** concerns.

### How it runs (this machine)
- dsh checkout: `G:\xing\deepseek-harness` (at `0.1.1-rc.2`, `b150a551b8`).
- Start: `start-dsh-web.bat` (in the checkout) — starts the PIN gateway (if 3081 is idle)
  then `pnpm dsh web` (which itself opens the browser once). dsh web = `127.0.0.1:3080`.
- Gateway: `G:\xing\YYE\check_104\dsh-mobile\gateway`, `node dsh-gateway.mjs --listen 3081
  --target 127.0.0.1:3080`. Registered as a **logon scheduled task** (see `gateway/
  install-task.ps1`, now `-Action install|status|remove|task`). auth.json carries the PIN
  (**still the placeholder `123456` — change it** at <http://127.0.0.1:3081/__setpin>).
- Phone access: `http://39.106.132.53:3081` (NPS tunnel → local gateway → dsh web). PIN
  required for non-loopback hosts; loopback/IP bypass only when you already have a session.
- NPS: server `39.106.132.53` (bridge `8024`, public_vkey `f220743ac88d1e1f23bb8603503858a2`),
  client `C:\nps` (installed as Windows service, config `C:\nps\npc.conf`, tunnel server
  3081 → local 127.0.0.1:3081).

### CI (v1)
`.github/workflows/compat.yml` on `main` targets `dsh-v0.1.1-rc.2` (build:lib + tsc). It is
**green on `main`**. Note: `pnpm install` needs `--no-frozen-lockfile`; the build is
`pnpm run build:lib` (host first generates `/remote` types), not `build:lib:client`.

---

## 3. v2 (the actual work — IN PROGRESS)

Targeting `dsh-v0.1.2-alpha.3`. **Motivation:** a harness upgrade was the whole point;
the old approach (the v1 overlay) is structurally incompatible with alpha.3 because
**alpha.3 removed the `@deepseek-ai/dsh-client-runtime` package.**

### The core problem (why v1 breaks on alpha.3)
`dsh-v0.1.2-alpha.3` **deleted `@deepseek-ai/dsh-client-runtime`** (no references remain)
and repackaged the client layer:
- **store engine** → `@deepseek-ai/dsh-client-store` (`defineStore`/`StoreHandle`/
  `ObservableSnapshot`/`PropsStore`/`SnapshotSelectorHook`).
- **session controller** → `@deepseek-ai/dsh-api-session-controller` (`ISessions`,
  `SessionBinding`, `SessionListState`, `SessionSnapshot`, `SessionFace`/`ISession`,
  `UseProjection`). Native `SessionId = Branded<'SessionId'>`.
- **session→React adapter** → `@deepseek-ai/dsh-client-ui-session` (`UseSessions`,
  `UseSession`, `SessionSnapshotSelector`, `SessionPendingInteraction` /
  `SessionPendingInteractionSnapshot`, `PendingInteractionPublisher`).
- **conversation / chat content** → `@deepseek-ai/dsh-client-ui-conversation`
  (`ConversationSnapshot` in `src/client/contract/snapshot.ts`, plus `records.ts` for
  `RunningToolCall`/`ConversationNode`).
- **approvals / questions** → `@deepseek-ai/dsh-client-ui-approval`,
  `@deepseek-ai/dsh-client-ui-user-questions`.
- **pending interactions are NOT a snapshot field**: they are `ui-session`'s
  `useSessionPendingInteraction` (global `Map<SessionId, SessionPendingInteraction>`),
  fed by a declaration-merged `SessionPendingInteractionMap`.

### alpha.3 data-model split (must-read for the rewrite)
v1 read ONE runtime snapshot (`snap.pending`/`snap.queue`/`snap.nodes`). alpha.3 splits it:
1. **Session state + queue** → `SessionSnapshot` (`dsh-api-session-controller`): `queue`,
   `pendingSubmissions` (NOT `pending`), `running`, `subagent`, `removed`, `openState`,
   `openError`, `hasMore`, `loadingOlder`, `promptError`, `blank`, `lastAgentError`,
   `promptAttempted`, `awaitingFirstTurn`.
2. **Conversation content** (`nodes`/`partial`/`runningCalls`) → separate
   `ConversationSnapshot` (`dsh-client-ui-conversation`).
3. **Pending interactions** → `useSessionPendingInteraction` (ui-session), not snapshot.
- **Prop scope**: `useSession`/`sessionId`/`useProjection` = `SessionStandardProps`
  (session-scoped slot props). `useSessions`/`useSessionPendingInteraction` =
  `GlobalStandardProps`. A root-scoped shell gets the global ones; per-session snapshot
  reads need the session scope or the session-controller `binding(id).session`
  (`SessionFace`/`ISession` with a reactive `ObservableSnapshot<SessionSnapshot>` source).

### v2 status — exact
Already done (commits on the `v2` branch):
1. `ui-mobile/package.json` deps migrated: removed `dsh-client-runtime`; added
   `dsh-api-session-controller`, `dsh-client-store`, `dsh-client-ui-session`,
   `dsh-client-ui-conversation`, `dsh-client-ui-approval`, `dsh-client-ui-user-questions`
   (peer + dev + inject). ✅ Unblocks `install`.
2. `ui-mobile/tsconfig.json` references retargeted: removed `../runtime`; added `../ui-session`,
   `../store`, `../ui-conversation`, `../ui-approval`, `../ui-user-questions`,
   `../../api/session-controller/tsconfig.client.json`. ✅
3. `adapt/harness.ts` **rewritten to alpha.3** (imports `ISession`, `SessionSnapshot`,
   `ObservableSnapshot`, `SessionPendingInteraction`, `SessionId`; facade types
   `HarnessSession`/`HarnessSnapshot`/`HarnessConversation`; `answerApproval`/
   `answerQuestion`/`cancelQuestion` are **stubbed to throw "not yet wired"** — the
   alpha.3 pending carriers still need reading). ✅ (partially)
4. `v2-ROADMAP.md` + `v2-SPEC.md` (migration checklist + type/package map + file-by-file
   plan) committed on `v2`. ✅
5. Local verification environment set up (see §4). ✅
6. `.github/workflows/compat.yml` on `v2` targets `dsh-v0.1.2-alpha.3` (currently RED —
   expected until the rewrite lands).

Still to do (the bulk):
- **Resolve TS2878** ("import path is unsafe to rewrite… resolves to another project"):
  the composite-project import resolution across the new references. Ensure every alpha.3
  package ui-mobile imports is a proper tsconfig `reference` with correct
  `dsh.client`/composite config; likely need `../../core/session` (dsh-session) and the
  right path style for `dsh-api-session-controller`/`dsh-client-store`/`dsh-client-ui-session`
  etc.
- **Migrate the 11 page/hook files** off `@deepseek-ai/dsh-client-runtime/client`:
  `index.ts`, `useSnapshot.ts`, `MobileHome.tsx`, `MobileChatPage.tsx`,
  `MobileChatMenu.tsx`, `MobileDetailsPage.tsx`, `MobileMessageItem.tsx`,
  `MobilePendingPanel.tsx`, `MobileQueueDock.tsx`, `MobileSettingsPage.tsx`,
  `MobileShell.tsx`.
  Per-file work: (a) retarget type imports per the table below; (b) rework the data reads
  to the alpha.3 split (session snapshot for queue/state, ui-conversation snapshot for
  chat content, `useSessionPendingInteraction` for pending); (c) fix `ConnectionHandle.api`
  (`MobileChatMenu` — alpha.3 `ConnectionHandle` has no `.api`; route models/permission
  through the new session/API); (d) fix `MarkdownText` props (`MobileMessageItem` — the
  `labels`/`fileMentions`/`streaming` signature changed); (e) fix `settingsNamespace`
  (`useSnapshot.ts` — `@deepseek-ai/dsh-settings` no longer exports it).

### v2 import retarget table (fill these in per file)
| v1 symbol (`@deepseek-ai/dsh-client-runtime/client`) | alpha.3 home |
|---|---|
| `SessionFace` / `ISession` | `@deepseek-ai/dsh-api-session-controller` |
| `ConversationSnapshot` (nodes/partial/runningCalls) | `@deepseek-ai/dsh-client-ui-conversation` (contract/snapshot.ts) |
| `RunningToolCall` / `ConversationNode` | `@deepseek-ai/dsh-client-ui-conversation` (records.ts / conversation.ts) |
| `SessionId` | `@deepseek-ai/dsh-session/types` |
| `WorkspaceId` | `@deepseek-ai/dsh-workspace` |
| `QueuedMessage` | `@deepseek-ai/dsh-api-session-controller` (contract/snapshot.ts) |
| `PendingInteraction` | `@deepseek-ai/dsh-client-ui-session` (`SessionPendingInteraction`) |
| `ObservableSnapshot` / `SnapshotSelectorHook` | `@deepseek-ai/dsh-client-store` |
| `ConnectionHandle` | changed — no `.api` in alpha.3 |

---

## 4. Environment / local verification (already set up)

- **v1 dsh checkout**: `G:\xing\deepseek-harness` (0.1.1-rc.2). Working; do not disturb.
- **alpha.3 worktree**: `G:\xing\YYE\check_104\alpha3-worktree` — a git worktree at
  `dsh-v0.1.2-alpha.3` (HEAD `dd6322d6`, `pnpm@11.7.0`, `node ^22.19 || >=24`). The v2
  `ui-mobile` is already injected (copy + tsconfig reference + web-app dep), and
  `pnpm install` + `pnpm run build:lib:host` are **done**. Local verification loop:
  ```
  cd G:\xing\YYE\check_104\alpha3-worktree
  pnpm.cmd exec tsc -b packages/client/ui-mobile   # lists the exact migration errors
  ```
- **Tools**: Node `v24.14.0`. **pnpm must be invoked as `pnpm.cmd`** (ExecutionPolicy blocks
  `pnpm.ps1`). PowerShell 5.1 mangles inner double quotes when passing native args — avoid
  inline `node -e '...'`; use file scripts (`scripts/compat-patch.mjs`).
- **Network**: proxy `127.0.0.1:7890` (Clash) is up/down intermittently; direct GitHub also
  flaky. Push rule: if `git push` fails with "connection reset/timeout" to `github.com:443`,
  retry **through the proxy** (`git push` with the repo's configured `http.proxy=127.0.0.1:7890`);
  if the proxy is down, retry **direct** (`git -c http.proxy= -c https.proxy= push`). GitHub
  Actions **run logs need admin rights** (unauthenticated API returns 403) — ask the user to
  paste the failing step from the Actions page.
- **CI**: `.github/workflows/compat.yml` — matrix currently `[dsh-v0.1.1-rc.2]` on `main`,
  `[dsh-v0.1.2-alpha.3]` on `v2`.

---

## 5. How to continue v2 (recommended order)

1. Start in **`G:\xing\YYE\check_104\alpha3-worktree`** (local, fast iteration).
2. Fix TS2878 resolution: make sure every alpha.3 package ui-mobile imports is a correct
   `references` entry. Add missing ones (`dsh-session` → `../../core/session`, etc.); verify
   the referenced projects build.
3. Migrate the hook/file imports that gate everything: `useSnapshot.ts`, `index.ts`
   (the `ctx.sessions`/hooks wiring), `adapt/harness.ts` (already partly done).
4. Then the presentation pages. For each, rework the data reads to the alpha.3 split and
   retarget imports per the table.
5. Iterate `pnpm.cmd exec tsc -b packages/client/ui-mobile` to green locally.
6. Commit to `v2`, push; the `v2` CI matrix (`dsh-v0.1.2-alpha.3`) then confirms. When green,
   write the "install-time auto-select-version" wrapper (see §6) so install picks v1 or v2 by
   the actual harness version.
7. Never touch `main` (v1) until v2 is green and you want to fold the versions.

## 6. Future idea user requested (not yet built)
"Install one plugin that auto-runs the correct implementation by actual harness version."
**Runtime auto-switch is NOT feasible** (v1 imports `dsh-client-runtime`, v2 imports
`dsh-client-store` — mutually exclusive packages; dsh has no dynamic per-version plugin-dep
hook). **The feasible form** is an **install-time selector**: `scripts/compat-patch.mjs`
reads the harness version and copies v1 or v2 `ui-mobile/` into `packages/client/ui-mobile`.
That's the delivery wrapper to build after v2 is functional.

---

## 7. Repo / git state
- `main` @ `v1.0.0` (green). `v2` branch exists (RED, in progress). Tags: `v1.0.0`.
- Recent v2 commits: deps migration, tsconfig retarget, adapt/harness retype, SPEC/ROADMAP,
  type-home map.
- Local repo: `G:\xing\YYE\check_104\dsh-mobile` (current working copy). Switch branches with
  `git checkout main|v2`.
- **Do not commit secrets.** `gateway/auth.json` is gitignored; the PIN is still the
  placeholder `123456`.

## 8. Outstanding user-facing reminders
- Change the gateway PIN from `123456` (http://127.0.0.1:3081/__setpin).
- The "install-time auto select version" wrapper is not built (v2 must be code-complete first).
