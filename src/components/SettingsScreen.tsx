import { useState } from 'react'
import type { XtreamConfig } from '../../electron/xtream'

interface SettingsScreenProps {
  initialConfig: XtreamConfig | null
  onSaved: (config: XtreamConfig) => void
}

function SettingsScreen({ initialConfig, onSaved }: SettingsScreenProps) {
  const [serverUrl, setServerUrl] = useState(initialConfig?.serverUrl ?? '')
  const [username, setUsername] = useState(initialConfig?.username ?? '')
  const [password, setPassword] = useState(initialConfig?.password ?? '')
  const [testing, setTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [testPassedFor, setTestPassedFor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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

  return (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <h2>Xtream Account</h2>
      <label style={{ display: 'block', marginTop: 12 }}>
        Server URL
        <input
          type="text"
          placeholder="http://example.com:8080"
          value={serverUrl}
          onChange={(e) => {
            setServerUrl(e.target.value)
            setTestPassedFor(null)
          }}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ display: 'block', marginTop: 12 }}>
        Username
        <input
          type="text"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value)
            setTestPassedFor(null)
          }}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ display: 'block', marginTop: 12 }}>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setTestPassedFor(null)
          }}
          style={{ display: 'block', width: '100%' }}
        />
      </label>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button onClick={handleTest} disabled={testing || !serverUrl || !username || !password}>
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
        <button onClick={handleSave} disabled={!canSave || saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {testMessage && (
        <p style={{ marginTop: 12, color: canSave ? 'green' : 'crimson' }}>{testMessage}</p>
      )}
    </div>
  )
}

export default SettingsScreen
