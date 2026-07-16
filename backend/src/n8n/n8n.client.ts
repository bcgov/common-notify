import { Injectable, Logger } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'

/**
 * N8N API Client
 *
 * Integrates with BC Gov's centralized n8n instance at https://n8n.developer.gov.bc.ca
 * to trigger workflow automations for notifications.
 *
 * Common use cases:
 * - Trigger MS Teams notifications via n8n workflows
 * - Execute complex multi-step notification workflows
 * - Integrate with other BC Gov services through n8n
 *
 * @see https://docs.n8n.io/api/
 */
@Injectable()
export class N8nClient {
  private readonly logger = new Logger(N8nClient.name)
  private readonly httpClient: AxiosInstance

  constructor() {
    const apiUrl = process.env.N8N_API_URL || 'https://n8n.developer.gov.bc.ca/api/v1'
    const apiToken = process.env.N8N_API_TOKEN

    if (!apiToken) {
      this.logger.warn('N8N_API_TOKEN not configured - n8n integration disabled')
    }

    this.httpClient = axios.create({
      baseURL: apiUrl,
      headers: {
        'X-N8N-API-KEY': apiToken,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    })
  }

  /**
   * Trigger an n8n workflow by its ID
   *
   * @param workflowId The n8n workflow ID (e.g., '89DEIdsDQJkntJo5')
   * @param payload Data to pass to the workflow
   * @returns The workflow execution result
   *
   * @example
   * ```typescript
   * await n8nClient.triggerWorkflow('89DEIdsDQJkntJo5', {
   *   notificationId: '123',
   *   status: 'completed',
   *   channel: 'email'
   * })
   * ```
   */
  async triggerWorkflow(workflowId: string, payload: Record<string, any>): Promise<any> {
    try {
      this.logger.log(`Triggering n8n workflow ${workflowId}`)

      const response = await this.httpClient.post(`/workflows/${workflowId}/execute`, payload)

      this.logger.log(`Workflow ${workflowId} triggered successfully`)
      return response.data
    } catch (error) {
      this.logger.error(`Failed to trigger workflow ${workflowId}:`, error.message)
      throw error
    }
  }

  /**
   * Execute a webhook-based workflow
   *
   * @param webhookPath The webhook path (e.g., '/webhook/notify-teams')
   * @param payload Data to send to the webhook
   * @returns The webhook response
   *
   * @example
   * ```typescript
   * await n8nClient.executeWebhook('/webhook/notify-teams', {
   *   title: 'Notification Status',
   *   message: 'Email sent successfully'
   * })
   * ```
   */
  async executeWebhook(webhookPath: string, payload: Record<string, any>): Promise<any> {
    try {
      this.logger.log(`Executing n8n webhook: ${webhookPath}`)

      // Webhooks use the main n8n URL, not the API URL
      const webhookUrl = process.env.N8N_API_URL?.replace('/api/v1', '') || 'https://n8n.developer.gov.bc.ca'

      const response = await axios.post(`${webhookUrl}${webhookPath}`, payload, {
        timeout: 30000,
      })

      this.logger.log(`Webhook ${webhookPath} executed successfully`)
      return response.data
    } catch (error) {
      this.logger.error(`Failed to execute webhook ${webhookPath}:`, error.message)
      throw error
    }
  }

  /**
   * Get workflow details
   *
   * @param workflowId The workflow ID
   * @returns Workflow details including name, active status, nodes, etc.
   */
  async getWorkflow(workflowId: string): Promise<any> {
    try {
      const response = await this.httpClient.get(`/workflows/${workflowId}`)
      return response.data
    } catch (error) {
      this.logger.error(`Failed to get workflow ${workflowId}:`, error.message)
      throw error
    }
  }

  /**
   * List all workflows
   *
   * @returns List of all workflows accessible with the API key
   */
  async listWorkflows(): Promise<any> {
    try {
      const response = await this.httpClient.get('/workflows')
      return response.data
    } catch (error) {
      this.logger.error('Failed to list workflows:', error.message)
      throw error
    }
  }
}
