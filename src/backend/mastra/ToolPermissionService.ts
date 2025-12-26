/**
 * ToolPermissionService - Manages tool execution permission rules
 *
 * This service provides CRUD operations for tool permission rules and
 * evaluates whether a specific tool should be auto-approved or require
 * user confirmation (HITL - Human-in-the-Loop).
 *
 * Permission rules are evaluated in priority order (highest first).
 * The first matching rule determines the approval status.
 * If no rules match, the default is to require approval (safe default).
 */

import { randomUUID } from 'node:crypto'
import { eq, desc } from 'drizzle-orm'
import { db } from '../db'
import {
  toolPermissionRules,
  type SelectToolPermissionRule,
  type InsertToolPermissionRule
} from '../db/schema'
import logger from '../logger'

export interface ToolPermissionRule {
  id: string
  serverId: string | null
  toolName: string | null
  toolPattern: string | null
  autoApprove: boolean
  priority: number
  createdAt: string
  updatedAt: string
}

export interface CreateToolPermissionRuleInput {
  serverId?: string | null
  toolName?: string | null
  toolPattern?: string | null
  autoApprove: boolean
  priority?: number
}

export interface UpdateToolPermissionRuleInput {
  serverId?: string | null
  toolName?: string | null
  toolPattern?: string | null
  autoApprove?: boolean
  priority?: number
}

/**
 * Convert database row to domain model
 */
function toDomain(row: SelectToolPermissionRule): ToolPermissionRule {
  return {
    id: row.id,
    serverId: row.serverId,
    toolName: row.toolName,
    toolPattern: row.toolPattern,
    autoApprove: row.autoApprove === 1,
    priority: row.priority,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

/**
 * Check if a tool name matches a wildcard pattern
 * Supports * as wildcard (e.g., "delete_*" matches "delete_file", "delete_dir")
 */
function matchesPattern(toolName: string, pattern: string): boolean {
  // Convert wildcard pattern to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars except *
    .replace(/\*/g, '.*') // Convert * to .*

  const regex = new RegExp(`^${regexPattern}$`, 'i')
  return regex.test(toolName)
}

/**
 * ToolPermissionService - Singleton service for tool permission management
 */
export class ToolPermissionService {
  private rulesCache: ToolPermissionRule[] | null = null
  private cacheTimestamp: number = 0
  private readonly cacheTTL = 5000 // 5 seconds

  /**
   * Check if a tool should be auto-approved
   *
   * Rules are evaluated in priority order (highest first).
   * The first matching rule determines the result.
   *
   * Matching logic:
   * 1. If rule has serverId, it must match the tool's server
   * 2. If rule has toolName, it must exactly match the tool name
   * 3. If rule has toolPattern, the tool name must match the pattern
   * 4. A rule with all nulls matches everything (global rule)
   *
   * @param serverId - The MCP server ID
   * @param toolName - The tool name
   * @returns true if auto-approved, false if approval required
   */
  async shouldAutoApprove(serverId: string, toolName: string): Promise<boolean> {
    const rules = await this.listRules()

    for (const rule of rules) {
      // Check server match (null = any server)
      if (rule.serverId !== null && rule.serverId !== serverId) {
        continue
      }

      // Check exact tool name match
      if (rule.toolName !== null) {
        if (rule.toolName === toolName) {
          logger.debug('[ToolPermissionService] Rule matched (exact name)', {
            ruleId: rule.id,
            serverId,
            toolName,
            autoApprove: rule.autoApprove
          })
          return rule.autoApprove
        }
        continue
      }

      // Check pattern match
      if (rule.toolPattern !== null) {
        if (matchesPattern(toolName, rule.toolPattern)) {
          logger.debug('[ToolPermissionService] Rule matched (pattern)', {
            ruleId: rule.id,
            pattern: rule.toolPattern,
            serverId,
            toolName,
            autoApprove: rule.autoApprove
          })
          return rule.autoApprove
        }
        continue
      }

      // Global rule (all nulls) - matches everything
      logger.debug('[ToolPermissionService] Rule matched (global)', {
        ruleId: rule.id,
        serverId,
        toolName,
        autoApprove: rule.autoApprove
      })
      return rule.autoApprove
    }

    // No matching rule - default to requiring approval (safe default)
    logger.debug('[ToolPermissionService] No matching rule, requiring approval', {
      serverId,
      toolName
    })
    return false
  }

  /**
   * Synchronous version of shouldAutoApprove that uses cached rules
   * Falls back to requiring approval if cache is not available
   */
  shouldAutoApproveSync(serverId: string, toolName: string): boolean {
    if (!this.rulesCache) {
      logger.debug('[ToolPermissionService] Cache not available, defaulting to require approval')
      return false
    }

    for (const rule of this.rulesCache) {
      if (rule.serverId !== null && rule.serverId !== serverId) continue
      if (rule.toolName !== null) {
        if (rule.toolName === toolName) return rule.autoApprove
        continue
      }
      if (rule.toolPattern !== null) {
        if (matchesPattern(toolName, rule.toolPattern)) return rule.autoApprove
        continue
      }
      return rule.autoApprove
    }

    return false
  }

  /**
   * Pre-load rules cache for synchronous access
   */
  async preloadCache(): Promise<void> {
    await this.listRules()
  }

  /**
   * List all permission rules, ordered by priority (highest first)
   */
  async listRules(): Promise<ToolPermissionRule[]> {
    const now = Date.now()

    // Return cached if still valid
    if (this.rulesCache && now - this.cacheTimestamp < this.cacheTTL) {
      return this.rulesCache
    }

    logger.debug('[ToolPermissionService] Fetching rules from database')

    const rows = await db
      .select()
      .from(toolPermissionRules)
      .orderBy(desc(toolPermissionRules.priority))

    this.rulesCache = rows.map(toDomain)
    this.cacheTimestamp = now

    logger.info('[ToolPermissionService] Rules loaded', {
      count: this.rulesCache.length
    })

    return this.rulesCache
  }

  /**
   * Get a single rule by ID
   */
  async getRule(id: string): Promise<ToolPermissionRule | null> {
    const rows = await db.select().from(toolPermissionRules).where(eq(toolPermissionRules.id, id))

    if (rows.length === 0) return null
    return toDomain(rows[0])
  }

  /**
   * Create a new permission rule
   */
  async createRule(input: CreateToolPermissionRuleInput): Promise<ToolPermissionRule> {
    const now = new Date().toISOString()
    const id = randomUUID()

    const row: InsertToolPermissionRule = {
      id,
      serverId: input.serverId ?? null,
      toolName: input.toolName ?? null,
      toolPattern: input.toolPattern ?? null,
      autoApprove: input.autoApprove ? 1 : 0,
      priority: input.priority ?? 0,
      createdAt: now,
      updatedAt: now
    }

    await db.insert(toolPermissionRules).values(row)

    // Invalidate cache
    this.invalidateCache()

    logger.info('[ToolPermissionService] Rule created', {
      id,
      serverId: input.serverId,
      toolName: input.toolName,
      toolPattern: input.toolPattern,
      autoApprove: input.autoApprove
    })

    return toDomain(row as SelectToolPermissionRule)
  }

  /**
   * Update an existing permission rule
   */
  async updateRule(
    id: string,
    input: UpdateToolPermissionRuleInput
  ): Promise<ToolPermissionRule | null> {
    const existing = await this.getRule(id)
    if (!existing) return null

    const now = new Date().toISOString()

    const updates: Partial<InsertToolPermissionRule> = {
      updatedAt: now
    }

    if (input.serverId !== undefined) updates.serverId = input.serverId
    if (input.toolName !== undefined) updates.toolName = input.toolName
    if (input.toolPattern !== undefined) updates.toolPattern = input.toolPattern
    if (input.autoApprove !== undefined) updates.autoApprove = input.autoApprove ? 1 : 0
    if (input.priority !== undefined) updates.priority = input.priority

    await db.update(toolPermissionRules).set(updates).where(eq(toolPermissionRules.id, id))

    // Invalidate cache
    this.invalidateCache()

    logger.info('[ToolPermissionService] Rule updated', { id, updates })

    return this.getRule(id)
  }

  /**
   * Delete a permission rule
   */
  async deleteRule(id: string): Promise<boolean> {
    const result = await db.delete(toolPermissionRules).where(eq(toolPermissionRules.id, id))

    // Invalidate cache
    this.invalidateCache()

    const deleted = result.rowsAffected > 0
    if (deleted) {
      logger.info('[ToolPermissionService] Rule deleted', { id })
    }

    return deleted
  }

  /**
   * Delete all rules
   */
  async deleteAllRules(): Promise<number> {
    const result = await db.delete(toolPermissionRules)

    // Invalidate cache
    this.invalidateCache()

    logger.info('[ToolPermissionService] All rules deleted', {
      count: result.rowsAffected
    })

    return result.rowsAffected
  }

  /**
   * Invalidate the rules cache
   */
  invalidateCache(): void {
    this.rulesCache = null
    this.cacheTimestamp = 0
  }
}

// Export singleton instance
export const toolPermissionService = new ToolPermissionService()
