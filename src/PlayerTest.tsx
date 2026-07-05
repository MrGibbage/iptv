import { useEffect, useRef, useState } from 'react'

function PlayerTest() {
  const placeholderRef = useRef<HTMLDivElement>(null)
  const attachedRef = useRef(false)
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    const el = placeholderRef.current
    if (!el) return

    const syncGeometry = () => {
      const rect = el.getBoundingClientRect()
      if (!attachedRef.current) {
        attachedRef.current = true
        window.mpv.attach(rect.left, rect.top, rect.width, rect.height).then((ok) => {
          setStatus(ok ? 'attached' : 'attach failed')
          if (ok) playTestPattern()
        })
      } else {
        window.mpv.resize(rect.left, rect.top, rect.width, rect.height)
      }
    }

    syncGeometry()
    const observer = new ResizeObserver(syncGeometry)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const playTestPattern = () => {
    window.mpv.command('loadfile', 'av://lavfi:testsrc=size=1280x720:rate=30')
    setStatus('loading test pattern')
  }

  return (
    <div style={{ padding: 16 }}>
      <p>mpv status: {status}</p>
      <button onClick={playTestPattern}>Play test pattern</button>
      <div
        ref={placeholderRef}
        style={{ width: '100%', height: 480, marginTop: 12, background: '#000' }}
      />
    </div>
  )
}

export default PlayerTest
