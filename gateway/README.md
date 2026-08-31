# dsh-gateway

A tiny **zero-dependency** reverse proxy in front of `dsh web` for public phone
access over an NPS TCP tunnel.

The public door needs two things `dsh web` doesn't ship and NPS (a raw TCP
tunnel) can't add:

- **PIN access control** — a self-contained login page served by the gateway
  itself (no browser Basic-Auth dialog, so it works in every mobile browser and
  in-app webview, incl. WeChat). Open the bare URL, type the PIN, you're in.
- **Compression** — gzip / brotli for compressible responses, plus a
  `crypto.randomUUID` polyfill injected into the app shell (the public page is
  a non-secure context over plain HTTP, where `crypto.randomUUID` is missing).

## Run

```bash
cp auth.example.json auth.json   # set a real PIN (4-12 digits), or export DSH_GATEWAY_PIN
node dsh-gateway.mjs [--listen 3081] [--target 127.0.0.1:3080]
```

- **PIN**: `<dir>/auth.json` → `{"pin":"1234"}` (4-12 digits; or the
  `DSH_GATEWAY_PIN` env var). The file is watched — hand edits reload the PIN
  and invalidate all phone sessions.
- **Change the PIN** at `http://127.0.0.1:3081/__setpin` (loopback only), or on
  the desktop app via 设置 → 插件 → 可配置 → 访问 PIN card.

## Behavior

- Loopback hosts (`127.0.0.1` / `localhost`) **bypass the PIN** — they are the
  desktop — and get the admin `/__setpin` page.
- Every other host must present a valid PIN session. Top-level navigations get
  the login page; other requests get a plain `401` (no dialog).
- The session cookie is an **HMAC-SHA256** signature over its expiry, keyed by
  the PIN — changing the PIN revokes every cookie already issued.
- HTTP requests are proxied with compression; the two dsh WebSocket event
  streams (`events.mux` / `events.host`) are relayed verbatim after the PIN
  session is re-checked on the handshake.

## Security

See README → Security model. In short: the PIN is the whole trust boundary,
TLS should be terminated at the tunnel, and `auth.json` must never be
committed (`gitignore`d).
