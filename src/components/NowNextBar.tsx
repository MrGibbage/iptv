import { useEffect, useState } from 'react'
import type { LiveStream } from '../../electron/xtream'
import type { EpgProgram } from '../../electron/epg-db'
import type { RecorderConfig } from '../../electron/recorder-settings-store'
import RecordDialog from './RecordDialog'
import './epg.css'

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface NowNextBarProps {
  stream: LiveStream | null
  recorderConfig: RecorderConfig | null
  onOpenSettings: () => void
}

function NowNextBar({ stream, recorderConfig, onOpenSettings }: NowNextBarProps) {
  const [nowProg, setNowProg] = useState<EpgProgram | null>(null)
  const [nextProg, setNextProg] = useState<EpgProgram | null>(null)
  const [recordTarget, setRecordTarget] = useState<EpgProgram | null>(null)

  useEffect(() => {
    setNowProg(null)
    setNextProg(null)
    const epgId = stream?.epgChannelId
    if (!epgId) return

    let disposed = false
    const load = () => {
      const now = Date.now()
      window.epg.getPrograms([epgId], now, now + 12 * 60 * 60 * 1000).then((rows) => {
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
          <button className="app-icon-btn" title="Record this program" onClick={() => setRecordTarget(nowProg)}>
            ⏺
          </button>
        </span>
      ) : (
        <span className="nn-slot nn-label">No guide data</span>
      )}
      {nextProg && (
        <span className="nn-slot">
          <span className="nn-label">NEXT</span>
          {nextProg.title} ({fmtTime(nextProg.startMs)})
          <button className="app-icon-btn" title="Record this program" onClick={() => setRecordTarget(nextProg)}>
            ⏺
          </button>
        </span>
      )}

      {recordTarget && (
        <RecordDialog
          recorderConfig={recorderConfig}
          channelName={stream.name}
          channelId={String(stream.streamId)}
          initialStart={new Date(recordTarget.startMs)}
          initialEnd={new Date(recordTarget.stopMs)}
          onClose={() => setRecordTarget(null)}
          onOpenSettings={onOpenSettings}
        />
      )}
    </div>
  )
}

export default NowNextBar
