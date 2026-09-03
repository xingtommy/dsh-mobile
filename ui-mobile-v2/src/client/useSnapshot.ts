/**
 * Tiny `useSyncExternalStore` bridge over an {@link ObservableSnapshot}.
 * A `SessionFace` and every snapshot store satisfy that contract, so the mobile
 * chat/detail pages subscribe with the standard React 18 hook (no selector
 * synthesis needed — the session face is the whole snapshot).
 */
import { useCallback, useSyncExternalStore } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

/**
 * Subscribe to an observable snapshot source.
 * @param source - the source, or undefined (renders `undefined`).
 * @returns the current snapshot value, or undefined without a source.
 */
export function useSnapshot<T>(source: ObservableSnapshot<T> | undefined): T | undefined {
  return useSyncExternalStore(
    useCallback(
      (onStoreChange: () => void) => (source === undefined ? () => {} : source.subscribe(onStoreChange)),
      [source],
    ),
    useCallback(() => source?.getSnapshot(), [source]),
  )
}
