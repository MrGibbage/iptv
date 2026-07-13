import { app, screen, type Rectangle } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

export interface WindowState {
  bounds: Rectangle
  maximized: boolean
}

const DEFAULT_BOUNDS: Rectangle = { x: 0, y: 0, width: 1280, height: 800 }

function statePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function isRectangle(value: unknown): value is Rectangle {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Rectangle>
  return [item.x, item.y, item.width, item.height].every(Number.isFinite)
    && item.width! >= 800
    && item.height! >= 500
}

function isVisible(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    const overlapWidth = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)
    const overlapHeight = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y)
    return overlapWidth >= 100 && overlapHeight >= 100
  })
}

function centeredDefault(): Rectangle {
  const area = screen.getPrimaryDisplay().workArea
  const width = Math.min(DEFAULT_BOUNDS.width, area.width)
  const height = Math.min(DEFAULT_BOUNDS.height, area.height)
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
  }
}

export async function loadWindowState(): Promise<WindowState> {
  try {
    const raw = JSON.parse(await fs.readFile(statePath(), 'utf-8')) as Partial<WindowState>
    if (isRectangle(raw.bounds) && isVisible(raw.bounds)) {
      return { bounds: raw.bounds, maximized: raw.maximized === true }
    }
  } catch {
    // First launch or an unreadable state file uses the safe default below.
  }
  return { bounds: centeredDefault(), maximized: false }
}

export async function saveWindowState(state: WindowState): Promise<void> {
  await fs.mkdir(path.dirname(statePath()), { recursive: true })
  await fs.writeFile(statePath(), JSON.stringify(state, null, 2), 'utf-8')
}
