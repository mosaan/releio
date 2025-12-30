import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import logger from '../logger'

export interface ApprovalRequest {
  id: string
  sessionId: string
  streamId: string
  toolCallId: string // The ID from the LLM (if available, otherwise we generate one)
  toolName: string
  input: unknown
  status: 'pending' | 'approved' | 'declined'
  resolve: (value: boolean) => void
  reject: (reason?: any) => void
  createdAt: number
}

export class ApprovalManager extends EventEmitter {
  private pendingRequests = new Map<string, ApprovalRequest>()
  private readonly defaultTimeoutMs = 300000 // 5 minutes timeout

  constructor() {
    super()
  }

  /**
   * Request approval for a tool execution
   * Returns a promise that resolves to true (approved) or false (declined)
   */
  requestApproval(params: {
    sessionId: string
    streamId: string
    toolCallId: string
    toolName: string
    input: unknown
  }): Promise<boolean> {
    const { sessionId, streamId, toolCallId, toolName, input } = params

    // We use a unique runId for the approval request,
    // but we also track the original toolCallId from the LLM
    const runId = randomUUID()

    logger.info('[ApprovalManager] Creating approval request', {
      runId,
      sessionId,
      toolName
    })

    return new Promise<boolean>((resolve, reject) => {
      const request: ApprovalRequest = {
        id: runId,
        sessionId,
        streamId,
        toolCallId,
        toolName,
        input,
        status: 'pending',
        resolve,
        reject,
        createdAt: Date.now()
      }

      this.pendingRequests.set(runId, request)

      // Emit event for UI to pick up
      this.emit('approval-requested', {
        runId,
        ...params
      })

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(runId)) {
          this.decline(runId, 'Approval timed out')
        }
      }, this.defaultTimeoutMs)
    })
  }

  /**
   * Approve a pending request
   */
  approve(runId: string): boolean {
    const request = this.pendingRequests.get(runId)
    if (!request) {
      logger.warn('[ApprovalManager] Attempted to approve unknown request', { runId })
      return false
    }

    logger.info('[ApprovalManager] Approving request', { runId, toolName: request.toolName })

    request.status = 'approved'
    request.resolve(true)
    this.pendingRequests.delete(runId)

    this.emit('approval-resolved', {
      runId,
      sessionId: request.sessionId,
      approved: true
    })

    return true
  }

  /**
   * Decline a pending request
   */
  decline(runId: string, reason: string = 'User declined'): boolean {
    const request = this.pendingRequests.get(runId)
    if (!request) {
      logger.warn('[ApprovalManager] Attempted to decline unknown request', { runId })
      return false
    }

    logger.info('[ApprovalManager] Declining request', {
      runId,
      toolName: request.toolName,
      reason
    })

    request.status = 'declined'
    // We resolve with false instead of rejecting, so the tool execution can handle it gracefully
    request.resolve(false)
    this.pendingRequests.delete(runId)

    this.emit('approval-resolved', {
      runId,
      sessionId: request.sessionId,
      approved: false,
      reason
    })

    return true
  }

  /**
   * Get all pending requests (optionally filtered by session)
   */
  getPendingRequests(sessionId?: string): ApprovalRequest[] {
    const requests = Array.from(this.pendingRequests.values())
    if (sessionId) {
      return requests.filter((r) => r.sessionId === sessionId)
    }
    return requests
  }
}

// Singleton instance
export const approvalManager = new ApprovalManager()
