import { mcpManager } from './src/backend/mcp/manager'
import logger from './src/backend/logger'

async function checkMCPServers() {
  console.log('Checking MCP Servers...')

  await mcpManager.initialize()

  const statuses = mcpManager.getAllServerStatuses()
  console.log('Server Statuses:', JSON.stringify(statuses, null, 2))

  const tools = await mcpManager.getAllTools()
  console.log('Total Tools:', Object.keys(tools).length)

  await mcpManager.cleanup()
}

checkMCPServers().catch(console.error)
