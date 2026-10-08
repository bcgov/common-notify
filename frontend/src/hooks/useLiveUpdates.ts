import { useEffect, useRef, useState } from 'react'

export type LiveStatus = 'off' | 'connecting' | 'live' | 'reconnecting' | 'unavailable'

interface StreamHandlers {
  onOpen: () => void
  onChange: () => void
  onError: (fatal: boolean) => void
}

/**
 * Keep a server-sent change stream open while `enabled`, calling `onChange` for each signal.
 * `connect` opens the stream and returns its AbortController; it must be stable.
 */
export function useLiveUpdates(
  connect: (handlers: StreamHandlers) => AbortController,
  enabled: boolean,
  onChange: () => void,
): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('connecting')
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!enabled) return
    let opened = false
    const controller = connect({
      onOpen: () => {
        setStatus('live')
        // Changes made while the stream was down were never signalled; catch up on reconnect.
        if (opened) onChangeRef.current()
        opened = true
      },
      onChange: () => {
        onChangeRef.current()
      },
      onError: (fatal) => setStatus(fatal ? 'unavailable' : 'reconnecting'),
    })
    return () => {
      controller.abort()
      setStatus('connecting')
    }
  }, [connect, enabled])

  return enabled ? status : 'off'
}
