import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as net from 'net'

/**
 * Quarantine details when a file is flagged by ClamAV
 */
export interface QuarantineInfo {
  viruses: string[]
  filename?: string
  scannedAt: Date
}

/**
 * Result of a ClamAV scan operation
 */
export interface ScanResult {
  isInfected: boolean
  viruses: string[]
  scannedAt: Date
  quarantineInfo?: QuarantineInfo // Full details for storage
}

/**
 * ClamAV scanning service
 *
 * Provides antivirus scanning for files and buffers using the ClamAV daemon.
 * Communicates via the CLAMD protocol (not HTTP).
 *
 * Environment variables:
 * - CLAMAV_HOST: ClamAV daemon hostname (default: localhost)
 * - CLAMAV_PORT: ClamAV daemon port (default: 3310)
 * - CLAMAV_TIMEOUT: Connection timeout in ms (default: 30000)
 * - CLAMAV_ENABLED: Enable/disable scanning (default: true)
 */
@Injectable()
export class ClamavService implements OnModuleInit {
  private readonly logger = new Logger(ClamavService.name)
  private readonly host: string
  private readonly port: number
  private readonly timeout: number
  private readonly enabled: boolean
  private readonly failClosed: boolean
  private isHealthy = false

  constructor(private readonly configService: ConfigService) {
    this.host = this.getStringConfig('clamav.host', 'CLAMAV_HOST', 'localhost')
    this.port = this.getNumberConfig('clamav.port', 'CLAMAV_PORT', 3310)
    this.timeout = this.getNumberConfig('clamav.timeout', 'CLAMAV_TIMEOUT', 30000)
    this.enabled = this.getBooleanConfig('clamav.enabled', 'CLAMAV_ENABLED', true)
    this.failClosed = this.getBooleanConfig('clamav.failClosed', 'CLAMAV_FAIL_CLOSED', false)
  }

  private getRawConfigValue<T>(configKey: string, envKey: string): T | undefined {
    const configValue = this.configService.get<T>(configKey)
    if (configValue !== undefined) {
      return configValue
    }

    return this.configService.get<T>(envKey)
  }

  private getStringConfig(configKey: string, envKey: string, defaultValue: string): string {
    return this.getRawConfigValue<string>(configKey, envKey) ?? defaultValue
  }

  private getNumberConfig(configKey: string, envKey: string, defaultValue: number): number {
    const value = this.getRawConfigValue<number | string>(configKey, envKey)

    if (typeof value === 'number') {
      return value
    }

    if (typeof value === 'string') {
      const parsed = parseInt(value, 10)
      if (!Number.isNaN(parsed)) {
        return parsed
      }
    }

    return defaultValue
  }

  private getBooleanConfig(configKey: string, envKey: string, defaultValue: boolean): boolean {
    const value = this.getRawConfigValue<boolean | string>(configKey, envKey)

    if (typeof value === 'boolean') {
      return value
    }

    if (typeof value === 'string') {
      return value.toLowerCase() === 'true'
    }

    return defaultValue
  }

  /**
   * Initialize the service and check ClamAV health
   */
  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('ClamAV scanning is disabled')
      return
    }

    try {
      await this.healthCheck()
      this.isHealthy = true
      this.logger.log(`ClamAV service initialized (${this.host}:${this.port})`)
    } catch (error) {
      this.logger.error(
        `Failed to connect to ClamAV: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
      this.isHealthy = false
    }
  }

  /**
   * Check ClamAV daemon health via PING command
   */
  async healthCheck(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(
        { host: this.host, port: this.port, timeout: this.timeout },
        () => {
          socket.write('PING\n')
        },
      )

      socket.on('data', (data) => {
        const response = data.toString().trim()
        socket.destroy()
        if (response === 'PONG') {
          resolve()
        } else {
          reject(new Error(`Unexpected response: ${response}`))
        }
      })

      socket.on('error', (error) => {
        socket.destroy()
        reject(error)
      })

      socket.on('timeout', () => {
        socket.destroy()
        reject(new Error('ClamAV connection timeout'))
      })
    })
  }

  /**
   * Scan a buffer (file content)
   *
   * @param buffer The file content to scan
   * @param filename Optional filename for logging
   * @returns Scan result with infection status and detected viruses
   */
  async scanBuffer(buffer: Buffer, filename?: string): Promise<ScanResult> {
    if (!this.enabled) {
      if (this.failClosed) {
        const error = new Error('ClamAV scanning is disabled while fail-closed mode is enabled')
        this.logger.error(error.message)
        throw error
      }

      this.logger.debug('ClamAV scanning disabled, skipping scan')
      return {
        isInfected: false,
        viruses: [],
        scannedAt: new Date(),
      }
    }

    if (!this.isHealthy) {
      if (this.failClosed) {
        const error = new Error('ClamAV is unavailable while fail-closed mode is enabled')
        this.logger.error(error.message)
        throw error
      }

      this.logger.warn('ClamAV is not healthy, skipping scan')
      return {
        isInfected: false,
        viruses: [],
        scannedAt: new Date(),
      }
    }

    return new Promise((resolve, reject) => {
      const socket = net.createConnection(
        { host: this.host, port: this.port, timeout: this.timeout },
        () => {
          // clamd INSTREAM protocol requires null-terminated command and chunked payload.
          // Format: zINSTREAM\0 + [len(4 bytes BE) + chunk]* + len(0)
          const chunks: Buffer[] = [Buffer.from('zINSTREAM\0')]
          const chunkSize = 64 * 1024

          for (let offset = 0; offset < buffer.length; offset += chunkSize) {
            const chunk = buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length))
            const lengthPrefix = Buffer.alloc(4)
            lengthPrefix.writeUInt32BE(chunk.length, 0)
            chunks.push(lengthPrefix, chunk)
          }

          const terminator = Buffer.alloc(4)
          terminator.writeUInt32BE(0, 0)
          chunks.push(terminator)

          socket.end(Buffer.concat(chunks))
        },
      )

      let response = ''

      socket.on('data', (data) => {
        response += data.toString()
      })

      socket.on('end', () => {
        try {
          const result = this.parseResponse(response, filename)
          this.isHealthy = true
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })

      socket.on('error', (error) => {
        socket.destroy()
        this.isHealthy = false
        this.logger.error(
          `ClamAV scan error for ${filename || 'buffer'}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
        reject(error)
      })

      socket.on('timeout', () => {
        socket.destroy()
        this.isHealthy = false
        const timeoutError = new Error('ClamAV scan timeout')
        this.logger.error(`ClamAV scan timeout for ${filename || 'buffer'}: ${this.timeout}ms`)
        reject(timeoutError)
      })
    })
  }

  /**
   * Parse ClamAV INSTREAM response
   *
   * Response format:
   * - "stream: OK" if clean
   * - "stream: <virus_name> FOUND" if infected
   * - Multiple viruses can be reported
   */
  private parseResponse(response: string, filename?: string): ScanResult {
    const lines = response
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    const errorLine = lines.find((line) =>
      /UNKNOWN COMMAND|\bERROR\b|INSTREAM size limit exceeded/i.test(line),
    )
    if (errorLine) {
      throw new Error(`ClamAV returned error response: ${errorLine}`)
    }

    const viruses: string[] = []
    let isInfected = false

    for (const line of lines) {
      if (line.includes('FOUND')) {
        isInfected = true
        // Extract virus name from "stream: <virus_name> FOUND"
        const match = line.match(/^stream:\s*(.+?)\s+FOUND$/)
        if (match) {
          viruses.push(match[1])
          this.logger.warn(`Malware detected in ${filename || 'buffer'}: ${match[1]}`)
        }
      }
    }

    if (!isInfected && !lines.some((l) => l.includes('OK'))) {
      throw new Error(
        `Unexpected ClamAV response for ${filename || 'buffer'}: ${response || '<empty response>'}`,
      )
    }

    const scannedAt = new Date()
    const result: ScanResult = {
      isInfected,
      viruses,
      scannedAt,
    }

    // Include quarantine details if infected
    if (isInfected) {
      result.quarantineInfo = {
        viruses,
        filename,
        scannedAt,
      }
    }

    return result
  }

  /**
   * Get service status
   */
  getStatus(): {
    enabled: boolean
    failClosed: boolean
    healthy: boolean
    host: string
    port: number
  } {
    return {
      enabled: this.enabled,
      failClosed: this.failClosed,
      healthy: this.isHealthy,
      host: this.host,
      port: this.port,
    }
  }
}
