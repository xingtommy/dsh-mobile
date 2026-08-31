/**
 * Hash-based page-stack navigation for the mobile shell. Every page lives
 * under the `#/mobile` prefix so the phone's system back button / swipe-back
 * gesture (browser history) walks the stack naturally, and a deep link into a
 * specific conversation lands on its page directly.
 *
 * Route table:
 *   #/mobile                     → home (workspace + session list)
 *   #/mobile/chat/<id>           → one conversation, full screen
 *   #/mobile/chat/<id>/details   → that conversation's task details
 *   #/mobile/settings            → settings
 *   #/mobile/workspaces/new      → new-workspace directory browser
 */
import { useEffect, useState } from 'react'

export const MOBILE_PREFIX = '#/mobile'

/** Parsed mobile route. */
export type MobileRoute =
  | { name: 'home' }
  | { name: 'chat'; sessionId: string }
  | { name: 'details'; sessionId: string }
  | { name: 'settings' }
  | { name: 'newWorkspace' }

/**
 * Parse the current `location.hash` into a mobile route.
 * @param hash - the raw `location.hash` value.
 * @returns the matched route; unknown paths fall back to home.
 */
export function parseMobileRoute(hash: string): MobileRoute {
  const rest = hash.replace(/^#\/?/, '').replace(/^mobile\/?/, '')
  const segments = rest.split('/').filter(Boolean)
  if (segments[0] === 'settings') return { name: 'settings' }
  if (segments[0] === 'workspaces' && segments[1] === 'new') return { name: 'newWorkspace' }
  if (segments[0] === 'chat' && segments[1] !== undefined && segments[1] !== '') {
    const sessionId = decodeURIComponent(segments[1])
    if (segments[2] === 'details') return { name: 'details', sessionId }
    return { name: 'chat', sessionId }
  }
  return { name: 'home' }
}

/** Whether a hash is an explicit mobile-shell address. */
export function isMobileHash(hash: string): boolean {
  return hash.startsWith(MOBILE_PREFIX)
}

/**
 * Live mobile route bound to `hashchange`.
 * @returns the current parsed route.
 */
export function useMobileRoute(): MobileRoute {
  const [route, setRoute] = useState(() => parseMobileRoute(window.location.hash))
  useEffect(() => {
    const onChange = (): void => { setRoute(parseMobileRoute(window.location.hash)) }
    window.addEventListener('hashchange', onChange)
    return () => { window.removeEventListener('hashchange', onChange) }
  }, [])
  return route
}

/** Push a mobile-relative path under `#/mobile`. */
function push(path: string): void {
  window.location.hash = `${MOBILE_PREFIX}/${path}`
}

/** Navigate to the home page. */
export function navigateHome(): void {
  window.location.hash = MOBILE_PREFIX
}

/** Navigate to one conversation. */
export function navigateChat(sessionId: string): void {
  push(`chat/${encodeURIComponent(sessionId)}`)
}

/** Navigate to one conversation's task details. */
export function navigateDetails(sessionId: string): void {
  push(`chat/${encodeURIComponent(sessionId)}/details`)
}

/** Navigate to settings. */
export function navigateSettings(): void {
  push('settings')
}

/** Navigate to the new-workspace directory browser. */
export function navigateNewWorkspace(): void {
  push('workspaces/new')
}

/** Step back one history entry (the shell's top-left back button). */
export function goBack(): void {
  if (window.history.length > 1) {
    window.history.back()
  } else {
    navigateHome()
  }
}
