import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'

// Resume-position tracking for VOD/series playback, keyed by a caller-chosen
// string id (e.g. `vod:${streamId}`, `ep:${episodeId}`) since these aren't
// live channels and don't fit prefs-store's lastStreamId. Lives next to
// prefs.json in userData — never in the repo.
export interface WatchProgress {
  positionSecs: number
  durationSecs: number | null
  updatedAt: number
  kind?: 'vod' | 'episode'
  title?: string
  seriesName?: string
  image?: string
  containerExtension?: string
  categoryId?: string
  episodeNum?: number
  season?: number
}

export type ProgressMap = Record<string, WatchProgress>

function progressPath(): string {
  return path.join(app.getPath('userData'), 'progress.json')
}

export async function loadProgress(): Promise<ProgressMap> {
  try {
    const raw = JSON.parse(await fs.readFile(progressPath(), 'utf-8')) as ProgressMap
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

export async function saveProgress(key: string, progress: WatchProgress): Promise<void> {
  const all = await loadProgress()
  // A movie/episode played to (near) completion shouldn't keep offering
  // "Resume" — clearing the entry here means the UI just falls back to Play.
  const nearEnd = progress.durationSecs != null && progress.positionSecs >= progress.durationSecs - 30
  if (nearEnd || progress.positionSecs < 10) {
    delete all[key]
  } else {
    all[key] = progress
  }
  await fs.mkdir(path.dirname(progressPath()), { recursive: true })
  await fs.writeFile(progressPath(), JSON.stringify(all, null, 2), 'utf-8')
}
