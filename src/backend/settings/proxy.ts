/**
 * Proxy Settings Management Layer
 *
 * Manages proxy configuration lifecycle including:
 * - Loading settings from database
 * - Retrieving system proxy settings (Windows)
 * - Merging system and custom settings
 * - Encrypting/decrypting credentials
 */

import type { ProxySettings } from '@common/types'
import { getSetting, setSetting } from './index'
import { getWindowsProxySettings } from '../platform/windows/proxy'
import logger from '../logger'

const proxyLogger = logger.child('settings:proxy')

const PROXY_SETTINGS_KEY = 'proxy'

/**
 * Get the current proxy configuration
 *
 * Returns the appropriate proxy settings based on the configured mode:
 * - 'system': Retrieves Windows system proxy settings
 * - 'custom': Returns custom settings from database
 * - 'none': Returns no proxy configuration
 *
 * @returns Current proxy settings
 */
export async function getProxySettings(): Promise<ProxySettings> {
  proxyLogger.debug('Getting proxy settings')

  try {
    // Get stored settings from database
    const storedSettings = await getSetting<ProxySettings>(PROXY_SETTINGS_KEY)

    if (!storedSettings) {
      proxyLogger.info('No stored proxy settings, initializing with system mode')
      // On first launch, automatically set system mode
      const systemSettings = await getSystemProxySettings()
      await setProxySettings(systemSettings)
      return systemSettings
    }

    const mode = storedSettings.mode

    switch (mode) {
      case 'system':
        return await getSystemProxySettings()

      case 'custom':
        proxyLogger.debug('Using custom proxy settings')
        return storedSettings

      case 'none':
        proxyLogger.debug('Proxy disabled')
        return { mode: 'none' }

      default:
        proxyLogger.warn('Unknown proxy mode, falling back to system', { mode })
        return await getSystemProxySettings()
    }
  } catch (error) {
    proxyLogger.error('Failed to get proxy settings, using none mode', { error })
    return { mode: 'none' }
  }
}

/**
 * Get system proxy settings
 *
 * Retrieves proxy settings from the operating system.
 * Currently supports Windows only.
 *
 * @returns System proxy settings
 */
export async function getSystemProxySettings(): Promise<ProxySettings> {
  proxyLogger.debug('Getting system proxy settings')

  try {
    if (process.platform === 'win32') {
      return await getWindowsProxySettings()
    } else {
      proxyLogger.warn('System proxy not supported on this platform', {
        platform: process.platform
      })
      return { mode: 'none' }
    }
  } catch (error) {
    proxyLogger.error('Failed to get system proxy settings', { error })
    return { mode: 'none' }
  }
}

/**
 * Set proxy settings
 *
 * Stores proxy configuration in database.
 * Credentials should be encrypted before calling this function.
 *
 * @param settings - Proxy settings to store
 */
export async function setProxySettings(settings: ProxySettings): Promise<void> {
  proxyLogger.info('Setting proxy settings', {
    mode: settings.mode,
    hasHttpProxy: !!settings.httpProxy,
    hasHttpsProxy: !!settings.httpsProxy,
    hasCredentials: !!(settings.username || settings.password)
  })

  // Validate settings
  if (settings.mode === 'custom') {
    if (!settings.httpProxy && !settings.httpsProxy) {
      throw new Error('Custom proxy mode requires at least one proxy URL')
    }
  }

  await setSetting(PROXY_SETTINGS_KEY, settings)
  proxyLogger.info('Proxy settings saved successfully')
}

/**
 * Get effective proxy URL for a given protocol
 *
 * Returns the appropriate proxy URL based on settings and protocol.
 *
 * @param protocol - 'http' or 'https'
 * @returns Proxy URL or undefined if no proxy
 */
export async function getProxyUrl(protocol: 'http' | 'https'): Promise<string | undefined> {
  const settings = await getProxySettings()

  if (settings.mode === 'none') {
    return undefined
  }

  const proxyUrl = protocol === 'https' ? settings.httpsProxy : settings.httpProxy

  // Add credentials if present
  if (proxyUrl && settings.username) {
    try {
      const url = new URL(proxyUrl)
      url.username = settings.username
      if (settings.password) {
        url.password = settings.password
      }
      return url.toString()
    } catch {
      // Invalid URL, return as-is
      return proxyUrl
    }
  }

  return proxyUrl
}

/**
 * Check if a host should bypass proxy
 *
 * @param host - Hostname to check
 * @returns true if host should bypass proxy
 */
export async function shouldBypassProxy(host: string): Promise<boolean> {
  const settings = await getProxySettings()

  if (!settings.noProxy || settings.noProxy.length === 0) {
    return false
  }

  const normalizedHost = host.toLowerCase()

  return settings.noProxy.some((pattern) => {
    const normalizedPattern = pattern.toLowerCase().trim()

    // Handle wildcard patterns
    if (normalizedPattern.startsWith('*.')) {
      const domain = normalizedPattern.slice(2)
      return normalizedHost.endsWith(domain) || normalizedHost === domain
    }

    // Handle localhost and special cases
    if (normalizedPattern === '<local>') {
      return !normalizedHost.includes('.')
    }

    // Exact match
    return normalizedHost === normalizedPattern
  })
}
