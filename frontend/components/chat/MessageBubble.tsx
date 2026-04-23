'use client'

import { Pencil } from 'lucide-react'
import styles from './MessageBubble.module.css'
import type { Message } from '@/types'

interface MessageBubbleProps {
  message: Message
  isLastUserMessage?: boolean
  onEdit?: (content: string) => void
}

export default function MessageBubble({ message, isLastUserMessage, onEdit }: MessageBubbleProps) {
  return (
    <div className={styles.userMessage}>
      {isLastUserMessage && onEdit && (
        <button
          className={styles.editBtn}
          onClick={() => onEdit(message.content)}
          title="Edit message"
        >
          <Pencil size={13} />
        </button>
      )}
      <div className={styles.userBubble}>{message.content}</div>
    </div>
  )
}
