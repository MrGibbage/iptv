import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'

// Local viewing preferences (favorites, hidden channels, last tuned channel).
// Lives next to xtream-config.json in userData — never in the repo.
export interface Prefs {
  favoriteStreamIds: number[]
  hiddenStreamIds: number[]
  lastStreamId: number | null
  // Shared Live TV / Guide category filter. Null means All Channels.
  selectedLiveCategoryId: string | null
  selectedVodCategoryId: string | null
  selectedSeriesCategoryId: string | null
  startupView: 'home' | 'live' | 'guide' | 'vod' | 'series'
  dismissedHomeItems: string[]
  // When true, mpv decodes in software (hwdec=no) instead of on the GPU. Off
  // by default; a "maximum compatibility" escape hatch for the rare malformed
  // stream that can hang the hardware decoder (see electron/playback.ts).
  softwareDecoding: boolean
  // Selected color theme id ('system' follows the OS; other ids are built-ins
  // from src/themes.ts, or 'custom' with customTheme below). See src/themes.ts.
  theme: string
  // Token map for the user's pasted custom theme, applied when theme==='custom'.
  customTheme: Record<string, string> | null
}

function prefsPath(): string {
  return path.join(app.getPath('userData'), 'prefs.json')
}

function toNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((id): id is number => typeof id === 'number') : []
}

export async function loadPrefs(): Promise<Prefs> {
  try {
    const raw = JSON.parse(await fs.readFile(prefsPath(), 'utf-8')) as Partial<Prefs>
    return {
      favoriteStreamIds: toNumberArray(raw.favoriteStreamIds),
      hiddenStreamIds: toNumberArray(raw.hiddenStreamIds),
      lastStreamId: typeof raw.lastStreamId === 'number' ? raw.lastStreamId : null,
      selectedLiveCategoryId:
        typeof raw.selectedLiveCategoryId === 'string' ? raw.selectedLiveCategoryId : null,
      selectedVodCategoryId:
        typeof raw.selectedVodCategoryId === 'string' ? raw.selectedVodCategoryId : null,
      selectedSeriesCategoryId:
        typeof raw.selectedSeriesCategoryId === 'string' ? raw.selectedSeriesCategoryId : null,
      startupView: ['home', 'live', 'guide', 'vod', 'series'].includes(raw.startupView ?? '')
        ? raw.startupView!
        : 'live',
      dismissedHomeItems: Array.isArray(raw.dismissedHomeItems)
        ? raw.dismissedHomeItems.filter((key): key is string => typeof key === 'string')
        : [],
      softwareDecoding: raw.softwareDecoding === true,
      theme: typeof raw.theme === 'string' ? raw.theme : 'system',
      customTheme:
        raw.customTheme && typeof raw.customTheme === 'object' && !Array.isArray(raw.customTheme)
          ? (raw.customTheme as Record<string, string>)
          : null,
    }
  } catch {
    return {
      favoriteStreamIds: [],
      hiddenStreamIds: [],
      lastStreamId: null,
      selectedLiveCategoryId: null,
      selectedVodCategoryId: null,
      selectedSeriesCategoryId: null,
      startupView: 'live',
      dismissedHomeItems: [],
      softwareDecoding: false,
      theme: 'system',
      customTheme: null,
    }
  }
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  await fs.mkdir(path.dirname(prefsPath()), { recursive: true })
  await fs.writeFile(prefsPath(), JSON.stringify(prefs, null, 2), 'utf-8')
}
