import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { ToolApprovalDialog } from '@renderer/components/ToolApprovalDialog'
import { ok, error } from '@common/result'
import type { ToolApprovalRequestPayload } from '@common/types'

describe('ToolApprovalDialog', () => {
  const mockRequest: ToolApprovalRequestPayload = {
    sessionId: 'session-1',
    streamId: 'stream-1',
    runId: 'run-1',
    toolCallId: 'tool-call-1',
    toolName: 'read_file',
    serverId: 'mcp-server-1',
    input: { path: '/test/file.txt' }
  }

  const defaultProps = {
    open: true,
    request: mockRequest,
    onApprove: vi.fn(),
    onDecline: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should not render when open is false', () => {
      render(<ToolApprovalDialog {...defaultProps} open={false} />)

      expect(screen.queryByText('Tool Execution Approval')).not.toBeInTheDocument()
    })

    it('should render when open is true', () => {
      render(<ToolApprovalDialog {...defaultProps} />)

      expect(screen.getByText('Tool Execution Approval')).toBeInTheDocument()
    })

    it('should display tool name', () => {
      render(<ToolApprovalDialog {...defaultProps} />)

      expect(screen.getByText('read_file')).toBeInTheDocument()
    })

    it('should display server ID when provided', () => {
      render(<ToolApprovalDialog {...defaultProps} />)

      expect(screen.getByText('Server: mcp-server-1')).toBeInTheDocument()
    })

    it('should not display server ID when it is "unknown"', () => {
      const requestWithUnknownServer = {
        ...mockRequest,
        serverId: 'unknown'
      }
      render(<ToolApprovalDialog {...defaultProps} request={requestWithUnknownServer} />)

      expect(screen.queryByText(/Server:/)).not.toBeInTheDocument()
    })

    it('should display tool input as JSON', () => {
      render(<ToolApprovalDialog {...defaultProps} />)

      // The input should be displayed in a pre block
      const inputDisplay = screen.getByText(/path/)
      expect(inputDisplay).toBeInTheDocument()
      expect(inputDisplay.textContent).toContain('/test/file.txt')
    })

    it('should display "(no input)" for null input', () => {
      const requestWithNullInput = {
        ...mockRequest,
        input: null
      }
      render(<ToolApprovalDialog {...defaultProps} request={requestWithNullInput} />)

      expect(screen.getByText('(no input)')).toBeInTheDocument()
    })

    it('should display string input directly', () => {
      const requestWithStringInput = {
        ...mockRequest,
        input: 'simple string input'
      }
      render(<ToolApprovalDialog {...defaultProps} request={requestWithStringInput} />)

      expect(screen.getByText('simple string input')).toBeInTheDocument()
    })

    it('should display approve and decline buttons', () => {
      render(<ToolApprovalDialog {...defaultProps} />)

      expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument()
    })

    it('should display warning message', () => {
      render(<ToolApprovalDialog {...defaultProps} />)

      expect(screen.getByText(/make sure you trust/i)).toBeInTheDocument()
    })
  })

  describe('Approve Action', () => {
    it('should call approveToolCall with correct parameters when approved', async () => {
      const user = userEvent.setup()
      window.backend.approveToolCall = vi.fn().mockResolvedValue(ok(undefined))

      render(<ToolApprovalDialog {...defaultProps} />)

      const approveButton = screen.getByRole('button', { name: /approve/i })
      await user.click(approveButton)

      await waitFor(() => {
        expect(window.backend.approveToolCall).toHaveBeenCalledWith('run-1', 'tool-call-1')
      })
    })

    it('should call onApprove callback after successful approval', async () => {
      const user = userEvent.setup()
      const onApprove = vi.fn()
      window.backend.approveToolCall = vi.fn().mockResolvedValue(ok(undefined))

      render(<ToolApprovalDialog {...defaultProps} onApprove={onApprove} />)

      const approveButton = screen.getByRole('button', { name: /approve/i })
      await user.click(approveButton)

      await waitFor(() => {
        expect(onApprove).toHaveBeenCalled()
      })
    })

    it('should display error when approval fails', async () => {
      const user = userEvent.setup()
      window.backend.approveToolCall = vi.fn().mockResolvedValue(error('Approval failed'))

      render(<ToolApprovalDialog {...defaultProps} />)

      const approveButton = screen.getByRole('button', { name: /approve/i })
      await user.click(approveButton)

      await waitFor(() => {
        expect(screen.getByText(/failed to approve/i)).toBeInTheDocument()
      })
    })

    it('should not call onApprove when approval fails', async () => {
      const user = userEvent.setup()
      const onApprove = vi.fn()
      window.backend.approveToolCall = vi.fn().mockResolvedValue(error('Approval failed'))

      render(<ToolApprovalDialog {...defaultProps} onApprove={onApprove} />)

      const approveButton = screen.getByRole('button', { name: /approve/i })
      await user.click(approveButton)

      await waitFor(() => {
        expect(screen.getByText(/failed to approve/i)).toBeInTheDocument()
      })
      expect(onApprove).not.toHaveBeenCalled()
    })

    it('should disable buttons while processing', async () => {
      const user = userEvent.setup()
      // Create a promise that we can control
      let resolveApproval: (value: unknown) => void
      const approvalPromise = new Promise((resolve) => {
        resolveApproval = resolve
      })
      window.backend.approveToolCall = vi.fn().mockReturnValue(approvalPromise)

      render(<ToolApprovalDialog {...defaultProps} />)

      const approveButton = screen.getByRole('button', { name: /approve/i })
      await user.click(approveButton)

      // Buttons should be disabled while processing
      await waitFor(() => {
        expect(approveButton).toBeDisabled()
        expect(screen.getByRole('button', { name: /decline/i })).toBeDisabled()
      })

      // Resolve the promise
      resolveApproval!(ok(undefined))
    })
  })

  describe('Decline Action', () => {
    it('should call declineToolCall with correct parameters when declined', async () => {
      const user = userEvent.setup()
      window.backend.declineToolCall = vi.fn().mockResolvedValue(ok(undefined))

      render(<ToolApprovalDialog {...defaultProps} />)

      const declineButton = screen.getByRole('button', { name: /decline/i })
      await user.click(declineButton)

      await waitFor(() => {
        expect(window.backend.declineToolCall).toHaveBeenCalledWith(
          'run-1',
          'tool-call-1',
          'User declined'
        )
      })
    })

    it('should call onDecline callback after successful decline', async () => {
      const user = userEvent.setup()
      const onDecline = vi.fn()
      window.backend.declineToolCall = vi.fn().mockResolvedValue(ok(undefined))

      render(<ToolApprovalDialog {...defaultProps} onDecline={onDecline} />)

      const declineButton = screen.getByRole('button', { name: /decline/i })
      await user.click(declineButton)

      await waitFor(() => {
        expect(onDecline).toHaveBeenCalledWith('User declined')
      })
    })

    it('should display error when decline fails', async () => {
      const user = userEvent.setup()
      window.backend.declineToolCall = vi.fn().mockResolvedValue(error('Decline failed'))

      render(<ToolApprovalDialog {...defaultProps} />)

      const declineButton = screen.getByRole('button', { name: /decline/i })
      await user.click(declineButton)

      await waitFor(() => {
        expect(screen.getByText(/failed to decline/i)).toBeInTheDocument()
      })
    })

    it('should not call onDecline when decline fails', async () => {
      const user = userEvent.setup()
      const onDecline = vi.fn()
      window.backend.declineToolCall = vi.fn().mockResolvedValue(error('Decline failed'))

      render(<ToolApprovalDialog {...defaultProps} onDecline={onDecline} />)

      const declineButton = screen.getByRole('button', { name: /decline/i })
      await user.click(declineButton)

      await waitFor(() => {
        expect(screen.getByText(/failed to decline/i)).toBeInTheDocument()
      })
      expect(onDecline).not.toHaveBeenCalled()
    })
  })

  describe('Null Request Handling', () => {
    it('should not show request details when request is null', () => {
      render(<ToolApprovalDialog {...defaultProps} request={null} />)

      // The dialog should still open but without request details
      expect(screen.getByText('Tool Execution Approval')).toBeInTheDocument()
      expect(screen.queryByText('read_file')).not.toBeInTheDocument()
    })

    it('should not call backend when approve clicked with null request', async () => {
      const user = userEvent.setup()
      window.backend.approveToolCall = vi.fn()

      render(<ToolApprovalDialog {...defaultProps} request={null} />)

      const approveButton = screen.getByRole('button', { name: /approve/i })
      await user.click(approveButton)

      expect(window.backend.approveToolCall).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should display error when approveToolCall throws an exception', async () => {
      const user = userEvent.setup()
      window.backend.approveToolCall = vi.fn().mockRejectedValue(new Error('Network error'))

      render(<ToolApprovalDialog {...defaultProps} />)

      const approveButton = screen.getByRole('button', { name: /approve/i })
      await user.click(approveButton)

      await waitFor(() => {
        expect(screen.getByText(/error: network error/i)).toBeInTheDocument()
      })
    })

    it('should display error when declineToolCall throws an exception', async () => {
      const user = userEvent.setup()
      window.backend.declineToolCall = vi.fn().mockRejectedValue(new Error('Network error'))

      render(<ToolApprovalDialog {...defaultProps} />)

      const declineButton = screen.getByRole('button', { name: /decline/i })
      await user.click(declineButton)

      await waitFor(() => {
        expect(screen.getByText(/error: network error/i)).toBeInTheDocument()
      })
    })
  })
})
