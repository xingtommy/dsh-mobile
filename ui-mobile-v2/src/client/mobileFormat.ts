/** Locale-aware helpers for the compact mobile rows. */

/**
 * Relative-time copy ("3 分钟前" / "3 minutes ago") for list rows, driven by
 * the active locale so it follows the app's language switch without a
 * translation pass through the dictionary.
 * @param timestamp - Unix epoch ms.
 * @param activeLocale - the active locale id ('zh' | 'en').
 * @returns a short relative label, or a date for items older than a week.
 */
export function formatRelativeTime(timestamp: number, activeLocale: string): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
  const locale = activeLocale === 'zh' ? 'zh-CN' : 'en'
  const diff = timestamp - Date.now()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (abs < 60_000) return rtf.format(Math.round(diff / 1000), 'second')
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute')
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour')
  if (abs < 604_800_000) return rtf.format(Math.round(diff / 86_400_000), 'day')
  return new Date(timestamp).toLocaleDateString(locale)
}

/**
 * Last non-empty path segment (both separators, trailing separators ignored),
 * matching the host's workspace-title derivation.
 * @param path - a directory path.
 * @returns the basename, or the full path when no segment exists.
 */
export function pathBasename(path: string): string {
  return path.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? path
}
