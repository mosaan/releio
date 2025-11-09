/**
 * Custom Fetch Builder
 *
 * Creates a customized fetch function with proxy and certificate support.
 * This is used by AI providers to make HTTP requests through corporate proxies
 * and with custom certificates.
 */

import nodeFetch from 'node-fetch'
import { HttpsProxyAgent } from 'https-proxy-agent'
import type { RequestInfo, RequestInit, Response } from 'node-fetch'
import * as https from 'https'
import { getProxySettings, shouldBypassProxy } from '../settings/proxy'
import { getTrustedCertificates, shouldRejectUnauthorized } from '../settings/certificate'
import logger from '../logger'

const fetchLogger = logger.child('ai:fetch')

/**
 * Create a custom fetch function with proxy and certificate support
 *
 * This function creates a fetch implementation that:
 * - Routes requests through configured proxy
 * - Uses custom CA certificates for HTTPS validation
 * - Handles proxy bypass rules
 * - Logs proxy usage (without credentials)
 *
 * @returns Custom fetch function compatible with AI SDK
 */
export async function createCustomFetch(): Promise<
  (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>
> {
  fetchLogger.debug('Creating custom fetch function')

  // Get current proxy and certificate settings
  const proxySettings = await getProxySettings()
  const certificates = await getTrustedCertificates()
  const rejectUnauthorized = await shouldRejectUnauthorized()

  fetchLogger.info('Custom fetch configured', {
    proxyMode: proxySettings.mode,
    hasCertificates: !!certificates,
    certificateCount: certificates?.length || 0,
    rejectUnauthorized
  })

  // Return custom fetch function
  return async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlString = typeof url === 'string' ? url : url.toString()

    try {
      // Parse URL to check if proxy should be used
      const parsedUrl = new URL(urlString)
      const shouldBypass = await shouldBypassProxy(parsedUrl.hostname)

      // Determine if we need a custom agent
      let agent: https.Agent | HttpsProxyAgent<string> | undefined

      if (parsedUrl.protocol === 'https:') {
        // Create HTTPS agent with custom certificates
        const agentOptions: https.AgentOptions = {
          rejectUnauthorized
        }

        // Add custom CA certificates if available
        if (certificates && certificates.length > 0) {
          agentOptions.ca = certificates
        }

        // Add proxy if configured and not bypassed
        if (
          proxySettings.mode !== 'none' &&
          !shouldBypass &&
          (proxySettings.httpsProxy || proxySettings.httpProxy)
        ) {
          const proxyUrl = proxySettings.httpsProxy || proxySettings.httpProxy

          if (proxyUrl) {
            // Build proxy URL with credentials if available
            let proxyUrlWithAuth = proxyUrl
            if (proxySettings.username) {
              try {
                const proxyUrlObj = new URL(proxyUrl)
                proxyUrlObj.username = proxySettings.username
                if (proxySettings.password) {
                  proxyUrlObj.password = proxySettings.password
                }
                proxyUrlWithAuth = proxyUrlObj.toString()
              } catch (error) {
                fetchLogger.warn('Failed to parse proxy URL, using without auth', { error })
              }
            }

            fetchLogger.debug('Using HTTPS proxy for request', {
              host: parsedUrl.hostname,
              proxy: sanitizeProxyUrl(proxyUrlWithAuth)
            })

            agent = new HttpsProxyAgent(proxyUrlWithAuth, agentOptions)
          }
        } else {
          // No proxy, but may have custom certificates
          agent = new https.Agent(agentOptions)
        }
      } else if (parsedUrl.protocol === 'http:') {
        // For HTTP, we don't need certificate handling
        if (
          proxySettings.mode !== 'none' &&
          !shouldBypass &&
          (proxySettings.httpProxy || proxySettings.httpsProxy)
        ) {
          const proxyUrl = proxySettings.httpProxy || proxySettings.httpsProxy

          if (proxyUrl) {
            // Build proxy URL with credentials if available
            let proxyUrlWithAuth = proxyUrl
            if (proxySettings.username) {
              try {
                const proxyUrlObj = new URL(proxyUrl)
                proxyUrlObj.username = proxySettings.username
                if (proxySettings.password) {
                  proxyUrlObj.password = proxySettings.password
                }
                proxyUrlWithAuth = proxyUrlObj.toString()
              } catch (error) {
                fetchLogger.warn('Failed to parse proxy URL, using without auth', { error })
              }
            }

            fetchLogger.debug('Using HTTP proxy for request', {
              host: parsedUrl.hostname,
              proxy: sanitizeProxyUrl(proxyUrlWithAuth)
            })

            agent = new HttpsProxyAgent(proxyUrlWithAuth)
          }
        }
      }

      // Add agent to request init
      const customInit: RequestInit = {
        ...init,
        agent
      }

      // Make the request
      const response = await nodeFetch(url, customInit)

      fetchLogger.debug('Request completed', {
        status: response.status,
        url: parsedUrl.hostname
      })

      return response as Response
    } catch (error) {
      fetchLogger.error('Request failed', {
        url: urlString,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }
}

/**
 * Sanitize proxy URL for logging
 * Removes credentials from the URL
 */
function sanitizeProxyUrl(proxyUrl: string): string {
  try {
    const url = new URL(proxyUrl)
    if (url.username || url.password) {
      return `${url.protocol}//${url.username ? '***:***@' : ''}${url.host}`
    }
    return proxyUrl
  } catch {
    return proxyUrl
  }
}
