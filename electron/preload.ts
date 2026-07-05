import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APTs you need here.
  // ...
})

// --------- Expose mpv playback controls to the Renderer process ---------
contextBridge.exposeInMainWorld('mpv', {
  attach: (x: number, y: number, width: number, height: number) =>
    ipcRenderer.invoke('mpv:attach', x, y, width, height),
  resize: (x: number, y: number, width: number, height: number) =>
    ipcRenderer.invoke('mpv:resize', x, y, width, height),
  command: (...args: string[]) => ipcRenderer.invoke('mpv:command', ...args),
  setProperty: (name: string, value: string | number | boolean) =>
    ipcRenderer.invoke('mpv:setProperty', name, value),
  getProperty: (name: string) => ipcRenderer.invoke('mpv:getProperty', name),
  onEvent: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('mpv:event', listener)
    return () => ipcRenderer.removeListener('mpv:event', listener)
  },
})
