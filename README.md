# dsh-mobile

Phone-optimized mobile UI + PIN access gateway for **DeepSeek Harness** (`dsh`).
Browse your dsh workspaces and conversations from a phone's browser — over the
public internet, behind a PIN you set on the desktop.

`dsh-mobile` is an **overlay** for a `dsh` checkout: no DeepSeek core code is
modified. Everything lives in two places:

| Path | What it is |
|---|---|
| [`ui-mobile/`](ui-mobile/) | A dsh **client plugin** (`@deepseek-ai/dsh-client-ui-mobile`): a full-screen, page-stack mobile shell that shadows the desktop three-pane frame on small viewports. Own Home / Chat / Task-details / Settings pages, plus a conversation menu (details · model · permission) and a new-workspace directory browser. |
| [`gateway/`](gateway/) | `dsh-gateway` — a tiny **zero-dependency** reverse proxy in front of `dsh web` that adds PIN access control (a self-contained login page that works in every mobile browser and in-app webview, incl. WeChat) and gzip/brotli compression, then lets an NPS TCP tunnel expose it to the public. |

## Architecture

```
                    ┌─────────────────────────────── localhost ───────────────────────────────┐
 phone (public)     │                                                                          │
  browser ──► NPS TCP tunnel ──► dsh-gateway ──► dsh web ──► dsh host (workspaces, models)
                 (untrusted)     127.0.0.1:3081    127.0.0.1:3080       (sessions, tools)
                     │              │                                                         │
                     │              ├─ PIN login page (public host)                            │
                     │              ├─ gzip/brotli + crypto.randomUUID shim                    │
                     │              └─ HMAC-signed session cookie (rotation = revocation)       │
                     └────────── loopback (127.0.0.1) bypasses the PIN entirely ───────────────┘
```

- **Gateway** — runs on loopback, proxies every HTTP request and relays the two
  dsh WebSocket event streams (`events.mux` / `events.host`) verbatim, checking
  the PIN session cookie on each handshake.
- **Mobile plugin** — registers into dsh's built-in `root` slot at priority −1
  **only while** a small viewport (or `#/mobile` / `__DSH_MOBILE__`) is active.
  On a wide viewport the registration is disposed and the desktop frame renders
  unchanged — the plugin never touches any core code.
- **PIN** — set on the desktop (loopback only `/__setpin`, or the desktop
  设置 → 插件 → 可配置 → 访问 PIN card), typed on the phone.

## Security model

Read this before exposing anything publicly.

- **The PIN is the entire trust boundary.** The gateway is only reachable from
  the public internet through the tunnel. Loopback hosts bypass the PIN (they
  are the desktop); every other host must present a valid PIN session.
- **Rotation is revocation.** The phone session cookie is an HMAC-SHA256
  signature over its expiry, keyed by the PIN. Changing the PIN immediately
  invalidates every active phone session.
- **A PIN holder is a dsh user.** With the default `workspace-write` permission
  preset, a holder can read and modify the contents of the session's workspace.
  Choose permission presets for your sessions accordingly.
- **`browse` capability trade-off** (required for the phone's 新建工作区
  directory browser): enabling it lets a PIN holder **enumerate the host's
  directory tree and create folders**. Only enable it if that matches your
  threat model — see [INSTALL.md](INSTALL.md#5-optional-enable-the-browse-directory-picker).
- **Transport is not encrypted by default.** An NPS TCP tunnel is plaintext, so
  the PIN and session cookie cross the public link unencrypted. Terminate TLS at
  the tunnel (NPS HTTPS mode, or a reverse proxy like Caddy) before real use.
- **No login throttling.** The PIN endpoint does not rate-limit, so over a
  public link a 4-digit PIN is a brute-force surface. Prefer a longer PIN (up to
  12 digits) and keep the gateway log.
- **Never commit `auth.json`.** The repo ships `auth.example.json` only;
  `auth.json` (the real PIN) is gitignored.

## Quick start

```bash
# 1. Run the gateway (set a real PIN first)
cd gateway
cp auth.example.json auth.json        # edit the "pin", or export DSH_GATEWAY_PIN
node dsh-gateway.mjs --listen 3081 --target 127.0.0.1:3080
#   set/change the PIN at http://127.0.0.1:3081/__setpin

# 2. Install the mobile plugin into your dsh checkout  →  see INSTALL.md

# 3. Point your NPS TCP tunnel at 127.0.0.1:3081 and trust your public host
#    (INSTALL.md §4). Open the tunnel URL on your phone, type the PIN, done.
```

## Repo layout

```
gateway/            dsh-gateway.mjs (PIN + compression reverse proxy), auth.example.json
ui-mobile/          the mobile UI plugin source (overlay — copy into a dsh checkout)
INSTALL.md          end-to-end install: plugin wiring, patch rows, gateway, tunnel
```

## License

[MIT](LICENSE). Built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(MIT) — the plugin is an unmodified-core overlay for it.
