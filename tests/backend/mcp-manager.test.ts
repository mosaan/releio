import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createTestDatabase } from './database-helper'
import { MCPManager } from '@backend/mcp/manager'

// Mock the AI SDK's experimental_createMCPClient
vi.mock('ai', () => ({
  experimental_createMCPClient: vi.fn(() => ({
    listResources: vi.fn(async () => [
      {
        uri: 'file:///test.txt',
        name: 'test.txt',
        description: 'A test file',
        mimeType: 'text/plain'
      }
    ]),
    getTools: vi.fn(async ({ includeResources }) => {
      const tools = [
        {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: { type: 'object', properties: {} }
        }
      ]

      if (includeResources) {
        tools.push({
          name: 'read_resource',
          description: 'Read a resource',
          inputSchema: { type: 'object', properties: { uri: { type: 'string' } } }
        })
      }

      return tools
    }),
    listPrompts: vi.fn(async () => [
      {
        name: 'test_prompt',
        description: 'A test prompt',
        arguments: []
      }
    ])
  }))
}))

// Mock logger to avoid console output during tests
vi.mock('@backend/logger', () => {
  const createLoggerMock = () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => createLoggerMock())
  })
  return {
    default: createLoggerMock()
  }
})

// Mock the db module to use test database
let testDbInstance: any = null

vi.mock('@backend/db', async () => {
  const actual = await vi.importActual('@backend/db')
  return {
    ...actual,
    get db() {
      return testDbInstance
    }
  }
})

describe('MCPManager', () => {
  let manager: MCPManager

  beforeEach(async () => {
    // Create a fresh test database for each test
    testDbInstance = await createTestDatabase()

    // Create a fresh MCPManager instance for each test
    manager = new MCPManager()
    await manager.initialize()
  })

  afterEach(async () => {
    // Cleanup after each test
    if (manager) {
      await manager.cleanup()
    }
  })

  describe('Server Management', () => {
    it('should add a new MCP server', async () => {
      const serverConfig = {
        name: 'Test Server',
        description: 'A test MCP server',
        command: 'node',
        args: ['test-server.js'],
        env: { TEST_VAR: 'value' },
        enabled: false,
        includeResources: false
      }

      const result = await manager.addServer(serverConfig)

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.value).toBeDefined()
        expect(typeof result.value).toBe('string')
      }
    })

    it('should list all registered servers', async () => {
      // Add a test server
      await manager.addServer({
        name: 'Server 1',
        command: 'node',
        args: ['server1.js'],
        enabled: false,
        includeResources: false
      })

      const result = await manager.listServers()

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.value).toHaveLength(1)
        expect(result.value[0].name).toBe('Server 1')
      }
    })

    it('should update an existing server', async () => {
      const addResult = await manager.addServer({
        name: 'Original Name',
        command: 'node',
        args: ['server.js'],
        enabled: false,
        includeResources: false
      })

      if (addResult.status === 'ok') {
        const serverId = addResult.value

        const updateResult = await manager.updateServer(serverId, {
          name: 'Updated Name',
          description: 'Updated description'
        })

        expect(updateResult.status).toBe('ok')

        const listResult = await manager.listServers()
        if (listResult.status === 'ok') {
          const server = listResult.value.find(s => s.id === serverId)
          expect(server?.name).toBe('Updated Name')
          expect(server?.description).toBe('Updated description')
        }
      }
    })

    it('should remove a server', async () => {
      const addResult = await manager.addServer({
        name: 'To Be Removed',
        command: 'node',
        args: ['server.js'],
        enabled: false,
        includeResources: false
      })

      if (addResult.status === 'ok') {
        const serverId = addResult.value

        const removeResult = await manager.removeServer(serverId)
        expect(removeResult.status).toBe('ok')

        const listResult = await manager.listServers()
        if (listResult.status === 'ok') {
          expect(listResult.value).toHaveLength(0)
        }
      }
    })
  })

  describe('Server Lifecycle', () => {
    it('should track server status as stopped when added with enabled=false', async () => {
      const addResult = await manager.addServer({
        name: 'Test Server',
        command: 'node',
        args: ['server.js'],
        enabled: false,
        includeResources: false
      })

      if (addResult.status === 'ok') {
        const status = manager.getServerStatus(addResult.value)
        expect(status?.status).toBe('stopped')
      }
    })

    it('should start server when enabled is set to true', async () => {
      const addResult = await manager.addServer({
        name: 'Test Server',
        command: 'node',
        args: ['server.js'],
        enabled: false,
        includeResources: false
      })

      if (addResult.status === 'ok') {
        const serverId = addResult.value

        // Enable the server
        await manager.updateServer(serverId, { enabled: true })

        const status = manager.getServerStatus(serverId)
        expect(status?.status).toBe('connected')
      }
    })

    it('should stop server when enabled is set to false', async () => {
      const addResult = await manager.addServer({
        name: 'Test Server',
        command: 'node',
        args: ['server.js'],
        enabled: true,
        includeResources: false
      })

      if (addResult.status === 'ok') {
        const serverId = addResult.value

        // Initially should be connected
        let status = manager.getServerStatus(serverId)
        expect(status?.status).toBe('connected')

        // Disable the server
        await manager.updateServer(serverId, { enabled: false })

        status = manager.getServerStatus(serverId)
        expect(status?.status).toBe('stopped')
      }
    })
  })

  describe('MCP Primitives', () => {
    it('should list resources from a connected server', async () => {
      const addResult = await manager.addServer({
        name: 'Test Server',
        command: 'node',
        args: ['server.js'],
        enabled: true,
        includeResources: false
      })

      if (addResult.status === 'ok') {
        const serverId = addResult.value
        const result = await manager.listResources(serverId)

        expect(result.status).toBe('ok')
        if (result.status === 'ok') {
          expect(result.value).toHaveLength(1)
          expect(result.value[0].name).toBe('test.txt')
        }
      }
    })

    it('should list tools from a connected server', async () => {
      const addResult = await manager.addServer({
        name: 'Test Server',
        command: 'node',
        args: ['server.js'],
        enabled: true,
        includeResources: false
      })

      if (addResult.status === 'ok') {
        const serverId = addResult.value
        const result = await manager.listTools(serverId)

        expect(result.status).toBe('ok')
        if (result.status === 'ok') {
          expect(result.value).toHaveLength(1)
          expect(result.value[0].name).toBe('test_tool')
        }
      }
    })

    it('should list prompts from a connected server', async () => {
      const addResult = await manager.addServer({
        name: 'Test Server',
        command: 'node',
        args: ['server.js'],
        enabled: true,
        includeResources: false
      })

      if (addResult.status === 'ok') {
        const serverId = addResult.value
        const result = await manager.listPrompts(serverId)

        expect(result.status).toBe('ok')
        if (result.status === 'ok') {
          expect(result.value).toHaveLength(1)
          expect(result.value[0].name).toBe('test_prompt')
        }
      }
    })

    it('should return error when listing resources from disconnected server', async () => {
      const addResult = await manager.addServer({
        name: 'Test Server',
        command: 'node',
        args: ['server.js'],
        enabled: false,
        includeResources: false
      })

      if (addResult.status === 'ok') {
        const serverId = addResult.value
        const result = await manager.listResources(serverId)

        expect(result.status).toBe('error')
      }
    })
  })

  describe('Tool Aggregation', () => {
    it('should get all tools from all active servers', async () => {
      // Add two enabled servers
      await manager.addServer({
        name: 'Server 1',
        command: 'node',
        args: ['server1.js'],
        enabled: true,
        includeResources: false
      })

      await manager.addServer({
        name: 'Server 2',
        command: 'node',
        args: ['server2.js'],
        enabled: true,
        includeResources: false
      })

      const tools = await manager.getAllTools()

      // Each server provides 1 tool (without includeResources)
      expect(tools).toHaveLength(2)
      expect(tools.every(t => t.name === 'test_tool')).toBe(true)
    })

    it('should respect includeResources flag when getting tools', async () => {
      await manager.addServer({
        name: 'Server with resources',
        command: 'node',
        args: ['server.js'],
        enabled: true,
        includeResources: true
      })

      const tools = await manager.getAllTools()

      // Should have 2 tools: test_tool + read_resource
      expect(tools.length).toBeGreaterThanOrEqual(2)
      expect(tools.some(t => t.name === 'read_resource')).toBe(true)
    })

    it('should only include tools from enabled servers', async () => {
      await manager.addServer({
        name: 'Enabled Server',
        command: 'node',
        args: ['server1.js'],
        enabled: true,
        includeResources: false
      })

      await manager.addServer({
        name: 'Disabled Server',
        command: 'node',
        args: ['server2.js'],
        enabled: false,
        includeResources: false
      })

      const tools = await manager.getAllTools()

      // Only 1 tool from the enabled server
      expect(tools).toHaveLength(1)
    })
  })

  describe('Error Handling', () => {
    it('should return error for non-existent server', async () => {
      const result = await manager.updateServer('non-existent-id', { name: 'New Name' })

      expect(result.status).toBe('error')
    })

    it('should handle cleanup gracefully', async () => {
      await manager.addServer({
        name: 'Test Server',
        command: 'node',
        args: ['server.js'],
        enabled: true,
        includeResources: false
      })

      await expect(manager.cleanup()).resolves.not.toThrow()
    })
  })
})
