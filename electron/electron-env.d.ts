/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer
  mpv: {
    attach: (x: number, y: number, width: number, height: number) => Promise<boolean>
    resize: (x: number, y: number, width: number, height: number) => Promise<void>
    command: (...args: string[]) => Promise<number | undefined>
    setProperty: (name: string, value: string | number | boolean) => Promise<number | undefined>
    getProperty: (name: string) => Promise<string | null>
    onEvent: (callback: () => void) => () => void
  }
}
