/**
 * MastraToolService - Converts MCP tools to Mastra tool format
 *
 * This service bridges the gap between AI SDK v5 format tools (from MCP)
 * and Mastra's tool format, including HITL (Human-in-the-Loop) approval support.
 */

import { createTool } from '@mastra/core/tools'
import type { ToolAction } from '@mastra/core/tools'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { mcpManager } from '../mcp'
import logger from '../logger'
import { toolPermissionService } from './ToolPermissionService'
import { sessionContext } from './session-context'
import { approvalManager } from './ApprovalManager'

// JSON Schema to Zod conversion is complex, so we use a passthrough schema
// that accepts any input matching the original JSON schema structure
const createPassthroughSchema = () => z.record(z.unknown())

export interface MastraToolOptions {
  /** Server ID for tracking which MCP server this tool belongs to */
  serverId?: string
  /** Whether this tool requires approval before execution */
  requireApproval?: boolean
}

// Use ToolAction which is the base type that Agent.tools accepts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MastraTool = ToolAction<any, any, any>
export type MastraToolRecord = Record<string, MastraTool>

/**
 * Converts an MCP tool (AI SDK v5 format) to a Mastra tool
 */
function convertMCPToolToMastra(
  toolName: string,
  mcpTool: {
    description?: string
    parameters?: unknown
    execute?: (args: unknown) => Promise<unknown>
  },
  options: MastraToolOptions = {}
): MastraTool {
  const { serverId, requireApproval = false } = options

  logger.info('[MastraToolService] Converting tool', {
    toolName,
    serverId,
    requireApproval,
    hasExecute: !!mcpTool.execute
  })

  // Create a Mastra tool that wraps the MCP tool execution
  return createTool({
    id: toolName,
    description: mcpTool.description || `MCP Tool: ${toolName}`,
    inputSchema: createPassthroughSchema(),
    requireApproval,
    execute: async ({ context }) => {
      logger.info('[MastraToolService] Executing tool', {
        toolName,
        serverId,
        inputKeys: Object.keys(context || {})
      })

      // HITL Approval Check
      if (requireApproval) {
        const store = sessionContext.getStore()

        if (store) {
          logger.info('[MastraToolService] Tool requires approval, requesting...', {
            toolName,
            sessionId: store.sessionId
          })

          const approved = await approvalManager.requestApproval({
            sessionId: store.sessionId,
            streamId: store.streamId,
            toolCallId: randomUUID(), // We don't have the exact LLM toolCallId here, so generate one
            toolName,
            input: context
          })

          if (!approved) {
            logger.info('[MastraToolService] Tool execution declined by user', { toolName })
            throw new Error('Tool execution declined by user')
          }

          logger.info('[MastraToolService] Tool execution approved', { toolName })
        } else {
          logger.warn(
            '[MastraToolService] Tool requires approval but no session context found. Auto-allowing (fallback).',
            {
              toolName
            }
          )
        }
      }

      try {
        if (!mcpTool.execute) {
          throw new Error(`Tool ${toolName} has no execute function`)
        }

        const result = await mcpTool.execute(context)

        logger.info('[MastraToolService] Tool execution completed', {
          toolName,
          resultType: typeof result
        })

        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error('[MastraToolService] Tool execution failed', {
          toolName,
          error: message
        })
        throw err
      }
    }
  })
}

/**
 * MastraToolService - Manages MCP tool conversion and HITL integration
 */
export class MastraToolService {
  private toolCache: Map<string, MastraToolRecord> = new Map()
  private lastRefresh: number = 0
  private readonly cacheValidityMs = 30000 // 30 seconds

  /**
   * Get all MCP tools converted to Mastra format
   *
   * @param permissionChecker - Optional function to determine if a tool requires approval
   * @returns Record of tool name to Mastra Tool
   */
  async getAllTools(
    permissionChecker?: (serverId: string, toolName: string) => boolean
  ): Promise<MastraToolRecord> {
    const now = Date.now()

    // Check cache validity
    if (this.toolCache.size > 0 && now - this.lastRefresh < this.cacheValidityMs) {
      logger.info('[MastraToolService] Returning cached tools', {
        toolCount: this.toolCache.size
      })
      return this.flattenToolCache()
    }

    logger.info('[MastraToolService] Refreshing tools from MCP servers')

    // Get all tools from MCP manager
    const mcpTools = await mcpManager.getAllTools()
    const toolNames = Object.keys(mcpTools)

    logger.info('[MastraToolService] Retrieved MCP tools', {
      toolCount: toolNames.length
    })

    // Clear old cache
    this.toolCache.clear()

    // Convert each tool
    const allTools: MastraToolRecord = {}

    for (const [toolName, mcpTool] of Object.entries(mcpTools)) {
      // Determine server ID from tool name if possible (MCP tools may be prefixed)
      // For now, we use 'unknown' as we don't have server mapping in getAllTools
      const serverId = 'unknown'

      // Check if approval is required
      const requireApproval = permissionChecker
        ? !permissionChecker(serverId, toolName) // If not auto-approved, require approval
        : false // Default: no approval required (for Phase 2)

      const mastraTool = convertMCPToolToMastra(toolName, mcpTool, {
        serverId,
        requireApproval
      })

      allTools[toolName] = mastraTool
    }

    // Update cache
    this.toolCache.set('all', allTools)
    this.lastRefresh = now

    logger.info('[MastraToolService] Tool conversion completed', {
      toolCount: Object.keys(allTools).length
    })

    return allTools
  }

  /**
   * Get all MCP tools with permission checking from ToolPermissionService
   *
   * This method uses the configured permission rules from the database
   * to determine which tools require approval.
   *
   * @returns Record of tool name to Mastra Tool with appropriate approval flags
   */
  async getAllToolsWithPermissions(): Promise<MastraToolRecord> {
    // Preload permission rules cache for sync access during conversion
    await toolPermissionService.preloadCache()

    // Use the permission service as the checker
    return this.getAllTools((serverId, toolName) =>
      toolPermissionService.shouldAutoApproveSync(serverId, toolName)
    )
  }

  /**
   * Get tools for a specific MCP server
   */
  async getToolsForServer(
    serverId: string,
    permissionChecker?: (serverId: string, toolName: string) => boolean
  ): Promise<MastraToolRecord> {
    const result = await mcpManager.listTools(serverId)

    if (result.status === 'error') {
      logger.error('[MastraToolService] Failed to get tools for server', {
        serverId,
        error: result.error
      })
      return {}
    }

    const tools: MastraToolRecord = {}

    for (const mcpTool of result.value) {
      const requireApproval = permissionChecker ? !permissionChecker(serverId, mcpTool.name) : false

      // For server-specific tools, we need to get the executable version
      // This requires calling getAllTools which has the execute functions
      const allMcpTools = await mcpManager.getAllTools()
      const executableTool = allMcpTools[mcpTool.name]

      if (executableTool) {
        tools[mcpTool.name] = convertMCPToolToMastra(mcpTool.name, executableTool, {
          serverId,
          requireApproval
        })
      }
    }

    return tools
  }

  /**
   * Invalidate the tool cache (call when MCP servers change)
   */
  invalidateCache(): void {
    this.toolCache.clear()
    this.lastRefresh = 0
    logger.info('[MastraToolService] Tool cache invalidated')
  }

  /**
   * Get tool count
   */
  async getToolCount(): Promise<number> {
    const tools = await this.getAllTools()
    return Object.keys(tools).length
  }

  private flattenToolCache(): MastraToolRecord {
    const result: MastraToolRecord = {}
    for (const tools of this.toolCache.values()) {
      Object.assign(result, tools)
    }
    return result
  }
}

// Export singleton instance
export const mastraToolService = new MastraToolService()
