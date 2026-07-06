import { useEffect, useRef } from 'react'

// Pure video surface: keeps the native mpv child window glued to this
// placeholder's geometry. Loading streams is App's job (via window.playback,
// which routes through the main-process watchdog).
function Player() {
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

  return <div ref={placeholderRef} style={{ width: '100%', height: '100%', background: '#000' }} />
}

export default Player
