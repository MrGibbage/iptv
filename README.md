# IPTV Viewer

Custom Windows IPTV client (Electron + React + TypeScript). See [PLAN.md](./PLAN.md)
for architecture, scope, and build order.

## Dev setup

Playback uses [electron-libmpv](https://www.npmjs.com/package/electron-libmpv), a native
addon that embeds libmpv directly into the Electron window (Windows only). Its build and
runtime files are gitignored (large binaries, not source) and must be set up manually:

1. Install Visual Studio Build Tools with the "Desktop development with C++" workload
   (needed by node-gyp to compile the native addon).
2. Download a libmpv dev build for Windows from the
   [mpv-player-windows SourceForge project](https://sourceforge.net/projects/mpv-player-windows/files/libmpv/)
   (an `x86_64` or `x86_64-v3` `.7z`; `v3` needs a CPU with AVX2, which any Ryzen/Core CPU
   from the last ~8 years has).
3. Extract it into `C:\mpv-dev` so it looks like:
   ```
   C:\mpv-dev\
     include\mpv\*.h
     x86_64\libmpv-2.dll.a   (rename from libmpv.dll.a)
     libmpv-2.dll
   ```
4. Copy `C:\mpv-dev\libmpv-2.dll` into this project's root directory (next to
   `package.json`) — required for the dev server / `electron .` to find it at runtime.

```powershell
npm install       # also applies patches/ (see below) and rebuilds native addons for Electron's ABI
npm run dev
```

`electron-libmpv` is patched (`patches/electron-libmpv+1.1.0.patch`, applied automatically via
`patch-package` in `postinstall`) — upstream never registers mpv's wakeup callback or forwards
event payloads, which the playback watchdog below depends on entirely. If you ever bump the
`electron-libmpv` version, re-apply/regenerate the patch and re-run `electron-rebuild`.

## Using the app

- **Favorites:** hover a channel row and click the star; favorites sort first in the
  list, and the ★ button next to the filter box shows favorites only. Stored with the
  last-tuned channel in `%APPDATA%/iptv/prefs.json`.
- **Channel filter:** the sidebar search box filters the loaded channel list by name
  (no EPG involved).
- **Quick switching:** with the Live TV tab focused (and not typing in a field),
  `↑`/`↓` zap to the previous/next channel in the *visible* (filtered/sorted) list,
  and `Backspace` jumps back to the previously tuned channel. The last channel
  resumes automatically on next launch.
- **Hidden channels:** hover a channel row and click ⊘ to remove a permanently broken
  channel from the sidebar, guide grid, and EPG search — some Xtream channels are just
  bad (wrong stream, wrong codec, dead relay) and there's no reason to keep tripping
  over them. A channel that freezes playback badly enough to wedge mpv (see below) is
  hidden automatically. Review or restore hidden channels from Settings → Hidden
  Channels (no preview/playback there by design, since that's exactly what could
  trigger the freeze again).

## Logs & flaky streams

Logs live in `%APPDATA%\iptv\logs\`:

- **`main.log`** — app events: every tune, playback failures (with mpv's reason),
  EPG refresh errors. Rotated when it exceeds 2 MB.
- **`mpv.log`** — mpv's own verbose log, truncated on each launch. This is where the
  real network/demux detail is when a channel won't play.

Playback runs through a watchdog in the main process (`electron/playback.ts`), driven
entirely by real mpv events (see `patches/electron-libmpv+1.1.0.patch` — the upstream
addon silently discarded every mpv event and never registered its wakeup callback, so
this had to be patched in; `getRawProperty` is synchronous and must never be polled,
since it blocks the whole main process if the mpv core is busy). If a stream produces
no playback within 25 s, or freezes for 20 s mid-play, the load is aborted with `stop`
and the error shows in a bar above the player with a Retry button. The abort matters
beyond the UI: it closes the connection, and Xtream providers typically cap concurrent
streams — a wedged stream would otherwise hold the slot and block every subsequent
tune. mpv's network timeout is also lowered to 10 s (default 60 s) so dead sockets fail
fast, and hwdec is `auto-safe` rather than a forced `d3d11va`.

**When mpv itself wedges:** some malformed streams don't just fail to open — they hang
the GPU hardware-decode session outright, a driver-level deadlock libmpv can't recover
from in-process (confirmed via `mpv.log`: a channel played audio+video fine for ~30 s,
then every mpv event stopped arriving, including for our own `stop` command — nothing
played again until the process was killed). The watchdog detects this directly: any
command it expects mpv to at least acknowledge (`loadfile`, `stop`) arms an 8 s timer
that only clears when *any* mpv event arrives; silence past that means the core is
dead. There is no in-process recovery from this — an earlier version tried an
automatic kill-and-relaunch, but Chromium's own GPU process shares the same physical
device/driver mpv hung on, so even Electron's own exit path could block on it too,
and getting a reliable external relaunch working turned out to cost far more
complexity than the rare failure justified. Instead the app shows a fixed "Playback
engine became unresponsive — restart the app to continue" message (no Retry — retrying
is pointless once the core is dead) and hides the offending channel automatically, so
it can't wedge you again on the next launch. Relatedly, a channel is only trusted as
the next-launch *resume* target once it's played without failing for 45 s
(`CONFIRM_PLAYABLE_MS`) — comfortably past the ~30 s hang above — so a bad channel
can't boot-loop the app into itself even before the auto-hide kicks in.

## EPG (guide) internals

The guide is cached in SQLite (`better-sqlite3`) at `%APPDATA%/iptv/epg-cache.sqlite3`,
with an FTS5 index so search matches channel name, programme title, AND description.
Ingestion streams the provider's full XMLTV feed (`xmltv.php`) through a SAX parser —
feeds are tens of MB, so they never fully materialize in memory. The cache refreshes on
app start when older than 12 hours (rechecked hourly), or on demand via the Guide tab's
Refresh button. Refreshes ingest into staging tables and swap them in atomically at
commit, so the previous guide stays fully browsable for the whole refresh.

Dev tip: set `IPTV_EPG_FILE` to a local XMLTV file path before `npm run dev` to ingest
from disk instead of hitting the provider (e.g. the gitignored sample in the project
root).

Native/CJS modules (`electron-libmpv`, `better-sqlite3`, `sax`) must stay in
`rollupOptions.external` in `vite.config.ts` — bundling them into the ESM main bundle
breaks addon path resolution (and Rollup's CJS interop mangles `sax` at runtime).
