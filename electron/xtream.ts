export interface XtreamConfig {
  serverUrl: string
  username: string
  password: string
}

export interface XtreamUserInfo {
  username: string
  status: string
  expDate: string | null
  isTrial: boolean
  activeConnections: number
  maxConnections: number
}

export interface XtreamTestResult {
  ok: boolean
  message: string
  userInfo?: XtreamUserInfo
}

export interface LiveCategory {
  categoryId: string
  categoryName: string
}

export interface LiveStream {
  streamId: number
  name: string
  streamIcon: string
  categoryId: string
  epgChannelId: string | null
}

const REQUEST_TIMEOUT_MS = 10_000

function normalizeBaseUrl(serverUrl: string): string {
  const trimmed = serverUrl.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('Server URL must start with http:// or https://')
  }
  return trimmed
}

function playerApiUrl(config: XtreamConfig, params: Record<string, string> = {}): string {
  const base = normalizeBaseUrl(config.serverUrl)
  const url = new URL(`${base}/player_api.php`)
  url.searchParams.set('username', config.username)
  url.searchParams.set('password', config.password)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`Server responded with HTTP ${response.status}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

export async function testConnection(config: XtreamConfig): Promise<XtreamTestResult> {
  let raw: unknown
  try {
    raw = await fetchJson(playerApiUrl(config))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, message: `Connection failed: ${message}` }
  }

  const userInfo = (raw as { user_info?: Record<string, unknown> } | null)?.user_info
  if (!userInfo) {
    return { ok: false, message: 'Server did not return account info — check the server URL.' }
  }

  const auth = userInfo.auth
  if (auth !== 1 && auth !== '1' && auth !== true) {
    return { ok: false, message: 'Authentication failed — check username and password.' }
  }

  return {
    ok: true,
    message: 'Connected successfully.',
    userInfo: {
      username: String(userInfo.username ?? config.username),
      status: String(userInfo.status ?? 'Unknown'),
      expDate: userInfo.exp_date != null ? String(userInfo.exp_date) : null,
      isTrial: userInfo.is_trial === 1 || userInfo.is_trial === '1',
      activeConnections: Number(userInfo.active_cons ?? 0),
      maxConnections: Number(userInfo.max_connections ?? 0),
    },
  }
}

export async function getLiveCategories(config: XtreamConfig): Promise<LiveCategory[]> {
  const raw = await fetchJson(playerApiUrl(config, { action: 'get_live_categories' }))
  if (!Array.isArray(raw)) return []
  return raw.map((entry: Record<string, unknown>) => ({
    categoryId: String(entry.category_id),
    categoryName: String(entry.category_name),
  }))
}

export async function getLiveStreams(config: XtreamConfig, categoryId?: string): Promise<LiveStream[]> {
  const params: Record<string, string> = { action: 'get_live_streams' }
  if (categoryId) params.category_id = categoryId
  const raw = await fetchJson(playerApiUrl(config, params))
  if (!Array.isArray(raw)) return []
  return raw.map((entry: Record<string, unknown>) => ({
    streamId: Number(entry.stream_id),
    name: String(entry.name ?? ''),
    streamIcon: String(entry.stream_icon ?? ''),
    categoryId: String(entry.category_id ?? ''),
    epgChannelId: entry.epg_channel_id != null ? String(entry.epg_channel_id) : null,
  }))
}

export function buildLiveStreamUrl(config: XtreamConfig, streamId: number, extension = 'ts'): string {
  const base = normalizeBaseUrl(config.serverUrl)
  return `${base}/live/${config.username}/${config.password}/${streamId}.${extension}`
}
