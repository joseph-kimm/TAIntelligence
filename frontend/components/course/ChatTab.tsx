'use client'

import { useState } from 'react'
import { GraduationCap, ArrowUp } from 'lucide-react'
import styles from './ChatTab.module.css'
import type { Message } from '@/types'

interface ChatTabProps {
  messages: Message[]
  onSend: (text: string) => void
}

export default function ChatTab({ messages, onSend }: ChatTabProps) {
  const [input, setInput] = useState('')

  function handleSend() {
    if (!input.trim()) return
    onSend(input.trim())
    setInput('')
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.messages}>
        {messages.map((msg) =>
          msg.role === 'assistant' ? (
            <div key={msg.id} className={styles.aiMessage}>
              <div className={styles.aiAvatar}>
                <GraduationCap size={16} color="var(--primary)" />
              </div>
              <div className={styles.aiBody}>
                <p className={styles.aiText}>{msg.content}</p>
              </div>
            </div>
          ) : (
            <div key={msg.id} className={styles.userMessage}>
              <div className={styles.userBubble}>{msg.content}</div>
            </div>
          )
        )}
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputWrap}>
          <input
            className={styles.input}
            placeholder="Ask a question about your notes..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
          />
          <button className={styles.sendBtn} onClick={handleSend}>
            <ArrowUp size={20} />
          </button>
        </div>
      </div>
    </div>
  )
}
