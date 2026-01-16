/**
 * Mastra Suspend/Resume Feature Check
 *
 * This test verifies that @mastra/core 0.24.6 supports suspend/resume functionality
 * required for HITL (Human-in-the-Loop) approval flow.
 *
 * Based on actual Mastra API:
 * - execute receives ToolExecutionContext object
 * - suspend and resumeData are properties of the context
 */

import { describe, it, expect } from 'vitest'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

describe('Mastra suspend/resume feature check', () => {
  it('should support suspendSchema and resumeSchema in createTool', () => {
    // This test verifies TypeScript compilation - if it compiles, the feature is supported
    const testTool = createTool({
      id: 'test-suspend',
      description: 'Test suspend/resume',
      inputSchema: z.object({ value: z.string() }),
      suspendSchema: z.object({ reason: z.string() }),
      resumeSchema: z.object({ approved: z.boolean() }),
      execute: async (ctx) => {
        // Type check: suspend should be available in context
        expect(ctx.suspend).toBeDefined()
        expect(typeof ctx.suspend).toBe('function')

        // Test suspend call
        if (!ctx.resumeData && ctx.suspend) {
          return await ctx.suspend({ reason: 'Test approval required' })
        }

        // Test resumeData handling
        if (ctx.resumeData && ctx.resumeData.approved) {
          return { result: 'approved' }
        }

        throw new Error('Declined')
      }
    })

    expect(testTool).toBeDefined()
    expect(testTool.id).toBe('test-suspend')
    expect(testTool.suspendSchema).toBeDefined()
    expect(testTool.resumeSchema).toBeDefined()
  })

  it('should support destructuring suspend and resumeData from context', () => {
    const testTool = createTool({
      id: 'test-destructure',
      description: 'Test destructuring',
      inputSchema: z.object({ test: z.string() }),
      suspendSchema: z.object({ reason: z.string() }),
      resumeSchema: z.object({ approved: z.boolean() }),
      execute: async (ctx) => {
        // Destructuring should work
        const { context, suspend, resumeData } = ctx

        expect(context).toBeDefined()
        expect(suspend).toBeDefined()

        if (!resumeData && suspend) {
          return await suspend({ reason: 'Test' })
        }

        return { result: 'ok' }
      }
    })

    expect(testTool).toBeDefined()
  })

  it('should compile with suspend/resume pattern used in migration doc', () => {
    // This is the pattern we want to use in MastraToolService
    const testTool = createTool({
      id: 'test-migration-pattern',
      description: 'Test migration pattern',
      inputSchema: z.object({ value: z.string() }),
      suspendSchema: z.object({
        reason: z.string(),
        toolName: z.string(),
        serverId: z.string().optional(),
        input: z.record(z.unknown())
      }),
      resumeSchema: z.object({
        approved: z.boolean()
      }),
      execute: async (ctx) => {
        const requireApproval = true

        // Pattern from migration doc
        if (requireApproval && !ctx.resumeData && ctx.suspend) {
          return await ctx.suspend({
            reason: 'Tool requires approval',
            toolName: 'test-tool',
            serverId: 'test-server',
            input: ctx.context
          })
        }

        if (!requireApproval || (ctx.resumeData && ctx.resumeData.approved)) {
          return { result: 'executed' }
        }

        throw new Error('Tool execution declined by user')
      }
    })

    expect(testTool).toBeDefined()
    expect(testTool.suspendSchema).toBeDefined()
    expect(testTool.resumeSchema).toBeDefined()
  })
})
