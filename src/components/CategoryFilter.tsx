import { useEffect, useRef, useState } from 'react'
import type { CategoryOption } from './ChannelList'

interface Props {
  categories: CategoryOption[]
  selectedCategoryId: string | null
  selectedCategoryName: string | null
  onSelectCategory: (categoryId: string | null) => void
}

function CategoryFilter({ categories, selectedCategoryId, selectedCategoryName, onSelectCategory }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [open])

  const choose = (categoryId: string | null) => {
    onSelectCategory(categoryId)
    setOpen(false)
  }
  const allCount = categories.reduce((total, category) => total + category.count, 0)

  if (categories.length === 0) return null
  return (
    <div className="channel-cat" ref={rootRef}>
      <button
        className={`channel-cat-btn${selectedCategoryId ? ' active' : ''}`}
        title="Filter guide by category"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="channel-cat-label">{selectedCategoryName ?? 'Categories'}</span>
        <span className="channel-cat-caret">▾</span>
      </button>
      {open && (
        <div className="channel-cat-menu" role="menu">
          <button className={`channel-cat-item${selectedCategoryId ? '' : ' sel'}`} onClick={() => choose(null)}>
            <span className="channel-cat-item-name">All Channels</span>
            <span className="channel-cat-item-count">{allCount.toLocaleString()}</span>
          </button>
          <div className="channel-cat-sep" />
          {categories.map((category) => (
            <button
              key={category.id}
              className={`channel-cat-item${selectedCategoryId === category.id ? ' sel' : ''}`}
              onClick={() => choose(category.id)}
            >
              <span className="channel-cat-item-name">{category.name}</span>
              <span className="channel-cat-item-count">{category.count.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default CategoryFilter
