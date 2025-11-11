import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { AIProvider } from '@common/types'
import type { LanguageModel } from 'ai'
import { createCustomFetch } from './fetch'
import logger from '../logger'

const factoryLogger = logger.child('ai:factory')

export const FACTORY = {
  openai: {
    default: 'gpt-4o',
    available: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    createModel: async (apiKey: string, model: string, customFetch?: typeof fetch) =>
      createOpenAI({ apiKey, fetch: customFetch })(model)
  },
  anthropic: {
    default: 'claude-3-5-sonnet-20241022',
    available: [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ],
    createModel: async (apiKey: string, model: string, customFetch?: typeof fetch) =>
      createAnthropic({ apiKey, fetch: customFetch })(model)
  },
  google: {
    default: 'gemini-2.5-flash',
    available: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    createModel: async (apiKey: string, model: string, customFetch?: typeof fetch) =>
      createGoogleGenerativeAI({ apiKey, fetch: customFetch })(model)
  }
}

export async function listAvailableModel(provider: AIProvider): Promise<string[]> {
  return FACTORY[provider]?.available || []
}

export async function createModel(
  provider: AIProvider,
  apiKey: string,
  model: string
): Promise<LanguageModel> {
  const config = FACTORY[provider]

  try {
    // Create custom fetch with proxy and certificate support
    const customFetch = await createCustomFetch()
    factoryLogger.debug('Creating AI model with custom fetch', { provider, model })

    // Type assertion needed due to mismatch between node-fetch and global fetch types
    return await config.createModel(apiKey, model, customFetch as unknown as typeof fetch)
  } catch (error) {
    factoryLogger.error('Failed to create custom fetch, using default', { error })
    // Fallback to default fetch if custom fetch creation fails
    return await config.createModel(apiKey, model)
  }
}
