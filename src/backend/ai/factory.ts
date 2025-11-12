import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAzure } from '@ai-sdk/azure'
import type { AIProvider, AIConfig } from '@common/types'
import type { LanguageModel } from 'ai'
import { createCustomFetch } from './fetch'
import logger from '../logger'

const factoryLogger = logger.child('ai:factory')

export const FACTORY = {
  openai: {
    default: 'gpt-4o',
    available: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    createModel: async (config: AIConfig, customFetch?: typeof fetch) =>
      createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        fetch: customFetch
      }).chat(config.model) // Use Chat Completion API for better compatibility with OpenAI-compatible servers
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
    createModel: async (config: AIConfig, customFetch?: typeof fetch) =>
      createAnthropic({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        fetch: customFetch
      })(config.model)
  },
  google: {
    default: 'gemini-2.5-flash',
    available: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    createModel: async (config: AIConfig, customFetch?: typeof fetch) =>
      createGoogleGenerativeAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        fetch: customFetch
      })(config.model)
  },
  azure: {
    default: 'gpt-4o',
    available: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-35-turbo'],
    createModel: async (config: AIConfig, customFetch?: typeof fetch) => {
      const azureConfig: any = {
        apiKey: config.apiKey,
        fetch: customFetch
      }

      // Add Azure-specific configuration
      if (config.resourceName) {
        azureConfig.resourceName = config.resourceName
      }
      if (config.baseURL) {
        azureConfig.baseURL = config.baseURL
      }
      if (config.useDeploymentBasedUrls !== undefined) {
        azureConfig.useDeploymentBasedUrls = config.useDeploymentBasedUrls
      }

      return createAzure(azureConfig).chat(config.model) // Use Chat Completion API
    }
  }
}

export async function listAvailableModel(provider: AIProvider): Promise<string[]> {
  return FACTORY[provider]?.available || []
}

export async function createModel(config: AIConfig): Promise<LanguageModel> {
  const factory = FACTORY[config.provider]

  try {
    // Create custom fetch with proxy and certificate support
    const customFetch = await createCustomFetch()
    factoryLogger.debug('Creating AI model with custom fetch', {
      provider: config.provider,
      model: config.model,
      baseURL: config.baseURL
    })

    // Type assertion needed due to mismatch between node-fetch and global fetch types
    return await factory.createModel(config, customFetch as unknown as typeof fetch)
  } catch (error) {
    factoryLogger.error('Failed to create custom fetch, using default', { error })
    // Fallback to default fetch if custom fetch creation fails
    return await factory.createModel(config)
  }
}
