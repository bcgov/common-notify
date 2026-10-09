import { segmentSms } from '@/utils/smsSegments'

export default function EventsSmsEstimate({ body }: { body: string }) {
  const { characters, segments } = segmentSms(body)
  return (
    <p className="events__help" aria-live="polite">
      {characters} characters
      <br />
      Estimated parts: {segments}
    </p>
  )
}
