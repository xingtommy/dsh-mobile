/**
 * Mobile UI plugin, browser half. A dedicated full-screen page-stack shell
 * (home → chat → details, plus settings) that shadows the desktop AppFrame on
 * small viewports by registering into the built-in `root` slot at priority −1.
 *
 * The shadow is conditional and reversible: on a wide viewport (and without an
 * explicit `#/mobile` address or `__DSH_MOBILE__` flag) the registration is
 * disposed and the desktop frame renders unchanged — this plugin never touches
 * any core code. Because the shell registers into `root` WITHOUT declaring
 * children, it coexists with ui-layout's frame registration (same cell,
 * distinct priority — lowest renders) and needs no store seat.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
// Type-only: pulls the slot registry's Context merge (ctx.slots) into the
// client program (declared by ui-renderer's client entry).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale) and the
// theme plugin's (ctx.theme) into the client program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { AccessPinCard, ACCESS_PIN_NS } from './AccessPinCard.tsx'
import { MobileShell, type MobileInjected } from './MobileShell.tsx'
import { en, zh, type MobileKey } from './locales.ts'
import { isMobileHash } from './useMobileNav.ts'

export type { MobileRoute, MobileRoute as MobileNavRoute } from './useMobileNav.ts'
export type { MobilePageProps, MobileInjected } from './MobileShell.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The mobile shell's page-stack copy. */
    mobile: MobileKey
  }
}

declare global {
  interface Window {
    /** Set by the optional `/mobile` route: force the mobile shell even on a wide viewport. */
    __DSH_MOBILE__?: boolean
  }
}

const NS = 'mobile'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'sessions', 'workspaces', 'uiWorkspace', 'uiConversation', 'locale', 'theme', 'modelDirectories']

/**
 * Client plugin body: register the mobile shell into `root` (priority −1)
 * while a mobile viewport or address is active, and keep that decision live
 * against viewport and hash changes. Registering (or disposing) inside a
 * `ctx.effect` follows the host's HMR lifecycle.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const mq = window.matchMedia('(max-width: 767px)')
  const isMobile = (): boolean => window.__DSH_MOBILE__ === true || isMobileHash(window.location.hash) || mq.matches

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-mobile: dictionaries')

  // The gateway-PIN card lives in the desktop Plugins → Configurable tab. It is
  // registered unconditionally — a wide viewport renders the desktop settings
  // section (a small viewport shows the mobile shell's own settings page and
  // never dispatches it), and the tab only dispatches the card because the node
  // half serves the `access-pin` namespace.
  ctx.effect(() => ctx.slots.register({
    name: 'settings.plugin.item',
    key: ACCESS_PIN_NS,
    locale: NS,
  }, AccessPinCard), 'ui-mobile: gateway-PIN card in the plugins tab')

  ctx.effect(() => {
    let disposeRegistration: (() => void) | undefined
    const sync = (): void => {
      const mobile = isMobile()
      if (mobile && disposeRegistration === undefined) {
        disposeRegistration = ctx.slots.register({
          name: 'root',
          // Lower than the desktop frame's default 0: the shell wins the cell.
          priority: -1,
          // No children / no store: the desktop frame's declarations stay on
          // the ledger untouched, and this entry only ever owns its own page.
          locale: NS,
          inject: (): MobileInjected => ({
            // The hash router's ids are plain strings; brand them at the service boundary.
            binding: (id: string) => ctx.sessions.binding(id as SessionId)?.session,
            openSession: (id: string) => ctx.sessions.open(id as SessionId),
            startSession: (workspaceId?: string) => ctx.get('uiWorkspace').startSession(workspaceId as WorkspaceId | undefined),
            conversation: (sessionId: SessionId) => {
              const binding = ctx.uiConversation.binding(sessionId)
              return binding === undefined ? undefined : binding.target('chat')
            },
            modelDirectory: (sessionId: SessionId) => {
              try { return ctx.modelDirectories.directoryFor(sessionId) } catch { return undefined }
            },
            createWorkspace: (path: string) => ctx.workspaces.create({ path }).then(() => undefined),
            listDirectory: (path?: string) => ctx.get('uiWorkspace').listDirectory(path),
            createDirectory: (path: string, name: string) => ctx.get('uiWorkspace').createDirectory(path, name),
            setTheme: (id: string) => ctx.theme.setTheme(id),
            setLocale: (id: string) => ctx.locale.setLocale(id),
            // The locale service is itself a LocaleFace (getSnapshot/subscribe).
            locale: ctx.locale,
            // The theme service exposes no face; wrap its change event into
            // the ObservableSnapshot contract (subscribe pairs with mount).
            theme: {
              getSnapshot: () => ctx.theme.getTheme(),
              subscribe: (fn) => ctx.on('theme/change', fn),
            },
          }),
        }, MobileShell)
      } else if (!mobile && disposeRegistration !== undefined) {
        disposeRegistration()
        disposeRegistration = undefined
      }
    }
    sync()
    const onChange = (): void => { sync() }
    mq.addEventListener('change', onChange)
    window.addEventListener('hashchange', onChange)
    return () => {
      mq.removeEventListener('change', onChange)
      window.removeEventListener('hashchange', onChange)
      disposeRegistration?.()
    }
  }, 'ui-mobile: shadow the root slot on small viewports')
}
