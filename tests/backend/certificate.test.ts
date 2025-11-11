import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock certificate data
const MOCK_CERT_1 = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKL0UG+mRKKzMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
-----END CERTIFICATE-----`

const MOCK_CERT_2 = `-----BEGIN CERTIFICATE-----
MIIDYTCCAkmgAwIBAgIJAKL0UG+mRKK0MA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
-----END CERTIFICATE-----`

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

// Mock Windows certificate module
vi.mock('../../src/backend/platform/windows/certificate', () => ({
  getWindowsCertificateSettings: vi.fn(async () => ({
    mode: 'system' as const,
    customCertificates: [MOCK_CERT_1, MOCK_CERT_2],
    rejectUnauthorized: true
  }))
}))

// Mock win-ca module (for potential direct imports)
vi.mock('win-ca', () => {
  const mockWinCa = vi.fn(
    (options: { format?: any; ondata?: (cert: string) => void; onend?: () => void }) => {
      if (options.ondata) {
        // Call ondata for each certificate
        options.ondata(MOCK_CERT_1)
        options.ondata(MOCK_CERT_2)
      }
      if (options.onend) {
        // Signal end
        options.onend()
      }
    }
  )

  // Add der2 property for format constants
  ;(mockWinCa as any).der2 = {
    pem: 1,
    der: 0,
    txt: 2
  }

  return {
    default: mockWinCa
  }
})

import { setupDatabaseTest } from './database-helper'
import {
  getCertificateSettings,
  setCertificateSettings,
  getTrustedCertificates,
  shouldRejectUnauthorized,
  addCustomCertificate,
  removeCustomCertificate
} from '../../src/backend/settings/certificate'
import type { CertificateSettings } from '../../src/common/types'

describe('Certificate Settings Management', () => {
  const getTestDatabase = setupDatabaseTest()

  beforeEach(() => {
    getTestDatabase()
  })

  describe('getCertificateSettings', () => {
    it('should return system certificate settings when no custom settings exist', async () => {
      const settings = await getCertificateSettings()

      expect(settings.mode).toBe('system')
      expect(settings.customCertificates).toHaveLength(2)
      expect(settings.rejectUnauthorized).toBe(true)
    })

    it('should return custom certificate settings when configured', async () => {
      const customSettings: CertificateSettings = {
        mode: 'custom',
        customCertificates: [MOCK_CERT_1],
        rejectUnauthorized: true
      }

      await setCertificateSettings(customSettings)
      const settings = await getCertificateSettings()

      expect(settings).toEqual(customSettings)
    })

    it('should return none mode when configured', async () => {
      await setCertificateSettings({ mode: 'none', rejectUnauthorized: true })
      const settings = await getCertificateSettings()

      expect(settings.mode).toBe('none')
      expect(settings.rejectUnauthorized).toBe(true)
    })

    it('should allow disabling certificate validation', async () => {
      await setCertificateSettings({ mode: 'none', rejectUnauthorized: false })
      const settings = await getCertificateSettings()

      expect(settings.rejectUnauthorized).toBe(false)
    })
  })

  describe('setCertificateSettings', () => {
    it('should save custom certificate settings to database', async () => {
      const customSettings: CertificateSettings = {
        mode: 'custom',
        customCertificates: [MOCK_CERT_1, MOCK_CERT_2],
        rejectUnauthorized: true
      }

      await setCertificateSettings(customSettings)
      const retrieved = await getCertificateSettings()

      expect(retrieved).toEqual(customSettings)
    })

    it('should throw error when custom mode has no certificates', async () => {
      await expect(
        setCertificateSettings({
          mode: 'custom',
          customCertificates: [],
          rejectUnauthorized: true
        })
      ).rejects.toThrow('Custom certificate mode requires at least one certificate')
    })

    it('should throw error when custom mode has undefined certificates', async () => {
      await expect(
        setCertificateSettings({
          mode: 'custom',
          rejectUnauthorized: true
        })
      ).rejects.toThrow('Custom certificate mode requires at least one certificate')
    })

    it('should throw error when certificate is not in PEM format', async () => {
      await expect(
        setCertificateSettings({
          mode: 'custom',
          customCertificates: ['not a valid certificate'],
          rejectUnauthorized: true
        })
      ).rejects.toThrow('Invalid certificate format: must be PEM format')
    })

    it('should validate all certificates in the array', async () => {
      await expect(
        setCertificateSettings({
          mode: 'custom',
          customCertificates: [MOCK_CERT_1, 'invalid cert'],
          rejectUnauthorized: true
        })
      ).rejects.toThrow('Invalid certificate format: must be PEM format')
    })

    it('should allow none mode without certificates', async () => {
      await setCertificateSettings({
        mode: 'none',
        rejectUnauthorized: true
      })

      const settings = await getCertificateSettings()
      expect(settings.mode).toBe('none')
    })
  })

  describe('getTrustedCertificates', () => {
    it('should return undefined for none mode (use Node.js defaults)', async () => {
      await setCertificateSettings({ mode: 'none', rejectUnauthorized: true })

      const certificates = await getTrustedCertificates()
      expect(certificates).toBeUndefined()
    })

    it('should return custom certificates when in custom mode', async () => {
      await setCertificateSettings({
        mode: 'custom',
        customCertificates: [MOCK_CERT_1],
        rejectUnauthorized: true
      })

      const certificates = await getTrustedCertificates()
      expect(certificates).toEqual([MOCK_CERT_1])
    })

    it('should return system certificates when in system mode', async () => {
      await setCertificateSettings({ mode: 'system', rejectUnauthorized: true })

      const certificates = await getTrustedCertificates()
      expect(certificates).toHaveLength(2)
    })
  })

  describe('shouldRejectUnauthorized', () => {
    it('should return true by default', async () => {
      await setCertificateSettings({ mode: 'none', rejectUnauthorized: true })

      const reject = await shouldRejectUnauthorized()
      expect(reject).toBe(true)
    })

    it('should return false when explicitly disabled', async () => {
      await setCertificateSettings({ mode: 'none', rejectUnauthorized: false })

      const reject = await shouldRejectUnauthorized()
      expect(reject).toBe(false)
    })

    it('should respect setting across different modes', async () => {
      await setCertificateSettings({
        mode: 'custom',
        customCertificates: [MOCK_CERT_1],
        rejectUnauthorized: false
      })

      const reject = await shouldRejectUnauthorized()
      expect(reject).toBe(false)
    })
  })

  describe('addCustomCertificate', () => {
    it('should add certificate to empty custom certificates', async () => {
      await setCertificateSettings({ mode: 'none', rejectUnauthorized: true })
      await addCustomCertificate(MOCK_CERT_1)

      const settings = await getCertificateSettings()
      expect(settings.mode).toBe('custom')
      expect(settings.customCertificates).toEqual([MOCK_CERT_1])
    })

    it('should append certificate to existing custom certificates', async () => {
      await setCertificateSettings({
        mode: 'custom',
        customCertificates: [MOCK_CERT_1],
        rejectUnauthorized: true
      })

      await addCustomCertificate(MOCK_CERT_2)

      const settings = await getCertificateSettings()
      expect(settings.customCertificates).toEqual([MOCK_CERT_1, MOCK_CERT_2])
    })

    it('should throw error when adding invalid certificate', async () => {
      await expect(addCustomCertificate('not a certificate')).rejects.toThrow(
        'Invalid certificate format: must be PEM format'
      )
    })

    it('should preserve rejectUnauthorized setting when adding certificate', async () => {
      await setCertificateSettings({ mode: 'none', rejectUnauthorized: false })
      await addCustomCertificate(MOCK_CERT_1)

      const settings = await getCertificateSettings()
      expect(settings.rejectUnauthorized).toBe(false)
    })
  })

  describe('removeCustomCertificate', () => {
    beforeEach(async () => {
      await setCertificateSettings({
        mode: 'custom',
        customCertificates: [MOCK_CERT_1, MOCK_CERT_2],
        rejectUnauthorized: true
      })
    })

    it('should remove certificate at specified index', async () => {
      await removeCustomCertificate(0)

      const settings = await getCertificateSettings()
      expect(settings.customCertificates).toEqual([MOCK_CERT_2])
    })

    it('should remove second certificate correctly', async () => {
      await removeCustomCertificate(1)

      const settings = await getCertificateSettings()
      expect(settings.customCertificates).toEqual([MOCK_CERT_1])
    })

    it('should throw error when index is out of bounds', async () => {
      await expect(removeCustomCertificate(5)).rejects.toThrow('Invalid certificate index')
    })

    it('should throw error when no custom certificates exist', async () => {
      await setCertificateSettings({ mode: 'none', rejectUnauthorized: true })

      await expect(removeCustomCertificate(0)).rejects.toThrow('Invalid certificate index')
    })

    it('should preserve other settings when removing certificate', async () => {
      await removeCustomCertificate(0)

      const settings = await getCertificateSettings()
      expect(settings.mode).toBe('custom')
      expect(settings.rejectUnauthorized).toBe(true)
    })
  })

  describe('Certificate Settings Persistence', () => {
    it('should persist settings across multiple get/set operations', async () => {
      const settings1: CertificateSettings = {
        mode: 'custom',
        customCertificates: [MOCK_CERT_1],
        rejectUnauthorized: true
      }

      await setCertificateSettings(settings1)
      expect((await getCertificateSettings()).customCertificates).toHaveLength(1)

      const settings2: CertificateSettings = {
        mode: 'custom',
        customCertificates: [MOCK_CERT_1, MOCK_CERT_2],
        rejectUnauthorized: false
      }

      await setCertificateSettings(settings2)
      const retrieved = await getCertificateSettings()

      expect(retrieved.customCertificates).toHaveLength(2)
      expect(retrieved.rejectUnauthorized).toBe(false)
    })
  })
})
