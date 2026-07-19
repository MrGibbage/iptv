import { useState } from 'react'
import type { XtreamConfig, LiveStream } from '../../electron/xtream'
import type { Provider } from '../../electron/recorder'
import type { RecorderConfig } from '../../electron/recorder-settings-store'
import { THEMES, THEME_TOKENS, THEME_BY_ID } from '../themes'
import '../app.css'

export type StartupView = 'home' | 'live' | 'guide' | 'vod' | 'series' | 'recordings'

interface SettingsScreenProps {
  initialConfig: XtreamConfig | null
  onSaved: (config: XtreamConfig) => void
  onCancel?: () => void
  channels?: LiveStream[]
  hiddenIds?: Set<number>
  onUnhideChannel?: (streamId: number) => void
  softwareDecoding?: boolean
  onToggleSoftwareDecoding?: (enabled: boolean) => void
  theme?: string
  onSelectTheme?: (themeId: string) => void
  onApplyCustomTheme?: (tokens: Record<string, string>) => void
  startupView?: StartupView
  onStartupViewChange?: (view: StartupView) => void
  dismissedHomeItemCount?: number
  onResetDismissedHomeItems?: () => void
  initialRecorderConfig?: RecorderConfig | null
  onRecorderSaved?: (config: RecorderConfig) => void
}

// Loose match for auto-preselecting a recorder provider against this app's
// Xtream server URL — ignores protocol/trailing-slash/case differences, which
// are common (http vs https, a trailing "/") without implying anything else.
function normalizeForCompare(url: string): string {
  return url.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase()
}

function SettingsScreen({
  initialConfig,
  onSaved,
  onCancel,
  channels,
  hiddenIds,
  onUnhideChannel,
  softwareDecoding,
  onToggleSoftwareDecoding,
  theme,
  onSelectTheme,
  onApplyCustomTheme,
  startupView,
  onStartupViewChange,
  dismissedHomeItemCount,
  onResetDismissedHomeItems,
  initialRecorderConfig,
  onRecorderSaved,
}: SettingsScreenProps) {
  const [serverUrl, setServerUrl] = useState(initialConfig?.serverUrl ?? '')
  const [username, setUsername] = useState(initialConfig?.username ?? '')
  const [password, setPassword] = useState(initialConfig?.password ?? '')
  const [testing, setTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [testPassedFor, setTestPassedFor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Prefill the import box with the current (or default) theme's tokens so the
  // 16-key schema is visible to edit against.
  const schemaTheme = (theme && THEME_BY_ID.get(theme)) || THEME_BY_ID.get('default-dark')!
  const [themeJson, setThemeJson] = useState(() => JSON.stringify(schemaTheme.tokens, null, 2))
  const [themeJsonError, setThemeJsonError] = useState<string | null>(null)

  const handleApplyThemeJson = () => {
    try {
      const parsed = JSON.parse(themeJson)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Expected a JSON object of token → color.')
      }
      onApplyCustomTheme?.(parsed as Record<string, string>)
      setThemeJsonError(null)
    } catch (err) {
      setThemeJsonError(err instanceof Error ? err.message : 'Invalid JSON')
    }
  }

  const currentKey = JSON.stringify({ serverUrl, username, password })
  const canSave = testPassedFor === currentKey

  const handleTest = async () => {
    setTesting(true)
    setTestMessage(null)
    try {
      const result = await window.xtream.testConnection({ serverUrl, username, password })
      setTestMessage(result.message)
      setTestPassedFor(result.ok ? currentKey : null)
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const config: XtreamConfig = { serverUrl, username, password }
      await window.settings.save(config)
      onSaved(config)
    } finally {
      setSaving(false)
    }
  }

  const [recorderBaseUrl, setRecorderBaseUrl] = useState(initialRecorderConfig?.baseUrl ?? '')
  const [recorderApiKey, setRecorderApiKey] = useState(initialRecorderConfig?.apiKey ?? '')
  const [recorderTesting, setRecorderTesting] = useState(false)
  const [recorderTestMessage, setRecorderTestMessage] = useState<string | null>(null)
  const [recorderTestPassedFor, setRecorderTestPassedFor] = useState<string | null>(null)
  const [recorderProviders, setRecorderProviders] = useState<Provider[] | null>(null)
  const [recorderProvidersError, setRecorderProvidersError] = useState<string | null>(null)
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(
    initialRecorderConfig?.providerId ?? null,
  )
  const [recorderSaving, setRecorderSaving] = useState(false)
  const [recorderSaveMessage, setRecorderSaveMessage] = useState<string | null>(null)

  const currentRecorderKey = JSON.stringify({ baseUrl: recorderBaseUrl, apiKey: recorderApiKey })
  const recorderConnectionTested = recorderTestPassedFor === currentRecorderKey
  const canSaveRecorder = recorderConnectionTested && selectedProviderId != null

  const handleTestRecorder = async () => {
    setRecorderTesting(true)
    setRecorderTestMessage(null)
    setRecorderProviders(null)
    setRecorderProvidersError(null)
    try {
      const conn = { baseUrl: recorderBaseUrl, apiKey: recorderApiKey }
      const result = await window.recorder.testConnection(conn)
      setRecorderTestMessage(result.message)
      if (!result.ok) {
        setRecorderTestPassedFor(null)
        return
      }
      setRecorderTestPassedFor(currentRecorderKey)
      try {
        const providers = await window.recorder.listProviders(conn)
        setRecorderProviders(providers)
        // Auto-preselect only when the current selection isn't already one of
        // the returned providers — keeps a previously-saved, still-valid pick
        // from being silently overridden on every re-test.
        if (!providers.some((p) => p.id === selectedProviderId)) {
          const xtreamHost = initialConfig?.serverUrl ? normalizeForCompare(initialConfig.serverUrl) : null
          const match = xtreamHost ? providers.find((p) => normalizeForCompare(p.baseUrl) === xtreamHost) : undefined
          setSelectedProviderId(match?.id ?? (providers.length === 1 ? providers[0].id : null))
        }
      } catch (err) {
        setRecorderProvidersError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setRecorderTesting(false)
    }
  }

  const handleSaveRecorder = async () => {
    if (!canSaveRecorder || selectedProviderId == null) return
    setRecorderSaving(true)
    setRecorderSaveMessage(null)
    try {
      const config: RecorderConfig = { baseUrl: recorderBaseUrl, apiKey: recorderApiKey, providerId: selectedProviderId }
      await window.recorderSettings.save(config)
      onRecorderSaved?.(config)
      setRecorderSaveMessage('Recorder settings saved.')
    } finally {
      setRecorderSaving(false)
    }
  }

  return (
    <div className="settings-wrap">
      {onCancel && (
        <div className="settings-header">
          <button onClick={onCancel}>← Back</button>
          <span className="settings-header-title">Settings</span>
        </div>
      )}
      <div className="settings-card">
        <h2>Xtream Account</h2>
        <p className="settings-sub">
          A passing connection test is required before the account can be saved.
        </p>
        <label className="settings-field">
          <span className="settings-field-label">Server URL</span>
          <input
            type="text"
            placeholder="http://example.com:8080"
            value={serverUrl}
            onChange={(e) => {
              setServerUrl(e.target.value)
              setTestPassedFor(null)
            }}
          />
        </label>
        <label className="settings-field">
          <span className="settings-field-label">Username</span>
          <input
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              setTestPassedFor(null)
            }}
          />
        </label>
        <label className="settings-field">
          <span className="settings-field-label">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setTestPassedFor(null)
            }}
          />
        </label>

        <div className="settings-actions">
          <button onClick={handleTest} disabled={testing || !serverUrl || !username || !password}>
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
          <button className="btn-accent" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {testMessage && (
          <p className={`settings-message ${canSave ? 'ok' : 'err'}`}>{testMessage}</p>
        )}
      </div>

      {initialRecorderConfig !== undefined && (
        <div className="settings-card">
          <h2>Recording (iptv-recorder)</h2>
          <p className="settings-sub">
            Connects to a companion recording service for DVR. A passing connection test is
            required before these settings can be saved.
          </p>
          <label className="settings-field">
            <span className="settings-field-label">Recorder Server URL</span>
            <input
              type="text"
              placeholder="http://192.168.0.231:3300"
              value={recorderBaseUrl}
              onChange={(e) => {
                setRecorderBaseUrl(e.target.value)
                setRecorderTestPassedFor(null)
              }}
            />
          </label>
          <label className="settings-field">
            <span className="settings-field-label">API Key</span>
            <input
              type="password"
              value={recorderApiKey}
              onChange={(e) => {
                setRecorderApiKey(e.target.value)
                setRecorderTestPassedFor(null)
              }}
            />
          </label>

          <div className="settings-actions">
            <button
              onClick={handleTestRecorder}
              disabled={recorderTesting || !recorderBaseUrl || !recorderApiKey}
            >
              {recorderTesting ? 'Testing…' : 'Test Connection'}
            </button>
          </div>

          {recorderTestMessage && (
            <p className={`settings-message ${recorderConnectionTested ? 'ok' : 'err'}`}>
              {recorderTestMessage}
            </p>
          )}

          {recorderConnectionTested && (
            <label className="settings-field">
              <span className="settings-field-label">Provider</span>
              {recorderProvidersError ? (
                <p className="settings-message err">Failed to load providers: {recorderProvidersError}</p>
              ) : recorderProviders && recorderProviders.length === 0 ? (
                <p className="settings-sub" style={{ marginBottom: 0 }}>
                  No providers are configured on the recorder yet — add one there first.
                </p>
              ) : (
                <select
                  value={selectedProviderId ?? ''}
                  onChange={(e) => setSelectedProviderId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="" disabled>
                    Select the provider matching this account…
                  </option>
                  {recorderProviders?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.baseUrl}
                      {!p.enabled ? ' (disabled)' : ''}
                    </option>
                  ))}
                </select>
              )}
              <p className="settings-sub" style={{ marginBottom: 0 }}>
                Which of the recorder's own Xtream provider accounts corresponds to this app's
                account above — the recorder stores its own credentials separately and has no
                other way to know they're the same account.
              </p>
            </label>
          )}

          {onRecorderSaved && (
            <div className="settings-actions">
              <button className="btn-accent" onClick={handleSaveRecorder} disabled={!canSaveRecorder || recorderSaving}>
                {recorderSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}

          {recorderSaveMessage && <p className="settings-message ok">{recorderSaveMessage}</p>}
        </div>
      )}

      {startupView && onStartupViewChange && (
        <div className="settings-card">
          <h2>Startup</h2>
          <p className="settings-sub">Choose what you see when the app opens.</p>
          <label className="settings-field">
            <span className="settings-field-label">Start on</span>
            <select
              value={startupView}
              onChange={(event) => onStartupViewChange(event.target.value as StartupView)}
            >
              <option value="home">Home</option>
              <option value="live">Live TV</option>
              <option value="guide">Live TV Guide</option>
              <option value="vod">Movie List</option>
              <option value="series">TV Show List</option>
              <option value="recordings">Recordings</option>
            </select>
          </label>
          {!!dismissedHomeItemCount && onResetDismissedHomeItems && (
            <div className="settings-inline-action">
              <span className="settings-sub">
                {dismissedHomeItemCount} item{dismissedHomeItemCount === 1 ? '' : 's'} hidden from Home.
              </span>
              <button onClick={onResetDismissedHomeItems}>Restore hidden Home items</button>
            </div>
          )}
        </div>
      )}

      {onSelectTheme && (
        <div className="settings-card">
          <h2>Appearance</h2>
          <p className="settings-sub">
            Pick a color theme. <strong>System</strong> follows the Windows light/dark setting;
            any other choice overrides it.
          </p>
          <div className="theme-grid">
            <button
              className={`theme-swatch${!theme || theme === 'system' ? ' active' : ''}`}
              onClick={() => onSelectTheme('system')}
            >
              <span className="theme-dots theme-dots-system" aria-hidden="true">
                <span style={{ background: '#11141b' }} />
                <span style={{ background: '#f4f6fa' }} />
                <span style={{ background: '#5b8cff' }} />
                <span style={{ background: '#9aa3b8' }} />
              </span>
              <span className="theme-swatch-text">
                <span className="theme-swatch-name">System</span>
                <span className="theme-swatch-mode">follows Windows</span>
              </span>
            </button>
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={`theme-swatch${theme === t.id ? ' active' : ''}`}
                onClick={() => onSelectTheme(t.id)}
              >
                <span className="theme-dots" aria-hidden="true">
                  <span style={{ background: t.tokens['bg-1'] }} />
                  <span style={{ background: t.tokens['bg-3'] }} />
                  <span style={{ background: t.tokens['accent'] }} />
                  <span style={{ background: t.tokens['text'] }} />
                </span>
                <span className="theme-swatch-text">
                  <span className="theme-swatch-name">{t.name}</span>
                  <span className="theme-swatch-mode">{t.mode}</span>
                </span>
              </button>
            ))}
          </div>

          {onApplyCustomTheme && (
            <details className="shortcuts-details" style={{ marginTop: 18 }}>
              <summary>Paste a custom theme</summary>
              <p className="settings-sub" style={{ marginTop: 10 }}>
                Any palette (Gruvbox, a Terminal.sexy export…) as JSON of these {THEME_TOKENS.length}{' '}
                keys. Omitted keys keep the current value.
              </p>
              <textarea
                className="theme-json"
                spellCheck={false}
                value={themeJson}
                onChange={(e) => setThemeJson(e.target.value)}
              />
              <div className="theme-json-actions">
                <button className="btn-accent" onClick={handleApplyThemeJson}>
                  Apply theme
                </button>
                {themeJsonError && <span className="settings-message err">{themeJsonError}</span>}
                {theme === 'custom' && !themeJsonError && (
                  <span className="settings-message ok">Custom theme active.</span>
                )}
              </div>
            </details>
          )}
        </div>
      )}

      {onToggleSoftwareDecoding && (
        <div className="settings-card">
          <h2>Playback</h2>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={!!softwareDecoding}
              onChange={(e) => onToggleSoftwareDecoding(e.target.checked)}
            />
            <span>Maximum compatibility (software decoding)</span>
          </label>
          <p className="settings-sub" style={{ marginBottom: 0 }}>
            Decodes video on the CPU instead of the GPU. Turn this on if playback
            ever freezes the player and you have to restart it — some malformed
            streams can hang the GPU decoder, and software decoding sidesteps that
            entirely. Costs more CPU (fine for most channels; heaviest on 4K).
            Takes effect on the next channel you tune.
          </p>
        </div>
      )}

      <div className="settings-card">
        <h2>Diagnostics</h2>
        <p className="settings-sub">
          Logs contain app lifecycle, provider-operation results, guide refreshes, and
          playback failures. Provider URLs and credentials are automatically removed.
        </p>
        <div className="settings-actions">
          <button onClick={() => window.app.openLogsFolder()}>Open Logs Folder</button>
          <button
            onClick={async () => {
              await window.app.createDiagnosticReport()
            }}
          >
            Create Diagnostic Report
          </button>
        </div>
        <p className="settings-sub" style={{ marginBottom: 0 }}>
          A diagnostic report contains sanitized logs and basic app/system versions. It
          does not include account settings, provider addresses, usernames, or passwords.
        </p>
      </div>

      <div className="settings-card">
        <details className="shortcuts-details">
          <summary>Keyboard shortcuts</summary>
          <div className="shortcuts-list">
            <div className="shortcuts-row">
              <span className="shortcuts-keys">↑ / ↓</span>
              <span>Previous / next channel</span>
            </div>
            <div className="shortcuts-row">
              <span className="shortcuts-keys">Backspace</span>
              <span>Return to the previously tuned channel</span>
            </div>
            <div className="shortcuts-row">
              <span className="shortcuts-keys">F11</span>
              <span>Toggle full screen (hides all UI on the Live tab — only the video remains)</span>
            </div>
            <div className="shortcuts-row">
              <span className="shortcuts-keys">Esc</span>
              <span>Exit full screen</span>
            </div>
            <div className="shortcuts-row">
              <span className="shortcuts-keys">Tab</span>
              <span>Jump to the guide and back (while full screen)</span>
            </div>
          </div>
        </details>
      </div>

      {/* Only shown once channels have actually loaded (not on first run). No
          preview/playback here by design — reviewing a bad channel is the
          whole point, so nothing on this screen should be able to tune it. */}
      {channels && channels.length > 0 && hiddenIds && onUnhideChannel && (
        <div className="settings-card">
          <h2>Hidden Channels</h2>
          <p className="settings-sub">
            Channels you've hidden — manually, or automatically after one froze playback — are
            removed from the channel list, guide, and search. Restore one to bring it back.
          </p>
          {hiddenIds.size === 0 ? (
            <p className="settings-sub" style={{ marginBottom: 0 }}>
              No channels hidden.
            </p>
          ) : (
            Array.from(hiddenIds)
              .map((streamId) => ({
                streamId,
                name: channels.find((c) => c.streamId === streamId)?.name ?? `Channel ${streamId}`,
              }))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(({ streamId, name }) => (
                <div key={streamId} className="hidden-channel-row">
                  <span className="hidden-channel-name" title={name}>
                    {name}
                  </span>
                  <button onClick={() => onUnhideChannel(streamId)}>Restore</button>
                </div>
              ))
          )}
        </div>
      )}
    </div>
  )
}

export default SettingsScreen
