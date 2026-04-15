import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { sendSimpleNotify } from '@/redux/thunks/notify.thunks'
import { showSuccessToast, showErrorToast } from '@/redux/utils/toastUtils'
import '@/scss/send.scss'

export const Route = createFileRoute('/send')({
  component: SendNotification,
})

function SendNotification() {
  const dispatch = useAppDispatch()
  const { loading, error } = useAppSelector((state) => state.notify)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [toEmail, setToEmail] = useState('')

  // Show error toast when error occurs
  useEffect(() => {
    if (error) {
      showErrorToast(error)
    }
  }, [error])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!toEmail || !subject || !body) {
      showErrorToast('Please fill in all fields')
      return
    }

    try {
      console.log('Sending notification request...', {
        to: toEmail,
        subject,
        body,
      })

      const result = await dispatch(
        sendSimpleNotify({
          email: {
            to: [toEmail],
            subject,
            body,
          },
        }),
      ).unwrap()

      console.log('Success response:', result)

      if (result) {
        showSuccessToast('Notification sent successfully!')
        setSubject('')
        setBody('')
        setToEmail('')
      }
    } catch (err) {
      console.error('Error sending notification:', err)
      showErrorToast(err instanceof Error ? err.message : 'Failed to send notification')
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Send Notification</h1>

        <form onSubmit={handleSubmit} className="form">
          <div className="formGroup">
            <label htmlFor="toEmail">To Email:</label>
            <input
              id="toEmail"
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="recipient@example.com"
              disabled={loading}
              required
            />
          </div>

          <div className="formGroup">
            <label htmlFor="subject">Subject:</label>
            <input
              id="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              disabled={loading}
              required
            />
          </div>

          <div className="formGroup">
            <label htmlFor="body">Message Body:</label>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Enter your message"
              rows={6}
              disabled={loading}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`submitBtn ${loading ? 'loading' : ''}`}
          >
            {loading ? 'Sending...' : 'Send Notification'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default SendNotification
