/**
 * The gateway-PIN card: set the PIN phones type at the public URL.
 *
 * The card is anchored in the configurable-plugins tab by the Host-served
 * `access-pin` settings namespace, but it edits nothing in the settings store.
 * Save posts to the dsh-gateway's loopback `/__setpin` endpoint (same origin,
 * since the desktop page is served through the gateway), which is the single
 * authority for the PIN: it validates the current PIN, writes auth.json
 * atomically, and revokes every phone session.
 */

import { useState } from 'react'
import clsx from 'clsx'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-settings-plugins client's slot contract so this card
// registers under the configurable tab's keyed `settings.plugin.item` slot.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import css from './AccessPinCard.module.css'

/**
 * The settings namespace this card edits. Spelled here rather than imported: a
 * client bundle must not pull the node half in, and the value is the gateway's
 * auth domain anyway. The node half registers the same string on the Host so
 * the tab dispatches this card.
 */
export const ACCESS_PIN_NS = 'access-pin'

/** Props the renderer binds for the access-PIN card. */
export type AccessPinCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'mobile'>

/** One submit cycle's outcome. */
type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'done' }
  | { kind: 'error'; message: string }

const PIN_RE = /^\d{4,12}$/

/**
 * Render the access-PIN card.
 * @param props - locale copy.
 * @returns the card, or nothing when its namespace is not served.
 */
export function AccessPinCard(props: AccessPinCardProps) {
  const { t } = props
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [state, setState] = useState<SaveState>({ kind: 'idle' })

  /** POST the three fields to the gateway's /__setpin and reflect the verdict. */
  const save = async (): Promise<void> => {
    if (state.kind === 'saving') return
    // Client-side guards mirror the gateway's rules so a bad form never leaves.
    if (!PIN_RE.test(current)) return setState({ kind: 'error', message: t('pin.currentInvalid') })
    if (!PIN_RE.test(next)) return setState({ kind: 'error', message: t('pin.nextInvalid') })
    if (next !== confirm) return setState({ kind: 'error', message: t('pin.mismatch') })
    setState({ kind: 'saving' })
    try {
      const res = await fetch('/__setpin', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new URLSearchParams({ current, 'new': next, confirm }),
        credentials: 'same-origin',
      })
      const json = await res.json().catch(() => null)
      if (json?.ok === true) {
        setCurrent('')
        setNext('')
        setConfirm('')
        setState({ kind: 'done' })
      } else {
        setState({ kind: 'error', message: json?.error ?? t('pin.gatewayDown') })
      }
    } catch {
      setState({ kind: 'error', message: t('pin.gatewayDown') })
    }
  }

  return (
    <li className={css.card}>
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        onClick={() => { setOpen(!open) }}
      >
        <span className={css.headText}>
          <span className={css.name}>{t('pin.title')}</span>
          <span className={css.description}>{t('pin.description')}</span>
        </span>
        <IconChevronDownOutline14 className={clsx(css.chevron, open && css.chevronOpen)} />
      </button>
      {open
        ? (
          <div className={css.body}>
            <label className={css.field}>
              <span className={css.label}>{t('pin.current')}</span>
              <input
                className={css.input}
                type="password"
                inputMode="numeric"
                value={current}
                placeholder={t('pin.current')}
                autoComplete="current-password"
                onChange={e => setCurrent(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <label className={css.field}>
              <span className={css.label}>{t('pin.next')}</span>
              <input
                className={css.input}
                type="password"
                inputMode="numeric"
                value={next}
                placeholder={t('pin.nextPlaceholder')}
                autoComplete="new-password"
                onChange={e => setNext(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <label className={css.field}>
              <span className={css.label}>{t('pin.confirm')}</span>
              <input
                className={css.input}
                type="password"
                inputMode="numeric"
                value={confirm}
                placeholder={t('pin.confirm')}
                autoComplete="new-password"
                onChange={e => setConfirm(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            {state.kind === 'error'
              ? <p className={css.failed} role="status">{state.message}</p>
              : state.kind === 'done'
                ? <p className={css.saved} role="status">{t('pin.saved')}</p>
                : null}
            <div className={css.footer}>
              <button
                type="button"
                className={css.save}
                disabled={state.kind === 'saving'}
                onClick={() => { void save() }}
              >
                {state.kind === 'saving' ? t('pin.saving') : t('pin.save')}
              </button>
            </div>
          </div>
        )
        : null}
    </li>
  )
}
