/**
 * Certificate Settings Management Layer
 *
 * Manages certificate configuration lifecycle including:
 * - Loading settings from database
 * - Retrieving system certificates (Windows)
 * - Merging system and custom certificates
 * - Managing certificate validation options
 */

import type { CertificateSettings, CustomCertificate } from '@common/types'
import { getSetting, setSetting } from './index'
import { getWindowsCertificateSettings } from '../platform/windows/certificate'
import logger from '../logger'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const certLogger = logger.child('settings:certificate')

const CERTIFICATE_SETTINGS_KEY = 'certificate'

/**
 * Parse certificate metadata from PEM content
 *
 * Extracts issuer and validity information from a PEM certificate.
 *
 * @param pemContent - PEM-formatted certificate content
 * @returns Certificate metadata or undefined if parsing fails
 */
function parseCertificateMetadata(
  pemContent: string
): { issuer?: string; validUntil?: string } | undefined {
  try {
    // Use Node.js X509Certificate API (available in Node.js v15.6.0+)
    const cert = new crypto.X509Certificate(pemContent)

    // Extract issuer CN (Common Name)
    const issuerMatch = cert.issuer.match(/CN=([^,]+)/)
    const issuer = issuerMatch ? issuerMatch[1] : cert.issuer

    // Get expiration date in ISO format
    const validUntil = cert.validTo

    return { issuer, validUntil }
  } catch (error) {
    certLogger.warn('Failed to parse certificate metadata', { error })
    return undefined
  }
}

/**
 * Validate that a certificate file exists and is readable
 *
 * @param certPath - Path to certificate file
 * @returns true if file exists and is readable
 */
function validateCertificatePath(certPath: string): boolean {
  try {
    // Check if file exists and is readable
    fs.accessSync(certPath, fs.constants.R_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Read certificate content from file path
 *
 * @param certPath - Path to certificate file
 * @returns PEM-formatted certificate content
 * @throws Error if file cannot be read or is not valid PEM
 */
function readCertificateFromPath(certPath: string): string {
  try {
    const content = fs.readFileSync(certPath, 'utf-8')

    // Validate PEM format
    if (!content.includes('BEGIN CERTIFICATE')) {
      throw new Error('Invalid certificate format: must be PEM format')
    }

    return content
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to read certificate from ${certPath}: ${error.message}`)
    }
    throw error
  }
}

/**
 * Get the current certificate configuration
 *
 * Returns the appropriate certificate settings based on the configured mode:
 * - 'system': Retrieves Windows system certificates
 * - 'custom': Returns custom certificates from database
 * - 'none': Returns default Node.js certificates
 *
 * @returns Current certificate settings
 */
export async function getCertificateSettings(): Promise<CertificateSettings> {
  certLogger.debug('Getting certificate settings')

  try {
    // Get stored settings from database
    const storedSettings = await getSetting<CertificateSettings>(CERTIFICATE_SETTINGS_KEY)

    if (!storedSettings) {
      certLogger.info('No stored certificate settings, initializing with system mode')
      // On first launch, automatically set system mode
      const systemSettings = await getSystemCertificateSettings()
      await setCertificateSettings(systemSettings)
      return systemSettings
    }

    const mode = storedSettings.mode

    switch (mode) {
      case 'system': {
        const systemSettings = await getSystemCertificateSettings()
        // Preserve user's rejectUnauthorized setting if specified
        if (storedSettings.rejectUnauthorized !== undefined) {
          systemSettings.rejectUnauthorized = storedSettings.rejectUnauthorized
        }
        return systemSettings
      }

      case 'custom':
        certLogger.debug('Using custom certificate settings', {
          certificateCount: storedSettings.customCertificates?.length || 0
        })
        return storedSettings

      case 'none':
        certLogger.debug('Using default Node.js certificates')
        // Preserve user's rejectUnauthorized setting if specified
        return {
          mode: 'none',
          rejectUnauthorized: storedSettings.rejectUnauthorized !== undefined
            ? storedSettings.rejectUnauthorized
            : true
        }

      default:
        certLogger.warn('Unknown certificate mode, falling back to system', { mode })
        return await getSystemCertificateSettings()
    }
  } catch (error) {
    certLogger.error('Failed to get certificate settings, using none mode', { error })
    return { mode: 'none', rejectUnauthorized: true }
  }
}

/**
 * Get system certificate settings
 *
 * Retrieves trusted CA certificates from the operating system.
 * Currently supports Windows only.
 *
 * @returns System certificate settings
 */
export async function getSystemCertificateSettings(): Promise<CertificateSettings> {
  certLogger.debug('Getting system certificate settings')

  try {
    if (process.platform === 'win32') {
      return await getWindowsCertificateSettings()
    } else {
      certLogger.warn('System certificates not supported on this platform', {
        platform: process.platform
      })
      return { mode: 'none', rejectUnauthorized: true }
    }
  } catch (error) {
    certLogger.error('Failed to get system certificate settings', { error })
    return { mode: 'none', rejectUnauthorized: true }
  }
}

/**
 * Set certificate settings
 *
 * Stores certificate configuration in database.
 *
 * @param settings - Certificate settings to store
 */
export async function setCertificateSettings(settings: CertificateSettings): Promise<void> {
  certLogger.info('Setting certificate settings', {
    mode: settings.mode,
    certificateCount: settings.customCertificates?.length || 0,
    rejectUnauthorized: settings.rejectUnauthorized
  })

  // Validate settings
  if (settings.mode === 'custom') {
    if (!settings.customCertificates || settings.customCertificates.length === 0) {
      throw new Error('Custom certificate mode requires at least one certificate')
    }

    // Validate certificate paths
    for (const cert of settings.customCertificates) {
      // Type guard: custom mode should have CustomCertificate[]
      if (typeof cert === 'string') {
        throw new Error('Invalid certificate: expected CustomCertificate object, got string')
      }
      if (!cert.path || typeof cert.path !== 'string') {
        throw new Error('Invalid certificate: path is required')
      }
      if (!path.isAbsolute(cert.path)) {
        throw new Error(`Invalid certificate path: must be absolute (${cert.path})`)
      }
    }
  }

  await setSetting(CERTIFICATE_SETTINGS_KEY, settings)
  certLogger.info('Certificate settings saved successfully')
}

/**
 * Get all trusted CA certificates
 *
 * Returns an array of PEM-formatted CA certificates based on current settings.
 * For custom certificates, reads the content from file paths.
 * This can be used to configure HTTPS agents.
 *
 * @returns Array of PEM certificates or undefined for default
 */
export async function getTrustedCertificates(): Promise<string[] | undefined> {
  const settings = await getCertificateSettings()

  if (settings.mode === 'none') {
    // Use Node.js default certificates
    return undefined
  }

  if (settings.mode === 'system') {
    // System certificates are already in PEM format (from Windows certificate store)
    const certs = settings.customCertificates
    if (!certs) return undefined

    // For system mode, certificates are PEM strings
    if (certs.length > 0 && typeof certs[0] === 'string') {
      return certs as string[]
    }

    return undefined
  }

  // Custom mode: read certificates from file paths
  if (settings.mode === 'custom' && settings.customCertificates) {
    const certificates: string[] = []

    for (const cert of settings.customCertificates) {
      // Type guard: custom mode should have CustomCertificate[]
      if (typeof cert === 'string') {
        certLogger.warn('Unexpected string certificate in custom mode, skipping')
        continue
      }

      try {
        const content = readCertificateFromPath(cert.path)
        certificates.push(content)
      } catch (error) {
        certLogger.warn('Failed to read certificate from path', {
          path: cert.path,
          id: cert.id,
          error
        })
        // Continue with other certificates even if one fails
      }
    }

    return certificates.length > 0 ? certificates : undefined
  }

  return undefined
}

/**
 * Check if unauthorized certificates should be rejected
 *
 * @returns true if unauthorized certificates should be rejected
 */
export async function shouldRejectUnauthorized(): Promise<boolean> {
  const settings = await getCertificateSettings()
  return settings.rejectUnauthorized !== false
}

/**
 * Add a custom certificate from file path
 *
 * Adds a certificate to the custom certificate list by reading from the specified path.
 * Automatically switches to custom mode if not already set.
 *
 * @param certPath - Absolute path to PEM certificate file
 * @param displayName - Optional display name for the certificate
 * @returns The created CustomCertificate object
 */
export async function addCustomCertificate(
  certPath: string,
  displayName?: string
): Promise<CustomCertificate> {
  certLogger.info('Adding custom certificate', { path: certPath })

  // Validate path is absolute
  if (!path.isAbsolute(certPath)) {
    throw new Error('Certificate path must be absolute')
  }

  // Read and validate certificate
  const content = readCertificateFromPath(certPath)

  // Parse metadata
  const metadata = parseCertificateMetadata(content)

  // Create certificate object
  const certificate: CustomCertificate = {
    id: crypto.randomUUID(),
    path: certPath,
    displayName: displayName || path.basename(certPath),
    issuer: metadata?.issuer,
    validUntil: metadata?.validUntil,
    addedAt: new Date().toISOString()
  }

  const currentSettings = await getCertificateSettings()

  const customCertificates = (currentSettings.customCertificates || []) as CustomCertificate[]
  customCertificates.push(certificate)

  await setCertificateSettings({
    mode: 'custom',
    customCertificates,
    rejectUnauthorized: currentSettings.rejectUnauthorized
  })

  certLogger.info('Custom certificate added successfully', {
    id: certificate.id,
    path: certPath
  })

  return certificate
}

/**
 * Remove a custom certificate
 *
 * Removes a certificate from the custom certificate list by ID.
 *
 * @param certificateId - ID of certificate to remove
 */
export async function removeCustomCertificate(certificateId: string): Promise<void> {
  certLogger.info('Removing custom certificate', { id: certificateId })

  const currentSettings = await getCertificateSettings()

  if (!currentSettings.customCertificates) {
    throw new Error('No custom certificates configured')
  }

  const customCertificates = currentSettings.customCertificates as CustomCertificate[]
  const index = customCertificates.findIndex((cert) => cert.id === certificateId)

  if (index === -1) {
    throw new Error(`Certificate not found: ${certificateId}`)
  }

  const updatedCertificates = [...customCertificates]
  updatedCertificates.splice(index, 1)

  await setCertificateSettings({
    ...currentSettings,
    customCertificates: updatedCertificates
  })

  certLogger.info('Custom certificate removed successfully', { id: certificateId })
}

/**
 * Validate all custom certificate paths
 *
 * Checks if all configured certificate files exist and are readable.
 *
 * @returns Array of validation results with certificate ID and status
 */
export async function validateCustomCertificates(): Promise<
  Array<{ id: string; path: string; valid: boolean; error?: string }>
> {
  const settings = await getCertificateSettings()

  if (settings.mode !== 'custom' || !settings.customCertificates) {
    return []
  }

  const results = (settings.customCertificates as CustomCertificate[]).map((cert) => {
    const valid = validateCertificatePath(cert.path)
    return {
      id: cert.id,
      path: cert.path,
      valid,
      error: valid ? undefined : 'File not found or not readable'
    }
  })

  return results
}
