import { useState, type CSSProperties } from 'react'

function fmt(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) secs = 0
  const s = Math.floor(secs % 60)
  const m = Math.floor((secs / 60) % 60)
  const h = Math.floor(secs / 3600)
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

interface MediaScrubberProps {
  positionSecs: number
  durationSecs: number
  onSeek: (secs: number) => void
}

// Seek bar for VOD/series playback. While dragging, the thumb follows the
// pointer (dragValue) and incoming time-pos updates are ignored for display;
// the actual seek fires once on release (onChange), avoiding a flood of seeks
// mid-drag.
function MediaScrubber({ positionSecs, durationSecs, onSeek }: MediaScrubberProps) {
  const [dragValue, setDragValue] = useState<number | null>(null)

  if (!durationSecs || durationSecs <= 0) return null

  const shown = Math.min(dragValue ?? positionSecs, durationSecs)
  const pct = (shown / durationSecs) * 100

  return (
    <div className="scrubber">
      <span className="scrubber-time">{fmt(shown)}</span>
      <input
        className="scrubber-range"
        type="range"
        min={0}
        max={durationSecs}
        step={1}
        value={shown}
        style={{ '--scrubber-pct': `${pct}%` } as CSSProperties}
        onInput={(e) => setDragValue(Number(e.currentTarget.value))}
        onChange={(e) => {
          onSeek(Number(e.currentTarget.value))
          setDragValue(null)
        }}
      />
      <span className="scrubber-time">{fmt(durationSecs)}</span>
    </div>
  )
}

export default MediaScrubber
