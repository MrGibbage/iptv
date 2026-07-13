import { useEffect, useMemo, useRef, useState } from 'react'
import type { XtreamConfig, VodCategory, VodStream, VodInfo } from '../../electron/xtream'
import type { ProgressMap } from '../../electron/progress-store'

interface VodBrowserProps {
  config: XtreamConfig
  progress: ProgressMap
  onPlay: (item: VodStream, resumeSecs: number) => void
  initialCategoryId: string | null
  onCategoryChange: (categoryId: string) => void
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function VodBrowser({ config, progress, onPlay, initialCategoryId, onCategoryChange }: VodBrowserProps) {
  const initialCategoryIdRef = useRef(initialCategoryId)
  const [categories, setCategories] = useState<VodCategory[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [categoriesError, setCategoriesError] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  const [streams, setStreams] = useState<VodStream[]>([])
  const [streamsLoading, setStreamsLoading] = useState(false)
  const [streamsError, setStreamsError] = useState<string | null>(null)
  const [filterText, setFilterText] = useState('')
  const [searchScope, setSearchScope] = useState<'category' | 'all'>('category')

  const [allStreams, setAllStreams] = useState<VodStream[] | null>(null)
  const [allStreamsLoading, setAllStreamsLoading] = useState(false)
  const [allStreamsError, setAllStreamsError] = useState<string | null>(null)

  const [selectedItem, setSelectedItem] = useState<VodStream | null>(null)
  const [info, setInfo] = useState<VodInfo | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setCategoriesLoading(true)
    setCategoriesError(null)
    window.xtream
      .getVodCategories(config)
      .then((cats) => {
        if (cancelled) return
        setCategories(cats)
        if (cats.length > 0) {
          const restored = cats.find((cat) => cat.categoryId === initialCategoryIdRef.current)
          setSelectedCategoryId(restored?.categoryId ?? cats[0].categoryId)
        }
      })
      .catch((err) => {
        if (!cancelled) setCategoriesError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setCategoriesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [config])

  useEffect(() => {
    if (!selectedCategoryId) return
    let cancelled = false
    setStreamsLoading(true)
    setStreamsError(null)
    window.xtream
      .getVodStreams(config, selectedCategoryId)
      .then((items) => {
        if (!cancelled) setStreams(items)
      })
      .catch((err) => {
        if (!cancelled) setStreamsError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setStreamsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [config, selectedCategoryId])

  useEffect(() => {
    if (!selectedItem) {
      setInfo(null)
      return
    }
    let cancelled = false
    setInfoLoading(true)
    window.xtream
      .getVodInfo(config, selectedItem.streamId)
      .then((result) => {
        if (!cancelled) setInfo(result)
      })
      .finally(() => {
        if (!cancelled) setInfoLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [config, selectedItem])

  const text = filterText.trim().toLowerCase()
  const searchingAll = Boolean(text) && searchScope === 'all'

  useEffect(() => {
    if (!searchingAll || allStreams !== null || allStreamsLoading) return
    let cancelled = false
    setAllStreamsLoading(true)
    setAllStreamsError(null)
    window.xtream
      .getVodStreams(config)
      .then((items) => {
        if (!cancelled) setAllStreams(items)
      })
      .catch((err) => {
        if (!cancelled) setAllStreamsError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setAllStreamsLoading(false)
      })
    return () => {
      cancelled = true
    }
    // Deliberately omits allStreams/allStreamsLoading: setAllStreamsLoading(true)
    // above would otherwise retrigger this effect and cancel its own in-flight
    // request before the response arrives (cancelled flips true on the stale
    // closure, so the resolved data gets silently dropped).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, searchingAll])

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>()
    categories.forEach((c) => map.set(c.categoryId, c.categoryName))
    return map
  }, [categories])

  const visibleStreams = !text
    ? streams
    : searchingAll
      ? (allStreams ?? []).filter((s) => s.name.toLowerCase().includes(text))
      : streams.filter((s) => s.name.toLowerCase().includes(text))

  const closeDetail = () => setSelectedItem(null)

  const play = (resumeSecs: number) => {
    if (!selectedItem) return
    onPlay(selectedItem, resumeSecs)
    closeDetail()
  }

  const selectedProgress = selectedItem ? progress[`vod:${selectedItem.streamId}`] : undefined

  return (
    <div className="vod-panel">
      <aside className="vod-sidebar">
        {categoriesLoading ? (
          <p className="channel-hint">Loading categories…</p>
        ) : categoriesError ? (
          <p className="channel-hint channel-error">Failed to load categories: {categoriesError}</p>
        ) : (
          <div className="vod-category-list">
            {categories.map((cat) => (
              <div
                key={cat.categoryId}
                className={`vod-category-row${cat.categoryId === selectedCategoryId ? ' selected' : ''}`}
                onClick={() => {
                  setSelectedCategoryId(cat.categoryId)
                  onCategoryChange(cat.categoryId)
                }}
              >
                {cat.categoryName}
              </div>
            ))}
          </div>
        )}
      </aside>

      <div className="vod-main">
        <div className="vod-toolbar">
          <input
            className="vod-search"
            type="search"
            placeholder="Filter titles…"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          {text && (
            <div className="vod-scope-toggle">
              <button
                className={`vod-scope-btn${searchScope === 'category' ? ' active' : ''}`}
                onClick={() => setSearchScope('category')}
              >
                This category
              </button>
              <button
                className={`vod-scope-btn${searchScope === 'all' ? ' active' : ''}`}
                onClick={() => setSearchScope('all')}
              >
                All
              </button>
            </div>
          )}
        </div>

        {streamsLoading ? (
          <p className="channel-hint">Loading titles…</p>
        ) : streamsError ? (
          <p className="channel-hint channel-error">Failed to load titles: {streamsError}</p>
        ) : searchingAll && allStreamsLoading ? (
          <p className="channel-hint">Loading full library…</p>
        ) : searchingAll && allStreamsError ? (
          <p className="channel-hint channel-error">Failed to load full library: {allStreamsError}</p>
        ) : visibleStreams.length === 0 ? (
          <p className="channel-hint">No titles match.</p>
        ) : (
          <div className="vod-grid">
            {visibleStreams.map((item) => {
              const itemProgress = progress[`vod:${item.streamId}`]
              return (
                <div key={item.streamId} className="vod-poster-card" onClick={() => setSelectedItem(item)}>
                  {item.streamIcon ? (
                    <img className="vod-poster-img" src={item.streamIcon} alt="" loading="lazy" />
                  ) : (
                    <div className="vod-poster-img vod-poster-fallback">{item.name.charAt(0).toUpperCase()}</div>
                  )}
                  {itemProgress && itemProgress.durationSecs && (
                    <div className="vod-poster-progress">
                      <div
                        className="vod-poster-progress-fill"
                        style={{ width: `${Math.min(100, (itemProgress.positionSecs / itemProgress.durationSecs) * 100)}%` }}
                      />
                    </div>
                  )}
                  <div className="vod-poster-title" title={item.name}>
                    {item.name}
                  </div>
                  {searchingAll && (
                    <div className="vod-poster-category">{categoryNameById.get(item.categoryId) ?? ''}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedItem && (
        <div className="vod-detail-backdrop" onClick={closeDetail}>
          <div className="vod-detail-card" onClick={(e) => e.stopPropagation()}>
            <button className="vod-detail-close" onClick={closeDetail}>
              ✕
            </button>
            {selectedItem.streamIcon ? (
              <img className="vod-detail-poster" src={selectedItem.streamIcon} alt="" />
            ) : (
              <div className="vod-detail-poster vod-poster-fallback">{selectedItem.name.charAt(0).toUpperCase()}</div>
            )}
            <div className="vod-detail-info">
              <h2 className="vod-detail-title">{selectedItem.name}</h2>
              {infoLoading ? (
                <p className="channel-hint">Loading details…</p>
              ) : (
                <>
                  <div className="vod-detail-meta">
                    {(info?.rating ?? selectedItem.rating) != null && (
                      <span>★ {(info?.rating ?? selectedItem.rating)?.toFixed(1)}</span>
                    )}
                    {info?.releaseDate && <span>{info.releaseDate.slice(0, 4)}</span>}
                    {info?.genre && <span>{info.genre}</span>}
                  </div>
                  {info?.plot && <p className="vod-detail-plot">{info.plot}</p>}
                  {info?.cast && (
                    <p className="vod-detail-cast">
                      <strong>Cast:</strong> {info.cast}
                    </p>
                  )}
                  {info?.director && (
                    <p className="vod-detail-cast">
                      <strong>Director:</strong> {info.director}
                    </p>
                  )}
                </>
              )}
              <div className="vod-detail-actions">
                <button className="btn-accent" onClick={() => play(0)}>
                  ▶ Play
                </button>
                {selectedProgress && selectedProgress.durationSecs && (
                  <button onClick={() => play(selectedProgress.positionSecs)}>
                    Resume at {formatDuration(selectedProgress.positionSecs)}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VodBrowser
