import { createReadStream } from 'node:fs'
import sax from 'sax'

export interface XmltvChannel {
  id: string
  displayName: string
  icon: string | null
}

export interface XmltvProgramme {
  channelId: string
  startMs: number
  stopMs: number
  title: string
  description: string
}

export interface XmltvHandlers {
  onChannels(batch: XmltvChannel[]): void
  onProgrammes(batch: XmltvProgramme[]): void
}

const BATCH_SIZE = 1000

// XMLTV timestamps look like "20260704073000 +0000" (offset optional,
// seconds optional). Returns null for unparseable values.
export function parseXmltvTime(value: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-])(\d{2})(\d{2}))?/.exec(value.trim())
  if (!m) return null
  const [, year, month, day, hour, minute, second, sign, offH, offM] = m
  let ms = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    second ? Number(second) : 0,
  )
  if (sign) {
    const offsetMs = (Number(offH) * 60 + Number(offM)) * 60_000
    ms += sign === '+' ? -offsetMs : offsetMs
  }
  return ms
}

// Streaming XMLTV parse — the file never fully materializes in memory.
// Channels and programmes are delivered in batches; XMLTV files list all
// channels before any programmes, so onChannels calls finish before the
// first onProgrammes call.
export function parseXmltvFile(
  filePath: string,
  handlers: XmltvHandlers,
): Promise<{ channelCount: number; programmeCount: number }> {
  return new Promise((resolve, reject) => {
    const saxStream = sax.createStream(true, { trim: false })
    const fileStream = createReadStream(filePath, { encoding: 'utf-8' })

    let channelCount = 0
    let programmeCount = 0
    let channelBatch: XmltvChannel[] = []
    let programmeBatch: XmltvProgramme[] = []

    let currentChannel: { id: string; displayName: string | null; icon: string | null } | null = null
    let currentProgramme: {
      channelId: string
      start: string
      stop: string
      title: string
      description: string
    } | null = null
    // Which text-bearing element we're inside, if any.
    let textTarget: 'display-name' | 'title' | 'desc' | null = null

    const flushChannels = () => {
      if (channelBatch.length > 0) {
        handlers.onChannels(channelBatch)
        channelBatch = []
      }
    }
    const flushProgrammes = () => {
      if (programmeBatch.length > 0) {
        handlers.onProgrammes(programmeBatch)
        programmeBatch = []
      }
    }

    saxStream.on('opentag', (node) => {
      const attrs = node.attributes as Record<string, string>
      switch (node.name) {
        case 'channel':
          currentChannel = { id: String(attrs.id ?? ''), displayName: null, icon: null }
          break
        case 'programme':
          currentProgramme = {
            channelId: String(attrs.channel ?? ''),
            start: String(attrs.start ?? ''),
            stop: String(attrs.stop ?? ''),
            title: '',
            description: '',
          }
          break
        case 'display-name':
          // Only the first display-name is the channel's name; later ones are
          // aliases/channel numbers.
          if (currentChannel && currentChannel.displayName === null) textTarget = 'display-name'
          break
        case 'title':
          if (currentProgramme) textTarget = 'title'
          break
        case 'desc':
          if (currentProgramme) textTarget = 'desc'
          break
        case 'icon':
          if (currentChannel && attrs.src) currentChannel.icon = String(attrs.src)
          break
      }
    })

    saxStream.on('text', (text) => {
      if (!textTarget) return
      if (textTarget === 'display-name' && currentChannel) {
        currentChannel.displayName = (currentChannel.displayName ?? '') + text
      } else if (textTarget === 'title' && currentProgramme) {
        currentProgramme.title += text
      } else if (textTarget === 'desc' && currentProgramme) {
        currentProgramme.description += text
      }
    })

    saxStream.on('closetag', (name) => {
      if (name === 'display-name' || name === 'title' || name === 'desc') {
        textTarget = null
        return
      }
      if (name === 'channel' && currentChannel) {
        if (currentChannel.id) {
          channelBatch.push({
            id: currentChannel.id,
            displayName: (currentChannel.displayName ?? currentChannel.id).trim(),
            icon: currentChannel.icon,
          })
          channelCount++
          if (channelBatch.length >= BATCH_SIZE) flushChannels()
        }
        currentChannel = null
      } else if (name === 'programme' && currentProgramme) {
        const startMs = parseXmltvTime(currentProgramme.start)
        const stopMs = parseXmltvTime(currentProgramme.stop)
        if (currentProgramme.channelId && startMs !== null && stopMs !== null && stopMs > startMs) {
          programmeBatch.push({
            channelId: currentProgramme.channelId,
            startMs,
            stopMs,
            title: currentProgramme.title.trim() || '(no title)',
            description: currentProgramme.description.trim(),
          })
          programmeCount++
          if (programmeBatch.length >= BATCH_SIZE) {
            // Channels always precede programmes in XMLTV; flush any remainder
            // before the first programme batch goes out.
            flushChannels()
            flushProgrammes()
          }
        }
        currentProgramme = null
      }
    })

    saxStream.on('error', (err) => {
      fileStream.destroy()
      reject(new Error(`XMLTV parse error: ${err.message}`))
    })
    fileStream.on('error', (err) => {
      reject(new Error(`Could not read XMLTV file: ${err.message}`))
    })

    saxStream.on('end', () => {
      try {
        flushChannels()
        flushProgrammes()
        resolve({ channelCount, programmeCount })
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })

    fileStream.pipe(saxStream)
  })
}
