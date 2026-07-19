import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'

// The recorder is a separate account entirely from prefs.json's viewing
// prefs — its own connection config (base URL, API key, and which of the
// recorder's providers corresponds to this app's single Xtream account),
// same on-disk pattern as settings-store.ts's Xtream config.
export interface RecorderConfig {
  baseUrl: string
  apiKey: string
  providerId: number | null
}

function configPath(): string {
  return path.join(app.getPath('userData'), 'recorder-config.json')
}

export async function loadRecorderConfig(): Promise<RecorderConfig | null> {
  try {
    const content = await fs.readFile(configPath(), 'utf-8')
    return JSON.parse(content) as RecorderConfig
  } catch {
    return null
  }
}

export async function saveRecorderConfig(config: RecorderConfig): Promise<void> {
  await fs.mkdir(path.dirname(configPath()), { recursive: true })
  await fs.writeFile(configPath(), JSON.stringify(config, null, 2), 'utf-8')
}
