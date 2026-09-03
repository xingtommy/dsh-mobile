# Install

`dsh-mobile` never touches dsh core. You install the plugin into a `dsh`
checkout, wire it into the client bundle, mount it through the user patch
layer, and run the gateway in front of `dsh web`.

## Prerequisites

- A [`deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)
  checkout (pnpm workspace, Node ≥ 20).
- pnpm. (`corepack enable && corepack prepare pnpm@latest --activate`)

## 1. Add the plugin package

The repo carries both overlay lines and picks the one matching your harness:

- `ui-mobile-v1/` — the v1 overlay (targets `dsh-v0.1.1-rc.2`, imports
  `@deepseek-ai/dsh-client-runtime`).
- `ui-mobile-v2/` — the v2 overlay (targets the `0.1.2+` alpha.3 client layer).

Copy the file is one step; picking the right one is what
`scripts/compat-patch.mjs` does for you — it reads your checkout's harness
version and injects the matching variant:

```bash
node scripts/compat-patch.mjs <checkout> .   # e.g. node scripts/compat-patch.mjs ../deepseek-harness .
```

The script copies the selected overlay into `<checkout>/packages/client/ui-mobile`,
adds the `tsconfig.client.json` reference, and declares the web-app bundle
dependency (INSTALL.md §2). The injected package stays named
`@deepseek-ai/dsh-client-ui-mobile` — the bundle and the patch layer reference
it by that name.

To inject manually, copy the variant dir instead:

```bash
cp -r ui-mobile-v2 <checkout>/packages/client/ui-mobile   # or ui-mobile-v1
```

## 2. Wire the bundle

**`packages/bundle/web-app/package.json`** — add the workspace dependency to
`dependencies` (keep it alphabetized):

```jsonc
"@deepseek-ai/dsh-client-ui-mobile": "workspace:^",
```

**`tsconfig.client.json`** — add the project to `references`:

```jsonc
{ "path": "./packages/client/ui-mobile" },
```

Then regenerate the lockfile and build the client bundle:

```bash
pnpm install
pnpm run build:lib:client
```

## 3. Mount the plugin (user patch layer)

In `$DSH_HOME/cordis.patch.yml` (default `~/.dsh/cordis.patch.yml`):

```yaml
- insert:
    - id: ui-mobile
      name: '@deepseek-ai/dsh-client-ui-mobile'
```

Restart `dsh web`. On a viewport ≤ 767px — or with `#/mobile` / `__DSH_MOBILE__`
— the mobile shell renders; the desktop frame is untouched.

## 4. Trust your public host

Expose `dsh web` to the tunnel's hostname by appending it to `trustedHosts` on
the `web-runtime` row (a full row override — keep the other keys):

```yaml
- id: web-runtime
  config:
    openBrowser: !!js ctx.webStartup.openBrowser
    printUrl: true
    surfaceContext: true
    trustedHosts: !!js [...ctx.webStartup.trustedHosts, 'your.public.host']
```

## 5. (Optional) Enable the browse directory picker

The phone's 新建工作区 directory browser talks to the host `browse` capability
(`host.listDirectory` / `host.createDirectory`). The default adaptive picker
serves the **native OS dialog** on a loopback-bound win32 desktop, which has no
`browse` capability — so compose the browse backend and its desktop surface
instead. The patch layer can't swap a row's module (a `name` mismatch is
skipped by design), so the adaptive auto row is disabled and the browse rows
are inserted:

```yaml
- id: directory-picker
  disabled: true
- insert:
    - id: directory-picker-browse
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: ui-directory-picker-browse
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
```

**Security trade-off:** a PIN holder can now enumerate the host's directory
tree and create folders. Desktop create-workspace also switches from the native
dialog to the in-app browser. See README → Security model.

## 6. Run the gateway

```bash
cd gateway
cp auth.example.json auth.json     # set a real PIN (4-12 digits), or export DSH_GATEWAY_PIN
node dsh-gateway.mjs --listen 3081 --target 127.0.0.1:3080
```

- Set / change the PIN at `http://127.0.0.1:3081/__setpin` (loopback only), or
  on the desktop via 设置 → 插件 → 可配置 → 访问 PIN card.
- `auth.json` is watched — hand edits reload the running PIN.
- **Keep it running**: a bare `node` process dies with whatever console killed
  node. On Windows, `gateway\install-task.ps1` installs a sign-in autostart —
  by default a Startup-folder entry (visible in Task Manager → Startup apps,
  delete the file to uninstall); `-Task` opts into a crash-restarting
  Scheduled Task instead, which is a security-sensitive persistence mechanism
  corporate EDR/policy may flag. `-Remove` undoes either:

  ```powershell
  powershell -ExecutionPolicy Bypass -File gateway\install-task.ps1                    # Startup folder + start
  powershell -ExecutionPolicy Bypass -File gateway\install-task.ps1 -Action task       # Scheduled Task instead
  powershell -ExecutionPolicy Bypass -File gateway\install-task.ps1 -Action status
  powershell -ExecutionPolicy Bypass -File gateway\install-task.ps1 -Action remove     # undoes both
  ```

  See `gateway/README.md` for the Linux systemd equivalent.
- **Point your NPS TCP tunnel at `127.0.0.1:3081`**, not at dsh directly. The
  gateway checks the PIN session cookie on every HTTP request and every
  WebSocket handshake (the two dsh event streams).

## 7. Verify

- Loopback: `http://127.0.0.1:3081` needs no PIN and renders the desktop app.
- Public: open the tunnel URL on the phone → PIN page → the mobile shell.
- `ui-mobile/e2e/mobile.mjs` is a Playwright smoke test that drives the mobile
  shell and the gateway against a live `dsh web` (`DSH_GATEWAY=1` to exercise
  the proxy).

## 8. Troubleshooting

**`failed to apply loader entry … slot "settings.plugin.item" is not declared`**
— older `ui-mobile` copies registered the gateway-PIN card without declaring
`@deepseek-ai/dsh-client-ui-settings-plugins` as a loader-level inject, so the
slot the card registers into could resolve before its owner loaded, failing the
whole plugin. Fixed in this repo's overlay `package.json` (`dsh.client.inject`);
re-run `scripts/compat-patch.mjs` over your checkout's copy and restart `dsh web`.

**The phone renders the app shell but every list is empty** — that is dsh's
`/api` trust fence, not missing data: non-loopback `Host` headers are answered
403 before any RPC or event-stream upgrade, so the page loads (static assets)
while sessions and workspaces never arrive. The §4 `trustedHosts` row is
mandatory for public access. After adding it and restarting `dsh web`, the
WebSocket upgrade for `/api/events.mux` must answer `101`, not `403`, under
your public Host.

**The gateway dies whenever `dsh web` restarts** — a bare `node` process dies
with whatever console killed node. Supervise it: `gateway\install-task.ps1`
(§6) on Windows, or the systemd unit in `gateway/README.md` on Linux.
