/**
 * Connection Test Utilities
 *
 * Provides functionality to test proxy and certificate configurations
 * by making actual HTTP/HTTPS requests to verify settings.
 */

import type { ProxySettings, CertificateSettings, ConnectionTestResult } from '@common/types'
import { createFetchWithProxyAndCertificates } from '../ai/fetch'
import logger from '../logger'

const testLogger = logger.child('settings:connectionTest')

/**
 * Test URLs for connectivity checks
 */
const TEST_URLS = {
  http: 'http://www.google.com',
  https: 'https://www.google.com'
}

/**
 * Test proxy connection
 *
 * Makes a real HTTP request through the configured proxy to verify
 * that the proxy settings are correct and the proxy is reachable.
 *
 * @param settings - Proxy settings to test
 * @returns Test result with success status and details
 */
export async function testProxyConnection(
  settings: ProxySettings
): Promise<ConnectionTestResult> {
  testLogger.info('Testing proxy connection', { mode: settings.mode })

  if (settings.mode === 'none') {
    return {
      success: true,
      message: 'No proxy configured - direct connection will be used'
    }
  }

  const startTime = Date.now()

  try {
    // Create fetch with proxy settings (no certificate settings for this test)
    const customFetch = await createFetchWithProxyAndCertificates(settings, {
      mode: 'none',
      rejectUnauthorized: true
    })

    // Test with HTTP first (simpler, faster)
    const testUrl = settings.httpProxy ? TEST_URLS.http : TEST_URLS.https
    testLogger.debug('Making test request', { url: testUrl })

    const response = await Promise.race([
      customFetch(testUrl, {
        method: 'HEAD',
        redirect: 'manual'
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), 10000)
      )
    ])

    const responseTime = Date.now() - startTime

    if (!response.ok && response.status !== 301 && response.status !== 302) {
      testLogger.warn('Test request returned non-OK status', {
        status: response.status,
        statusText: response.statusText
      })

      return {
        success: false,
        message: `Proxy returned HTTP ${response.status}: ${response.statusText}`,
        details: {
          url: testUrl,
          statusCode: response.status,
          responseTime,
          errorType: 'proxy'
        }
      }
    }

    testLogger.info('Proxy connection test successful', { responseTime })

    return {
      success: true,
      message: 'Proxy connection successful',
      details: {
        url: testUrl,
        statusCode: response.status,
        responseTime
      }
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    testLogger.error('Proxy connection test failed', { error: errorMessage })

    // Categorize error type
    let errorType: 'proxy' | 'certificate' | 'network' | 'timeout' | 'unknown' = 'unknown'
    let userMessage = 'Connection failed'

    if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
      errorType = 'timeout'
      userMessage = 'Connection timeout - proxy server may be unreachable'
    } else if (
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('ENOTFOUND')
    ) {
      errorType = 'network'
      userMessage = 'Cannot reach proxy server - check proxy URL and port'
    } else if (
      errorMessage.includes('authentication') ||
      errorMessage.includes('407')
    ) {
      errorType = 'proxy'
      userMessage = 'Proxy authentication failed - check username and password'
    } else if (errorMessage.includes('ECONNRESET')) {
      errorType = 'network'
      userMessage = 'Connection reset by proxy server'
    }

    return {
      success: false,
      message: userMessage,
      details: {
        url: TEST_URLS.http,
        responseTime,
        error: errorMessage,
        errorType
      }
    }
  }
}

/**
 * Test certificate connection
 *
 * Makes a real HTTPS request with the configured certificate settings
 * to verify that SSL/TLS connections work correctly.
 *
 * @param settings - Certificate settings to test
 * @returns Test result with success status and details
 */
export async function testCertificateConnection(
  settings: CertificateSettings
): Promise<ConnectionTestResult> {
  testLogger.info('Testing certificate connection', { mode: settings.mode })

  const startTime = Date.now()

  try {
    // Create fetch with certificate settings (no proxy for this test)
    const customFetch = await createFetchWithProxyAndCertificates(
      { mode: 'none' },
      settings
    )

    testLogger.debug('Making HTTPS test request', { url: TEST_URLS.https })

    const response = await Promise.race([
      customFetch(TEST_URLS.https, {
        method: 'HEAD',
        redirect: 'manual'
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), 10000)
      )
    ])

    const responseTime = Date.now() - startTime

    if (!response.ok && response.status !== 301 && response.status !== 302) {
      testLogger.warn('Test request returned non-OK status', {
        status: response.status,
        statusText: response.statusText
      })

      return {
        success: false,
        message: `HTTPS request returned HTTP ${response.status}: ${response.statusText}`,
        details: {
          url: TEST_URLS.https,
          statusCode: response.status,
          responseTime,
          errorType: 'network'
        }
      }
    }

    testLogger.info('Certificate connection test successful', { responseTime })

    return {
      success: true,
      message: 'HTTPS connection successful',
      details: {
        url: TEST_URLS.https,
        statusCode: response.status,
        responseTime
      }
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    testLogger.error('Certificate connection test failed', { error: errorMessage })

    // Categorize error type
    let errorType: 'proxy' | 'certificate' | 'network' | 'timeout' | 'unknown' = 'unknown'
    let userMessage = 'HTTPS connection failed'

    if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
      errorType = 'timeout'
      userMessage = 'Connection timeout'
    } else if (
      errorMessage.includes('certificate') ||
      errorMessage.includes('CERT_') ||
      errorMessage.includes('SSL') ||
      errorMessage.includes('TLS')
    ) {
      errorType = 'certificate'
      if (errorMessage.includes('CERT_HAS_EXPIRED')) {
        userMessage = 'Certificate has expired'
      } else if (errorMessage.includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE')) {
        userMessage = 'Unable to verify certificate - CA certificate may be missing'
      } else if (errorMessage.includes('SELF_SIGNED_CERT_IN_CHAIN')) {
        userMessage = 'Self-signed certificate in chain - add CA certificate or disable verification'
      } else {
        userMessage = 'Certificate verification failed'
      }
    } else if (
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('ENOTFOUND')
    ) {
      errorType = 'network'
      userMessage = 'Cannot reach server'
    }

    return {
      success: false,
      message: userMessage,
      details: {
        url: TEST_URLS.https,
        responseTime,
        error: errorMessage,
        errorType
      }
    }
  }
}

/**
 * Test combined proxy and certificate connection
 *
 * Tests both proxy and certificate settings together by making
 * an HTTPS request through the configured proxy.
 *
 * @param proxySettings - Proxy settings to test
 * @param certSettings - Certificate settings to test
 * @returns Test result with success status and details
 */
export async function testCombinedConnection(
  proxySettings: ProxySettings,
  certSettings: CertificateSettings
): Promise<ConnectionTestResult> {
  testLogger.info('Testing combined proxy and certificate connection')

  const startTime = Date.now()

  try {
    const customFetch = await createFetchWithProxyAndCertificates(
      proxySettings,
      certSettings
    )

    const response = await Promise.race([
      customFetch(TEST_URLS.https, {
        method: 'HEAD',
        redirect: 'manual'
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), 10000)
      )
    ])

    const responseTime = Date.now() - startTime

    if (!response.ok && response.status !== 301 && response.status !== 302) {
      return {
        success: false,
        message: `Request returned HTTP ${response.status}: ${response.statusText}`,
        details: {
          url: TEST_URLS.https,
          statusCode: response.status,
          responseTime
        }
      }
    }

    testLogger.info('Combined connection test successful', { responseTime })

    return {
      success: true,
      message: 'Connection successful (proxy + HTTPS)',
      details: {
        url: TEST_URLS.https,
        statusCode: response.status,
        responseTime
      }
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    testLogger.error('Combined connection test failed', { error: errorMessage })

    // Try to determine if it's a proxy or certificate issue
    let errorType: 'proxy' | 'certificate' | 'network' | 'timeout' | 'unknown' = 'unknown'
    let userMessage = 'Connection failed'

    if (errorMessage.includes('certificate') || errorMessage.includes('CERT_')) {
      errorType = 'certificate'
      userMessage = 'Certificate verification failed'
    } else if (
      errorMessage.includes('407') ||
      errorMessage.includes('authentication')
    ) {
      errorType = 'proxy'
      userMessage = 'Proxy authentication failed'
    } else if (errorMessage.includes('timeout')) {
      errorType = 'timeout'
      userMessage = 'Connection timeout'
    } else if (
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('ENOTFOUND')
    ) {
      errorType = 'network'
      userMessage = 'Cannot reach proxy or server'
    }

    return {
      success: false,
      message: userMessage,
      details: {
        url: TEST_URLS.https,
        responseTime,
        error: errorMessage,
        errorType
      }
    }
  }
}
