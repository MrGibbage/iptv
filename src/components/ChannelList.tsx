import type { LiveStream } from '../../electron/xtream'

interface ChannelListProps {
  channels: LiveStream[]
  loading: boolean
  error: string | null
  onSelect: (stream: LiveStream) => void
  selectedStreamId: number | null
}

function ChannelList({ channels, loading, error, onSelect, selectedStreamId }: ChannelListProps) {
  if (loading) return <p style={{ padding: 16 }}>Loading channels...</p>
  if (error) return <p style={{ padding: 16, color: 'crimson' }}>Failed to load channels: {error}</p>

  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      {channels.map((channel) => (
        <div
          key={channel.streamId}
          onClick={() => onSelect(channel)}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            background: channel.streamId === selectedStreamId ? '#2563eb22' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {channel.streamIcon && (
            <img src={channel.streamIcon} alt="" width={24} height={24} style={{ objectFit: 'contain' }} />
          )}
          <span>{channel.name}</span>
        </div>
      ))}
    </div>
  )
}

export default ChannelList
