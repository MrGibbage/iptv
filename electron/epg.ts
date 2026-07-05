import { app } from 'electron'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import type { XtreamConfig } from './xtream'
import * as epgDb from './epg-db'
import { parseXmltvFile } from './xmltv'

export interface EpgStatus {
  state: 'idle' | 'refreshing' | 'error'
  phase: 'download' | 'ingest' | null
  lastRefreshMs: number | null
  channelCount: number
  programmeCount: number
  error: string | null
}

const REFRESH_TTL_MS = 12 * 60 * 60 * 1000
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000
const LAST_REFRESH_KEY = 'lastRefreshMs'

let refreshing = false
let currentPhase: EpgStatus['phase'] = null
let lastError: string | null = null
let statusListener: ((status: EpgStatus) => void) | null = null

export function onStatusChange(listener: (status: EpgStatus) => void): void {
  statusListener = listener
}

export function getStatus(): EpgStatus {
  const last = epgDb.getMeta(LAST_REFRESH_KEY)
  const counts = epgDb.getCounts()
  return {
    state: refreshing ? 'refreshing' : lastError ? 'error' : 'idle',
    phase: currentPhase,
    lastRefreshMs: last != null ? Number(last) : null,
    channelCount: counts.channels,
    programmeCount: counts.programmes,
    error: lastError,
  }
}

function emitStatus(): void {
  statusListener?.(getStatus())
}

function xmltvUrl(config: XtreamConfig): string {
  const base = config.serverUrl.trim().replace(/\/+$/, '')
  const url = new URL(`${base}/xmltv.php`)
  url.searchParams.set('username', config.username)
  url.searchParams.set('password', config.password)
  return url.toString()
}

async function downloadXmltv(config: XtreamConfig, destPath: string): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
  try {
    const response = await fetch(xmltvUrl(config), { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`EPG download failed: HTTP ${response.status}`)
    }
    if (!response.body) {
      throw new Error('EPG download failed: empty response body')
    }
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(destPath))
  } finally {
    clearTimeout(timeout)
  }
}

async function ingestFile(filePath: string): Promise<{ channelCount: number; programmeCount: number }> {
  const ingest = epgDb.beginReplaceIngest()
  // Programme FTS rows carry the channel name so search can match on it;
  // XMLTV lists all channels before any programmes, so this map is complete
  // by the time programmes arrive.
  const channelNames = new Map<string, string>()
  try {
    const result = await parseXmltvFile(filePath, {
      onChannels(batch) {
        for (const ch of batch) {
          channelNames.set(ch.id, ch.displayName)
          ingest.insertChannel({ id: ch.id, displayName: ch.displayName, icon: ch.icon })
        }
      },
      onProgrammes(batch) {
        for (const p of batch) {
          ingest.insertProgramme({
            channelId: p.channelId,
            startMs: p.startMs,
            stopMs: p.stopMs,
            title: p.title,
            description: p.description,
            channelName: channelNames.get(p.channelId) ?? '',
          })
        }
      },
    })
    ingest.commit()
    return result
  } catch (err) {
    ingest.rollback()
    throw err
  }
}

export async function refresh(config: XtreamConfig, force = false): Promise<EpgStatus> {
  if (refreshing) return getStatus()

  if (!force) {
    const last = epgDb.getMeta(LAST_REFRESH_KEY)
    if (last != null && Date.now() - Number(last) < REFRESH_TTL_MS) {
      return getStatus()
    }
  }

  refreshing = true
  lastError = null

  // Dev override: point IPTV_EPG_FILE at a local XMLTV file to skip the
  // provider download (see README).
  const overrideFile = process.env.IPTV_EPG_FILE
  const downloadPath = path.join(app.getPath('userData'), 'epg-download.xml')

  try {
    let sourceFile: string
    if (overrideFile) {
      sourceFile = overrideFile
    } else {
      currentPhase = 'download'
      emitStatus()
      await downloadXmltv(config, downloadPath)
      sourceFile = downloadPath
    }

    currentPhase = 'ingest'
    emitStatus()
    await ingestFile(sourceFile)
    epgDb.setMeta(LAST_REFRESH_KEY, String(Date.now()))
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
  } finally {
    refreshing = false
    currentPhase = null
    if (!overrideFile) {
      await fs.rm(downloadPath, { force: true }).catch(() => {})
    }
    emitStatus()
  }
  return getStatus()
}
