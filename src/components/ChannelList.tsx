import { useEffect, useRef, useState } from 'react'
import type { LiveStream } from '../../electron/xtream'

export interface CategoryOption {
  id: string
  name: string
  count: number
}

interface ChannelListProps {
  channels: LiveStream[]
  totalCount: number
  loading: boolean
  error: string | null
  onSelect: (stream: LiveStream) => void
  selectedStreamId: number | null
  favorites: Set<number>
  onToggleFavorite: (streamId: number) => void
  favoritesOnly: boolean
  onToggleFavoritesOnly: () => void
  filterText: string
  onFilterTextChange: (text: string) => void
  onHideChannel: (streamId: number) => void
  categories: CategoryOption[]
  selectedCategoryId: string | null
  selectedCategoryName: string | null
  onSelectCategory: (categoryId: string | null) => void
}

function ChannelList({
  channels,
  totalCount,
  loading,
  error,
  onSelect,
  selectedStreamId,
  favorites,
  onToggleFavorite,
  favoritesOnly,
  onToggleFavoritesOnly,
  filterText,
  onFilterTextChange,
  onHideChannel,
  categories,
  selectedCategoryId,
  selectedCategoryName,
  onSelectCategory,
}: ChannelListProps) {
  const selectedRef = useRef<HTMLDivElement>(null)
  const catRef = useRef<HTMLDivElement>(null)
  const [catMenuOpen, setCatMenuOpen] = useState(false)

  // Keep the tuned channel visible while zapping with the keyboard.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedStreamId])

  // Close the category menu on any click outside it.
  useEffect(() => {
    if (!catMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [catMenuOpen])

  const chooseCategory = (categoryId: string | null) => {
    onSelectCategory(categoryId)
    setCatMenuOpen(false)
  }
  const allCount = categories.reduce((n, c) => n + c.count, 0)

  return (
    <div className="channel-panel">
      <div className="channel-toolbar">
        <input
          className="channel-search"
          type="search"
          placeholder="Filter channels…"
          value={filterText}
          onChange={(e) => onFilterTextChange(e.target.value)}
        />
        {categories.length > 0 && (
          <div className="channel-cat" ref={catRef}>
            <button
              className={`channel-cat-btn${selectedCategoryId ? ' active' : ''}`}
              title="Filter by category"
              onClick={() => setCatMenuOpen((o) => !o)}
            >
              <span className="channel-cat-label">{selectedCategoryName ?? 'Categories'}</span>
              <span className="channel-cat-caret">▾</span>
            </button>
            {catMenuOpen && (
              <div className="channel-cat-menu">
                <button
                  className={`channel-cat-item${selectedCategoryId ? '' : ' sel'}`}
                  onClick={() => chooseCategory(null)}
                >
                  <span className="channel-cat-item-name">All Channels</span>
                  <span className="channel-cat-item-count">{allCount.toLocaleString()}</span>
                </button>
                <div className="channel-cat-sep" />
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    className={`channel-cat-item${selectedCategoryId === cat.id ? ' sel' : ''}`}
                    onClick={() => chooseCategory(cat.id)}
                  >
                    <span className="channel-cat-item-name">{cat.name}</span>
                    <span className="channel-cat-item-count">{cat.count.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button
          className={`channel-fav-filter${favoritesOnly ? ' active' : ''}`}
          title={favoritesOnly ? 'Show all channels' : 'Show favorites only'}
          onClick={onToggleFavoritesOnly}
        >
          ★
        </button>
      </div>

      {loading ? (
        <p className="channel-hint">Loading channels…</p>
      ) : error ? (
        <p className="channel-hint channel-error">Failed to load channels: {error}</p>
      ) : (
        <>
          <div className="channel-scroll">
            {channels.length === 0 && (
              <p className="channel-hint">
                {favoritesOnly
                  ? 'No favorites yet — click a channel’s star to add one.'
                  : 'No channels match.'}
              </p>
            )}
            {channels.map((channel) => {
              const isSelected = channel.streamId === selectedStreamId
              const isFav = favorites.has(channel.streamId)
              return (
                <div
                  key={channel.streamId}
                  ref={isSelected ? selectedRef : undefined}
                  className={`channel-row${isSelected ? ' selected' : ''}`}
                  onClick={() => onSelect(channel)}
                >
                  {channel.streamIcon ? (
                    <img className="channel-logo" src={channel.streamIcon} alt="" loading="lazy" />
                  ) : (
                    <div className="channel-logo channel-logo-fallback">
                      {channel.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="channel-name" title={channel.name}>
                    {channel.name}
                  </span>
                  <button
                    className={`channel-star${isFav ? ' faved' : ''}`}
                    title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleFavorite(channel.streamId)
                    }}
                  >
                    {isFav ? '★' : '☆'}
                  </button>
                  <button
                    className="channel-hide"
                    title="Hide this channel"
                    onClick={(e) => {
                      e.stopPropagation()
                      onHideChannel(channel.streamId)
                    }}
                  >
                    ⊘
                  </button>
                </div>
              )
            })}
          </div>
          <div className="channel-count">
            {channels.length === totalCount
              ? `${totalCount.toLocaleString()} channels`
              : `${channels.length.toLocaleString()} of ${totalCount.toLocaleString()} channels`}
          </div>
        </>
      )}
    </div>
  )
}

export default ChannelList
