/**
 * Certificate Settings Management Layer
 *
 * Manages certificate configuration lifecycle including:
 * - Loading settings from database
 * - Retrieving system certificates (Windows)
 * - Merging system and custom certificates
 * - Managing certificate validation options
 */

import type { CertificateSettings } from '@common/types'
import { getSetting, setSetting } from './index'
import { getWindowsCertificateSettings } from '../platform/windows/certificate'
import logger from '../logger'

const certLogger = logger.child('settings:certificate')

const CERTIFICATE_SETTINGS_KEY = 'certificate'

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

    // Validate certificate format
    for (const cert of settings.customCertificates) {
      if (!cert.includes('BEGIN CERTIFICATE')) {
        throw new Error('Invalid certificate format: must be PEM format')
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

  return settings.customCertificates
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
 * Add a custom certificate
 *
 * Adds a certificate to the custom certificate list.
 * Automatically switches to custom mode if not already set.
 *
 * @param certificate - PEM-formatted certificate to add
 */
export async function addCustomCertificate(certificate: string): Promise<void> {
  certLogger.info('Adding custom certificate')

  if (!certificate.includes('BEGIN CERTIFICATE')) {
    throw new Error('Invalid certificate format: must be PEM format')
  }

  const currentSettings = await getCertificateSettings()

  const customCertificates = currentSettings.customCertificates || []
  customCertificates.push(certificate)

  await setCertificateSettings({
    mode: 'custom',
    customCertificates,
    rejectUnauthorized: currentSettings.rejectUnauthorized
  })

  certLogger.info('Custom certificate added successfully')
}

/**
 * Remove a custom certificate
 *
 * Removes a certificate from the custom certificate list.
 *
 * @param index - Index of certificate to remove
 */
export async function removeCustomCertificate(index: number): Promise<void> {
  certLogger.info('Removing custom certificate', { index })

  const currentSettings = await getCertificateSettings()

  if (!currentSettings.customCertificates || index >= currentSettings.customCertificates.length) {
    throw new Error('Invalid certificate index')
  }

  const customCertificates = [...currentSettings.customCertificates]
  customCertificates.splice(index, 1)

  await setCertificateSettings({
    ...currentSettings,
    customCertificates
  })

  certLogger.info('Custom certificate removed successfully')
}
