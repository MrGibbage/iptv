import { useEffect, useState } from 'react'
import type { XtreamConfig, LiveStream } from '../electron/xtream'
import SettingsScreen from './components/SettingsScreen'
import ChannelList from './components/ChannelList'
import Player from './components/Player'
import EpgGrid from './components/EpgGrid'
import NowNextBar from './components/NowNextBar'

type View = 'live' | 'guide'

function App() {
  const [config, setConfig] = useState<XtreamConfig | null>(null)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [view, setView] = useState<View>('live')
  const [selectedStream, setSelectedStream] = useState<LiveStream | null>(null)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [channels, setChannels] = useState<LiveStream[]>([])
  const [channelsLoading, setChannelsLoading] = useState(false)
  const [channelsError, setChannelsError] = useState<string | null>(null)

  useEffect(() => {
    window.settings.load().then((loaded) => {
      setConfig(loaded)
      setConfigLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!config) return
    let cancelled = false
    setChannelsLoading(true)
    setChannelsError(null)
    window.xtream
      .getLiveStreams(config)
      .then((streams) => {
        if (!cancelled) setChannels(streams)
      })
      .catch((err) => {
        if (!cancelled) setChannelsError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setChannelsLoading(false)
      })
    // Kick a TTL-gated EPG refresh whenever the config becomes available or
    // changes (a no-op when the cache is fresh).
    window.epg.refresh(config, false)
    return () => {
      cancelled = true
    }
  }, [config])

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

  const tune = (stream: LiveStream) => {
    setSelectedStream(stream)
    setView('live')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid #3a3a3a', alignItems: 'center' }}>
        <button
          onClick={() => setView('live')}
          style={{ borderColor: view === 'live' ? '#646cff' : 'transparent' }}
        >
          Live TV
        </button>
        <button
          onClick={() => setView('guide')}
          style={{ borderColor: view === 'guide' ? '#646cff' : 'transparent' }}
        >
          Guide
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowSettings(true)}>Settings</button>
      </div>

      {/* The live view stays mounted while the guide is open: the mpv video
          surface is a native child window, so hiding its placeholder (display:
          none) collapses it to 0×0 via Player's ResizeObserver while playback
          (audio) continues. */}
      <div style={{ display: view === 'live' ? 'flex' : 'none', flex: 1, minHeight: 0 }}>
        <div style={{ width: 280, borderRight: '1px solid #3a3a3a', display: 'flex', flexDirection: 'column' }}>
          <ChannelList
            channels={channels}
            loading={channelsLoading}
            error={channelsError}
            selectedStreamId={selectedStream?.streamId ?? null}
            onSelect={tune}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <NowNextBar stream={selectedStream} />
          <div style={{ flex: 1, minHeight: 0 }}>
            <Player streamUrl={streamUrl} />
          </div>
        </div>
      </div>

      {view === 'guide' && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <EpgGrid
            config={config}
            channels={channels}
            tunedStreamId={selectedStream?.streamId ?? null}
            onTune={tune}
          />
        </div>
      )}
    </div>
  )
}

export default App
