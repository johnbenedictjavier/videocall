import type { Message } from '../types'

export const getMessagePreview = (message?: Pick<Message, 'kind' | 'content' | 'attachmentName' | 'meetingBoardId'>) => {
  if (!message) return undefined
  if (message.kind === 'system') return message.meetingBoardId ? 'Meeting notes saved' : undefined
  if (message.kind === 'image') return 'Shared an image'
  if (message.kind === 'file') return `Shared ${message.attachmentName || 'a file'}`
  return message.content
}

export const isVisibleMessage = (message: Message) => {
  if (message.kind === 'system') return Boolean(message.meetingBoardId)
  if (message.kind === 'text') return Boolean(message.content.trim())
  return Boolean(message.content.trim() || message.attachmentName || message.attachmentPath || message.attachmentUrl)
}
