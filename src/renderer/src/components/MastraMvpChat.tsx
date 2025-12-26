import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Cpu, Loader2, Play, Square, Workflow } from 'lucide-react'
import type {
  AIMessage,
  MastraSessionInfo,
  MastraStatus,
  ToolApprovalRequestPayload
} from '@common/types'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { getMastraStatus, startMastraSession, streamMastraText } from '@renderer/lib/mastra-client'
import { logger } from '@renderer/lib/logger'
import { ToolApprovalDialog } from '@renderer/components/ToolApprovalDialog'

interface MastraMvpChatProps {
  onBack: () => void
  onOpenSettings: () => void
}

type ConversationMessage = AIMessage & { id: string }

export function MastraMvpChat({ onBack, onOpenSettings }: MastraMvpChatProps): React.JSX.Element {
  const [status, setStatus] = useState<MastraStatus | null>(null)
  const [session, setSession] = useState<MastraSessionInfo | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendingApproval, setPendingApproval] = useState<ToolApprovalRequestPayload | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const bootstrap = async (): Promise<void> => {
      try {
        await window.connectBackend()
        const resolvedStatus = await getMastraStatus()
        setStatus(resolvedStatus)

        if (resolvedStatus.ready) {
          const sessionInfo = await startMastraSession()
          setSession(sessionInfo)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Mastra起動に失敗しました'
        setError(message)
        logger.error(message, err)
      }
    }

    bootstrap()
  }, [])

  const handleSend = async (): Promise<void> => {
    if (!status?.ready) {
      setError(status?.reason || 'Mastraが利用できません')
      return
    }
    if (!session) {
      setError('セッションが初期化されていません')
      return
    }
    if (!input.trim()) return

    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim()
    }

    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput('')
    setError(null)

    const abortController = new AbortController()
    abortRef.current = abortController
    setIsStreaming(true)
    setStreamingText('')

    try {
      const stream = await streamMastraText(
        session.sessionId,
        nextMessages.map(({ role, content }) => ({ role, content })),
        abortController.signal
      )

      let assistantText = ''
      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          assistantText += chunk.text
          logger.info('[Mastra][UI] rendering chunk', {
            len: chunk.text.length,
            total: assistantText.length
          })
          setStreamingText(assistantText)
        } else if (chunk.type === 'tool-approval-required') {
          logger.info('[Mastra][UI] tool approval required', {
            toolName: chunk.request.toolName,
            toolCallId: chunk.request.toolCallId
          })
          setPendingApproval(chunk.request)
          // Stream will continue after user approves/declines via backend events
        }
      }

      const assistantMessage: ConversationMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: assistantText || '（応答がありませんでした）'
      }

      logger.info('[Mastra][UI] assistant message finalized', {
        totalLength: assistantText.length
      })

      setMessages((prev) => [...prev, assistantMessage])
      setStreamingText('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ストリーミングに失敗しました'
      setError(message)
      logger.error('Mastra stream failed', err)
    } finally {
      abortRef.current = null
      setIsStreaming(false)
    }
  }

  const handleAbort = (): void => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
  }

  const handleToolApproval = (): void => {
    logger.info('[Mastra][UI] tool approved by user')
    setPendingApproval(null)
  }

  const handleToolDecline = (reason?: string): void => {
    logger.info('[Mastra][UI] tool declined by user', { reason })
    setPendingApproval(null)
  }

  const streamingMessage = useMemo<ConversationMessage | null>(() => {
    if (!streamingText) return null
    return {
      id: 'streaming',
      role: 'assistant',
      content: streamingText
    }
  }, [streamingText])

  const renderedMessages = useMemo(() => {
    return streamingMessage ? [...messages, streamingMessage] : messages
  }, [messages, streamingMessage])

  const renderStatusBadge = (): React.JSX.Element | null => {
    if (!status) return null
    if (status.ready) {
      return (
        <Badge variant="outline" className="gap-1">
          <Cpu className="h-3 w-3" />
          {status.provider} / {status.model}
        </Badge>
      )
    }
    return (
      <Badge variant="destructive" className="gap-1">
        <Workflow className="h-3 w-3" />
        未初期化
      </Badge>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-900 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack} className="text-slate-200">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="text-lg font-semibold">Mastra MVP Chat</div>
              <p className="text-xs text-slate-300">UC1: 基本的なAI会話（Mastra経路）</p>
            </div>
            {renderStatusBadge()}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenSettings}
              className="border-slate-600"
            >
              設定を開く
            </Button>
          </div>
        </div>

        {!status?.ready && (
          <Card className="border-red-500/60 bg-red-500/10 text-red-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="h-4 w-4" />
                Mastraが利用できません
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p>{status?.reason || '有効なAI設定を確認してください。'}</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={onOpenSettings}
                  className="border-red-500/60 text-red-50"
                >
                  設定を確認
                </Button>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const refreshed = await getMastraStatus()
                    setStatus(refreshed)
                    if (refreshed.ready) {
                      const sessionInfo = await startMastraSession()
                      setSession(sessionInfo)
                    }
                  }}
                >
                  再チェック
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-slate-900/80 border-slate-800 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-slate-50">会話</CardTitle>
              <p className="text-xs text-slate-400">
                セッションID: {session?.sessionId || '未初期化'} / Thread:{' '}
                {session?.threadId || '-'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isStreaming ? (
                <Button variant="destructive" size="sm" onClick={handleAbort} className="gap-2">
                  <Square className="h-4 w-4" />
                  中断
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setMessages([])
                    setStreamingText('')
                    setError(null)
                  }}
                  className="gap-2"
                >
                  クリア
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-80 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/40 p-4 space-y-3">
              {renderedMessages.length === 0 && (
                <div className="text-sm text-slate-400 text-center py-8">
                  まだメッセージはありません
                </div>
              )}
              {renderedMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-indigo-900/60 border border-indigo-700/60'
                      : 'bg-slate-800/70 border border-slate-700/70'
                  }`}
                >
                  <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">
                    {msg.role === 'user' ? 'You' : 'Assistant'}
                  </div>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Input
                placeholder="メッセージを入力..."
                value={input}
                disabled={isStreaming || !status?.ready}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                className="bg-slate-950/40 border-slate-800 text-slate-100"
              />
              <div className="flex items-center justify-between">
                {error && <div className="text-sm text-red-400">{error}</div>}
                <Button
                  onClick={handleSend}
                  disabled={isStreaming || !status?.ready}
                  className="ml-auto gap-2"
                >
                  {isStreaming ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      応答中...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      送信
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tool Approval Dialog for HITL */}
      <ToolApprovalDialog
        open={pendingApproval !== null}
        request={pendingApproval}
        onApprove={handleToolApproval}
        onDecline={handleToolDecline}
      />
    </div>
  )
}
