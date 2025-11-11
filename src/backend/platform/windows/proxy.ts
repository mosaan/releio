/**
 * Windows Platform Proxy Retrieval Module
 *
 * Retrieves proxy configuration from Windows system settings.
 * Uses @cypress/get-windows-proxy to read Windows registry settings.
 */

import type { ProxySettings } from '@common/types'
import logger from '../../logger'

const proxyLogger = logger.child('platform:windows:proxy')

interface WindowsProxyConfig {
  httpProxy?: string
  httpsProxy?: string
  noProxy?: string
  proxyServer?: string
  proxyBypass?: string
}

/**
 * Get Windows system proxy configuration
 *
 * Reads proxy settings from Windows registry and converts them
 * to our ProxySettings format.
 *
 * @returns ProxySettings with system mode and discovered settings
 */
export async function getWindowsProxySettings(): Promise<ProxySettings> {
  proxyLogger.info('Retrieving Windows system proxy settings')

  try {
    // Only import on Windows platform
    if (process.platform !== 'win32') {
      proxyLogger.warn('Not on Windows platform, returning none mode')
      return { mode: 'none' }
    }

    // Dynamic import to avoid loading on non-Windows platforms
    // @cypress/get-windows-proxy uses module.exports (default export)
    const getWindowsProxy = (await import('@cypress/get-windows-proxy')).default

    const windowsProxy: WindowsProxyConfig = await getWindowsProxy()
    if (!windowsProxy) {
      proxyLogger.info('No Windows proxy configuration found, returning none mode')
      return { mode: 'none' }
    }
    proxyLogger.debug('Windows proxy retrieved', { proxy: sanitizeProxyForLog(windowsProxy) })

    // Parse the proxy settings
    const settings: ProxySettings = {
      mode: 'system'
    }

    // Handle proxyServer format (can be "http=proxy:port;https=proxy:port" or just "proxy:port")
    if (windowsProxy.proxyServer) {
      const proxyServer = windowsProxy.proxyServer
      if (proxyServer.includes('=')) {
        // Format: "http=proxy:port;https=proxy:port"
        const proxies = proxyServer.split(';')
        for (const proxy of proxies) {
          const [protocol, server] = proxy.split('=')
          if (protocol === 'http') {
            settings.httpProxy = server
          } else if (protocol === 'https') {
            settings.httpsProxy = server
          }
        }
      } else {
        // Format: "proxy:port" - use for both http and https
        settings.httpProxy = proxyServer
        settings.httpsProxy = proxyServer
      }
    }

    // Use direct proxy settings if available
    if (windowsProxy.httpProxy) {
      settings.httpProxy = windowsProxy.httpProxy
    }
    if (windowsProxy.httpsProxy) {
      settings.httpsProxy = windowsProxy.httpsProxy
    }

    // Parse bypass list (no proxy)
    if (windowsProxy.proxyBypass || windowsProxy.noProxy) {
      const bypass = windowsProxy.proxyBypass || windowsProxy.noProxy || ''
      settings.noProxy = bypass.split(';').map((s) => s.trim()).filter(Boolean)
    }

    // If no proxy configured, return none mode
    if (!settings.httpProxy && !settings.httpsProxy) {
      proxyLogger.info('No Windows proxy configured')
      return { mode: 'none' }
    }

    proxyLogger.info('Windows proxy settings retrieved successfully', {
      hasHttpProxy: !!settings.httpProxy,
      hasHttpsProxy: !!settings.httpsProxy,
      noProxyCount: settings.noProxy?.length || 0
    })

    return settings
  } catch (error) {
    proxyLogger.error('Failed to retrieve Windows proxy settings', { error })
    // Return none mode on error
    return { mode: 'none' }
  }
}

/**
 * Sanitize proxy configuration for logging
 * Removes sensitive information like credentials
 */
function sanitizeProxyForLog(proxy: WindowsProxyConfig): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}

  if (proxy.httpProxy) {
    sanitized.httpProxy = sanitizeProxyUrl(proxy.httpProxy)
  }
  if (proxy.httpsProxy) {
    sanitized.httpsProxy = sanitizeProxyUrl(proxy.httpsProxy)
  }
  if (proxy.proxyServer) {
    sanitized.proxyServer = sanitizeProxyUrl(proxy.proxyServer)
  }
  if (proxy.proxyBypass) {
    sanitized.proxyBypass = proxy.proxyBypass
  }
  if (proxy.noProxy) {
    sanitized.noProxy = proxy.noProxy
  }

  return sanitized
}

/**
 * Remove credentials from proxy URL for logging
 */
function sanitizeProxyUrl(url: string): string {
  try {
    // Check if URL contains credentials
    if (url.includes('@')) {
      const parts = url.split('@')
      if (parts.length === 2) {
        return `***:***@${parts[1]}`
      }
    }
    return url
  } catch {
    return url
  }
}
