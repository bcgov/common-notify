import type { Page } from '@playwright/test'

export async function dashboard_page(page: Page): Promise<void> {
  // Stub: Navigate to the application
  await page.goto('/')
}
