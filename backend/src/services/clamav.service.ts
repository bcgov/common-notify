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
  private isHealthy = false

  constructor(private configService: ConfigService) {
    this.host = this.configService.get('CLAMAV_HOST', 'localhost')
    this.port = parseInt(this.configService.get('CLAMAV_PORT', '3310'), 10)
    this.timeout = parseInt(this.configService.get('CLAMAV_TIMEOUT', '30000'), 10)
    this.enabled = this.configService.get('CLAMAV_ENABLED', true) !== 'false'
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
      this.logger.debug('ClamAV scanning disabled, skipping scan')
      return {
        isInfected: false,
        viruses: [],
        scannedAt: new Date(),
      }
    }

    if (!this.isHealthy) {
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
          // Send INSTREAM command followed by buffer
          socket.write(`INSTREAM\n`)
          socket.write(buffer)
          socket.write('\0')
        },
      )

      let response = ''

      socket.on('data', (data) => {
        response += data.toString()
      })

      socket.on('end', () => {
        try {
          const result = this.parseResponse(response, filename)
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })

      socket.on('error', (error) => {
        socket.destroy()
        this.logger.error(
          `ClamAV scan error for ${filename || 'buffer'}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
        reject(error)
      })

      socket.on('timeout', () => {
        socket.destroy()
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
      this.logger.debug(`Unexpected ClamAV response for ${filename || 'buffer'}: ${response}`)
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
    healthy: boolean
    host: string
    port: number
  } {
    return {
      enabled: this.enabled,
      healthy: this.isHealthy,
      host: this.host,
      port: this.port,
    }
  }
}
