import { useEffect, useState } from 'react'
import type { XtreamConfig, LiveStream } from '../electron/xtream'
import SettingsScreen from './components/SettingsScreen'
import ChannelList from './components/ChannelList'
import Player from './components/Player'

function App() {
  const [config, setConfig] = useState<XtreamConfig | null>(null)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [selectedStream, setSelectedStream] = useState<LiveStream | null>(null)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)

  useEffect(() => {
    window.settings.load().then((loaded) => {
      setConfig(loaded)
      setConfigLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (config && selectedStream) {
      window.xtream.buildLiveStreamUrl(config, selectedStream.streamId).then(setStreamUrl)
    }
  }, [config, selectedStream])

  if (!configLoaded) return null

  if (!config || showSettings) {
    return (
      <SettingsScreen
        initialConfig={config}
        onSaved={(saved) => {
          setConfig(saved)
          setShowSettings(false)
        }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ width: 280, borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column' }}>
        <button onClick={() => setShowSettings(true)} style={{ margin: 8 }}>
          Settings
        </button>
        <ChannelList
          config={config}
          selectedStreamId={selectedStream?.streamId ?? null}
          onSelect={setSelectedStream}
        />
      </div>
      <div style={{ flex: 1 }}>
        <Player streamUrl={streamUrl} />
      </div>
    </div>
  )
}

export default App
