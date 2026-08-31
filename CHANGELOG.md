# Changelog

## 2026-08-31

### Fixed

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
