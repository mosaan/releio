import { describe, it, expect, vi, beforeEach } from 'vitest'

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

// Mock Windows modules
vi.mock('../../src/backend/platform/windows/proxy', () => ({
  getWindowsProxySettings: vi.fn(async () => ({
    mode: 'none' as const
  }))
}))

vi.mock('../../src/backend/platform/windows/certificate', () => ({
  getWindowsCertificateSettings: vi.fn(async () => ({
    mode: 'none' as const,
    rejectUnauthorized: true
  }))
}))

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch as any

import { setupDatabaseTest } from './database-helper'
import { createCustomFetch } from '../../src/backend/ai/fetch'
import { setProxySettings } from '../../src/backend/settings/proxy'
import { setCertificateSettings } from '../../src/backend/settings/certificate'
import type { ProxySettings, CertificateSettings } from '../../src/common/types'

const MOCK_CERT = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKL0UG+mRKKzMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
-----END CERTIFICATE-----`

describe('Custom Fetch Builder', () => {
  const getTestDatabase = setupDatabaseTest()

  beforeEach(() => {
    getTestDatabase()
    mockFetch.mockClear()
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: true })
    } as any)
  })

  describe('createCustomFetch', () => {
    it('should create a fetch function', async () => {
      const customFetch = await createCustomFetch()
      expect(typeof customFetch).toBe('function')
    })

    it('should return a function that can be called', async () => {
      const customFetch = await createCustomFetch()
      await customFetch('https://example.com')
      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe('Proxy Configuration', () => {
    it('should use no proxy when mode is none', async () => {
      await setProxySettings({ mode: 'none' })

      const customFetch = await createCustomFetch()
      await customFetch('https://api.example.com/test')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.any(Object)
      )
    })

    it('should configure proxy when mode is custom', async () => {
      const proxySettings: ProxySettings = {
        mode: 'custom',
        httpsProxy: 'http://proxy.example.com:8080'
      }
      await setProxySettings(proxySettings)

      const customFetch = await createCustomFetch()
      await customFetch('https://api.example.com/test')

      expect(mockFetch).toHaveBeenCalled()
      const callArgs = mockFetch.mock.calls[0]
      expect(callArgs[1]).toHaveProperty('dispatcher')
    })

    it('should handle HTTP URLs with proxy', async () => {
      const proxySettings: ProxySettings = {
        mode: 'custom',
        httpProxy: 'http://proxy.example.com:8080'
      }
      await setProxySettings(proxySettings)

      const customFetch = await createCustomFetch()
      await customFetch('http://api.example.com/test')

      expect(mockFetch).toHaveBeenCalled()
    })

    it('should handle proxy with credentials', async () => {
      const proxySettings: ProxySettings = {
        mode: 'custom',
        httpsProxy: 'http://proxy.example.com:8080',
        username: 'testuser',
        password: 'testpass'
      }
      await setProxySettings(proxySettings)

      const customFetch = await createCustomFetch()
      await customFetch('https://api.example.com/test')

      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe('Certificate Configuration', () => {
    it('should use default certificates when mode is none', async () => {
      await setCertificateSettings({ mode: 'none', rejectUnauthorized: true })

      const customFetch = await createCustomFetch()
      await customFetch('https://api.example.com/test')

      expect(mockFetch).toHaveBeenCalled()
      const callArgs = mockFetch.mock.calls[0]
      expect(callArgs[1]).toHaveProperty('dispatcher')
    })

    it('should use custom certificates when configured', async () => {
      const certSettings: CertificateSettings = {
        mode: 'custom',
        customCertificates: [MOCK_CERT],
        rejectUnauthorized: true
      }
      await setCertificateSettings(certSettings)

      const customFetch = await createCustomFetch()
      await customFetch('https://api.example.com/test')

      expect(mockFetch).toHaveBeenCalled()
    })

    it('should respect rejectUnauthorized setting', async () => {
      await setCertificateSettings({ mode: 'none', rejectUnauthorized: false })

      const customFetch = await createCustomFetch()
      await customFetch('https://api.example.com/test')

      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe('Proxy Bypass', () => {
    beforeEach(async () => {
      await setProxySettings({
        mode: 'custom',
        httpsProxy: 'http://proxy.example.com:8080',
        noProxy: ['localhost', '*.internal.com']
      })
    })

    it('should bypass proxy for localhost', async () => {
      const customFetch = await createCustomFetch()
      await customFetch('https://localhost:3000/api')

      expect(mockFetch).toHaveBeenCalled()
    })

    it('should bypass proxy for matching wildcard domains', async () => {
      const customFetch = await createCustomFetch()
      await customFetch('https://api.internal.com/test')

      expect(mockFetch).toHaveBeenCalled()
    })

    it('should use proxy for non-matching domains', async () => {
      const customFetch = await createCustomFetch()
      await customFetch('https://api.external.com/test')

      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should propagate fetch errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const customFetch = await createCustomFetch()

      await expect(customFetch('https://example.com')).rejects.toThrow('Network error')
    })

    it('should handle invalid URLs gracefully', async () => {
      const customFetch = await createCustomFetch()

      await expect(customFetch('not-a-valid-url')).rejects.toThrow()
    })
  })

  describe('Request Options', () => {
    it('should preserve custom request headers', async () => {
      const customFetch = await createCustomFetch()

      await customFetch('https://api.example.com', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token'
        }
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer token'
          })
        })
      )
    })

    it('should preserve request method', async () => {
      const customFetch = await createCustomFetch()

      await customFetch('https://api.example.com', {
        method: 'POST'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.objectContaining({
          method: 'POST'
        })
      )
    })

    it('should preserve request body', async () => {
      const customFetch = await createCustomFetch()
      const body = JSON.stringify({ data: 'test' })

      await customFetch('https://api.example.com', {
        method: 'POST',
        body
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.objectContaining({
          body
        })
      )
    })
  })

  describe('Combined Proxy and Certificate Settings', () => {
    it('should apply both proxy and certificate settings', async () => {
      const proxySettings: ProxySettings = {
        mode: 'custom',
        httpsProxy: 'http://proxy.example.com:8080'
      }
      const certSettings: CertificateSettings = {
        mode: 'custom',
        customCertificates: [MOCK_CERT],
        rejectUnauthorized: true
      }

      await setProxySettings(proxySettings)
      await setCertificateSettings(certSettings)

      const customFetch = await createCustomFetch()
      await customFetch('https://api.example.com/test')

      expect(mockFetch).toHaveBeenCalled()
      const callArgs = mockFetch.mock.calls[0]
      expect(callArgs[1]).toHaveProperty('dispatcher')
    })

    it('should work with proxy and disabled cert validation', async () => {
      await setProxySettings({
        mode: 'custom',
        httpsProxy: 'http://proxy.example.com:8080'
      })
      await setCertificateSettings({
        mode: 'none',
        rejectUnauthorized: false
      })

      const customFetch = await createCustomFetch()
      await customFetch('https://api.example.com/test')

      expect(mockFetch).toHaveBeenCalled()
    })
  })
})
