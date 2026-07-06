import { useEffect, useMemo, useRef, useState } from 'react'
import type { XtreamConfig, LiveStream } from '../electron/xtream'
import type { PlaybackStatus } from '../electron/playback'
import SettingsScreen from './components/SettingsScreen'
import ChannelList from './components/ChannelList'
import Player from './components/Player'
import EpgGrid from './components/EpgGrid'
import NowNextBar from './components/NowNextBar'
import './app.css'

type View = 'live' | 'guide'

function App() {
  const [config, setConfig] = useState<XtreamConfig | null>(null)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [view, setView] = useState<View>('live')
  const [selectedStream, setSelectedStream] = useState<LiveStream | null>(null)
  const [previousStream, setPreviousStream] = useState<LiveStream | null>(null)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [channels, setChannels] = useState<LiveStream[]>([])
  const [channelsLoading, setChannelsLoading] = useState(false)
  const [channelsError, setChannelsError] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<Set<number>>(new Set())
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [channelFilter, setChannelFilter] = useState('')
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set())
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus | null>(null)
  const lastStreamIdRef = useRef<number | null>(null)
  const resumedRef = useRef(false)

  const favoritesRef = useRef(favorites)
  useEffect(() => {
    favoritesRef.current = favorites
  }, [favorites])
  const hiddenIdsRef = useRef(hiddenIds)
  useEffect(() => {
    hiddenIdsRef.current = hiddenIds
  }, [hiddenIds])

  const persistPrefs = (overrides: {
    favorites?: Set<number>
    hiddenIds?: Set<number>
    lastStreamId?: number | null
  }) => {
    window.prefs.save({
      favoriteStreamIds: Array.from(overrides.favorites ?? favoritesRef.current),
      hiddenStreamIds: Array.from(overrides.hiddenIds ?? hiddenIdsRef.current),
      lastStreamId: 'lastStreamId' in overrides ? overrides.lastStreamId! : lastStreamIdRef.current,
    })
  }

  useEffect(() => window.playback.onStatus(setPlaybackStatus), [])

  useEffect(
    () =>
      // A channel becomes the startup-resume target only after it's played
      // without stalling/erroring for a while (see CONFIRM_PLAYABLE_MS in
      // electron/playback.ts) — persisting at tune time, or on the first
      // frame, would boot-loop the app into a channel that plays briefly and
      // then hangs.
      window.playback.onConfirmed((streamId) => {
        if (lastStreamIdRef.current === streamId) return
        lastStreamIdRef.current = streamId
        persistPrefs({ lastStreamId: streamId })
      }),
    [],
  )

  // mpv itself is unrecoverable once wedged (see electron/playback.ts) — the
  // one useful automatic response is to make sure this channel doesn't do it
  // to the next person too, so it's hidden immediately.
  useEffect(() => {
    if (playbackStatus?.state !== 'wedged' || playbackStatus.streamId == null) return
    const streamId = playbackStatus.streamId
    if (hiddenIdsRef.current.has(streamId)) return
    const next = new Set(hiddenIdsRef.current)
    next.add(streamId)
    setHiddenIds(next)
    persistPrefs({ hiddenIds: next })
  }, [playbackStatus])

  useEffect(() => {
    window.settings.load().then((loaded) => {
      setConfig(loaded)
      setConfigLoaded(true)
    })
    window.prefs.load().then((p) => {
      setFavorites(new Set(p.favoriteStreamIds))
      setHiddenIds(new Set(p.hiddenStreamIds))
      lastStreamIdRef.current = p.lastStreamId
      setPrefsLoaded(true)
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

  const tune = (stream: LiveStream) => {
    if (selectedStream && selectedStream.streamId !== stream.streamId) {
      setPreviousStream(selectedStream)
    }
    setSelectedStream(stream)
    setView('live')
  }

  // Start playback whenever a new stream URL is built. Same-URL re-tunes are
  // covered by the error bar's Retry button.
  useEffect(() => {
    if (streamUrl && selectedStream) {
      window.playback.play(streamUrl, selectedStream.streamId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamUrl])

  // Channels the user has hidden (froze the app, or manually blocked) never
  // appear anywhere — sidebar, guide grid, or EPG search — regardless of
  // favorite status. Resolved before favorites/filter so both surfaces and
  // keyboard zapping stay in sync automatically.
  const visibleChannels = useMemo(
    () => channels.filter((c) => !hiddenIds.has(c.streamId)),
    [channels, hiddenIds],
  )

  // EPG search queries the SQLite cache directly (main process), which has no
  // notion of hidden channels — pass the hidden set's guide-side ids through
  // so EpgGrid can filter its own search results the same way the grid rows
  // already are (via the visibleChannels list above).
  const hiddenEpgChannelIds = useMemo(
    () =>
      new Set(
        channels
          .filter((c) => hiddenIds.has(c.streamId) && c.epgChannelId)
          .map((c) => c.epgChannelId!),
      ),
    [channels, hiddenIds],
  )

  const toggleFavorite = (streamId: number) => {
    const next = new Set(favorites)
    if (next.has(streamId)) next.delete(streamId)
    else next.add(streamId)
    setFavorites(next)
    persistPrefs({ favorites: next })
  }

  const hideChannel = (streamId: number) => {
    const next = new Set(hiddenIds)
    next.add(streamId)
    setHiddenIds(next)
    persistPrefs({ hiddenIds: next })
  }

  const unhideChannel = (streamId: number) => {
    const next = new Set(hiddenIds)
    next.delete(streamId)
    setHiddenIds(next)
    persistPrefs({ hiddenIds: next })
  }

  // The list as displayed in the sidebar: name-filtered, favorites surfaced
  // first (or exclusively). Keyboard zapping walks this same order.
  const displayChannels = useMemo(() => {
    const text = channelFilter.trim().toLowerCase()
    let list = visibleChannels
    if (text) list = list.filter((c) => c.name.toLowerCase().includes(text))
    if (favoritesOnly) return list.filter((c) => favorites.has(c.streamId))
    if (favorites.size === 0) return list
    const favs: LiveStream[] = []
    const rest: LiveStream[] = []
    for (const c of list) (favorites.has(c.streamId) ? favs : rest).push(c)
    return [...favs, ...rest]
  }, [visibleChannels, channelFilter, favoritesOnly, favorites])

  // Quick switching: ArrowUp/ArrowDown zap through the visible list,
  // Backspace swaps back to the previously tuned channel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (view !== 'live' || showSettings) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        if (displayChannels.length === 0) return
        const idx = displayChannels.findIndex((c) => c.streamId === selectedStream?.streamId)
        const step = e.key === 'ArrowDown' ? 1 : -1
        const next =
          idx < 0 ? 0 : (idx + step + displayChannels.length) % displayChannels.length
        tune(displayChannels[next])
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        if (previousStream) tune(previousStream)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Last-channel resume: once channels and prefs are both in, re-tune the
  // channel that was playing when the app last closed (never a hidden one).
  useEffect(() => {
    if (resumedRef.current || !prefsLoaded || visibleChannels.length === 0 || selectedStream) return
    resumedRef.current = true
    const last = visibleChannels.find((c) => c.streamId === lastStreamIdRef.current)
    if (last) setSelectedStream(last)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsLoaded, visibleChannels])

  if (!configLoaded) return null

  if (!config || showSettings) {
    return (
      <SettingsScreen
        initialConfig={config}
        onSaved={(saved) => {
          setConfig(saved)
          setShowSettings(false)
        }}
        onCancel={config ? () => setShowSettings(false) : undefined}
        channels={channels}
        hiddenIds={hiddenIds}
        onUnhideChannel={unhideChannel}
      />
    )
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-title">
          <span className="app-title-mark">▶</span> IPTV
        </div>
        <nav className="app-tabs">
          <button className={`app-tab${view === 'live' ? ' active' : ''}`} onClick={() => setView('live')}>
            Live TV
          </button>
          <button className={`app-tab${view === 'guide' ? ' active' : ''}`} onClick={() => setView('guide')}>
            Guide
          </button>
        </nav>
        <div className="app-header-spacer" />
        <button className="app-settings-btn" onClick={() => setShowSettings(true)}>
          Settings
        </button>
      </header>

      {/* The live view stays mounted while the guide is open: the mpv video
          surface is a native child window, so hiding its placeholder (display:
          none) collapses it to 0×0 via Player's ResizeObserver while playback
          (audio) continues. */}
      <div className="app-live" style={{ display: view === 'live' ? 'flex' : 'none' }}>
        <aside className="app-sidebar">
          <ChannelList
            channels={displayChannels}
            totalCount={channels.length}
            loading={channelsLoading}
            error={channelsError}
            selectedStreamId={selectedStream?.streamId ?? null}
            onSelect={tune}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            favoritesOnly={favoritesOnly}
            onToggleFavoritesOnly={() => setFavoritesOnly((v) => !v)}
            filterText={channelFilter}
            onFilterTextChange={setChannelFilter}
            onHideChannel={hideChannel}
          />
        </aside>
        <div className="app-player-col">
          <NowNextBar stream={selectedStream} />
          {/* Playback state must render OUTSIDE the player surface — the mpv
              video is a native child window that paints over any HTML in
              that rectangle. */}
          {playbackStatus && playbackStatus.state !== 'idle' && playbackStatus.state !== 'playing' && (
            <div
              className={`playback-bar${playbackStatus.state !== 'loading' ? ' playback-bar-error' : ''}`}
            >
              {playbackStatus.state === 'loading' ? (
                <span>Tuning {selectedStream ? selectedStream.name : ''}…</span>
              ) : playbackStatus.state === 'wedged' ? (
                <span className="playback-bar-msg">
                  {playbackStatus.message} This channel has been hidden.
                </span>
              ) : (
                <>
                  <span className="playback-bar-msg">
                    {playbackStatus.message ?? 'Playback failed'}
                  </span>
                  {streamUrl && (
                    <button
                      onClick={() => window.playback.play(streamUrl, selectedStream?.streamId)}
                    >
                      Retry
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          <div className="app-player-surface">
            <Player />
          </div>
        </div>
      </div>

      {view === 'guide' && (
        <div className="app-guide">
          <EpgGrid
            config={config}
            channels={visibleChannels}
            hiddenEpgChannelIds={hiddenEpgChannelIds}
            tunedStreamId={selectedStream?.streamId ?? null}
            onTune={tune}
          />
        </div>
      )}
    </div>
  )
}

export default App
