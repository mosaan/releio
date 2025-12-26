import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { ToolPermissionSettings } from '@renderer/components/ToolPermissionSettings'
import { ok, error } from '@common/result'
import type { ToolPermissionRule } from '@common/types'

describe('ToolPermissionSettings', () => {
  const mockRule: ToolPermissionRule = {
    id: 'rule-1',
    serverId: 'mcp-server-1',
    toolName: 'read_file',
    toolPattern: null,
    autoApprove: true,
    priority: 10,
    createdAt: '2025-12-26T10:00:00.000Z',
    updatedAt: '2025-12-26T10:00:00.000Z'
  }

  const mockRules: ToolPermissionRule[] = [
    mockRule,
    {
      id: 'rule-2',
      serverId: null,
      toolName: null,
      toolPattern: 'delete_*',
      autoApprove: false,
      priority: 5,
      createdAt: '2025-12-26T09:00:00.000Z',
      updatedAt: '2025-12-26T09:00:00.000Z'
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Loading State', () => {
    it('should show loading state initially', () => {
      window.backend.listToolPermissionRules = vi.fn().mockReturnValue(new Promise(() => {}))

      render(<ToolPermissionSettings />)

      expect(screen.getByText(/loading rules/i)).toBeInTheDocument()
    })

    it('should load and display rules on mount', async () => {
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok(mockRules))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        // Text is split into "Tool: " and "read_file" in badges
        expect(screen.getByText(/tool:/i)).toBeInTheDocument()
      })
    })
  })

  describe('Empty State', () => {
    it('should display empty state when no rules exist', async () => {
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([]))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByText(/no permission rules configured/i)).toBeInTheDocument()
      })
    })

    it('should show create button in empty state', async () => {
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([]))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create your first rule/i })).toBeInTheDocument()
      })
    })
  })

  describe('Rule Display', () => {
    it('should display rule with server ID badge', async () => {
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([mockRule]))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByText(/server: mcp-server-1/i)).toBeInTheDocument()
      })
    })

    it('should display rule with tool name badge', async () => {
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([mockRule]))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByText(/tool: read_file/i)).toBeInTheDocument()
      })
    })

    it('should display rule with pattern badge', async () => {
      const patternRule: ToolPermissionRule = {
        ...mockRule,
        id: 'rule-pattern',
        toolName: null,
        toolPattern: 'delete_*'
      }
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([patternRule]))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByText(/pattern: delete_\*/i)).toBeInTheDocument()
      })
    })

    it('should display "All tools (default)" for rule with no filters', async () => {
      const defaultRule: ToolPermissionRule = {
        ...mockRule,
        id: 'rule-default',
        serverId: null,
        toolName: null,
        toolPattern: null
      }
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([defaultRule]))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByText(/all tools \(default\)/i)).toBeInTheDocument()
      })
    })

    it('should display priority value', async () => {
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([mockRule]))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByText(/priority: 10/i)).toBeInTheDocument()
      })
    })

    it('should display auto-approve status', async () => {
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([mockRule]))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByText(/auto-approve/i)).toBeInTheDocument()
      })
    })

    it('should display requires approval status for non-auto-approve rule', async () => {
      const requiresApprovalRule: ToolPermissionRule = {
        ...mockRule,
        autoApprove: false
      }
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([requiresApprovalRule]))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByText(/requires approval/i)).toBeInTheDocument()
      })
    })
  })

  describe('Create Rule', () => {
    it('should show form when "Add Rule" button is clicked', async () => {
      const user = userEvent.setup()
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([]))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add rule/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /add rule/i }))

      expect(screen.getByText(/new permission rule/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/server id/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/priority/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/tool name \(exact\)/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/tool pattern \(wildcard\)/i)).toBeInTheDocument()
    })

    it('should hide "Add Rule" button when form is open', async () => {
      const user = userEvent.setup()
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([]))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add rule/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /add rule/i }))

      // The header's Add Rule button should be hidden
      const header = screen.getByText('Tool Permission Rules').closest('div')!
      expect(within(header).queryByRole('button', { name: /add rule/i })).not.toBeInTheDocument()
    })

    it('should call createToolPermissionRule with form data when saved', async () => {
      const user = userEvent.setup()
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([]))
      window.backend.createToolPermissionRule = vi.fn().mockResolvedValue(
        ok({
          ...mockRule,
          id: 'new-rule'
        })
      )

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add rule/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /add rule/i }))

      // Fill in form
      await user.type(screen.getByLabelText(/server id/i), 'test-server')
      await user.clear(screen.getByLabelText(/priority/i))
      await user.type(screen.getByLabelText(/priority/i), '20')
      await user.type(screen.getByLabelText(/tool name \(exact\)/i), 'test_tool')

      // Enable auto-approve
      const autoApproveSwitch = screen.getByRole('switch')
      await user.click(autoApproveSwitch)

      // Save
      await user.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(window.backend.createToolPermissionRule).toHaveBeenCalledWith({
          serverId: 'test-server',
          toolName: 'test_tool',
          toolPattern: null,
          autoApprove: true,
          priority: 20
        })
      })
    })

    it('should cancel form when cancel button is clicked', async () => {
      const user = userEvent.setup()
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([]))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add rule/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /add rule/i }))
      expect(screen.getByText(/new permission rule/i)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(screen.queryByText(/new permission rule/i)).not.toBeInTheDocument()
    })

    it('should reload rules after successful creation', async () => {
      const user = userEvent.setup()
      window.backend.listToolPermissionRules = vi
        .fn()
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok([mockRule]))
      window.backend.createToolPermissionRule = vi.fn().mockResolvedValue(ok(mockRule))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add rule/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /add rule/i }))
      await user.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(window.backend.listToolPermissionRules).toHaveBeenCalledTimes(2)
      })
    })

    it('should display error when creation fails', async () => {
      const user = userEvent.setup()
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([]))
      window.backend.createToolPermissionRule = vi.fn().mockResolvedValue(error('Creation failed'))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add rule/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /add rule/i }))
      await user.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(screen.getByText('Creation failed')).toBeInTheDocument()
      })
    })
  })

  describe('Edit Rule', () => {
    it('should show edit form when edit button is clicked', async () => {
      const user = userEvent.setup()
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([mockRule]))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByText(/tool:/i)).toBeInTheDocument()
      })

      // Find and click edit button (lucide-pen icon)
      const editButton = screen
        .getAllByRole('button')
        .find((btn) => btn.querySelector('svg.lucide-pen'))
      expect(editButton).toBeDefined()
      await user.click(editButton!)

      expect(screen.getByText(/edit rule/i)).toBeInTheDocument()
    })

    it('should populate form with existing rule data', async () => {
      const user = userEvent.setup()
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([mockRule]))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByText(/tool:/i)).toBeInTheDocument()
      })

      const editButton = screen
        .getAllByRole('button')
        .find((btn) => btn.querySelector('svg.lucide-pen'))
      await user.click(editButton!)

      expect(screen.getByLabelText(/server id/i)).toHaveValue('mcp-server-1')
      expect(screen.getByLabelText(/tool name \(exact\)/i)).toHaveValue('read_file')
      expect(screen.getByLabelText(/priority/i)).toHaveValue(10)
    })

    it('should call updateToolPermissionRule when saved', async () => {
      const user = userEvent.setup()
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([mockRule]))
      window.backend.updateToolPermissionRule = vi.fn().mockResolvedValue(
        ok({
          ...mockRule,
          toolName: 'updated_tool'
        })
      )

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByText(/tool: read_file/i)).toBeInTheDocument()
      })

      const editButton = screen
        .getAllByRole('button')
        .find((btn) => btn.querySelector('svg.lucide-pen'))
      await user.click(editButton!)

      // Update tool name
      const toolNameInput = screen.getByLabelText(/tool name \(exact\)/i)
      await user.clear(toolNameInput)
      await user.type(toolNameInput, 'updated_tool')

      await user.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(window.backend.updateToolPermissionRule).toHaveBeenCalledWith('rule-1', {
          serverId: 'mcp-server-1',
          toolName: 'updated_tool',
          toolPattern: null,
          autoApprove: true,
          priority: 10
        })
      })
    })
  })

  describe('Delete Rule', () => {
    it('should call deleteToolPermissionRule when delete button is clicked', async () => {
      const user = userEvent.setup()
      window.backend.listToolPermissionRules = vi
        .fn()
        .mockResolvedValueOnce(ok([mockRule]))
        .mockResolvedValueOnce(ok([]))
      window.backend.deleteToolPermissionRule = vi.fn().mockResolvedValue(ok(true))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByText(/tool: read_file/i)).toBeInTheDocument()
      })

      const deleteButton = screen
        .getAllByRole('button')
        .find((btn) => btn.querySelector('svg.lucide-trash-2'))
      expect(deleteButton).toBeDefined()
      await user.click(deleteButton!)

      await waitFor(() => {
        expect(window.backend.deleteToolPermissionRule).toHaveBeenCalledWith('rule-1')
      })
    })

    it('should reload rules after successful deletion', async () => {
      const user = userEvent.setup()
      window.backend.listToolPermissionRules = vi
        .fn()
        .mockResolvedValueOnce(ok([mockRule]))
        .mockResolvedValueOnce(ok([]))
      window.backend.deleteToolPermissionRule = vi.fn().mockResolvedValue(ok(true))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByText(/tool: read_file/i)).toBeInTheDocument()
      })

      const deleteButton = screen
        .getAllByRole('button')
        .find((btn) => btn.querySelector('svg.lucide-trash-2'))
      await user.click(deleteButton!)

      await waitFor(() => {
        expect(window.backend.listToolPermissionRules).toHaveBeenCalledTimes(2)
      })
    })

    it('should display error when deletion fails', async () => {
      const user = userEvent.setup()
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([mockRule]))
      window.backend.deleteToolPermissionRule = vi.fn().mockResolvedValue(error('Deletion failed'))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByText(/tool: read_file/i)).toBeInTheDocument()
      })

      const deleteButton = screen
        .getAllByRole('button')
        .find((btn) => btn.querySelector('svg.lucide-trash-2'))
      await user.click(deleteButton!)

      await waitFor(() => {
        expect(screen.getByText('Deletion failed')).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('should display error when loading rules fails', async () => {
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(error('Load failed'))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByText('Load failed')).toBeInTheDocument()
      })
    })

    it('should display error when listToolPermissionRules throws', async () => {
      window.backend.listToolPermissionRules = vi.fn().mockRejectedValue(new Error('Network error'))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })
    })
  })

  describe('Help Text', () => {
    it('should display help text about how rules work', async () => {
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([]))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByText(/rules are evaluated in priority order/i)).toBeInTheDocument()
      })
    })

    it('should display example pattern in help text', async () => {
      window.backend.listToolPermissionRules = vi.fn().mockResolvedValue(ok([]))

      render(<ToolPermissionSettings />)

      await waitFor(() => {
        expect(screen.getByText(/delete_\*/)).toBeInTheDocument()
      })
    })
  })
})
