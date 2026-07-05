import { useEffect, useRef } from 'react'

interface PlayerProps {
  streamUrl: string | null
}

function Player({ streamUrl }: PlayerProps) {
  const placeholderRef = useRef<HTMLDivElement>(null)
  const attachedRef = useRef(false)

  useEffect(() => {
    const el = placeholderRef.current
    if (!el) return

    const syncGeometry = () => {
      const rect = el.getBoundingClientRect()
      if (!attachedRef.current) {
        attachedRef.current = true
        window.mpv.attach(rect.left, rect.top, rect.width, rect.height)
      } else {
        window.mpv.resize(rect.left, rect.top, rect.width, rect.height)
      }
    }

    syncGeometry()
    const observer = new ResizeObserver(syncGeometry)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (streamUrl) {
      window.mpv.command('loadfile', streamUrl)
    }
  }, [streamUrl])

  return <div ref={placeholderRef} style={{ width: '100%', height: '100%', background: '#000' }} />
}

export default Player
