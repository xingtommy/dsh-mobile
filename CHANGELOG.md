# Changelog

## 2026-08-31

### Added

- **ui-mobile**: queue dock in the chat page, mirroring the desktop inbox.
  Queued messages (including messages the user sent while the agent was busy)
  now render as rows with per-row Edit (in place, text rows), Remove, and
  Steer-send (running only), all through the same `updateQueue` protocol the
  desktop dock uses. Previously the mobile shell had no visible queue at all.

- **ui-mobile**: interjection ("插话") from the mobile chat page. While the
  agent is running the composer now shows both an Interject button and Stop:
  sending while running goes through `prompt(content, 'steer')` so the message
  jumps the queue into the live turn, matching the desktop composer's
  steer-while-running behaviour; idle sends stay `queue`.

- **ui-mobile**: assistant messages now render as markdown. Assistant text
  blocks and the streaming partial go through the shared MarkdownText
  primitive (GFM headings/bold/lists/code, sanitized, streaming-aware)
  instead of pre-wrapped plain text; user bubbles stay plain. Previously
  `##` headings and bold showed as raw markdown characters on the phone.

- **ui-mobile**: pending host interactions (ask-user question batches and tool
  approvals) now render in the mobile chat page. The session face snapshot
  already exposes `pending: readonly PendingInteraction[]`; the new
  MobilePendingPanel renders an approval card (waiting strip, reason or
  tool-name escalation headline, paired shell command, Deny / Allow-once) and
  a question card (stacked questions, single/multi options with recommended
  badges, custom answers, per-question skip, cancel) above the composer,
  answering through the carrier `respond` protocol with the same wire
  encodings as the desktop composer chain. Previously a pending interaction
  left the mobile task looking stuck with nothing to answer.

### Changed

- **gateway/install-task.ps1**: replaced the `[switch]` parameters with a single
  `-Action install|status|remove|task` string. Switch parameters failed to bind
  when the script was launched via `powershell -File` from wrapped/hosted
  sessions (`Cannot convert value ... to type SwitchParameter`) while the same
  invocation through `-Command` worked; a value parameter eliminates that
  entire failure class. Also: the port probe now uses a raw TcpClient instead
  of `Test-NetConnection`, the script is pure ASCII (Windows PowerShell 5.1
  reads BOM-less files as ANSI and mangles non-ASCII tokens under `-File`),
  and the Startup-folder install starts the gateway immediately instead of
  waiting for the next sign-in.
- **gateway/install-task.ps1**: the default autostart is now a Startup-folder
  entry (user-visible in Task Manager → Startup apps, delete the file to
  uninstall) rather than a logon Scheduled Task. Scheduled tasks are a
  security-sensitive persistence mechanism (MITRE T1053.005) that corporate
  EDR/policy may flag and that outlives the repo folder when uninstalled
  by hand; `-Action task` opts into it for crash-restarting behaviour, and
  `-Action remove` cleans up both mechanisms.

### Fixed

- **ui-mobile**: the mobile Home session list now filters out archived
  sessions (`workspaces.archivedSessionIds`), matching the desktop browser,
  which excludes them in every list mode. Previously the mobile shell showed
  archived sessions as if they were active.

- **ui-mobile**: declared `@deepseek-ai/dsh-client-ui-settings-plugins` in the
  package's `dsh.client.inject` list. The gateway-PIN card registers into the
  `settings.plugin.item` slot, which that package declares; without the inject
  entry the loader could apply ui-mobile before the slot's owner, failing the
  whole plugin with
  `slot "settings.plugin.item" is not declared (a parent entry's children table must declare it)`.
  The failure surfaced on small viewports (the mobile shell) and its likelihood
  depended on the surrounding bundle composition — e.g. removing another
  profile bundle could reorder the loader tree and trigger it.

### Documented

- INSTALL.md: new **Troubleshooting** section covering the three field failure
  signatures seen in deployment:
  - the loader-slot error above,
  - a phone that renders the shell but shows no sessions (missing §4
    `trustedHosts` row → the `/api` trust fence 403s every RPC and event-stream
    upgrade under the public Host),
  - a gateway that dies whenever `dsh web` restarts (supervise it with a
    logon scheduled task; example included).
