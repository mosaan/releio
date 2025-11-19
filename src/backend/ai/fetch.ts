/**
 * Custom Fetch Builder
 *
 * Creates a customized fetch function with proxy and certificate support.
 * This is used by AI providers to make HTTP requests through corporate proxies
 * and with custom certificates.
 *
 * Note: Uses Node.js built-in fetch with undici ProxyAgent
 */

import { ProxyAgent } from 'undici'
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

      // Determine if we need a custom dispatcher (proxy agent)
      let dispatcher: ProxyAgent | undefined

      // Check if proxy is needed
      if (
        proxySettings.mode !== 'none' &&
        !shouldBypass &&
        (proxySettings.httpsProxy || proxySettings.httpProxy)
      ) {
        const proxyUrl =
          parsedUrl.protocol === 'https:'
            ? proxySettings.httpsProxy || proxySettings.httpProxy
            : proxySettings.httpProxy || proxySettings.httpsProxy

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

          fetchLogger.debug('Using proxy for request', {
            protocol: parsedUrl.protocol,
            host: parsedUrl.hostname,
            proxy: sanitizeProxyUrl(proxyUrlWithAuth)
          })

          // Create ProxyAgent with proxy URL and certificate settings
          dispatcher = new ProxyAgent({
            uri: proxyUrlWithAuth,
            connect: {
              ca: certificates,
              rejectUnauthorized
            }
          })
        }
      }

      // Add dispatcher to request init if needed
      const customInit: RequestInit = {
        ...init,
        // @ts-expect-error - dispatcher is undici-specific
        dispatcher
      }

      // Make the request using built-in fetch
      const response = await fetch(url, customInit)

      fetchLogger.debug('Request completed', {
        status: response.status,
        url: parsedUrl.hostname
      })

      return response
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
 * Create a custom fetch function with explicit proxy and certificate settings
 *
 * This is similar to createCustomFetch() but allows you to pass explicit settings
 * instead of loading them from the database. Useful for connection testing.
 *
 * @param proxySettings - Proxy settings to use
 * @param certSettings - Certificate settings to use
 * @returns Custom fetch function
 */
export async function createFetchWithProxyAndCertificates(
  proxySettings: import('@common/types').ProxySettings,
  certSettings: import('@common/types').CertificateSettings
): Promise<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>> {
  fetchLogger.debug('Creating custom fetch with explicit settings')

  // Determine certificates based on mode
  let certificates: string[] | undefined
  let rejectUnauthorized = true

  if (certSettings.mode === 'custom' && certSettings.customCertificates) {
    // For custom mode, certificates are CustomCertificate[] with file paths
    // For testing with explicit settings, assume PEM strings are passed
    const certs = certSettings.customCertificates
    if (certs.length > 0 && typeof certs[0] === 'string') {
      certificates = certs as string[]
    } else {
      // CustomCertificate[] - not supported in test context
      certificates = undefined
    }
  } else if (certSettings.mode === 'system' && certSettings.customCertificates) {
    // System certificates are already PEM strings
    certificates = certSettings.customCertificates as string[]
  } else {
    // mode === 'none', use Node.js defaults
    certificates = undefined
  }

  if (certSettings.rejectUnauthorized !== undefined) {
    rejectUnauthorized = certSettings.rejectUnauthorized
  }

  fetchLogger.info('Custom fetch configured with explicit settings', {
    proxyMode: proxySettings.mode,
    certMode: certSettings.mode,
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

      // Check bypass list
      let shouldBypass = false
      if (proxySettings.noProxy && proxySettings.noProxy.length > 0) {
        const normalizedHost = parsedUrl.hostname.toLowerCase()
        shouldBypass = proxySettings.noProxy.some((pattern) => {
          const normalizedPattern = pattern.toLowerCase().trim()
          if (normalizedPattern.startsWith('*.')) {
            const domain = normalizedPattern.slice(2)
            return normalizedHost.endsWith(domain) || normalizedHost === domain
          }
          if (normalizedPattern === '<local>') {
            return !normalizedHost.includes('.')
          }
          return normalizedHost === normalizedPattern
        })
      }

      // Determine if we need a custom dispatcher (proxy agent)
      let dispatcher: ProxyAgent | undefined

      // Check if proxy is needed
      if (
        proxySettings.mode !== 'none' &&
        !shouldBypass &&
        (proxySettings.httpsProxy || proxySettings.httpProxy)
      ) {
        const proxyUrl =
          parsedUrl.protocol === 'https:'
            ? proxySettings.httpsProxy || proxySettings.httpProxy
            : proxySettings.httpProxy || proxySettings.httpsProxy

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

          fetchLogger.debug('Using proxy for request', {
            protocol: parsedUrl.protocol,
            host: parsedUrl.hostname,
            proxy: sanitizeProxyUrl(proxyUrlWithAuth)
          })

          // Create ProxyAgent with proxy URL and certificate settings
          dispatcher = new ProxyAgent({
            uri: proxyUrlWithAuth,
            connect: {
              ca: certificates,
              rejectUnauthorized
            }
          })
        }
      }

      // Add dispatcher to request init if needed
      const customInit: RequestInit = {
        ...init,
        // @ts-expect-error - dispatcher is undici-specific
        dispatcher
      }

      // Make the request using built-in fetch
      const response = await fetch(url, customInit)

      fetchLogger.debug('Request completed', {
        status: response.status,
        url: parsedUrl.hostname
      })

      return response
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
