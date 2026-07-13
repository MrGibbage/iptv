import { useEffect, useMemo, useState } from 'react'
import type { ProgressMap, WatchProgress } from '../../electron/progress-store'
import type { LiveStream, SeriesEpisode, VodStream, XtreamConfig } from '../../electron/xtream'

interface Props {
  config: XtreamConfig
  favoriteChannels: LiveStream[]
  progress: ProgressMap
  dismissedItems: Set<string>
  onDismiss: (key: string) => void
  onTuneChannel: (channel: LiveStream) => void
  onPlayMovie: (movie: VodStream, resumeSecs: number) => void
  onPlayEpisode: (episode: SeriesEpisode, seriesName: string, seriesCover: string, resumeSecs: number) => void
  onBrowse: (view: 'live' | 'vod' | 'series') => void
}

function progressLabel(progress: WatchProgress): string {
  const minutes = Math.max(1, Math.floor(progress.positionSecs / 60))
  return `Resume at ${minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`}`
}

function HomeScreen({
  config,
  favoriteChannels,
  progress,
  dismissedItems,
  onDismiss,
  onTuneChannel,
  onPlayMovie,
  onPlayEpisode,
  onBrowse,
}: Props) {
  const [vodLibrary, setVodLibrary] = useState<VodStream[]>([])
  const hasMovieProgress = Object.keys(progress).some((key) => key.startsWith('vod:'))

  // Older progress entries predate dashboard metadata. Resolve their movie
  // ids from the provider once so they can still appear on Home.
  useEffect(() => {
    if (!hasMovieProgress) return
    let cancelled = false
    window.xtream.getVodStreams(config).then((items) => {
      if (!cancelled) setVodLibrary(items)
    })
    return () => {
      cancelled = true
    }
  }, [config, hasMovieProgress])

  const moviesById = useMemo(
    () => new Map(vodLibrary.map((movie) => [movie.streamId, movie])),
    [vodLibrary],
  )
  const favoriteItems = favoriteChannels.filter(
    (channel) => !dismissedItems.has(`channel:${channel.streamId}`),
  )
  const movieItems = Object.entries(progress)
    .filter(([key]) => key.startsWith('vod:') && !dismissedItems.has(key))
    .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
    .flatMap(([key, item]) => {
      const streamId = Number(key.slice(4))
      const resolved = moviesById.get(streamId)
      const movie = resolved ?? (item.title && item.containerExtension
        ? {
            streamId,
            name: item.title,
            streamIcon: item.image ?? '',
            categoryId: item.categoryId ?? '',
            containerExtension: item.containerExtension,
            rating: null,
            added: null,
          }
        : null)
      return movie ? [{ key, progress: item, movie }] : []
    })
    .slice(0, 12)
  const episodeItems = Object.entries(progress)
    .filter(([, item]) => item.kind === 'episode' && !!item.seriesName)
    .filter(([key]) => !dismissedItems.has(key))
    .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
    .slice(0, 12)

  return (
    <main className="home-screen">
      <div className="home-hero">
        <div>
          <div className="home-kicker">WELCOME BACK</div>
          <h1>Home</h1>
          <p>Your favorite channels and unfinished watching, all in one place.</p>
        </div>
      </div>

      <HomeSection title="Favorite Channels" action="Browse Live TV" onAction={() => onBrowse('live')}>
        {favoriteItems.length ? favoriteItems.map((channel) => (
          <article className="home-channel-card" key={channel.streamId} onClick={() => onTuneChannel(channel)}>
            <button className="home-dismiss" title="Remove from Home" onClick={(event) => {
              event.stopPropagation()
              onDismiss(`channel:${channel.streamId}`)
            }}>×</button>
            {channel.streamIcon ? <img src={channel.streamIcon} alt="" /> : <div className="home-channel-fallback">{channel.name[0]}</div>}
            <span title={channel.name}>{channel.name}</span>
          </article>
        )) : <HomeEmpty text="Favorite channels will appear here." />}
      </HomeSection>

      <HomeSection title="Continue Watching" action="Browse Movies" onAction={() => onBrowse('vod')}>
        {movieItems.length ? movieItems.map(({ key, progress: item, movie }) => (
          <MediaCard
            key={key}
            title={movie.name}
            image={movie.streamIcon}
            subtitle={progressLabel(item)}
            progress={item}
            onDismiss={() => onDismiss(key)}
            onPlay={() => onPlayMovie(movie, item.positionSecs)}
          />
        )) : <HomeEmpty text="Unfinished movies will appear here." />}
      </HomeSection>

      <HomeSection title="Recent Shows" action="Browse TV Shows" onAction={() => onBrowse('series')}>
        {episodeItems.length ? episodeItems.map(([key, item]) => {
          const episode: SeriesEpisode = {
            id: key.slice(3),
            episodeNum: item.episodeNum ?? 0,
            title: item.title ?? 'Episode',
            containerExtension: item.containerExtension ?? 'mp4',
            season: item.season ?? 0,
            plot: null,
            duration: null,
          }
          return (
            <MediaCard
              key={key}
              title={item.seriesName!}
              image={item.image ?? ''}
              subtitle={`${item.title ?? 'Episode'} · ${progressLabel(item)}`}
              progress={item}
              onDismiss={() => onDismiss(key)}
              onPlay={() => onPlayEpisode(episode, item.seriesName!, item.image ?? '', item.positionSecs)}
            />
          )
        }) : <HomeEmpty text="Recently watched shows will appear here." />}
      </HomeSection>
    </main>
  )
}

function HomeSection({ title, action, onAction, children }: { title: string; action: string; onAction: () => void; children: React.ReactNode }) {
  return (
    <section className="home-section">
      <div className="home-section-heading">
        <h2>{title}</h2>
        <button onClick={onAction}>{action} →</button>
      </div>
      <div className="home-row">{children}</div>
    </section>
  )
}

function HomeEmpty({ text }: { text: string }) {
  return <div className="home-empty">{text}</div>
}

function MediaCard({ title, image, subtitle, progress, onDismiss, onPlay }: {
  title: string
  image: string
  subtitle: string
  progress: WatchProgress
  onDismiss: () => void
  onPlay: () => void
}) {
  const percent = progress.durationSecs
    ? Math.min(100, (progress.positionSecs / progress.durationSecs) * 100)
    : 0
  return (
    <article className="home-media-card" onClick={onPlay}>
      <button className="home-dismiss" title="Remove from Home" onClick={(event) => {
        event.stopPropagation()
        onDismiss()
      }}>×</button>
      {image ? <img src={image} alt="" loading="lazy" /> : <div className="home-media-fallback">{title[0]}</div>}
      <div className="home-progress"><span style={{ width: `${percent}%` }} /></div>
      <strong title={title}>{title}</strong>
      <span title={subtitle}>{subtitle}</span>
    </article>
  )
}

export default HomeScreen
