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

export interface VodCategory {
  categoryId: string
  categoryName: string
}

export interface VodStream {
  streamId: number
  name: string
  streamIcon: string
  categoryId: string
  containerExtension: string
  rating: number | null
  added: string | null
}

export interface VodInfo {
  plot: string | null
  cast: string | null
  director: string | null
  genre: string | null
  releaseDate: string | null
  duration: string | null
  rating: number | null
  containerExtension: string
}

function toRating(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function getVodCategories(config: XtreamConfig): Promise<VodCategory[]> {
  const raw = await fetchJson(playerApiUrl(config, { action: 'get_vod_categories' }))
  if (!Array.isArray(raw)) return []
  return raw.map((entry: Record<string, unknown>) => ({
    categoryId: String(entry.category_id),
    categoryName: String(entry.category_name),
  }))
}

export async function getVodStreams(config: XtreamConfig, categoryId?: string): Promise<VodStream[]> {
  const params: Record<string, string> = { action: 'get_vod_streams' }
  if (categoryId) params.category_id = categoryId
  const raw = await fetchJson(playerApiUrl(config, params))
  if (!Array.isArray(raw)) return []
  return raw.map((entry: Record<string, unknown>) => ({
    streamId: Number(entry.stream_id),
    name: String(entry.name ?? ''),
    streamIcon: String(entry.stream_icon ?? ''),
    categoryId: String(entry.category_id ?? ''),
    containerExtension: String(entry.container_extension ?? 'mp4'),
    rating: toRating(entry.rating_5based ?? entry.rating),
    added: entry.added != null ? String(entry.added) : null,
  }))
}

export async function getVodInfo(config: XtreamConfig, vodId: number): Promise<VodInfo | null> {
  const raw = await fetchJson(playerApiUrl(config, { action: 'get_vod_info', vod_id: String(vodId) }))
  const obj = raw as { info?: Record<string, unknown>; movie_data?: Record<string, unknown> } | null
  if (!obj?.info) return null
  const info = obj.info
  const movieData = obj.movie_data ?? {}
  return {
    plot: (info.plot ?? info.description) != null ? String(info.plot ?? info.description) : null,
    cast: (info.cast ?? info.actors) != null ? String(info.cast ?? info.actors) : null,
    director: info.director != null ? String(info.director) : null,
    genre: info.genre != null ? String(info.genre) : null,
    releaseDate: (info.releasedate ?? info.release_date) != null ? String(info.releasedate ?? info.release_date) : null,
    duration: info.duration != null ? String(info.duration) : null,
    rating: toRating(info.rating),
    containerExtension: String(movieData.container_extension ?? 'mp4'),
  }
}

export function buildVodStreamUrl(config: XtreamConfig, streamId: number, extension: string): string {
  const base = normalizeBaseUrl(config.serverUrl)
  return `${base}/movie/${config.username}/${config.password}/${streamId}.${extension}`
}

export interface SeriesCategory {
  categoryId: string
  categoryName: string
}

export interface SeriesListItem {
  seriesId: number
  name: string
  cover: string
  categoryId: string
  rating: number | null
}

export interface SeriesEpisode {
  id: string
  episodeNum: number
  title: string
  containerExtension: string
  season: number
  plot: string | null
  duration: string | null
}

export interface SeriesSeason {
  seasonNumber: number
  name: string | null
  episodes: SeriesEpisode[]
}

export interface SeriesInfo {
  name: string
  cover: string
  plot: string | null
  cast: string | null
  director: string | null
  genre: string | null
  releaseDate: string | null
  rating: number | null
  seasons: SeriesSeason[]
}

export async function getSeriesCategories(config: XtreamConfig): Promise<SeriesCategory[]> {
  const raw = await fetchJson(playerApiUrl(config, { action: 'get_series_categories' }))
  if (!Array.isArray(raw)) return []
  return raw.map((entry: Record<string, unknown>) => ({
    categoryId: String(entry.category_id),
    categoryName: String(entry.category_name),
  }))
}

export async function getSeriesList(config: XtreamConfig, categoryId?: string): Promise<SeriesListItem[]> {
  const params: Record<string, string> = { action: 'get_series' }
  if (categoryId) params.category_id = categoryId
  const raw = await fetchJson(playerApiUrl(config, params))
  if (!Array.isArray(raw)) return []
  return raw.map((entry: Record<string, unknown>) => ({
    seriesId: Number(entry.series_id),
    name: String(entry.name ?? ''),
    cover: String(entry.cover ?? ''),
    categoryId: String(entry.category_id ?? ''),
    rating: toRating(entry.rating_5based ?? entry.rating),
  }))
}

export async function getSeriesInfo(config: XtreamConfig, seriesId: number): Promise<SeriesInfo | null> {
  const raw = await fetchJson(playerApiUrl(config, { action: 'get_series_info', series_id: String(seriesId) }))
  const obj = raw as {
    info?: Record<string, unknown>
    episodes?: Record<string, Array<Record<string, unknown>>>
    seasons?: Array<Record<string, unknown>>
  } | null
  if (!obj?.info) return null
  const info = obj.info

  const seasonNames = new Map<number, string | null>()
  for (const s of obj.seasons ?? []) {
    const num = Number(s.season_number)
    if (Number.isFinite(num)) seasonNames.set(num, s.name != null ? String(s.name) : null)
  }

  const episodesBySeason = obj.episodes ?? {}
  const seasons: SeriesSeason[] = Object.keys(episodesBySeason)
    .map((key) => Number(key))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
    .map((seasonNumber) => ({
      seasonNumber,
      name: seasonNames.get(seasonNumber) ?? null,
      episodes: (episodesBySeason[String(seasonNumber)] ?? []).map((ep) => {
        const epInfo = (ep.info ?? {}) as Record<string, unknown>
        return {
          id: String(ep.id),
          episodeNum: Number(ep.episode_num ?? 0),
          title: String(ep.title ?? `Episode ${ep.episode_num ?? ''}`),
          containerExtension: String(ep.container_extension ?? 'mp4'),
          season: seasonNumber,
          plot: epInfo.plot != null ? String(epInfo.plot) : null,
          duration: epInfo.duration != null ? String(epInfo.duration) : null,
        }
      }),
    }))

  return {
    name: String(info.name ?? ''),
    cover: String(info.cover ?? ''),
    plot: (info.plot ?? info.description) != null ? String(info.plot ?? info.description) : null,
    cast: (info.cast ?? info.actors) != null ? String(info.cast ?? info.actors) : null,
    director: info.director != null ? String(info.director) : null,
    genre: info.genre != null ? String(info.genre) : null,
    releaseDate:
      (info.releaseDate ?? info.release_date) != null ? String(info.releaseDate ?? info.release_date) : null,
    rating: toRating(info.rating_5based ?? info.rating),
    seasons,
  }
}

export function buildSeriesStreamUrl(config: XtreamConfig, episodeId: string, extension: string): string {
  const base = normalizeBaseUrl(config.serverUrl)
  return `${base}/series/${config.username}/${config.password}/${episodeId}.${extension}`
}
