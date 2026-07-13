import { useEffect, useMemo, useRef, useState } from 'react'
import type { XtreamConfig, LiveStream, LiveCategory, VodStream, SeriesEpisode } from '../electron/xtream'
import type { PlaybackStatus } from '../electron/playback'
import type { ProgressMap } from '../electron/progress-store'
import SettingsScreen, { type StartupView } from './components/SettingsScreen'
import ChannelList from './components/ChannelList'
import Player from './components/Player'
import EpgGrid from './components/EpgGrid'
import NowNextBar from './components/NowNextBar'
import PlayerStats from './components/PlayerStats'
import MediaScrubber from './components/MediaScrubber'
import VodBrowser from './components/VodBrowser'
import SeriesBrowser from './components/SeriesBrowser'
import HomeScreen from './components/HomeScreen'
import { applyTheme, type ThemeTokens } from './themes'
import './app.css'

type View = StartupView

// A movie or an episode — anything that isn't a live channel but shares the
// same single mpv instance, resume-tracking, and theater-mode behavior. Kept
// as one union (rather than separate vod/episode state) so those behaviors
// are implemented once instead of duplicated per media kind.
type PlayingMedia =
  | { kind: 'vod'; item: VodStream }
  | { kind: 'episode'; item: SeriesEpisode; seriesName: string; seriesCover: string }

function mediaProgressKey(media: PlayingMedia): string {
  return media.kind === 'vod' ? `vod:${media.item.streamId}` : `ep:${media.item.id}`
}

function mediaTitle(media: PlayingMedia): string {
  return media.kind === 'vod' ? media.item.name : `${media.seriesName} — ${media.item.title}`
}

const PROGRESS_SAVE_INTERVAL_MS = 20_000
// In theater mode the cursor (and the VOD/series scrubber) hide after this
// long with no pointer movement, and reappear the moment the pointer moves.
const CURSOR_IDLE_MS = 3_000
// How often to sample the global cursor position while in theater mode.
const CURSOR_POLL_MS = 250

function App() {
  const [config, setConfig] = useState<XtreamConfig | null>(null)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [view, setView] = useState<View>('live')
  const [startupView, setStartupView] = useState<StartupView>('live')
  const [playbackArmed, setPlaybackArmed] = useState(false)
  const [selectedStream, setSelectedStream] = useState<LiveStream | null>(null)
  const [previousStream, setPreviousStream] = useState<LiveStream | null>(null)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [channels, setChannels] = useState<LiveStream[]>([])
  const [channelsLoading, setChannelsLoading] = useState(false)
  const [channelsError, setChannelsError] = useState<string | null>(null)
  const [categories, setCategories] = useState<LiveCategory[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedVodCategoryId, setSelectedVodCategoryId] = useState<string | null>(null)
  const [selectedSeriesCategoryId, setSelectedSeriesCategoryId] = useState<string | null>(null)
  const [dismissedHomeItems, setDismissedHomeItems] = useState<Set<string>>(new Set())
  const [favorites, setFavorites] = useState<Set<number>>(new Set())
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [channelFilter, setChannelFilter] = useState('')
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set())
  const [softwareDecoding, setSoftwareDecoding] = useState(false)
  const [theme, setTheme] = useState('system')
  const [customTheme, setCustomTheme] = useState<Record<string, string> | null>(null)
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus | null>(null)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [statsOpen, setStatsOpen] = useState(false)
  const [showFsHint, setShowFsHint] = useState(false)
  const [playingMedia, setPlayingMedia] = useState<PlayingMedia | null>(null)
  const [mediaStreamUrl, setMediaStreamUrl] = useState<string | null>(null)
  const [mediaResumeSecs, setMediaResumeSecs] = useState(0)
  const [mediaPosition, setMediaPosition] = useState(0)
  const [mediaDuration, setMediaDuration] = useState(0)
  const [pointerActive, setPointerActive] = useState(true)
  const [progressMap, setProgressMap] = useState<ProgressMap>({})
  const lastStreamIdRef = useRef<number | null>(null)
  const resumedRef = useRef(false)
  const mediaSeekedRef = useRef(false)

  const favoritesRef = useRef(favorites)
  useEffect(() => {
    favoritesRef.current = favorites
  }, [favorites])
  const hiddenIdsRef = useRef(hiddenIds)
  useEffect(() => {
    hiddenIdsRef.current = hiddenIds
  }, [hiddenIds])
  const softwareDecodingRef = useRef(softwareDecoding)
  useEffect(() => {
    softwareDecodingRef.current = softwareDecoding
  }, [softwareDecoding])
  const themeRef = useRef(theme)
  useEffect(() => {
    themeRef.current = theme
  }, [theme])
  const customThemeRef = useRef(customTheme)
  useEffect(() => {
    customThemeRef.current = customTheme
  }, [customTheme])
  const selectedCategoryIdRef = useRef(selectedCategoryId)
  useEffect(() => {
    selectedCategoryIdRef.current = selectedCategoryId
  }, [selectedCategoryId])
  const selectedVodCategoryIdRef = useRef(selectedVodCategoryId)
  useEffect(() => { selectedVodCategoryIdRef.current = selectedVodCategoryId }, [selectedVodCategoryId])
  const selectedSeriesCategoryIdRef = useRef(selectedSeriesCategoryId)
  useEffect(() => { selectedSeriesCategoryIdRef.current = selectedSeriesCategoryId }, [selectedSeriesCategoryId])
  const startupViewRef = useRef(startupView)
  useEffect(() => { startupViewRef.current = startupView }, [startupView])
  const dismissedHomeItemsRef = useRef(dismissedHomeItems)
  useEffect(() => { dismissedHomeItemsRef.current = dismissedHomeItems }, [dismissedHomeItems])

  const persistPrefs = (overrides: {
    favorites?: Set<number>
    hiddenIds?: Set<number>
    lastStreamId?: number | null
    softwareDecoding?: boolean
    theme?: string
    customTheme?: Record<string, string> | null
    selectedCategoryId?: string | null
    selectedVodCategoryId?: string | null
    selectedSeriesCategoryId?: string | null
    startupView?: StartupView
    dismissedHomeItems?: Set<string>
  }) => {
    window.prefs.save({
      favoriteStreamIds: Array.from(overrides.favorites ?? favoritesRef.current),
      hiddenStreamIds: Array.from(overrides.hiddenIds ?? hiddenIdsRef.current),
      lastStreamId: 'lastStreamId' in overrides ? overrides.lastStreamId! : lastStreamIdRef.current,
      selectedLiveCategoryId:
        'selectedCategoryId' in overrides
          ? overrides.selectedCategoryId!
          : selectedCategoryIdRef.current,
      selectedVodCategoryId: 'selectedVodCategoryId' in overrides
        ? overrides.selectedVodCategoryId!
        : selectedVodCategoryIdRef.current,
      selectedSeriesCategoryId: 'selectedSeriesCategoryId' in overrides
        ? overrides.selectedSeriesCategoryId!
        : selectedSeriesCategoryIdRef.current,
      startupView: overrides.startupView ?? startupViewRef.current,
      dismissedHomeItems: Array.from(overrides.dismissedHomeItems ?? dismissedHomeItemsRef.current),
      softwareDecoding: overrides.softwareDecoding ?? softwareDecodingRef.current,
      theme: overrides.theme ?? themeRef.current,
      customTheme: 'customTheme' in overrides ? overrides.customTheme! : customThemeRef.current,
    })
  }

  useEffect(() => window.playback.onStatus(setPlaybackStatus), [])

  // Apply the selected color theme to :root whenever it changes (see
  // src/themes.ts). 'system' clears the overrides so the OS light/dark wins.
  useEffect(() => {
    applyTheme(theme, customTheme as ThemeTokens | null)
  }, [theme, customTheme])

  // The stats/URL panel is per-channel — close it when the tuned channel
  // changes so it can't show one channel's URL under another's title.
  useEffect(() => setStatsOpen(false), [selectedStream?.streamId])

  // F11/Esc are bound directly in the main process, so this only keeps the
  // header button's icon/label (and theater mode below) in sync when full
  // screen was toggled that way.
  useEffect(() => {
    window.app.isFullScreen().then(setIsFullScreen)
    return window.app.onFullScreenChange(setIsFullScreen)
  }, [])

  // Full screen on the Live tab goes into "theater mode": header, sidebar,
  // and the now/next toolbar disappear so only the video remains, since with
  // them gone there's no on-screen way back, a brief hint is shown for a few
  // seconds pointing at F11/Esc.
  const theaterMode =
    isFullScreen && (view === 'live' || ((view === 'vod' || view === 'series') && !!playingMedia))
  useEffect(() => {
    if (!theaterMode) {
      setShowFsHint(false)
      return
    }
    setShowFsHint(true)
    const timer = setTimeout(() => setShowFsHint(false), 3000)
    return () => clearTimeout(timer)
  }, [theaterMode])

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

  // NOTE: a wedge is NOT caused by the channel showing when it happens — it's
  // provoked by switching channels right after a *different* stream failed
  // (the failed stream's decode session is still tearing down; see
  // electron/playback.ts). The channel on screen at wedge time is innocent, so
  // there's deliberately no auto-hide here — doing so hid perfectly good
  // channels (and even favorites) in testing. Recovery is the Restart button
  // in the wedge UI below.

  useEffect(() => {
    window.settings.load().then((loaded) => {
      setConfig(loaded)
      setConfigLoaded(true)
    })
    window.prefs.load().then((p) => {
      setFavorites(new Set(p.favoriteStreamIds))
      setHiddenIds(new Set(p.hiddenStreamIds))
      setSoftwareDecoding(p.softwareDecoding)
      setTheme(p.theme)
      setCustomTheme(p.customTheme)
      setSelectedCategoryId(p.selectedLiveCategoryId)
      setSelectedVodCategoryId(p.selectedVodCategoryId)
      setSelectedSeriesCategoryId(p.selectedSeriesCategoryId)
      setStartupView(p.startupView)
      setView(p.startupView)
      setPlaybackArmed(p.startupView === 'live')
      setDismissedHomeItems(new Set(p.dismissedHomeItems))
      lastStreamIdRef.current = p.lastStreamId
      setPrefsLoaded(true)
    })
    window.progress.load().then(setProgressMap)
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
    // Categories for the sidebar's category filter — labels only; the actual
    // filtering is client-side off each channel's categoryId (no re-fetch).
    window.xtream
      .getLiveCategories(config)
      .then((cats) => {
        if (!cancelled) setCategories(cats)
      })
      .catch(() => {
        if (!cancelled) setCategories([])
      })
    // Kick a TTL-gated EPG refresh whenever the config becomes available or
    // changes (a no-op when the cache is fresh).
    window.epg.refresh(config, false)
    return () => {
      cancelled = true
    }
  }, [config])

  useEffect(() => {
    if (config && selectedStream && playbackArmed) {
      window.xtream.buildLiveStreamUrl(config, selectedStream.streamId).then(setStreamUrl)
    }
  }, [config, selectedStream, playbackArmed])

  const tune = (stream: LiveStream) => {
    if (selectedStream && selectedStream.streamId !== stream.streamId) {
      setPreviousStream(selectedStream)
    }
    setSelectedStream(stream)
    setPlaybackArmed(true)
    setPlayingMedia(null)
    setMediaStreamUrl(null)
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

  useEffect(() => {
    if (!config || !playingMedia) return
    const build =
      playingMedia.kind === 'vod'
        ? window.xtream.buildVodStreamUrl(config, playingMedia.item.streamId, playingMedia.item.containerExtension)
        : window.xtream.buildSeriesStreamUrl(config, playingMedia.item.id, playingMedia.item.containerExtension)
    build.then(setMediaStreamUrl)
  }, [config, playingMedia])

  // Mirrors the live-stream play effect above: loadfile replaces whatever mpv
  // had loaded, so tuning live and playing a movie/episode share the same
  // single mpv instance without any extra teardown.
  useEffect(() => {
    if (mediaStreamUrl && playingMedia) {
      window.playback.play(mediaStreamUrl, undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaStreamUrl])

  const playMedia = (media: PlayingMedia, resumeSecs: number) => {
    mediaSeekedRef.current = false
    setMediaResumeSecs(resumeSecs)
    setMediaPosition(resumeSecs)
    setMediaDuration(0)
    setPlayingMedia(media)
    setView(media.kind === 'vod' ? 'vod' : 'series')
  }

  const stopMedia = () => {
    window.playback.stop()
    setPlayingMedia(null)
    setMediaStreamUrl(null)
  }

  // A resumed movie/episode only seeks once mpv actually starts playing the
  // file — seeking any earlier would apply to whatever was previously loaded
  // (or be silently dropped before the file is open).
  useEffect(() => {
    if (!playingMedia || mediaResumeSecs <= 0 || mediaSeekedRef.current) return
    if (playbackStatus?.state === 'playing') {
      mediaSeekedRef.current = true
      window.mpv.command('seek', String(mediaResumeSecs), 'absolute')
    }
  }, [playbackStatus, playingMedia, mediaResumeSecs])

  // Periodically persist playback position so "Resume" survives navigating
  // away or quitting — mpv's getProperty blocks the main process while the
  // core is busy, so this stays a slow interval rather than a tight poll,
  // the same on-demand-only discipline PlayerStats uses.
  useEffect(() => {
    if (!playingMedia || playbackStatus?.state !== 'playing') return
    const key = mediaProgressKey(playingMedia)
    const saveNow = () => {
      Promise.all([window.mpv.getProperty('time-pos'), window.mpv.getProperty('duration')]).then(
        ([pos, dur]) => {
          const positionSecs = Number(pos)
          if (!Number.isFinite(positionSecs)) return
          const durationSecs = dur && Number.isFinite(Number(dur)) ? Number(dur) : null
          const entry = {
            positionSecs,
            durationSecs,
            updatedAt: Date.now(),
            kind: playingMedia.kind,
            title: playingMedia.kind === 'vod' ? playingMedia.item.name : playingMedia.item.title,
            seriesName: playingMedia.kind === 'episode' ? playingMedia.seriesName : undefined,
            image: playingMedia.kind === 'vod' ? playingMedia.item.streamIcon : playingMedia.seriesCover,
            containerExtension: playingMedia.item.containerExtension,
            categoryId: playingMedia.kind === 'vod' ? playingMedia.item.categoryId : undefined,
            episodeNum: playingMedia.kind === 'episode' ? playingMedia.item.episodeNum : undefined,
            season: playingMedia.kind === 'episode' ? playingMedia.item.season : undefined,
          }
          window.progress.save(key, entry)
          setProgressMap((prev) => ({ ...prev, [key]: entry }))
        },
      )
    }
    const interval = setInterval(saveNow, PROGRESS_SAVE_INTERVAL_MS)
    return () => {
      clearInterval(interval)
      saveNow()
    }
  }, [playingMedia, playbackStatus?.state])

  // Live playback position for the scrubber, from mpv's observed time-pos
  // (forwarded by the main process — no extra polling). Only subscribed while
  // a movie/episode is playing, so live TV doesn't drive per-second re-renders.
  useEffect(() => {
    if (!playingMedia) return
    return window.mpv.onTimePos(setMediaPosition)
  }, [playingMedia])

  // Total duration for the scrubber — one on-demand read once the file is
  // playing (duration isn't known until then), retried until mpv reports it.
  useEffect(() => {
    if (!playingMedia || playbackStatus?.state !== 'playing') return
    let cancelled = false
    let retry: ReturnType<typeof setTimeout>
    const fetchDuration = () => {
      window.mpv.getProperty('duration').then((d) => {
        if (cancelled) return
        const secs = Number(d)
        if (Number.isFinite(secs) && secs > 0) setMediaDuration(secs)
        else retry = setTimeout(fetchDuration, 1000)
      })
    }
    fetchDuration()
    return () => {
      cancelled = true
      clearTimeout(retry)
    }
  }, [playingMedia, playbackStatus?.state])

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

  const toggleSoftwareDecoding = (enabled: boolean) => {
    setSoftwareDecoding(enabled)
    window.playback.setSoftwareDecoding(enabled) // apply live in mpv
    persistPrefs({ softwareDecoding: enabled }) // remember for next launch
  }

  const selectTheme = (themeId: string) => {
    setTheme(themeId)
    persistPrefs({ theme: themeId })
  }

  const applyCustomTheme = (tokens: Record<string, string>) => {
    setCustomTheme(tokens)
    setTheme('custom')
    persistPrefs({ theme: 'custom', customTheme: tokens })
  }

  const selectLiveCategory = (categoryId: string | null) => {
    setSelectedCategoryId(categoryId)
    persistPrefs({ selectedCategoryId: categoryId })
  }

  const tuneFromHome = (stream: LiveStream) => {
    // Home favorites retain their provider category on the loaded stream, so
    // carry that browsing context into Live TV before tuning. This keeps the
    // selected row visible and makes the category the persisted default.
    selectLiveCategory(stream.categoryId || null)
    tune(stream)
  }

  const selectVodCategory = (categoryId: string) => {
    setSelectedVodCategoryId(categoryId)
    persistPrefs({ selectedVodCategoryId: categoryId })
  }

  const selectSeriesCategory = (categoryId: string) => {
    setSelectedSeriesCategoryId(categoryId)
    persistPrefs({ selectedSeriesCategoryId: categoryId })
  }

  const changeStartupView = (next: StartupView) => {
    setStartupView(next)
    persistPrefs({ startupView: next })
  }

  const dismissHomeItem = (key: string) => {
    const next = new Set(dismissedHomeItems)
    next.add(key)
    setDismissedHomeItems(next)
    persistPrefs({ dismissedHomeItems: next })
  }

  const resetDismissedHomeItems = () => {
    const next = new Set<string>()
    setDismissedHomeItems(next)
    persistPrefs({ dismissedHomeItems: next })
  }

  const openView = (next: View) => {
    if (next === 'live') setPlaybackArmed(true)
    setView(next)
  }

  // The list as displayed in the sidebar: name-filtered, favorites surfaced
  // first (or exclusively). Keyboard zapping walks this same order.
  const displayChannels = useMemo(() => {
    const text = channelFilter.trim().toLowerCase()
    let list = visibleChannels
    if (selectedCategoryId) list = list.filter((c) => c.categoryId === selectedCategoryId)
    if (text) list = list.filter((c) => c.name.toLowerCase().includes(text))
    if (favoritesOnly) return list.filter((c) => favorites.has(c.streamId))
    if (favorites.size === 0) return list
    const favs: LiveStream[] = []
    const rest: LiveStream[] = []
    for (const c of list) (favorites.has(c.streamId) ? favs : rest).push(c)
    return [...favs, ...rest]
  }, [visibleChannels, selectedCategoryId, channelFilter, favoritesOnly, favorites])

  // Category options for the sidebar dropdown: only categories that actually
  // have (non-hidden) channels, each with its live count, in the provider's
  // category order.
  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of visibleChannels) counts.set(c.categoryId, (counts.get(c.categoryId) ?? 0) + 1)
    return categories
      .map((cat) => ({ id: cat.categoryId, name: cat.categoryName, count: counts.get(cat.categoryId) ?? 0 }))
      .filter((c) => c.count > 0)
  }, [categories, visibleChannels])

  const selectedCategoryName = selectedCategoryId
    ? categoryOptions.find((c) => c.id === selectedCategoryId)?.name ?? null
    : null

  // Both views consume the same category state, so switching views or tuning
  // from the Guide never loses the user's current browsing context.
  const categoryChannels = useMemo(
    () => selectedCategoryId
      ? visibleChannels.filter((channel) => channel.categoryId === selectedCategoryId)
      : visibleChannels,
    [visibleChannels, selectedCategoryId],
  )

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

  // Tab jumps to the guide and back while full screen, so the EPG stays a
  // keypress away even with the header (and its Guide tab button) hidden by
  // theater mode. Scoped to full screen only so it doesn't steal normal
  // Tab focus-cycling elsewhere (Settings fields, the guide's own search box).
  // Inert while a movie/episode is playing — Live/Guide aren't where the user
  // is, and stealing Tab to bounce them out would be jarring.
  useEffect(() => {
    if (!isFullScreen || playingMedia) return
    const onKey = (e: KeyboardEvent) => {
      if (showSettings || e.key !== 'Tab') return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      e.preventDefault()
      setView((v) => (v === 'live' ? 'guide' : 'live'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullScreen, showSettings, playingMedia])

  // Theater mode is meant to be distraction-free, so the cursor (and the
  // scrubber) hide when idle and reappear on movement. Movement can't be
  // detected via DOM mousemove — mpv's native child window covers the video
  // and swallows those events — so poll the global cursor position instead.
  useEffect(() => {
    if (!theaterMode) {
      setPointerActive(true)
      return
    }
    setPointerActive(false)
    let last: { x: number; y: number } | null = null
    let lastMoveAt = 0
    const poll = setInterval(async () => {
      const p = await window.app.getCursorPoint()
      if (last && (p.x !== last.x || p.y !== last.y)) {
        lastMoveAt = Date.now()
        setPointerActive(true)
      } else if (Date.now() - lastMoveAt > CURSOR_IDLE_MS) {
        setPointerActive(false)
      }
      last = p
    }, CURSOR_POLL_MS)
    return () => clearInterval(poll)
  }, [theaterMode])

  // Apply cursor visibility: always visible unless we're in theater mode and
  // idle. setCursorVisible calls Win32's ShowCursor directly (a CSS cursor
  // rule can't reach the native mpv window, and mpv's own cursor-autohide
  // never fires over that bare render target).
  useEffect(() => {
    window.mpv.setCursorVisible(!theaterMode || pointerActive)
  }, [theaterMode, pointerActive])

  // Last-channel resume: once channels and prefs are both in, re-tune the
  // channel that was playing when the app last closed (never a hidden one).
  useEffect(() => {
    if (resumedRef.current || !prefsLoaded || visibleChannels.length === 0 || selectedStream) return
    resumedRef.current = true
    const last = visibleChannels.find((c) => c.streamId === lastStreamIdRef.current)
    if (last) setSelectedStream(last)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsLoaded, visibleChannels])

  if (!configLoaded || !prefsLoaded) return null

  const settingsOpen = !config || showSettings
  // Live TV and a playing movie/episode all share the single mpv instance, so
  // the player surface (and its native child window) stays mounted for any.
  const playerActive = view === 'live' || ((view === 'vod' || view === 'series') && !!playingMedia)
  const nowPlayingTitle =
    (view === 'vod' || view === 'series') && playingMedia ? mediaTitle(playingMedia) : selectedStream?.name
  const retryUrl = view === 'vod' || view === 'series' ? mediaStreamUrl : streamUrl

  return (
    <div className="app-root">
      {settingsOpen && (
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
          softwareDecoding={softwareDecoding}
          onToggleSoftwareDecoding={toggleSoftwareDecoding}
          theme={theme}
          onSelectTheme={selectTheme}
          onApplyCustomTheme={applyCustomTheme}
          startupView={startupView}
          onStartupViewChange={changeStartupView}
          dismissedHomeItemCount={dismissedHomeItems.size}
          onResetDismissedHomeItems={resetDismissedHomeItems}
        />
      )}

      {/* This wrapper (and everything below it, including the mpv video via
          Player) stays mounted even while Settings is open — Settings is
          rendered as an overlay above it, not a replacement, because the mpv
          video is a native child window that paints over any HTML in its
          rectangle regardless of z-index. display:none here is what actually
          collapses that rectangle to 0×0 (via Player's ResizeObserver), which
          is the only thing that keeps Settings from being painted over. */}
      <div style={{ display: settingsOpen ? 'none' : 'contents' }}>
        {config && (
        <>
        {!theaterMode && (
          <header className="app-header">
            <div className="app-title">
              <span className="app-title-mark">▶</span> IPTV
            </div>
            <nav className="app-tabs">
              <button
                className={`app-tab${view === 'home' ? ' active' : ''}`}
                onClick={() => openView('home')}
              >
                Home
              </button>
              <button
                className={`app-tab${view === 'live' ? ' active' : ''}`}
                onClick={() => openView('live')}
              >
                Live TV
              </button>
              <button
                className={`app-tab${view === 'guide' ? ' active' : ''}`}
                onClick={() => openView('guide')}
              >
                Guide
              </button>
              <button
                className={`app-tab${view === 'vod' ? ' active' : ''}`}
                onClick={() => openView('vod')}
              >
                Movies
              </button>
              <button
                className={`app-tab${view === 'series' ? ' active' : ''}`}
                onClick={() => openView('series')}
              >
                TV Shows
              </button>
            </nav>
            <div className="app-header-spacer" />
            {view === 'live' && (
              <button
                className="app-icon-btn"
                title={sidebarVisible ? 'Hide channel sidebar' : 'Show channel sidebar'}
                onClick={() => setSidebarVisible((v) => !v)}
              >
                ☰
              </button>
            )}
            <button
              className="app-icon-btn"
              title={isFullScreen ? 'Exit full screen (F11)' : 'Full screen (F11)'}
              onClick={() => window.app.toggleFullScreen()}
            >
              {isFullScreen ? '⤡' : '⤢'}
            </button>
            <button className="app-settings-btn" onClick={() => setShowSettings(true)}>
              Settings
            </button>
          </header>
        )}

        {/* The live view stays mounted while the guide is open: the mpv video
            surface is a native child window, so hiding its placeholder (display:
            none) collapses it to 0×0 via Player's ResizeObserver while playback
            (audio) continues. */}
        <div className="app-live" style={{ display: playerActive ? 'flex' : 'none' }}>
          {view === 'live' && sidebarVisible && !theaterMode && (
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
                categories={categoryOptions}
                selectedCategoryId={selectedCategoryId}
                selectedCategoryName={selectedCategoryName}
                onSelectCategory={selectLiveCategory}
              />
            </aside>
          )}
          <div className="app-player-col">
            {view === 'live' && selectedStream && !theaterMode && (
              <div className="player-toolbar">
                <div className="toolbar-main">
                  <NowNextBar stream={selectedStream} />
                  {statsOpen && (
                    <div className="channel-meta">
                      {selectedStream.num > 0 && (
                        <span className="channel-meta-item">
                          <span className="channel-meta-label">Channel</span>
                          {selectedStream.num}
                        </span>
                      )}
                      {streamUrl && (
                        <span className="channel-meta-item channel-meta-item-url">
                          <span className="channel-meta-label">URL</span>
                          <span className="channel-meta-url">{streamUrl}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <PlayerStats
                  streamKey={selectedStream.streamId}
                  open={statsOpen}
                  onToggle={() => setStatsOpen((o) => !o)}
                />
              </div>
            )}
            {(view === 'vod' || view === 'series') && playingMedia && (!theaterMode || pointerActive) && (
              <div className="media-toolbar">
                <div className="media-toolbar-top">
                  <div className="vod-nowplaying">▶ {mediaTitle(playingMedia)}</div>
                  <button className="app-icon-btn" onClick={stopMedia}>
                    ← Back to {view === 'vod' ? 'Movies' : 'TV Shows'}
                  </button>
                </div>
                <MediaScrubber
                  positionSecs={mediaPosition}
                  durationSecs={mediaDuration}
                  onSeek={(secs) => {
                    window.mpv.command('seek', String(secs), 'absolute')
                    setMediaPosition(secs)
                  }}
                />
              </div>
            )}
            {showFsHint && (
              <div className="fullscreen-hint">Press F11 or Esc to exit full screen</div>
            )}
            {/* Playback state must render OUTSIDE the player surface — the mpv
                video is a native child window that paints over any HTML in
                that rectangle. */}
            {playbackStatus && playbackStatus.state !== 'idle' && playbackStatus.state !== 'playing' && (
              <div
                className={`playback-bar${playbackStatus.state !== 'loading' ? ' playback-bar-error' : ''}`}
              >
                {playbackStatus.state === 'loading' ? (
                  <span>Tuning {nowPlayingTitle ?? ''}…</span>
                ) : playbackStatus.state === 'wedged' ? (
                  <>
                    <span className="playback-bar-msg">
                      {playbackStatus.message} Restart the player to keep watching — it'll
                      pick up right where you left off.
                    </span>
                    <button onClick={() => window.app.relaunch()}>Restart player</button>
                  </>
                ) : (
                  <>
                    <span className="playback-bar-msg">
                      {playbackStatus.message ?? 'Playback failed'}
                    </span>
                    {retryUrl && (
                      <button
                        onClick={() =>
                          window.playback.play(retryUrl, view === 'live' ? selectedStream?.streamId : undefined)
                        }
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
              channels={categoryChannels}
              hiddenEpgChannelIds={hiddenEpgChannelIds}
              tunedStreamId={selectedStream?.streamId ?? null}
              onTune={tune}
              categories={categoryOptions}
              selectedCategoryId={selectedCategoryId}
              selectedCategoryName={selectedCategoryName}
              onSelectCategory={selectLiveCategory}
            />
          </div>
        )}

        {view === 'home' && (
          <HomeScreen
            config={config}
            favoriteChannels={visibleChannels.filter((channel) => favorites.has(channel.streamId))}
            progress={progressMap}
            dismissedItems={dismissedHomeItems}
            onDismiss={dismissHomeItem}
            onTuneChannel={tuneFromHome}
            onPlayMovie={(item, resumeSecs) => playMedia({ kind: 'vod', item }, resumeSecs)}
            onPlayEpisode={(item, seriesName, seriesCover, resumeSecs) =>
              playMedia({ kind: 'episode', item, seriesName, seriesCover }, resumeSecs)
            }
            onBrowse={openView}
          />
        )}

        {/* Kept mounted (display:none, not unmounted) whenever a movie is
            playing so browsing state (category, scroll position, filter)
            survives a trip through the player and back via "Back to Movies". */}
        <div className="app-vod" style={{ display: view === 'vod' && !playingMedia ? 'flex' : 'none' }}>
          <VodBrowser
            config={config}
            progress={progressMap}
            onPlay={(item, resumeSecs) => playMedia({ kind: 'vod', item }, resumeSecs)}
            initialCategoryId={selectedVodCategoryId}
            onCategoryChange={selectVodCategory}
          />
        </div>

        {/* Same reasoning as app-vod above, for "Back to TV Shows". */}
        <div className="app-series" style={{ display: view === 'series' && !playingMedia ? 'flex' : 'none' }}>
          <SeriesBrowser
            config={config}
            progress={progressMap}
            onPlay={(episode, seriesName, seriesCover, resumeSecs) =>
              playMedia({ kind: 'episode', item: episode, seriesName, seriesCover }, resumeSecs)
            }
            initialCategoryId={selectedSeriesCategoryId}
            onCategoryChange={selectSeriesCategory}
          />
        </div>
        </>
        )}
      </div>
    </div>
  )
}

export default App
