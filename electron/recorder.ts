// Client for the iptv-recorder companion service (github.com/MrGibbage/iptv-recorder).
// Mirrors xtream.ts's shape: plain functions over fetch, JSON in/out, no state here.

export interface RecorderConnection {
  baseUrl: string
  apiKey: string
}

// Thrown for any non-2xx response. `status` lets callers distinguish the
// hard-reject cases the recorder documents (409: disabled provider, storage
// exhaustion, concurrent-stream limit, same-channel conflict) from real
// errors, and `message` is the recorder's own human-readable reason —
// surface it directly rather than a generic "request failed".
export class RecorderApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'RecorderApiError'
  }
}

// Electron's IPC boundary doesn't reliably preserve custom Error subclass
// properties (like RecorderApiError.status) when a thrown error crosses from
// main to renderer — only message/stack survive. Callers that need to tell a
// 409 hard-reject (with its specific reason) apart from a generic failure use
// this plain, structurally-cloneable shape instead of a thrown error.
export interface RecorderErrorInfo {
  status: number
  message: string
}

export function toErrorInfo(err: unknown): RecorderErrorInfo {
  if (err instanceof RecorderApiError) return { status: err.status, message: err.message }
  return { status: 0, message: err instanceof Error ? err.message : String(err) }
}

export type RecorderResult<T> = { ok: true; data: T } | { ok: false; error: RecorderErrorInfo }

export interface Provider {
  id: number
  name: string
  baseUrl: string
  maxConcurrentStreams: number
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface AuthCheckResult {
  ok: boolean
  error?: string
  checkedAt: string
}

export interface ProviderStatus {
  id: number
  enabled: boolean
  activeStreams: number
  maxConcurrentStreams: number
  auth: AuthCheckResult
}

export type RecordingStatus = 'scheduled' | 'recording' | 'completed' | 'failed' | 'cancelled'

export interface Recording {
  id: number
  providerId: number
  channelId: string
  recurringRuleId: number | null
  startTime: string
  endTime: string
  status: RecordingStatus
  filePath: string | null
  failureReason: string | null
  createdAt: string
  updatedAt: string
  projected?: boolean
}

export interface ProjectedOccurrence {
  recurringRuleId: number
  providerId: number
  channelId: string
  startTime: string
  endTime: string
  status: 'scheduled'
  projected: true
}

export function isProjected(row: Recording | ProjectedOccurrence): row is ProjectedOccurrence {
  return row.projected === true && !('id' in row)
}

export interface RecurringRule {
  id: number
  providerId: number
  channelId: string
  /** Bitmask: bit 0 = Monday .. bit 6 = Sunday. */
  daysOfWeek: number
  /** Minutes since midnight, UTC — enforced server-side (TZ pinned + boot-time assertion), not just a convention. */
  startMinuteOfDay: number
  durationMinutes: number
  endDate: string | null
  maxOccurrences: number | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

export interface RecurringRuleCancelResult extends RecurringRule {
  cancelledRecordings: number
}

export interface SkipException {
  id: number
  ruleId: number
  occurrenceDate: string
  createdAt: string
}

export interface RecordingsFilter {
  providerId?: number
  channelId?: string
  status?: RecordingStatus
  startAfter?: string
  startBefore?: string
  recurringRuleId?: number
  includeProjected?: boolean
}

export interface RecurringRulesFilter {
  providerId?: number
  cancelled?: boolean
}

export interface RecurrencePattern {
  daysOfWeek: number
  startMinuteOfDay: number
  durationMinutes: number
  endDate?: string
  maxOccurrences?: number
}

const REQUEST_TIMEOUT_MS = 10_000

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('Recorder base URL must start with http:// or https://')
  }
  return trimmed
}

function withQuery<T extends object>(path: string, params: T): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `${path}?${qs}` : path
}

async function request(conn: RecorderConnection, path: string, init?: RequestInit): Promise<unknown> {
  const base = normalizeBaseUrl(conn.baseUrl)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${conn.apiKey}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
      signal: controller.signal,
    })
    const text = await response.text()
    const body: unknown = text ? JSON.parse(text) : null
    if (!response.ok) {
      const message =
        body && typeof body === 'object' && 'error' in body
          ? String((body as { error: unknown }).error)
          : `HTTP ${response.status}`
      throw new RecorderApiError(response.status, message)
    }
    return body
  } finally {
    clearTimeout(timeout)
  }
}

export interface RecorderTestResult {
  ok: boolean
  message: string
}

// No dedicated "test" endpoint for a client's own key — GET /providers is the
// lightest authenticated route, so a passing call proves both that baseUrl is
// reachable and that apiKey is valid.
export async function testConnection(conn: RecorderConnection): Promise<RecorderTestResult> {
  try {
    await request(conn, '/providers')
    return { ok: true, message: 'Connected successfully.' }
  } catch (err) {
    if (err instanceof RecorderApiError) {
      if (err.status === 401 || err.status === 403) {
        return { ok: false, message: 'Authentication failed — check the API key.' }
      }
      return { ok: false, message: err.message }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, message: `Connection failed: ${message}` }
  }
}

export async function listProviders(conn: RecorderConnection): Promise<Provider[]> {
  return (await request(conn, '/providers')) as Provider[]
}

export async function getProviderStatus(conn: RecorderConnection, providerId: number): Promise<ProviderStatus> {
  return (await request(conn, `/providers/${providerId}/status`)) as ProviderStatus
}

export async function createOneOffRecording(
  conn: RecorderConnection,
  input: { providerId: number; channelId: string; startTime: string; endTime: string },
): Promise<Recording> {
  return (await request(conn, '/recordings', {
    method: 'POST',
    body: JSON.stringify(input),
  })) as Recording
}

export async function createRecurringRecording(
  conn: RecorderConnection,
  input: { providerId: number; channelId: string; recurrence: RecurrencePattern },
): Promise<RecurringRule> {
  return (await request(conn, '/recordings', {
    method: 'POST',
    body: JSON.stringify(input),
  })) as RecurringRule
}

export async function listRecordings(
  conn: RecorderConnection,
  filter: RecordingsFilter = {},
): Promise<Array<Recording | ProjectedOccurrence>> {
  return (await request(conn, withQuery('/recordings', filter))) as Array<Recording | ProjectedOccurrence>
}

export async function getRecording(conn: RecorderConnection, id: number): Promise<Recording> {
  return (await request(conn, `/recordings/${id}`)) as Recording
}

export async function cancelRecording(conn: RecorderConnection, id: number): Promise<void> {
  await request(conn, `/recordings/${id}`, { method: 'DELETE' })
}

// Not authenticated here — mpv fetches this URL directly with an
// Authorization header attached via playback.ts's per-load headers, since
// this app hands raw URLs to mpv rather than fetching bytes itself.
export function buildRecordingFileUrl(conn: RecorderConnection, id: number): string {
  return `${normalizeBaseUrl(conn.baseUrl)}/recordings/${id}/file`
}

export async function listRecurringRules(
  conn: RecorderConnection,
  filter: RecurringRulesFilter = {},
): Promise<RecurringRule[]> {
  return (await request(conn, withQuery('/recordings/recurring', filter))) as RecurringRule[]
}

export async function getRecurringRule(conn: RecorderConnection, ruleId: number): Promise<RecurringRule> {
  return (await request(conn, `/recordings/recurring/${ruleId}`)) as RecurringRule
}

export async function skipOccurrence(
  conn: RecorderConnection,
  ruleId: number,
  date: string,
): Promise<Recording | SkipException> {
  return (await request(conn, `/recordings/recurring/${ruleId}/skip`, {
    method: 'POST',
    body: JSON.stringify({ date }),
  })) as Recording | SkipException
}

export async function cancelRecurringRule(
  conn: RecorderConnection,
  ruleId: number,
): Promise<RecurringRuleCancelResult> {
  return (await request(conn, `/recordings/recurring/${ruleId}`, { method: 'DELETE' })) as RecurringRuleCancelResult
}
