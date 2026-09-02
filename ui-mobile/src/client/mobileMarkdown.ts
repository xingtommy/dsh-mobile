/**
 * Localized Markdown chrome for the mobile shell's assistant/answer text. The
 * MarkdownText primitive is Cordis-free and takes complete label props, so the
 * caller (this plugin) owns the copy through its `mobile` locale seat.
 */
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

/** Build the complete Markdown chrome copy for one locale revision. */
export function mobileMarkdownLabels(t: TranslateNS<'mobile'>): MarkdownLabels {
  return {
    code: { copyLabel: t('copy'), copiedLabel: t('copied') },
    footnotes: t('markdown.footnotes'),
  }
}
