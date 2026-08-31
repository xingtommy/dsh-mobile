/**
 * Mobile UI plugin, node half. Registers the `access-pin` settings namespace so
 * the desktop Plugins → Configurable tab serves the gateway-PIN card (the
 * card itself posts to the dsh-gateway's loopback /__setpin endpoint, which is
 * the single authority for the PIN). The browser half shadows the desktop frame
 * on small viewports — see src/client.
 */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

/** Settings namespace anchoring the gateway-PIN card in the plugins section. */
export const ACCESS_PIN_SETTINGS_NAMESPACE = 'access-pin'

/** The branded namespace; the client card keys its slot entry on the same string. */
export const ACCESS_PIN_NS = settingsNamespace(ACCESS_PIN_SETTINGS_NAMESPACE)

/**
 * Minimal schema. The namespace exists so the card is served to the
 * configurable tab; the gateway's auth.json is the PIN's source of truth, and
 * this section's value is never read by anything (the card writes to
 * /__setpin, not to this store).
 */
export const AccessPinSchema: z<{ pin: string }> = z.object({
  pin: z.string().pattern(/^\d{4,12}$/),
})

/** Composition base: a schema-valid value so the empty section resolves. */
export const ACCESS_PIN_BASE: { pin: string } = { pin: '000000' }

export { ACCESS_PIN_SETTINGS_NAMESPACE as ACCESS_PIN_SETTINGS_NS }

/**
 * Host plugin body: serve the access-pin section when a settings provider
 * exists. Named export only — cordis treats a module's default export as the
 * plugin entry, so this file must never default-export a schema.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(ACCESS_PIN_NS, AccessPinSchema, { base: ACCESS_PIN_BASE })
  })
}
