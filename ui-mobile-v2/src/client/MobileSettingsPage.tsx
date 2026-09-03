/**
 * Settings: theme (light / dark / system) and language (zh / en) with the
 * active choice marked, plus an about card. Back returns to wherever the user
 * came from. The live snapshots ride the injected theme/locale observables, so
 * the check marks follow changes made elsewhere.
 */
import type { MobilePageProps } from './MobileShell.tsx'
import { goBack, navigateNewWorkspace } from './useMobileNav.ts'
import { useSnapshot } from './useSnapshot.ts'
import css from './MobileSettingsPage.module.css'

const THEMES = [
  { id: 'light', labelKey: 'settings.theme.light' },
  { id: 'dark', labelKey: 'settings.theme.dark' },
  { id: 'system', labelKey: 'settings.theme.system' },
] as const

const LOCALES = [
  { id: 'zh', labelKey: 'settings.language.zh' },
  { id: 'en', labelKey: 'settings.language.en' },
] as const

/** The settings page of the page stack. */
export function MobileSettingsPage(props: MobilePageProps) {
  const { t } = props
  const theme = useSnapshot(props.theme)
  const locale = useSnapshot(props.locale)
  const preference = theme?.preference
  const activeLocale = locale?.active

  return (
    <div className={css.page}>
      <header className={css.header}>
        <button className={css.backButton} aria-label={t('back')} onClick={() => goBack()}>‹</button>
        <h1 className={css.headerTitle}>{t('settings.title')}</h1>
        <span className={css.headerSpacer} />
      </header>

      <main className={css.body}>
        <section className={css.section}>
          <h3 className={css.sectionTitle}>{t('settings.theme')}</h3>
          {THEMES.map(option => (
            <button
              key={option.id}
              className={css.row}
              onClick={() => props.setTheme(option.id)}
            >
              <span>{t(option.labelKey)}</span>
              {preference === option.id && <span className={css.check} aria-hidden="true">✓</span>}
            </button>
          ))}
        </section>

        <section className={css.section}>
          <h3 className={css.sectionTitle}>{t('settings.language')}</h3>
          {LOCALES.map(option => (
            <button
              key={option.id}
              className={css.row}
              onClick={() => props.setLocale(option.id)}
            >
              <span>{t(option.labelKey)}</span>
              {activeLocale === option.id && <span className={css.check} aria-hidden="true">✓</span>}
            </button>
          ))}
        </section>

        <section className={css.section}>
          <h3 className={css.sectionTitle}>{t('section.workspaces')}</h3>
          <button className={css.row} onClick={() => navigateNewWorkspace()}>
            <span>{t('workspace.new')}</span>
            <span className={css.chevron} aria-hidden="true">›</span>
          </button>
        </section>

        <section className={css.section}>
          <h3 className={css.sectionTitle}>{t('settings.about')}</h3>
          <div className={css.about}>
            <p className={css.version}>{t('settings.about.version')}</p>
            <p className={css.caption}>{t('settings.about.description')}</p>
          </div>
        </section>
      </main>
    </div>
  )
}
