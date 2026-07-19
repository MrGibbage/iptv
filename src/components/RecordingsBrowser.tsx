import { useEffect, useMemo, useState } from 'react'
import type { LiveStream } from '../../electron/xtream'
import type { RecorderConfig } from '../../electron/recorder-settings-store'
import type { Recording, ProjectedOccurrence, RecurringRule, RecorderConnection } from '../../electron/recorder'
import { isProjected } from '../../electron/recorder'

interface RecordingsBrowserProps {
  recorderConfig: RecorderConfig | null
  channels: LiveStream[]
  onPlay: (recording: Recording) => void
  onOpenSettings: () => void
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function fmtDaysOfWeek(mask: number): string {
  if (mask === 127) return 'Every day'
  const days = DAY_LABELS.filter((_, i) => (mask & (1 << i)) !== 0)
  return days.length > 0 ? days.join(', ') : 'No days set'
}

// startMinuteOfDay is always UTC (enforced server-side, not just documented —
// see recorder.ts's own comment) — labelled explicitly rather than implying
// it's the viewer's local time.
function fmtMinuteOfDay(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10)
}

function channelLabel(channelId: string, channels: LiveStream[]): { name: string; icon: string } {
  const stream = channels.find((c) => String(c.streamId) === channelId)
  return { name: stream?.name ?? `Channel ${channelId}`, icon: stream?.streamIcon ?? '' }
}

function RecordingsBrowser({ recorderConfig, channels, onPlay, onOpenSettings }: RecordingsBrowserProps) {
  const [recordings, setRecordings] = useState<Array<Recording | ProjectedOccurrence>>([])
  const [rules, setRules] = useState<RecurringRule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<{ text: string; isError: boolean } | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const ready = !!(recorderConfig?.baseUrl && recorderConfig?.apiKey && recorderConfig?.providerId)
  const conn: RecorderConnection | null = ready ? { baseUrl: recorderConfig!.baseUrl, apiKey: recorderConfig!.apiKey } : null
  const providerId = recorderConfig?.providerId ?? null

  useEffect(() => {
    if (!conn || providerId == null) return
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      window.recorder.listRecordings(conn, { providerId, includeProjected: true }),
      window.recorder.listRecurringRules(conn, { providerId, cancelled: false }),
    ])
      .then(([rec, rul]) => {
        if (cancelled) return
        setRecordings(rec)
        setRules(rul)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn?.baseUrl, conn?.apiKey, providerId, refreshTick])

  const refresh = () => setRefreshTick((n) => n + 1)

  const recordingNow = useMemo(
    () => recordings.filter((r): r is Recording => !isProjected(r) && r.status === 'recording'),
    [recordings],
  )
  const scheduled = useMemo(
    () =>
      recordings
        .filter((r) => r.status === 'scheduled')
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [recordings],
  )
  const completed = useMemo(
    () =>
      recordings
        .filter((r): r is Recording => !isProjected(r) && r.status === 'completed')
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
    [recordings],
  )
  const failed = useMemo(
    () => recordings.filter((r): r is Recording => !isProjected(r) && r.status === 'failed'),
    [recordings],
  )

  const runAction = async (label: string, action: () => Promise<{ ok: boolean; error?: { message: string } }>) => {
    setActionMessage(null)
    const result = await action()
    if (result.ok) {
      setActionMessage({ text: `${label} succeeded.`, isError: false })
      refresh()
    } else {
      setActionMessage({ text: result.error?.message ?? `${label} failed.`, isError: true })
    }
  }

  const cancelOne = (id: number) => runAction('Cancel', () => window.recorder.cancelRecording(conn!, id))
  const cancelSeries = (ruleId: number) =>
    runAction('Cancel series', () => window.recorder.cancelRecurringRule(conn!, ruleId))
  const skipOne = (ruleId: number, startTime: string) =>
    runAction('Skip', () => window.recorder.skipOccurrence(conn!, ruleId, dateOnly(startTime)))

  if (!ready) {
    return (
      <div className="recordings-panel">
        <div className="home-empty">
          Set up the recording service in Settings to schedule and manage DVR recordings.
          <div style={{ marginTop: 10 }}>
            <button className="btn-accent" onClick={onOpenSettings}>
              Open Settings
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="recordings-panel">
      <div className="recordings-toolbar">
        <h2 style={{ margin: 0 }}>Recordings</h2>
        <button onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {actionMessage && (
        <p className={`settings-message ${actionMessage.isError ? 'err' : 'ok'}`}>{actionMessage.text}</p>
      )}
      {error && <p className="channel-hint channel-error">Failed to load recordings: {error}</p>}

      {recordingNow.length > 0 && (
        <section className="recordings-section">
          <h3>Recording Now</h3>
          {recordingNow.map((row) => {
            const ch = channelLabel(row.channelId, channels)
            return (
              <div key={row.id} className="recordings-row">
                <span className="recordings-row-main">
                  <strong>{ch.name}</strong>
                  <span className="recordings-row-time">
                    {fmtDateTime(row.startTime)} – {fmtDateTime(row.endTime)}
                  </span>
                </span>
                <span className="recordings-badge recordings-badge-live">RECORDING</span>
                <button onClick={() => cancelOne(row.id)}>Stop</button>
              </div>
            )
          })}
        </section>
      )}

      <section className="recordings-section">
        <h3>Scheduled</h3>
        {scheduled.length === 0 ? (
          <p className="channel-hint">Nothing scheduled.</p>
        ) : (
          scheduled.map((row) => {
            const ch = channelLabel(row.channelId, channels)
            const projected = isProjected(row)
            return (
              <div key={projected ? `${row.recurringRuleId}:${row.startTime}` : `rec:${row.id}`} className="recordings-row">
                <span className="recordings-row-main">
                  <strong>{ch.name}</strong>
                  <span className="recordings-row-time">
                    {fmtDateTime(row.startTime)} – {fmtDateTime(row.endTime)}
                  </span>
                </span>
                {row.recurringRuleId != null && <span className="recordings-badge">recurring</span>}
                {projected && <span className="recordings-badge">upcoming</span>}
                {projected ? (
                  <button onClick={() => skipOne(row.recurringRuleId, row.startTime)}>Skip</button>
                ) : (
                  <button onClick={() => cancelOne(row.id)}>Cancel</button>
                )}
              </div>
            )
          })
        )}
      </section>

      {rules.length > 0 && (
        <section className="recordings-section">
          <h3>Recurring Rules</h3>
          {rules.map((rule) => {
            const ch = channelLabel(rule.channelId, channels)
            return (
              <div key={rule.id} className="recordings-row">
                <span className="recordings-row-main">
                  <strong>{ch.name}</strong>
                  <span className="recordings-row-time">
                    {fmtDaysOfWeek(rule.daysOfWeek)} at {fmtMinuteOfDay(rule.startMinuteOfDay)} UTC for{' '}
                    {rule.durationMinutes} min
                    {rule.maxOccurrences != null ? ` · up to ${rule.maxOccurrences} occurrences` : ''}
                    {rule.endDate ? ` · until ${new Date(rule.endDate).toLocaleDateString()}` : ''}
                  </span>
                </span>
                <button onClick={() => cancelSeries(rule.id)}>Cancel Series</button>
              </div>
            )
          })}
        </section>
      )}

      <section className="recordings-section">
        <h3>Completed</h3>
        {completed.length === 0 ? (
          <p className="channel-hint">No completed recordings yet.</p>
        ) : (
          completed.map((row) => {
            const ch = channelLabel(row.channelId, channels)
            return (
              <div key={row.id} className="recordings-row">
                <span className="recordings-row-main">
                  <strong>{ch.name}</strong>
                  <span className="recordings-row-time">
                    {fmtDateTime(row.startTime)} – {fmtDateTime(row.endTime)}
                  </span>
                </span>
                <button className="btn-accent" onClick={() => onPlay(row)}>
                  ▶ Play
                </button>
              </div>
            )
          })
        )}
      </section>

      {failed.length > 0 && (
        <section className="recordings-section">
          <h3>Failed</h3>
          {failed.map((row) => {
            const ch = channelLabel(row.channelId, channels)
            return (
              <div key={row.id} className="recordings-row">
                <span className="recordings-row-main">
                  <strong>{ch.name}</strong>
                  <span className="recordings-row-time">
                    {fmtDateTime(row.startTime)} – {fmtDateTime(row.endTime)}
                  </span>
                  {row.failureReason && <span className="recordings-row-error">{row.failureReason}</span>}
                </span>
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}

export default RecordingsBrowser
