/**
 * One message row in the mobile flow. Renders a finalized conversation node
 * (user / assistant / tool card / command / notices), a streaming assistant
 * partial, or a running tool call — the three shapes the chat and details
 * pages surface. Assistant text renders through the shared MarkdownText
 * primitive (GFM headings/bold/lists/code, sanitized); user bubbles stay
 * plain text.
 */
import { useState } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  AssistantBlock, CommandNode, ConversationNode, PartialAssistant,
  RunningToolCall, ToolResultNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import { toAssistantBlocks } from '@deepseek-ai/dsh-client-runtime/client'
import type { ContentBlock } from '@deepseek-ai/dsh-api-remotes/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import css from './MobileMessageItem.module.css'

interface Props {
  /** One finalized node; omit when rendering a partial or running call instead. */
  node?: ConversationNode
  /** An in-flight assistant prefix (streaming bubble). */
  partial?: PartialAssistant
  /** A running tool call card. */
  runningCall?: RunningToolCall
  t: TranslateNS<'mobile'>
}

/** Text blocks of a content list, joined — the bubble body for user/assistant. */
function textOf(content: readonly ContentBlock[]): string {
  return toAssistantBlocks(content)
    .filter(block => block.kind === 'text')
    .map(block => block.text)
    .join('\n')
}

/** The assistant bubble: collapsible reasoning, text, tool chips. */
function AssistantBubble(props: {
  blocks: readonly AssistantBlock[]
  t: TranslateNS<'mobile'>
  streaming?: boolean
  interrupted?: boolean
}) {
  const { blocks, t } = props
  const reasoning = blocks.find(block => block.kind === 'reasoning')
  const texts = blocks.filter(block => block.kind === 'text')
  const toolChips = blocks.filter(block => block.kind === 'tool-call')
  return (
    <div className={css.row}>
      <div className={`${css.assistantBubble}${props.streaming === true ? ` ${css.streaming}` : ''}`}>
        {reasoning !== undefined && (
          <details className={css.reasoning}>
            <summary>{t('chat.thinking')}</summary>
            <p className={css.reasoningText}>{reasoning.text}</p>
          </details>
        )}
        {texts.map((block, index) => (
          <MarkdownText
            key={index}
            text={block.text}
            streaming={props.streaming === true}
          />
        ))}
        {toolChips.length > 0 && (
          <div className={css.toolChips}>
            {toolChips.map(chip => <span key={chip.callId} className={css.toolChip}>🔧 {chip.name}</span>)}
          </div>
        )}
        {props.interrupted === true && <span className={css.interrupted}>{t('chat.stop')}</span>}
      </div>
    </div>
  )
}

/** A tool card: status head plus collapsible args / result. */
function ToolCard(props: {
  t: TranslateNS<'mobile'>
  call: ToolResultNode | RunningToolCall
}) {
  const { t, call } = props
  const [open, setOpen] = useState(false)
  // RunningToolCall has no `kind` discriminant — membership is the test.
  if ('kind' in call) {
    // Settled card: call head backfilled from the in-window tool/call (nullable).
    const name = call.call?.name ?? call.callId
    const statusClass = call.isError ? css.statusError : css.statusDone
    const statusText = call.isError ? t('tool.error') : t('tool.done')
    const argsRaw = call.call?.argsRaw ?? ''
    const resultText = textOf(call.content)
    return (
      <div className={`${css.row} ${css.toolCard}`}>
        <button className={css.toolHead} onClick={() => setOpen(open => !open)} aria-expanded={open}>
          <span className={`${css.statusDot} ${statusClass}`} />
          <span className={css.toolName}>{name}</span>
          <span className={css.toolStatus}>{statusText}</span>
        </button>
        {open && (
          <div className={css.toolBody}>
            {argsRaw !== '' && (
              <>
                <div className={css.toolLabel}>{t('tool.args')}</div>
                <pre className={css.pre}>{argsRaw}</pre>
              </>
            )}
            {resultText !== '' && (
              <>
                <div className={css.toolLabel}>{t('tool.result')}</div>
                <pre className={css.pre}>{resultText}</pre>
              </>
            )}
          </div>
        )}
      </div>
    )
  }
  // Running card: the in-flight tool/call head only.
  return (
    <div className={`${css.row} ${css.toolCard}`}>
      <button className={css.toolHead} onClick={() => setOpen(open => !open)} aria-expanded={open}>
        <span className={`${css.statusDot} ${css.statusRunning}`} />
        <span className={css.toolName}>{call.name}</span>
        <span className={css.toolStatus}>{t('tool.running')}</span>
      </button>
      {open && call.argsRaw !== '' && (
        <div className={css.toolBody}>
          <div className={css.toolLabel}>{t('tool.args')}</div>
          <pre className={css.pre}>{call.argsRaw}</pre>
        </div>
      )}
    </div>
  )
}

/** A slash-command lifecycle row. */
function CommandRow(props: { t: TranslateNS<'mobile'>; node: CommandNode }) {
  const { t, node } = props
  return (
    <div className={`${css.row} ${css.command}`}>
      <span>⏎</span>
      <span>{node.name === null ? t('command.line') : `/${node.name}`}</span>
      {node.outcome?.text !== undefined && <span className={css.commandOutcome}>{node.outcome.text}</span>}
    </div>
  )
}

/**
 * Dispatch one item to its renderer. Exactly one of node / partial /
 * runningCall should be present.
 */
export function MobileMessageItem(props: Props) {
  const { t, node, partial, runningCall } = props
  if (partial !== undefined) return <AssistantBubble blocks={partial.blocks} t={t} streaming />
  if (runningCall !== undefined) return <ToolCard t={t} call={runningCall} />
  if (node === undefined) return null
  switch (node.kind) {
    case 'user':
    case 'steering':
      return (
        <div className={`${css.row} ${css.userRow}`}>
          <div className={css.userBubble}>{textOf(node.content)}</div>
        </div>
      )
    case 'context':
      return (
        <div className={`${css.row} ${css.contextRow}`}>
          <div className={css.contextBubble}>{textOf(node.content)}</div>
        </div>
      )
    case 'assistant':
      return <AssistantBubble blocks={node.blocks} t={t} interrupted={node.interrupted === true} />
    case 'tool-result':
      return <ToolCard t={t} call={node} />
    case 'command':
      return <CommandRow t={t} node={node} />
    case 'compaction':
      return (
        <div className={css.compaction}>
          <span>{t('compaction')}</span>
          {node.summary !== null && <span className={css.compactionSummary}>{node.summary}</span>}
        </div>
      )
    case 'turn-error':
      return <div className={css.errorStrip}>{node.message}</div>
    case 'turn-max-tokens':
      return <div className={css.warnStrip}>{t('error.maxTokens')}</div>
    case 'model-retry':
      return <div className={css.warnStrip}>{t('model.retry')}</div>
    default:
      return null
  }
}
