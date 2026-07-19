import { useState } from 'react'
import type { RecorderConfig } from '../../electron/recorder-settings-store'

interface RecordDialogProps {
  recorderConfig: RecorderConfig | null
  channelName: string
  /** The recorder's channelId is this app's Xtream stream_id, as a string. */
  channelId: string
  initialStart: Date
  initialEnd: Date
  onClose: () => void
  onOpenSettings: () => void
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function toLocalDatetimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function dayBit(date: Date): number {
  // JS Date.getDay(): 0=Sunday..6=Saturday. Recorder bitmask: bit 0=Monday..bit 6=Sunday.
  return (date.getDay() + 6) % 7
}

function RecordDialog({ recorderConfig, channelName, channelId, initialStart, initialEnd, onClose, onOpenSettings }: RecordDialogProps) {
  const [mode, setMode] = useState<'one-off' | 'recurring'>('one-off')
  const [startInput, setStartInput] = useState(() => toLocalDatetimeInput(initialStart))
  const [endInput, setEndInput] = useState(() => toLocalDatetimeInput(initialEnd))
  const [days, setDays] = useState<Set<number>>(() => new Set([dayBit(initialStart)]))
  const [startTimeInput, setStartTimeInput] = useState(() => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(initialStart.getHours())}:${pad(initialStart.getMinutes())}`
  })
  const [durationMinutes, setDurationMinutes] = useState(() =>
    Math.max(1, Math.round((initialEnd.getTime() - initialStart.getTime()) / 60_000)),
  )
  const [endDateInput, setEndDateInput] = useState('')
  const [maxOccurrencesInput, setMaxOccurrencesInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null)

  const ready = !!(recorderConfig?.baseUrl && recorderConfig?.apiKey && recorderConfig?.providerId)

  const toggleDay = (bit: number) => {
    const next = new Set(days)
    if (next.has(bit)) next.delete(bit)
    else next.add(bit)
    setDays(next)
  }

  const daysMask = () => Array.from(days).reduce((mask, bit) => mask | (1 << bit), 0)

  const handleSubmit = async () => {
    if (!ready) return
    const conn = { baseUrl: recorderConfig!.baseUrl, apiKey: recorderConfig!.apiKey }
    const providerId = recorderConfig!.providerId!
    setSubmitting(true)
    setMessage(null)
    try {
      if (mode === 'one-off') {
        const start = new Date(startInput)
        const end = new Date(endInput)
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
          setMessage({ text: 'End time must be after start time.', isError: true })
          return
        }
        const result = await window.recorder.createOneOffRecording(conn, {
          providerId,
          channelId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        })
        if (result.ok) {
          setMessage({ text: 'Recording scheduled.', isError: false })
        } else {
          setMessage({ text: result.error.message, isError: true })
        }
      } else {
        const mask = daysMask()
        if (mask === 0) {
          setMessage({ text: 'Pick at least one day.', isError: true })
          return
        }
        const [h, m] = startTimeInput.split(':').map(Number)
        if (Number.isNaN(h) || Number.isNaN(m)) {
          setMessage({ text: 'Enter a valid start time.', isError: true })
          return
        }
        const maxOccurrences = maxOccurrencesInput ? Number(maxOccurrencesInput) : undefined
        const result = await window.recorder.createRecurringRecording(conn, {
          providerId,
          channelId,
          recurrence: {
            daysOfWeek: mask,
            startMinuteOfDay: h * 60 + m,
            durationMinutes,
            endDate: endDateInput ? new Date(endDateInput).toISOString() : undefined,
            maxOccurrences,
          },
        })
        if (result.ok) {
          setMessage({ text: 'Recurring recording scheduled.', isError: false })
        } else {
          setMessage({ text: result.error.message, isError: true })
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="record-dialog-backdrop" onClick={onClose}>
      <div className="record-dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="record-dialog-header">
          <h2>Record — {channelName}</h2>
          <button className="app-icon-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {!ready ? (
          <>
            <p className="settings-sub">Set up the recording service in Settings first.</p>
            <div className="settings-actions">
              <button className="btn-accent" onClick={onOpenSettings}>
                Open Settings
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="vod-scope-toggle" style={{ marginBottom: 14 }}>
              <button
                className={`vod-scope-btn${mode === 'one-off' ? ' active' : ''}`}
                onClick={() => setMode('one-off')}
              >
                One-off
              </button>
              <button
                className={`vod-scope-btn${mode === 'recurring' ? ' active' : ''}`}
                onClick={() => setMode('recurring')}
              >
                Recurring
              </button>
            </div>

            {mode === 'one-off' ? (
              <>
                <label className="settings-field">
                  <span className="settings-field-label">Start</span>
                  <input type="datetime-local" value={startInput} onChange={(e) => setStartInput(e.target.value)} />
                </label>
                <label className="settings-field">
                  <span className="settings-field-label">End</span>
                  <input type="datetime-local" value={endInput} onChange={(e) => setEndInput(e.target.value)} />
                </label>
              </>
            ) : (
              <>
                <label className="settings-field">
                  <span className="settings-field-label">Days</span>
                  <div className="record-dialog-days">
                    {DAY_LABELS.map((label, bit) => (
                      <button
                        key={label}
                        type="button"
                        className={`vod-scope-btn${days.has(bit) ? ' active' : ''}`}
                        onClick={() => toggleDay(bit)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="settings-field">
                  <span className="settings-field-label">Start time (UTC)</span>
                  <input type="time" value={startTimeInput} onChange={(e) => setStartTimeInput(e.target.value)} />
                </label>
                <label className="settings-field">
                  <span className="settings-field-label">Duration (minutes)</span>
                  <input
                    type="number"
                    min={1}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Math.max(1, Number(e.target.value) || 1))}
                  />
                </label>
                <label className="settings-field">
                  <span className="settings-field-label">End date (optional)</span>
                  <input type="date" value={endDateInput} onChange={(e) => setEndDateInput(e.target.value)} />
                </label>
                <label className="settings-field">
                  <span className="settings-field-label">Max occurrences (optional)</span>
                  <input
                    type="number"
                    min={1}
                    value={maxOccurrencesInput}
                    onChange={(e) => setMaxOccurrencesInput(e.target.value)}
                  />
                </label>
              </>
            )}

            <div className="settings-actions">
              <button className="btn-accent" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Scheduling…' : 'Schedule Recording'}
              </button>
            </div>

            {message && (
              <p className={`settings-message ${message.isError ? 'err' : 'ok'}`}>{message.text}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default RecordDialog
