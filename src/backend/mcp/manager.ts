import { experimental_createMCPClient, type experimental_MCPClient } from '@ai-sdk/mcp'
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio'
import type { MCPServerConfig, MCPResource, MCPTool, MCPPrompt, Result } from '@common/types'
import { ok, error } from '@common/result'
import logger from '../logger'
import { db } from '../db'
import { mcpServers } from '../db/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'

const mcpLogger = logger.child('mcp')

type MCPClient = experimental_MCPClient

export class MCPManager {
  private clients: Map<string, MCPClient> = new Map()
  private serverConfigs: Map<string, MCPServerConfig> = new Map()
  private serverStatus: Map<string, { status: 'connected' | 'stopped' | 'error'; error?: string }> = new Map()

  /**
   * Initialize MCP Manager - automatically starts all enabled servers
   * Called during application startup
   * Note: Individual server failures will not prevent initialization
   */
  async initialize(): Promise<void> {
    mcpLogger.info('Initializing MCP Manager...')

    try {
      const configs = await this.loadServerConfigs()
      mcpLogger.info(`Loaded ${configs.length} MCP server configuration(s)`)

      for (const config of configs) {
        this.serverConfigs.set(config.id, config)
        // Set initial status as stopped
        this.serverStatus.set(config.id, { status: 'stopped' })

        if (config.enabled) {
          mcpLogger.info(`Auto-starting enabled server: ${config.name} (${config.id})`)
          const result = await this.start(config.id)
          if (result.status === 'error') {
            mcpLogger.error(`Failed to start server ${config.name}: ${result.error}`)
            // Continue with other servers even if one fails
          }
        }
      }

      mcpLogger.info('MCP Manager initialized successfully')
    } catch (err) {
      // Log error but don't throw - allow backend process to continue
      mcpLogger.error('Failed to initialize MCP Manager', err)
      mcpLogger.warn('Backend process will continue despite MCP initialization failure')
    }
  }

  /**
   * Start an MCP server
   */
  async start(serverId: string): Promise<Result<void, string>> {
    const config = this.serverConfigs.get(serverId)
    if (!config) {
      return error(`Server config not found: ${serverId}`)
    }

    // Check if already running
    if (this.clients.has(serverId)) {
      mcpLogger.warn(`Server ${config.name} is already running`)
      return ok(undefined)
    }

    try {
      mcpLogger.info(`[START] Starting MCP server: ${config.name}`, {
        command: config.command,
        args: config.args,
        env: config.env ? Object.keys(config.env) : 'none'
      })

      const transport = new Experimental_StdioMCPTransport({
        command: config.command,
        args: config.args,
        env: config.env || undefined
      })

      const client = await experimental_createMCPClient({
        transport
      })

      this.clients.set(serverId, client)
      this.serverStatus.set(serverId, { status: 'connected' })

      // Try to get tools immediately to verify connection
      try {
        const tools = await client.tools()
        const toolCount = Object.keys(tools).length
        mcpLogger.info(`[START] Successfully connected to ${config.name}: ${toolCount} tool(s) available`)
      } catch (err) {
        mcpLogger.warn(`[START] Server ${config.name} started but failed to get tools:`, err)
      }

      return ok(undefined)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      mcpLogger.error(`Failed to start server ${config.name}:`, err)
      this.serverStatus.set(serverId, { status: 'error', error: errMsg })
      return error(`Failed to start server: ${errMsg}`)
    }
  }

  /**
   * Stop an MCP server
   */
  async stop(serverId: string): Promise<Result<void, string>> {
    const client = this.clients.get(serverId)
    const config = this.serverConfigs.get(serverId)

    if (!client) {
      mcpLogger.warn(`Server ${serverId} is not running`)
      return ok(undefined)
    }

    try {
      mcpLogger.info(`Stopping MCP server: ${config?.name || serverId}`)

      // Clean up the client
      this.clients.delete(serverId)
      this.serverStatus.set(serverId, { status: 'stopped' })

      mcpLogger.info(`Successfully stopped server: ${config?.name || serverId}`)
      return ok(undefined)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      mcpLogger.error(`Failed to stop server ${serverId}:`, err)
      return error(`Failed to stop server: ${errMsg}`)
    }
  }

  /**
   * List all registered MCP servers
   */
  async listServers(): Promise<Result<MCPServerConfig[], string>> {
    try {
      const configs = await this.loadServerConfigs()
      return ok(configs)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      mcpLogger.error('Failed to list servers:', err)
      return error(`Failed to list servers: ${errMsg}`)
    }
  }

  /**
   * Add a new MCP server
   */
  async addServer(
    config: Omit<MCPServerConfig, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Result<string, string>> {
    try {
      const serverId = randomUUID()
      const now = new Date()

      const fullConfig: MCPServerConfig = {
        ...config,
        id: serverId,
        createdAt: now,
        updatedAt: now
      }

      mcpLogger.info(`Adding new MCP server: ${config.name}`)

      // Save to database
      await db.insert(mcpServers).values({
        id: fullConfig.id,
        name: fullConfig.name,
        description: fullConfig.description || null,
        command: fullConfig.command,
        args: fullConfig.args,
        env: fullConfig.env || null,
        enabled: fullConfig.enabled,
        includeResources: fullConfig.includeResources,
        createdAt: fullConfig.createdAt,
        updatedAt: fullConfig.updatedAt
      })

      this.serverConfigs.set(serverId, fullConfig)
      // Set initial status as stopped
      this.serverStatus.set(serverId, { status: 'stopped' })

      // Start server if enabled
      if (fullConfig.enabled) {
        mcpLogger.info(`Starting newly added server: ${fullConfig.name}`)
        const result = await this.start(serverId)
        if (result.status === 'error') {
          mcpLogger.error(`Failed to start newly added server: ${result.error}`)
        }
      }

      mcpLogger.info(`Successfully added server: ${config.name} (${serverId})`)
      return ok(serverId)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      mcpLogger.error('Failed to add server:', err)
      return error(`Failed to add server: ${errMsg}`)
    }
  }

  /**
   * Update an existing MCP server
   */
  async updateServer(
    serverId: string,
    updates: Partial<MCPServerConfig>
  ): Promise<Result<void, string>> {
    const config = this.serverConfigs.get(serverId)
    if (!config) {
      return error(`Server not found: ${serverId}`)
    }

    try {
      const wasEnabled = config.enabled
      const newConfig: MCPServerConfig = {
        ...config,
        ...updates,
        id: serverId, // Ensure ID doesn't change
        updatedAt: new Date()
      }

      mcpLogger.info(`Updating MCP server: ${config.name}`)

      // Update database
      await db
        .update(mcpServers)
        .set({
          name: newConfig.name,
          description: newConfig.description || null,
          command: newConfig.command,
          args: newConfig.args,
          env: newConfig.env || null,
          enabled: newConfig.enabled,
          includeResources: newConfig.includeResources,
          updatedAt: newConfig.updatedAt
        })
        .where(eq(mcpServers.id, serverId))

      this.serverConfigs.set(serverId, newConfig)

      // Handle enabled state changes
      if (!wasEnabled && newConfig.enabled) {
        // Start server
        mcpLogger.info(`Enabling server: ${newConfig.name}`)
        await this.start(serverId)
      } else if (wasEnabled && !newConfig.enabled) {
        // Stop server
        mcpLogger.info(`Disabling server: ${newConfig.name}`)
        await this.stop(serverId)
      } else if (wasEnabled && newConfig.enabled) {
        // Restart server to apply config changes
        mcpLogger.info(`Restarting server to apply changes: ${newConfig.name}`)
        await this.stop(serverId)
        await this.start(serverId)
      }

      mcpLogger.info(`Successfully updated server: ${newConfig.name}`)
      return ok(undefined)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      mcpLogger.error('Failed to update server:', err)
      return error(`Failed to update server: ${errMsg}`)
    }
  }

  /**
   * Remove an MCP server
   */
  async removeServer(serverId: string): Promise<Result<void, string>> {
    const config = this.serverConfigs.get(serverId)

    try {
      mcpLogger.info(`Removing MCP server: ${config?.name || serverId}`)

      // Stop server if running
      if (this.clients.has(serverId)) {
        await this.stop(serverId)
      }

      // Remove from database
      await db.delete(mcpServers).where(eq(mcpServers.id, serverId))

      // Remove from in-memory store
      this.serverConfigs.delete(serverId)

      mcpLogger.info(`Successfully removed server: ${config?.name || serverId}`)
      return ok(undefined)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      mcpLogger.error('Failed to remove server:', err)
      return error(`Failed to remove server: ${errMsg}`)
    }
  }

  /**
   * List resources from a specific MCP server
   */
  async listResources(serverId: string): Promise<Result<MCPResource[], string>> {
    const client = this.clients.get(serverId)
    const config = this.serverConfigs.get(serverId)

    if (!client) {
      return error(`Server not connected: ${config?.name || serverId}`)
    }

    try {
      mcpLogger.info(`Listing resources from server: ${config?.name || serverId}`)
      const result = await client.listResources()
      const resources = result.resources as MCPResource[]
      mcpLogger.info(`Found ${resources.length} resource(s) from ${config?.name}`)
      return ok(resources)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      mcpLogger.error(`Failed to list resources from ${config?.name}:`, err)
      return error(`Failed to list resources: ${errMsg}`)
    }
  }

  /**
   * List tools from a specific MCP server (Phase 2)
   */
  async listTools(serverId: string): Promise<Result<MCPTool[], string>> {
    const client = this.clients.get(serverId)
    const config = this.serverConfigs.get(serverId)

    if (!client) {
      return error(`Server not connected: ${config?.name || serverId}`)
    }

    try {
      mcpLogger.info(`Listing tools from server: ${config?.name || serverId}`)
      const toolsRecord = await client.tools()
      // Convert Record<string, Tool> to MCPTool array for UI display
      const tools = Object.entries(toolsRecord).map(([name, tool]) => ({
        name,
        description: tool.description,
        inputSchema: tool.inputSchema as any
      })) as MCPTool[]
      mcpLogger.info(`Found ${tools.length} tool(s) from ${config?.name}`)
      return ok(tools)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      mcpLogger.error(`Failed to list tools from ${config?.name}:`, err)
      return error(`Failed to list tools: ${errMsg}`)
    }
  }

  /**
   * List prompts from a specific MCP server (Phase 1 - basic implementation)
   */
  async listPrompts(serverId: string): Promise<Result<MCPPrompt[], string>> {
    const client = this.clients.get(serverId)
    const config = this.serverConfigs.get(serverId)

    if (!client) {
      return error(`Server not connected: ${config?.name || serverId}`)
    }

    try {
      mcpLogger.info(`Listing prompts from server: ${config?.name || serverId}`)
      const result = await client.listPrompts()
      const prompts = result.prompts as MCPPrompt[]
      mcpLogger.info(`Found ${prompts.length} prompt(s) from ${config?.name}`)
      return ok(prompts)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      mcpLogger.error(`Failed to list prompts from ${config?.name}:`, err)
      return error(`Failed to list prompts: ${errMsg}`)
    }
  }

  /**
   * Call a tool on a specific MCP server (Phase 2)
   */
  async callTool(
    serverId: string,
    toolName: string,
    _args: unknown
  ): Promise<Result<unknown, string>> {
    const client = this.clients.get(serverId)
    const config = this.serverConfigs.get(serverId)

    if (!client) {
      return error(`Server not connected: ${config?.name || serverId}`)
    }

    try {
      mcpLogger.info(`Calling tool ${toolName} on server: ${config?.name || serverId}`)

      // Get the tool and execute it
      const toolsRecord = await client.tools()
      const tool = toolsRecord[toolName]

      if (!tool) {
        return error(`Tool not found: ${toolName}`)
      }

      // Note: The actual tool execution would be handled by the AI SDK
      // during the streamText() call. This method is for manual execution
      // from the UI (Phase 2).
      mcpLogger.warn('Manual tool execution not yet implemented')
      return error('Manual tool execution not yet implemented')
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      mcpLogger.error(`Failed to call tool ${toolName}:`, err)
      return error(`Failed to call tool: ${errMsg}`)
    }
  }

  /**
   * Get all tools from all active servers (Phase 3)
   * Returns tools in AI SDK v5 ToolSet format (Record<string, Tool>)
   */
  async getAllTools(): Promise<Record<string, any>> {
    const allTools: Record<string, any> = {}

    mcpLogger.info(`[TOOLS] Gathering tools from ${this.clients.size} active MCP server(s)...`)

    for (const [serverId, client] of this.clients) {
      const config = this.serverConfigs.get(serverId)
      if (!config) {
        mcpLogger.warn(`[TOOLS] Server config not found for ${serverId}, skipping`)
        continue
      }

      try {
        mcpLogger.info(`[TOOLS] Getting tools from "${config.name}"`)
        const tools = await client.tools()
        const toolNames = Object.keys(tools)

        mcpLogger.info(`[TOOLS] Retrieved ${toolNames.length} tool(s) from "${config.name}"`)
        if (toolNames.length > 0) {
          toolNames.forEach(name => {
            const tool = tools[name]
            mcpLogger.info(`[TOOLS]   - ${name}: ${tool.description || 'No description'}`)
          })
        }

        // Merge tools from this server into allTools
        Object.assign(allTools, tools)
      } catch (err) {
        mcpLogger.error(`[TOOLS] Failed to get tools from "${config.name}":`, err)
        // Continue with other servers even if one fails
      }
    }

    const totalCount = Object.keys(allTools).length
    mcpLogger.info(`[TOOLS] Total tools available: ${totalCount}`)
    return allTools
  }

  /**
   * Load server configurations from database
   */
  private async loadServerConfigs(): Promise<MCPServerConfig[]> {
    const rows = await db.select().from(mcpServers)

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      command: row.command,
      args: row.args,
      env: row.env || undefined,
      enabled: row.enabled,
      includeResources: row.includeResources,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }))
  }

  /**
   * Get status of a specific server
   */
  getServerStatus(serverId: string): { status: 'connected' | 'stopped' | 'error'; error?: string } | null {
    return this.serverStatus.get(serverId) || null
  }

  /**
   * Get status of all servers
   */
  getAllServerStatus(): Map<string, { status: 'connected' | 'stopped' | 'error'; error?: string }> {
    return new Map(this.serverStatus)
  }

  /**
   * Cleanup - stop all servers
   * Called during application shutdown
   */
  async cleanup(): Promise<void> {
    mcpLogger.info('Cleaning up MCP Manager...')

    for (const [serverId, config] of this.serverConfigs) {
      if (this.clients.has(serverId)) {
        mcpLogger.info(`Stopping server: ${config.name}`)
        await this.stop(serverId)
      }
    }

    mcpLogger.info('MCP Manager cleanup completed')
  }
}

// Export singleton instance
export const mcpManager = new MCPManager()
