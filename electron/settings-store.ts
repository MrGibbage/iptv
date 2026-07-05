import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { XtreamConfig } from './xtream'

function configPath(): string {
  return path.join(app.getPath('userData'), 'xtream-config.json')
}

export async function loadConfig(): Promise<XtreamConfig | null> {
  try {
    const content = await fs.readFile(configPath(), 'utf-8')
    return JSON.parse(content) as XtreamConfig
  } catch {
    return null
  }
}

export async function saveConfig(config: XtreamConfig): Promise<void> {
  await fs.mkdir(path.dirname(configPath()), { recursive: true })
  await fs.writeFile(configPath(), JSON.stringify(config, null, 2), 'utf-8')
}
