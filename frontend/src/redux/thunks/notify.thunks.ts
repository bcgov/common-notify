import { createAsyncThunk } from '@reduxjs/toolkit'
import { notifyApi } from '@/api/notify.api'
import type { RootState } from '../store'

/**
 * Send a simple notification via email or SMS
 * POST /api/v1/notifysimple
 */
export const sendSimpleNotify = createAsyncThunk<
  any,
  {
    email?: { to: string[]; subject: string; body: string }
    sms?: { to: string[]; body: string }
  },
  {
    state: RootState
    rejectValue: string
  }
>('notify/sendSimpleNotify', async (payload, { rejectWithValue }) => {
  try {
    const response = await notifyApi.sendSimpleNotify(payload)
    return response
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to send notification')
  }
})

/**
 * Get the status of a notification by ID
 * GET /api/v1/notify/status/:notifyId
 */
export const getNotificationStatus = createAsyncThunk<
  any,
  string, // notifyId
  {
    state: RootState
    rejectValue: string
  }
>('notify/getNotificationStatus', async (notifyId, { rejectWithValue }) => {
  try {
    const response = await notifyApi.getNotificationStatus(notifyId)
    return response
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : 'Failed to fetch notification status',
    )
  }
})

/**
 * List notifications with optional filters
 * GET /api/v1/notify
 */
export const listNotifications = createAsyncThunk<
  any,
  | {
      limit?: string
      cursor?: string
      status?: string
    }
  | undefined,
  {
    state: RootState
    rejectValue: string
  }
>('notify/listNotifications', async (params, { rejectWithValue }) => {
  try {
    const response = await notifyApi.listNotifications(params)
    return response
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch notifications')
  }
})
