import { useTranslate } from '../../i18n/index.js'
import clsx from 'clsx'
import { memo } from 'react'
import {
  IconRefreshOutline16,
  IconSearchOutline16,
  IconWarningOutline16,
} from '../base/icons.js'
import { describeReply } from '../../services/chat/describe.js'
import { canContinueReply } from '../../services/chat/reply.js'
import { continueReply, regenerateReply } from '../../services/chat/store.js'
import { setThinking } from '../../services/settings.js'
import { isSearchUnused } from '../../services/chat/view.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import type { AssistantMessage as AssistantMessageType } from '../../services/chat/types.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { IconButton } from '../base/IconButton.js'
import { Button } from '../base/Button.js'
import { Markdown } from '../markdown/Markdown.js'
import { SiteThumbnails } from '../search/SiteLogo.js'
import { toggleSearchPanel, useSearchPanel } from '../search/searchPanelState.js'
import { ReadAloudButton } from './ReadAloudButton.js'
import { CopyButton } from './CopyButton.js'
import { ReplyArea } from './ReplyArea.js'
import { useReplyView } from './useReplyView.js'
import {
  BranchSwitcher,
  type MessageVersions,
  type SelectMessageVersion,
} from './BranchSwitcher.js'
import styles from './AssistantMessage.module.css'

const TOP_UP_URL = 'https://platform.deepseek.com/top_up'

export const AssistantMessage = memo(function AssistantMessage({
  sessionId,
  message,
  isLast,
  streaming,
  busy,
  versions,
  onSelectVersion,
}: {
  sessionId: string
  message: AssistantMessageType
  isLast: boolean
  streaming: boolean
  busy: boolean
  versions: MessageVersions
  onSelectVersion: SelectMessageVersion
}) {
  const t = useTranslate()
  const view = useReplyView(message, streaming)
  const panelEntry = useSearchPanel((state) => state.entry)
  const notice = streaming ? null : describeReply(message)
  // 安全拒绝：已下发的思考与正文按协议丢弃，只显示模板答复。
  const refused = message.stopReason === 'refusal'
  const answer = refused ? null : view.answer
  const responseText = [answer?.text, notice?.presentation === 'response' ? notice.text : null]
    .filter(Boolean)
    .join('\n\n')
  const copyText = responseText || notice?.text
  const waiting = streaming && view.steps.length === 0 && !view.answer && !message.thinking
  // 开启搜索但本轮没有执行任何搜索调用：明确提示，并提供「关闭思考后重试」的恢复入口。
  const searchUnused = !streaming && !refused && isSearchUnused(message, view.steps)
  const retrySearch =
    searchUnused && message.thinking === true && (message.status === 'done' || message.status === 'stopped')
  // 含搜索/阅读步骤的回复不能继续（搜索步骤无法作为续写前缀），给出说明。
  const hasToolBlocks = message.blocks.some(
    (block) =>
      block.type === 'server_tool_use' ||
      block.type === 'web_search_tool_result' ||
      block.type === 'web_fetch_tool_result'
  )
  const continueBlockedBySearch =
    isLast && !streaming && !canContinueReply(message) && hasToolBlocks && message.status === 'stopped'
  const summaryEntry = `${message.id}-summary`
  return (
    <div className={styles.message}>
      {refused ? null : (
        <ReplyArea
          message={message}
          view={view}
          streaming={streaming}
          hasResponse={!!responseText}
          onRetry={() => {
            // 搜索失败或无结果：由用户点击后按新分支重新请求，原回答保留。
            stopReadAloud()
            regenerateReply(sessionId, message.id)
          }}
        />
      )}
      {answer ? (
        <Markdown
          className="ds-assistant-message-main-content"
          content={answer.markdown}
          loading={streaming}
          cacheKey={message.id}
          disableLink={false}
          sources={view.sources}
        />
      ) : null}
      {waiting ? (
        <div className={styles.waiting}>
          <span className={styles.waitingLabel}>{t('messageConnecting')}</span>
          {[0, 1, 2].map((index) => (
            <span key={index} className={styles.waitingDot} />
          ))}
        </div>
      ) : null}
      {notice?.presentation === 'response' ? (
        <Markdown
          className="ds-assistant-message-main-content"
          content={notice.text}
          loading={false}
          cacheKey={`${message.id}-template`}
          disableLink={false}
        />
      ) : notice ? (
        <div className={styles.notice}>
          <IconWarningOutline16 />
          <span>
            {notice.text}
            {notice.action === 'apiKey' ? (
              <>
                {' '}
                <button
                  type="button"
                  className={styles.noticeAction}
                  onClick={() => openSettings('data')}
                >
                  {t('changeApiKey')}
                </button>
              </>
            ) : null}
            {notice.action === 'topUp' ? (
              <>
                {' '}
                <a
                  className={styles.noticeAction}
                  href={TOP_UP_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('topUp')}
                </a>
              </>
            ) : null}
          </span>
        </div>
      ) : null}
      {!streaming && !refused && view.searchResults.length > 0 ? (
        <div
          className={clsx(styles.summary, panelEntry === summaryEntry && styles.summaryActive)}
          onClick={() => toggleSearchPanel(summaryEntry, view.searchResults)}
        >
          <SiteThumbnails sources={view.searchResults} />
          <span>
            {t(
              view.searchResults.length === 1 ? 'messageSearchSummary' : 'messageSearchSummaries',
              { count: view.searchResults.length }
            )}
          </span>
        </div>
      ) : null}
      {searchUnused ? (
        <div className={styles.searchUnused}>
          <IconSearchOutline16 />
          <span>{t('messageSearchNotUsed')}</span>
        </div>
      ) : null}
      {retrySearch ? (
        <div className={styles.searchRetry}>
          <Button
            variant="outlined"
            size="s"
            disabled={busy}
            onClick={() => {
              // 由用户明确发起：关闭深度思考后按新分支重新请求，原回答保留。
              setThinking(false)
              stopReadAloud()
              regenerateReply(sessionId, message.id)
            }}
          >
            {t('retryWithoutThinking')}
          </Button>
          <span className={styles.searchRetryHint}>{t('retryWithoutThinkingHint')}</span>
        </div>
      ) : null}
      {streaming ? null : (
        <div className={styles.bottom}>
          <BranchSwitcher versions={versions} disabled={busy} onSelect={onSelectVersion} />
          <div className={clsx(styles.actions, isLast && styles.alwaysShow)}>
            {copyText ? <CopyButton text={copyText} /> : null}
            {responseText && !refused ? (
              <ReadAloudButton messageId={message.id} text={responseText} />
            ) : null}
            <IconButton
              icon={<IconRefreshOutline16 />}
              tooltip={t('regenerate')}
              tooltipPlacement="bottom"
              disabled={busy || refused}
              onClick={() => {
                stopReadAloud()
                regenerateReply(sessionId, message.id)
              }}
            />
          </div>
          {isLast && canContinueReply(message) ? (
            <Button
              variant="outlined"
              size="s"
              className={styles.continueButton}
              title={t('continueKeepsSettings')}
              disabled={busy}
              onClick={() => {
                stopReadAloud()
                continueReply(sessionId, message.id)
              }}
            >
              {t('continueGenerating')}
            </Button>
          ) : null}
          {continueBlockedBySearch ? (
            <div className={styles.continueBlocked}>{t('continueUnavailableWithSearch')}</div>
          ) : null}
        </div>
      )}
    </div>
  )
})
