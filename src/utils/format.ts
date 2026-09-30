export const formatTime = (value: string | Date) =>
  new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value))

export const formatRelativeTime = (value?: string) => {
  if (!value) return ''
  const difference = Date.now() - new Date(value).getTime()
  const minutes = Math.max(0, Math.floor(difference / 60000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export const formatFullDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))

export const formatDuration = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`

export const getInitials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export const formatAvailability = (slots: { day: string; start: string; end: string }[]) => {
  if (!slots.length) return 'Flexible schedule'
  return slots.slice(0, 2).map((item) => `${item.day} ${item.start} - ${item.end}`).join('  ·  ')
}
