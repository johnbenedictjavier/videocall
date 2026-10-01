import type { Message } from '../types'

export const getMessagePreview = (message?: Pick<Message, 'kind' | 'content' | 'attachmentName'>) => {
  if (!message || message.kind === 'system') return undefined
  if (message.kind === 'image') return 'Shared an image'
  if (message.kind === 'file') return `Shared ${message.attachmentName || 'a file'}`
  return message.content
}

export const isVisibleMessage = (message: Message) => {
  if (message.kind === 'system') return false
  if (message.kind === 'text') return Boolean(message.content.trim())
  return Boolean(message.content.trim() || message.attachmentName || message.attachmentPath || message.attachmentUrl)
}
