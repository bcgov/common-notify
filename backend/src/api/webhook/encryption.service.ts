import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm'
  private readonly key: Buffer

  constructor(private configService: ConfigService) {
    const keyFromEnv = this.configService.get<string>('encryption.key')

    if (!keyFromEnv) {
      throw new Error('WEBHOOK_ENCRYPTION_KEY is not defined in environment variables')
    }

    // Convert base64 key to Buffer (32 bytes for AES-256)
    this.key = Buffer.from(keyFromEnv, 'base64')

    if (this.key.length !== 32) {
      throw new Error('WEBHOOK_ENCRYPTION_KEY must be 32 bytes (64 characters in base64)')
    }
  }

  /**
   * Encrypts plaintext using AES-256-GCM with a randomly generated IV.
   * Returns a Base64-encoded string containing the IV, authentication tag, and encrypted data.
   */
  encrypt(plaintext: string): string {
    // Generate random IV (12 bytes is recommended for GCM)
    const iv = randomBytes(12)

    const cipher = createCipheriv(this.algorithm, this.key, iv)

    // Encrypt
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

    // Get authentication tag
    const authTag = cipher.getAuthTag()

    // Combine IV + encrypted data + auth tag
    // Format: IV (12) + AuthTag (16) + Ciphertext
    const result = Buffer.concat([iv, authTag, encrypted])

    return result.toString('base64')
  }

  /**
   * Decrypts a Base64-encoded AES-256-GCM payload containing the IV, authentication tag, and ciphertext.
   * Verifies the authentication tag before returning the original plaintext.
   */
  decrypt(ciphertext: string): string {
    const data = Buffer.from(ciphertext, 'base64')

    // Extract components
    const iv = data.subarray(0, 12)
    const authTag = data.subarray(12, 28)
    const encrypted = data.subarray(28)

    const decipher = createDecipheriv(this.algorithm, this.key, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])

    return decrypted.toString('utf8')
  }
}
