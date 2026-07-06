import type Mpv from 'electron-libmpv'
import path from 'node:path'
import fs from 'node:fs'
import { log, logsDir } from './logger'

// Playback watchdog — strictly event-driven. mpv property reads
// (getRawProperty) are SYNCHRONOUS and block the Electron main process while
// the core is busy (e.g. wedged opening a dead stream) — polling them froze
// the whole app. So failure detection uses only mpv events (delivered by the
// patched addon, see patches/electron-libmpv+1.1.0.patch) plus plain JS
// timers:
//   - no playback-restart within OPEN_TIMEOUT_MS of loadfile → failure
//   - end-file with reason "error" (or an unexpected eof on a live stream) →
//     failure with mpv's own error string
//   - observed time-pos frozen for STALL_TIMEOUT_MS while playing → failure
// On failure the load is aborted with `stop` (async command — safe): that
// closes the connection, which frees the provider's concurrent-stream slot so
// other channels remain tunable.
//
// Some corrupt/malformed streams don't just fail to open — they hang the
// hardware decode session (a GPU-driver-level deadlock, not something JS or
// even Electron's own exit path can route around: Chromium's GPU process
// shares the same physical device/driver, so app.exit()/app.quit() can block
// on it too, and killing+relaunching the whole app from an external process
// turned out to fight dev tooling for no real gain). Instead this is
// reported as a distinct 'wedged' state with no Retry — mpv genuinely won't
// respond to anything anymore, so the honest answer is "restart the app"
// rather than pretending recovery is possible.
export interface PlaybackStatus {
  state: 'idle' | 'loading' | 'playing' | 'error' | 'wedged'
  message?: string
  /** The stream this status refers to (set by play); lets the renderer trust
   *  transitions without guessing which channel they belong to. */
  streamId?: number
}

export interface MpvEvent {
  event: string
  reason?: string
  error?: string
  name?: string
  value?: number | boolean | string
}

const OPEN_TIMEOUT_MS = 25_000
const STALL_TIMEOUT_MS = 20_000
const WEDGE_TIMEOUT_MS = 8_000
// A channel only becomes trustworthy as a startup-resume target after
// surviving this long without stalling/erroring. SKY CINEMA SCI-FI (the
// channel that originally wedged the app) played fine for ~30s before its
// hardware-decode hang — comfortably longer than STALL_TIMEOUT_MS — so this
// has to clear that bar, not just "played at all", or a bad channel that
// re-wedges the (now auto-restarting) app would just resume straight back
// into itself every time.
const CONFIRM_PLAYABLE_MS = 45_000

let player: Mpv | null = null
let emit: (status: PlaybackStatus) => void = () => {}
let onConfirmedPlayable: (streamId: number) => void = () => {}

let phase: PlaybackStatus['state'] = 'idle'
let currentStreamId: number | undefined
let openTimer: ReturnType<typeof setTimeout> | null = null
let stallTimer: ReturnType<typeof setTimeout> | null = null
let wedgeTimer: ReturnType<typeof setTimeout> | null = null
let confirmTimer: ReturnType<typeof setTimeout> | null = null

export function init(
  p: Mpv,
  onStatus: (status: PlaybackStatus) => void,
  onPlayableConfirmed: (streamId: number) => void,
): void {
  player = p
  emit = onStatus
  onConfirmedPlayable = onPlayableConfirmed
}

// Runtime mpv options, set once the player is attached (setProperty is async
// in the patched addon): fail hung network reads after 10 s instead of mpv's
// 60 s default; write mpv's own log to userData/logs/mpv.log (truncated on
// each launch) but keep it to lifecycle lines for cplayer (loadfile/opening/
// playback-restart — useful for diagnosing a wedge) while dropping the
// verbose per-frame/shader spam every other module emits at the same level.
export function configureMpv(): void {
  player?.property('log-file', path.join(logsDir(), 'mpv.log'))
  player?.property('msg-level', 'all=warn,cplayer=v')
  player?.property('network-timeout', '10')
  // auto-safe still uses the GPU decoder for well-formed streams but lets mpv
  // decline hwdec on codec/profile combos it doesn't trust — the outright
  // hang came from a malformed HEVC stream on d3d11va, so narrowing when
  // hwdec is used at all reduces (not eliminates) the risk of a repeat.
  player?.property('hwdec', 'auto-safe')
}

function clearTimers(): void {
  if (openTimer) clearTimeout(openTimer)
  if (stallTimer) clearTimeout(stallTimer)
  if (wedgeTimer) clearTimeout(wedgeTimer)
  if (confirmTimer) clearTimeout(confirmTimer)
  openTimer = null
  stallTimer = null
  wedgeTimer = null
  confirmTimer = null
}

// Call after every command we expect mpv to at least acknowledge (loadfile,
// or the `stop` issued from fail()). Any event at all clears it (see
// handleMpvEvent); silence for the full window means the core is wedged.
function armWedgeWatch(): void {
  if (wedgeTimer) clearTimeout(wedgeTimer)
  wedgeTimer = setTimeout(() => {
    log('playback', 'mpv core unresponsive')
    clearTimers()
    setPhase('wedged', 'Playback engine became unresponsive — restart the app to continue.')
  }, WEDGE_TIMEOUT_MS)
}

function setPhase(next: PlaybackStatus['state'], message?: string): void {
  phase = next
  emit({ state: next, message, streamId: currentStreamId })
}

export function play(url: string, streamId?: number): void {
  if (!player) return
  clearTimers()
  currentStreamId = streamId
  // Once mpv is confirmed wedged it never recovers — don't make the user
  // wait through another full open-timeout to be told the same thing again.
  if (phase === 'wedged') {
    setPhase('wedged', 'Playback engine became unresponsive — restart the app to continue.')
    return
  }
  log('playback', `loadfile ${url}`)
  player.command('loadfile', url, 'replace')
  setPhase('loading')
  openTimer = setTimeout(() => fail('Stream did not start'), OPEN_TIMEOUT_MS)
  armWedgeWatch()
}

export function stop(): void {
  clearTimers()
  player?.command('stop')
  armWedgeWatch()
  setPhase('idle')
}

export function handleMpvEvent(ev: MpvEvent): void {
  // Any event at all proves the core is alive and processing — clear the
  // wedge suspicion regardless of which event this is.
  if (wedgeTimer) {
    clearTimeout(wedgeTimer)
    wedgeTimer = null
  }
  switch (ev.event) {
    case 'playback-restart':
      // Fires when playback actually begins (and after seeks/recovery).
      if (phase === 'loading' || phase === 'error') {
        clearTimers()
        log('playback', 'playing')
        setPhase('playing')
        const streamId = currentStreamId
        if (streamId != null) {
          confirmTimer = setTimeout(() => {
            confirmTimer = null
            log('playback', 'confirmed playable')
            onConfirmedPlayable(streamId)
          }, CONFIRM_PLAYABLE_MS)
        }
      }
      bumpStall()
      break
    case 'end-file':
      // "stop"/"quit"/"redirect" are self-inflicted (our own stop command,
      // loadfile replace, app quit) — only real failures surface.
      if (ev.reason === 'error') {
        fail(`Playback failed: ${ev.error ?? 'unknown error'}`)
      } else if (ev.reason === 'eof' && phase === 'playing') {
        // A live stream reaching EOF means the provider dropped it.
        fail('Stream ended unexpectedly')
      }
      break
    case 'property-change':
      if (ev.name === 'time-pos' && typeof ev.value === 'number') {
        bumpStall()
      }
      break
  }
}

// While playing, time-pos changes arrive continuously; each one pushes the
// stall deadline out. Silence for STALL_TIMEOUT_MS means the stream froze.
function bumpStall(): void {
  if (phase !== 'playing') return
  if (stallTimer) clearTimeout(stallTimer)
  stallTimer = setTimeout(() => fail('Stream stalled'), STALL_TIMEOUT_MS)
}

function fail(reason: string): void {
  clearTimers()
  player?.command('stop')
  armWedgeWatch()
  const detail = lastMpvError()
  const message = detail && !reason.includes(detail) ? `${reason} — ${detail}` : reason
  log('playback', `error: ${message}`)
  setPhase('error', message)
}

// Pull the most recent error/fatal line from the tail of mpv's log so the
// user sees mpv's actual reason (403, connection refused, timeout, …).
function lastMpvError(): string | null {
  try {
    const file = path.join(logsDir(), 'mpv.log')
    const size = fs.statSync(file).size
    const len = Math.min(size, 64 * 1024)
    const buf = Buffer.alloc(len)
    const fd = fs.openSync(file, 'r')
    try {
      fs.readSync(fd, buf, 0, len, size - len)
    } finally {
      fs.closeSync(fd)
    }
    const lines = buf.toString('utf-8').split(/\r?\n/)
    // mpv log-file lines look like "[ 12.3][e][ffmpeg] tcp: ...": [e]rror/[f]atal.
    const isError = (l: string) => /^\[[^\]]*\]\[[ef]\]/.test(l)
    for (let i = lines.length - 1; i >= 0; i--) {
      if (isError(lines[i])) {
        return lines[i].replace(/^\[[^\]]*\]\[[ef]\]/, '').trim()
      }
    }
  } catch {
    // no log yet, or unreadable — the generic reason still gets shown
  }
  return null
}
