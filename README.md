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
npm install       # also rebuilds electron-libmpv's native addon for Electron's ABI
npm run dev
```
