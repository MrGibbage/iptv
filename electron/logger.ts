import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

// Minimal file logger: userData/logs/main.log gets one timestamped line per
// event (playback transitions, EPG refresh failures). mpv writes its own
// verbose log next to it (logs/mpv.log, truncated on each launch) — see
// playback.ts.
let dir: string | null = null

export function logsDir(): string {
  if (!dir) {
    dir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

const mainLogPath = () => path.join(logsDir(), 'main.log')

// Called once at startup so main.log can't grow without bound.
export function rotateLogs(maxBytes = 2 * 1024 * 1024): void {
  try {
    if (fs.statSync(mainLogPath()).size > maxBytes) fs.rmSync(mainLogPath())
  } catch {
    // missing file — nothing to rotate
  }
}

export function log(scope: string, message: string): void {
  const line = `${new Date().toISOString()} [${scope}] ${message}\n`
  try {
    fs.appendFileSync(mainLogPath(), line)
  } catch {
    // logging must never take the app down
  }
}
