/**
 * The mobile shell: a full-screen page-stack container. One page at a time
 * (home / chat / details / settings), driven by the `#/mobile` hash so the
 * phone's system back gesture walks the stack. On mount it normalizes a bare
 * narrow-viewport load to `#/mobile`.
 */
import { useEffect } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionFace, SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ObservableSnapshot, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store'
import type { UseSessionPendingInteraction } from '@deepseek-ai/dsh-client-ui-session/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ModelDirectory } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { DirectoryListing } from '@deepseek-ai/dsh-host-directory-picker/types'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { LocaleSnapshot } from '@deepseek-ai/dsh-client-locale/client'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import { MobileChatPage } from './MobileChatPage.tsx'
import { MobileDetailsPage } from './MobileDetailsPage.tsx'
import { MobileHome } from './MobileHome.tsx'
import { MobileNewWorkspacePage } from './MobileNewWorkspacePage.tsx'
import { MobileSettingsPage } from './MobileSettingsPage.tsx'
import { MOBILE_PREFIX, isMobileHash, useMobileRoute } from './useMobileNav.ts'
import css from './MobileShell.module.css'

/** Capability face captured from the apply closure and injected into the shell. */
export interface MobileInjected {
  /** Resolve a session's outward face (undefined when not listed/known). */
  binding(id: string): SessionFace | undefined
  /** Select a session as current. */
  openSession(id: string): void
  /** The New Session flow (optional explicit workspace). */
  startSession(workspaceId?: string): void
  /** Resolve the ui-chat `chat` view-target source for one session (undefined before staged). */
  conversation(sessionId: SessionId): ObservableSnapshot<ChatSnapshot | undefined> | undefined
  /** Resolve the model-directory for one session (undefined when unscoped). */
  modelDirectory(sessionId: SessionId): ModelDirectory | undefined
  /** Register an existing host path as a Workspace. */
  createWorkspace(path: string): Promise<void>
  /** List one directory level through the Host `browse` capability. */
  listDirectory(path?: string): Promise<DirectoryListing>
  /** Create one child directory through the Host `browse` capability. */
  createDirectory(path: string, name: string): Promise<string>
  /** Switch the theme preference. */
  setTheme(id: string): void
  /** Switch the active locale. */
  setLocale(id: string): void
  /** Live theme snapshot (preference + active definition). */
  theme: ObservableSnapshot<ThemeSnapshot>
  /** Live locale snapshot (active id + registry). */
  locale: ObservableSnapshot<LocaleSnapshot>
}

/** The shared props every mobile page receives. */
export interface MobilePageProps extends MobileInjected {
  useSessions: SnapshotSelectorHook<SessionListState>
  useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>
  useSessionPendingInteraction: UseSessionPendingInteraction
  t: TranslateNS<'mobile'>
}

/**
 * Route to the current page. `key` remounts pages per session so chat/detail
 * state never leaks across conversations.
 */
export function MobileShell(props: MobilePageProps) {
  const route = useMobileRoute()

  // A narrow-viewport first load has no mobile hash yet — normalize it so the
  // back gesture and deep links stay inside the shell.
  useEffect(() => {
    if (!isMobileHash(window.location.hash)) {
      window.location.replace(MOBILE_PREFIX)
    }
  }, [])

  return (
    <div className={css.shell}>
      {route.name === 'home' && <MobileHome {...props} />}
      {route.name === 'chat' && (
        <MobileChatPage key={`chat:${route.sessionId}`} {...props} sessionId={route.sessionId} />
      )}
      {route.name === 'details' && (
        <MobileDetailsPage key={`details:${route.sessionId}`} {...props} sessionId={route.sessionId} />
      )}
      {route.name === 'settings' && <MobileSettingsPage {...props} />}
      {route.name === 'newWorkspace' && <MobileNewWorkspacePage {...props} />}
    </div>
  )
}
