import { useEffect, useState } from 'react'

interface StatRow {
  label: string
  value: string
}

function formatBitrate(raw: string | null): string {
  if (!raw) return '—'
  const bits = Number(raw)
  if (!Number.isFinite(bits) || bits <= 0) return '—'
  return bits >= 1_000_000 ? `${(bits / 1_000_000).toFixed(2)} Mbps` : `${(bits / 1000).toFixed(0)} kbps`
}

// mpv's getRawProperty is synchronous and blocks the main process while the
// core is busy (see electron/playback.ts) — fetched only here, on demand,
// never on a timer.
async function fetchStats(): Promise<StatRow[]> {
  const [videoCodec, width, height, videoBitrate, hwdec, fps, audioCodec, audioBitrate] =
    await Promise.all([
      window.mpv.getProperty('video-codec'),
      window.mpv.getProperty('width'),
      window.mpv.getProperty('height'),
      window.mpv.getProperty('video-bitrate'),
      window.mpv.getProperty('hwdec-current'),
      window.mpv.getProperty('estimated-vf-fps'),
      window.mpv.getProperty('audio-codec-name'),
      window.mpv.getProperty('audio-bitrate'),
    ])

  return [
    { label: 'Video codec', value: videoCodec ?? '—' },
    { label: 'Resolution', value: width && height ? `${width}×${height}` : '—' },
    { label: 'Video bitrate', value: formatBitrate(videoBitrate) },
    { label: 'FPS', value: fps ? Number(fps).toFixed(2) : '—' },
    { label: 'HW decode', value: hwdec && hwdec !== 'no' ? hwdec : 'off' },
    { label: 'Audio codec', value: audioCodec ?? '—' },
    { label: 'Audio bitrate', value: formatBitrate(audioBitrate) },
  ]
}

interface PlayerStatsProps {
  // Any change (including going idle) drops stale stats. Panel visibility is
  // controlled by the parent so it can render the channel #/URL under the
  // title (left) in sync with this mpv-properties panel (right).
  streamKey: number | null
  open: boolean
  onToggle: () => void
}

function PlayerStats({ streamKey, open, onToggle }: PlayerStatsProps) {
  const [stats, setStats] = useState<StatRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  // Drop stale stats when the channel changes.
  useEffect(() => setStats(null), [streamKey])

  // Fetch when the panel is open (and re-fetch if the channel changes while
  // it's still open).
  useEffect(() => {
    if (open) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, streamKey])

  const refresh = () => {
    setLoading(true)
    fetchStats()
      .then(setStats)
      .finally(() => setLoading(false))
  }

  return (
    <>
      <button
        className="app-icon-btn"
        title="Playback info (stats for nerds)"
        disabled={streamKey == null}
        onClick={onToggle}
      >
        ⓘ
      </button>
      {open && (
        <div className="stats-panel">
          <div className="stats-panel-header">
            <span>Stats for nerds</span>
            <button onClick={refresh} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {stats ? (
            <dl className="stats-panel-list">
              {stats.map((row) => (
                <div key={row.label} className="stats-panel-row">
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="stats-panel-empty">Loading…</p>
          )}
        </div>
      )}
    </>
  )
}

export default PlayerStats
