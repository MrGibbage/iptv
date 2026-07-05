import { useEffect, useState } from 'react'
import type { LiveStream } from '../../electron/xtream'
import type { EpgProgramme } from '../../electron/epg-db'
import './epg.css'

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface NowNextBarProps {
  stream: LiveStream | null
}

function NowNextBar({ stream }: NowNextBarProps) {
  const [nowProg, setNowProg] = useState<EpgProgramme | null>(null)
  const [nextProg, setNextProg] = useState<EpgProgramme | null>(null)

  useEffect(() => {
    setNowProg(null)
    setNextProg(null)
    const epgId = stream?.epgChannelId
    if (!epgId) return

    let disposed = false
    const load = () => {
      const now = Date.now()
      window.epg.getProgrammes([epgId], now, now + 12 * 60 * 60 * 1000).then((rows) => {
        if (disposed) return
        setNowProg(rows.find((p) => p.startMs <= now && p.stopMs > now) ?? null)
        setNextProg(rows.find((p) => p.startMs > now) ?? null)
      })
    }
    load()
    const timer = setInterval(load, 60_000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [stream])

  if (!stream) return null

  return (
    <div className="nownext-bar">
      <span className="nn-channel">{stream.name}</span>
      {nowProg ? (
        <span className="nn-slot">
          <span className="nn-label">NOW</span>
          {nowProg.title} ({fmtTime(nowProg.startMs)}–{fmtTime(nowProg.stopMs)})
        </span>
      ) : (
        <span className="nn-slot nn-label">No guide data</span>
      )}
      {nextProg && (
        <span className="nn-slot">
          <span className="nn-label">NEXT</span>
          {nextProg.title} ({fmtTime(nextProg.startMs)})
        </span>
      )}
    </div>
  )
}

export default NowNextBar
