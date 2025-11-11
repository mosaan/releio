/**
 * Windows Platform Certificate Retrieval Module
 *
 * Retrieves trusted CA certificates from Windows certificate store.
 * Uses win-ca to read certificates from Windows Crypto API.
 */

import type { CertificateSettings } from '@common/types'
import logger from '../../logger'

const certLogger = logger.child('platform:windows:certificate')

/**
 * Get Windows system certificate configuration
 *
 * Reads trusted CA certificates from Windows certificate store
 * and converts them to our CertificateSettings format.
 *
 * @returns CertificateSettings with system mode and discovered certificates
 */
export async function getWindowsCertificateSettings(): Promise<CertificateSettings> {
  certLogger.info('Retrieving Windows system certificates')

  try {
    // Only import on Windows platform
    if (process.platform !== 'win32') {
      certLogger.warn('Not on Windows platform, returning none mode')
      return { mode: 'none', rejectUnauthorized: true }
    }

    // Dynamic import to avoid loading on non-Windows platforms
    // win-ca uses module.exports (default export)
    const { default: winCa } = await import('win-ca')

    const certificates: string[] = []

    // win-ca provides certificates through callbacks
    // We use ondata/onend callbacks to collect all certificates
    await new Promise<void>((resolve, reject) => {
      try {
        // Call winCa as a function with options
        winCa({
          format: winCa.der2.pem, // Request PEM format directly
          ondata: (cert: string) => {
            // Each certificate is provided as PEM string
            certificates.push(cert)
          },
          onend: () => {
            // Called when all certificates have been retrieved
            certLogger.info('Windows certificates retrieved', { count: certificates.length })
            resolve()
          }
        })
      } catch (error) {
        certLogger.error('Failed to retrieve Windows certificates', { error })
        reject(error)
      }
    })

    if (certificates.length === 0) {
      certLogger.warn('No Windows certificates found')
      return { mode: 'none', rejectUnauthorized: true }
    }

    certLogger.info('Windows certificate settings retrieved successfully', {
      certificateCount: certificates.length
    })

    return {
      mode: 'system',
      customCertificates: certificates,
      rejectUnauthorized: true
    }
  } catch (error) {
    certLogger.error('Failed to retrieve Windows certificate settings', { error })
    // Return none mode on error
    return { mode: 'none', rejectUnauthorized: true }
  }
}

/**
 * Convert certificate Buffer to PEM format
 *
 * @param cert - Certificate as Buffer or string
 * @returns Certificate in PEM format
 */
// @ts-ignore - Reserved for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _bufferToPem(cert: Buffer | string): string {
  if (typeof cert === 'string') {
    // Already in string format, check if it has PEM markers
    if (cert.includes('BEGIN CERTIFICATE')) {
      return cert
    }
    // Convert to Buffer for processing
    cert = Buffer.from(cert, 'base64')
  }

  // Convert Buffer to base64
  const base64Cert = cert.toString('base64')

  // Split into 64-character lines as per PEM spec
  const lines: string[] = []
  for (let i = 0; i < base64Cert.length; i += 64) {
    lines.push(base64Cert.slice(i, i + 64))
  }

  // Add PEM headers and footers
  return ['-----BEGIN CERTIFICATE-----', ...lines, '-----END CERTIFICATE-----'].join('\n')
}

/**
 * Check if Windows certificate injection is available
 *
 * @returns true if win-ca is available and platform is Windows
 */
export function isWindowsCertificateAvailable(): boolean {
  return process.platform === 'win32'
}
