import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock platform to simulate Windows
Object.defineProperty(process, 'platform', {
  value: 'win32',
  writable: true,
  configurable: true
})

// Mock logger before any imports that use it
vi.mock('../../src/backend/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    }))
  }
}))

// Mock @cypress/get-windows-proxy module
vi.mock('@cypress/get-windows-proxy', () => ({
  getWindowsProxy: vi.fn(async () => ({
    httpProxy: 'http://proxy.example.com:8080',
    httpsProxy: 'https://proxy.example.com:8443',
    noProxy: 'localhost;*.local'
  }))
}))

import { setupDatabaseTest } from './database-helper'
import {
  getProxySettings,
  setProxySettings,
  getProxyUrl,
  shouldBypassProxy
} from '../../src/backend/settings/proxy'
import type { ProxySettings } from '../../src/common/types'

describe('Proxy Settings Management', () => {
  const getTestDatabase = setupDatabaseTest()

  beforeEach(() => {
    getTestDatabase()
  })

  describe('getProxySettings', () => {
    it('should return system proxy settings when no custom settings exist', async () => {
      const settings = await getProxySettings()

      expect(settings.mode).toBe('system')
      expect(settings.httpProxy).toBe('http://proxy.example.com:8080')
      expect(settings.httpsProxy).toBe('https://proxy.example.com:8443')
    })

    it('should return custom proxy settings when configured', async () => {
      const customSettings: ProxySettings = {
        mode: 'custom',
        httpProxy: 'http://custom-proxy.com:3128',
        httpsProxy: 'https://custom-proxy.com:3129',
        noProxy: ['example.com']
      }

      await setProxySettings(customSettings)
      const settings = await getProxySettings()

      expect(settings).toEqual(customSettings)
    })

    it('should return none mode when configured', async () => {
      await setProxySettings({ mode: 'none' })
      const settings = await getProxySettings()

      expect(settings.mode).toBe('none')
      expect(settings.httpProxy).toBeUndefined()
      expect(settings.httpsProxy).toBeUndefined()
    })
  })

  describe('setProxySettings', () => {
    it('should save custom proxy settings to database', async () => {
      const customSettings: ProxySettings = {
        mode: 'custom',
        httpProxy: 'http://proxy.local:8080',
        httpsProxy: 'https://proxy.local:8443',
        username: 'testuser',
        password: 'testpass',
        noProxy: ['localhost', '127.0.0.1']
      }

      await setProxySettings(customSettings)
      const retrieved = await getProxySettings()

      expect(retrieved).toEqual(customSettings)
    })

    it('should throw error when custom mode has no proxy URLs', async () => {
      await expect(
        setProxySettings({
          mode: 'custom'
        })
      ).rejects.toThrow('Custom proxy mode requires at least one proxy URL')
    })

    it('should allow custom mode with only HTTP proxy', async () => {
      const settings: ProxySettings = {
        mode: 'custom',
        httpProxy: 'http://proxy.com:8080'
      }

      await setProxySettings(settings)
      const retrieved = await getProxySettings()

      expect(retrieved.httpProxy).toBe('http://proxy.com:8080')
      expect(retrieved.httpsProxy).toBeUndefined()
    })

    it('should allow custom mode with only HTTPS proxy', async () => {
      const settings: ProxySettings = {
        mode: 'custom',
        httpsProxy: 'https://proxy.com:8443'
      }

      await setProxySettings(settings)
      const retrieved = await getProxySettings()

      expect(retrieved.httpsProxy).toBe('https://proxy.com:8443')
      expect(retrieved.httpProxy).toBeUndefined()
    })
  })

  describe('getProxyUrl', () => {
    it('should return undefined when mode is none', async () => {
      await setProxySettings({ mode: 'none' })

      const httpUrl = await getProxyUrl('http')
      const httpsUrl = await getProxyUrl('https')

      expect(httpUrl).toBeUndefined()
      expect(httpsUrl).toBeUndefined()
    })

    it('should return HTTP proxy URL for HTTP protocol', async () => {
      await setProxySettings({
        mode: 'custom',
        httpProxy: 'http://proxy.com:8080',
        httpsProxy: 'https://proxy.com:8443'
      })

      const url = await getProxyUrl('http')
      expect(url).toBe('http://proxy.com:8080')
    })

    it('should return HTTPS proxy URL for HTTPS protocol', async () => {
      await setProxySettings({
        mode: 'custom',
        httpProxy: 'http://proxy.com:8080',
        httpsProxy: 'https://proxy.com:8443'
      })

      const url = await getProxyUrl('https')
      expect(url).toBe('https://proxy.com:8443')
    })

    it('should include credentials in proxy URL when provided', async () => {
      await setProxySettings({
        mode: 'custom',
        httpProxy: 'http://proxy.com:8080',
        username: 'user',
        password: 'pass'
      })

      const url = await getProxyUrl('http')
      expect(url).toBe('http://user:pass@proxy.com:8080/')
    })

    it('should include only username when no password provided', async () => {
      await setProxySettings({
        mode: 'custom',
        httpProxy: 'http://proxy.com:8080',
        username: 'user'
      })

      const url = await getProxyUrl('http')
      expect(url).toBe('http://user@proxy.com:8080/')
    })

    it('should handle invalid proxy URLs gracefully', async () => {
      await setProxySettings({
        mode: 'custom',
        httpProxy: 'invalid-url',
        username: 'user'
      })

      const url = await getProxyUrl('http')
      expect(url).toBe('invalid-url')
    })
  })

  describe('shouldBypassProxy', () => {
    beforeEach(async () => {
      await setProxySettings({
        mode: 'custom',
        httpProxy: 'http://proxy.com:8080',
        noProxy: ['localhost', '*.example.com', '*.local', '<local>']
      })
    })

    it('should return false when no bypass rules are configured', async () => {
      await setProxySettings({
        mode: 'custom',
        httpProxy: 'http://proxy.com:8080'
      })

      expect(await shouldBypassProxy('example.com')).toBe(false)
    })

    it('should bypass exact match hostnames', async () => {
      expect(await shouldBypassProxy('localhost')).toBe(true)
    })

    it('should bypass wildcard domain patterns', async () => {
      expect(await shouldBypassProxy('api.example.com')).toBe(true)
      expect(await shouldBypassProxy('www.example.com')).toBe(true)
      expect(await shouldBypassProxy('example.com')).toBe(true)
    })

    it('should bypass .local domains', async () => {
      expect(await shouldBypassProxy('dev.local')).toBe(true)
      expect(await shouldBypassProxy('test.local')).toBe(true)
    })

    it('should bypass <local> pattern for non-dotted hostnames', async () => {
      expect(await shouldBypassProxy('myserver')).toBe(true)
      expect(await shouldBypassProxy('api.myserver.com')).toBe(false)
    })

    it('should not bypass non-matching hostnames', async () => {
      expect(await shouldBypassProxy('google.com')).toBe(false)
      expect(await shouldBypassProxy('api.other.com')).toBe(false)
    })

    it('should be case-insensitive', async () => {
      expect(await shouldBypassProxy('LOCALHOST')).toBe(true)
      expect(await shouldBypassProxy('API.EXAMPLE.COM')).toBe(true)
    })
  })

  describe('Proxy Settings Persistence', () => {
    it('should persist settings across multiple get/set operations', async () => {
      const settings1: ProxySettings = {
        mode: 'custom',
        httpProxy: 'http://proxy1.com:8080'
      }

      await setProxySettings(settings1)
      expect((await getProxySettings()).httpProxy).toBe('http://proxy1.com:8080')

      const settings2: ProxySettings = {
        mode: 'custom',
        httpsProxy: 'https://proxy2.com:8443'
      }

      await setProxySettings(settings2)
      const retrieved = await getProxySettings()

      expect(retrieved.httpsProxy).toBe('https://proxy2.com:8443')
      expect(retrieved.httpProxy).toBeUndefined()
    })
  })
})
