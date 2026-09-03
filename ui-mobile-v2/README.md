# ui-mobile — dsh mobile UI plugin

`@deepseek-ai/dsh-client-ui-mobile` — a full-screen, page-stack mobile shell
for DeepSeek Harness. On a small viewport it shadows the desktop three-pane
frame and gives the phone a native-app-like experience:

- **Home** — workspace filter chips, the session list, New Session (`+`), and
  the door to Settings.
- **Chat** — one conversation, full screen: back button, title (tap for
  details), streaming message flow, running tool calls, composer (send / stop),
  load-older.
- **Details** — the conversation's task execution details.
- **Settings** — theme (light/dark/system), language (zh/en), about, and
  New workspace.
- **Conversation menu** (`⋯`) — Details, **Model** (pick a provider/model from
  the live model directory) and **Permission** (switch the session's permission
  preset: read-only / workspace-write / danger-full-access, the latter behind a
  confirmation gate).
- **New workspace** — an in-app directory browser over the host `browse`
  capability (`host.listDirectory` / `host.createDirectory`): navigate, create
  folders, pick a root.
- **Access PIN card** — the desktop 设置 → 插件 → 可配置 entry that sets the
  gateway PIN (see [`gateway/`](../gateway/)).

## How it stays out of core

The shell registers into dsh's built-in `root` slot at **priority −1**, and
**only while** a mobile viewport or `#/mobile` / `__DSH_MOBILE__` is active. On
a wide viewport the registration is disposed and the desktop frame renders
unchanged. No core package is modified; model/permission switching ride the
existing non-pinned RPCs (`session.models`, `session.selectModel`) and the
`/permission <preset>` command.

## Build & install

This is **source only** — it builds inside a `dsh` checkout (the `tsdown`
`clientBundle` preset, workspace peers). See [`INSTALL.md`](../INSTALL.md) for
the copy-in, bundle wiring, and patch rows.

```bash
# inside the checkout, after copying this directory to packages/client/ui-mobile:
pnpm install && pnpm run build:lib:client
```

## Test

`e2e/mobile.mjs` is a Playwright smoke test against a **live** `dsh web`
(`DSH_GATEWAY=1` also exercises the gateway). Not part of the repo's vitest
suite — it drives the real booted server.
