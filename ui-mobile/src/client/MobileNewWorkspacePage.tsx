/**
 * New-workspace flow: a directory browser over the Host `browse` capability
 * (`host.listDirectory` / `host.createDirectory` — neither trust-pinned, so the
 * flow works from the public phone). The user walks folders, optionally creates
 * a new folder, and registers the current folder as a Workspace through the
 * unwrapped `workspaces.create` call. The Host's native picker (`host.
 * pickDirectory`) stays loopback-pinned and is never touched.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DirectoryListing } from '@deepseek-ai/dsh-host-directory-picker/types'
import type { MobilePageProps } from './MobileShell.tsx'
import { goBack, navigateHome } from './useMobileNav.ts'
import css from './MobileNewWorkspacePage.module.css'

type LoadStatus = 'loading' | 'ready' | 'error'

interface LoadState {
  status: LoadStatus
  listing: DirectoryListing | null
  error: string | null
}

/** The new-workspace directory browser page. */
export function MobileNewWorkspacePage(props: MobilePageProps) {
  const { t, listDirectory, createDirectory, createWorkspace } = props
  const [state, setState] = useState<LoadState>({ status: 'loading', listing: null, error: null })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [mkdirOpen, setMkdirOpen] = useState(false)
  const [mkdirName, setMkdirName] = useState('')
  const [mkdring, setMkdring] = useState(false)
  const [mkdirError, setMkdirError] = useState<string | null>(null)

  // Last-write-wins guard: folder hops are user-paced, a stale listing must not
  // clobber a newer one. A counter (not the wire signal) is enough here.
  const navRef = useRef(0)

  const load = useCallback((path?: string): void => {
    const id = ++navRef.current
    setState({ status: 'loading', listing: null, error: null })
    listDirectory(path)
      .then(listing => { if (id === navRef.current) setState({ status: 'ready', listing, error: null }) })
      .catch((err: unknown) => {
        if (id === navRef.current) {
          setState({ status: 'error', listing: null, error: err instanceof Error ? err.message : String(err) })
        }
      })
  }, [listDirectory])

  useEffect(() => { load() }, [load])

  const doCreate = (): void => {
    const target = state.listing?.path
    if (target === undefined || creating) return
    setCreating(true)
    setCreateError(null)
    createWorkspace(target)
      .then(() => { navigateHome() })
      .catch((err: unknown) => {
        setCreating(false)
        setCreateError(t('workspace.new.error', { message: err instanceof Error ? err.message : String(err) }))
      })
  }

  const doMkdir = (): void => {
    const name = mkdirName.trim()
    const parent = state.listing?.path
    if (name === '' || parent === undefined || mkdring) return
    setMkdring(true)
    setMkdirError(null)
    createDirectory(parent, name)
      .then(() => {
        setMkdirName('')
        setMkdirOpen(false)
        setMkdring(false)
        load(parent)
      })
      .catch((err: unknown) => {
        setMkdring(false)
        setMkdirError(t('workspace.new.error', { message: err instanceof Error ? err.message : String(err) }))
      })
  }

  const listing = state.listing
  const folders = listing === null ? [] : listing.entries.filter(entry => !entry.hidden)

  return (
    <div className={css.page}>
      <header className={css.header}>
        <button type="button" className={css.backButton} aria-label={t('back')} onClick={goBack}>‹</button>
        <span className={css.headerTitle}>{t('workspace.new.title')}</span>
        <span className={css.headerSpacer} />
      </header>

      <p className={css.hint}>{t('workspace.new.hint')}</p>

      <div className={css.pathBar}>
        <button type="button" className={css.crumb} onClick={() => load()}>{t('workspace.new.home')}</button>
        {listing?.crumbs.map(crumb => (
          <button key={crumb.path} type="button" className={css.crumb} onClick={() => load(crumb.path)}>{crumb.name}</button>
        ))}
        {listing !== null && <span className={css.currentPath}>› {listing.path}</span>}
      </div>

      <div className={css.entries}>
        {state.status === 'loading' && <div className={css.status}>{t('model.loading')}</div>}
        {state.status === 'error' && (
          <div className={css.status}>
            <span className={css.error}>{t('workspace.new.error', { message: state.error ?? 'unknown' })}</span>
            <button type="button" className={css.retry} onClick={() => load(listing?.path)}>{t('model.retryButton')}</button>
          </div>
        )}
        {state.status === 'ready' && folders.length === 0 && (
          <div className={css.status}>{t('workspace.new.empty')}</div>
        )}
        {state.status === 'ready' && folders.map(entry => (
          <button key={entry.path} type="button" className={css.entry} onClick={() => load(entry.path)}>
            <span className={css.folderIcon} aria-hidden="true">📁</span>
            <span className={css.entryName}>{entry.name}</span>
            <span className={css.chevron} aria-hidden="true">›</span>
          </button>
        ))}
      </div>

      {mkdirOpen && (
        <div className={css.mkdirRow}>
          <input
            className={css.mkdirInput}
            value={mkdirName}
            placeholder={t('workspace.new.folderPlaceholder')}
            autoFocus
            onChange={event => setMkdirName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') doMkdir() }}
          />
          <button type="button" className={css.mkdirSubmit} disabled={mkdirName.trim() === '' || mkdring} onClick={doMkdir}>
            {t('workspace.new.create')}
          </button>
        </div>
      )}
      {mkdirError !== null && <div className={css.error}>{mkdirError}</div>}
      {createError !== null && <div className={css.error}>{createError}</div>}

      <footer className={css.footer}>
        <button
          type="button"
          className={css.selectButton}
          disabled={listing === null || creating}
          onClick={doCreate}
        >
          {creating ? t('workspace.new.creating') : t('workspace.new.selectHere')}
        </button>
        <button
          type="button"
          className={css.mkdirButton}
          disabled={listing === null || creating}
          onClick={() => setMkdirOpen(v => !v)}
        >
          {t('workspace.new.newFolder')}
        </button>
      </footer>
    </div>
  )
}
