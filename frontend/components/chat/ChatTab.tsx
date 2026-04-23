'use client'

import { useEffect, useRef, useState } from 'react'
import { GraduationCap, ArrowUp, Plus, Trash2, Pencil, X } from 'lucide-react'
import styles from './ChatTab.module.css'
import MessageBubble from './MessageBubble'
import type { Chat } from '@/types'

interface ChatTabProps {
  chats: Chat[]
  pendingNewChat: boolean
  onSend: (text: string) => void
  onNewChat: () => void
  onDeleteChat: (chatId: string) => void
  onEditMessage: (chatId: string, messageId: string, content: string) => void
}

interface EditState {
  chatId: string
  messageId: string
}

export default function ChatTab({
  chats,
  pendingNewChat,
  onSend,
  onNewChat,
  onDeleteChat,
  onEditMessage,
}: ChatTabProps) {
  const [input, setInput] = useState('')
  const [editState, setEditState] = useState<EditState | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const activeChat = chats.at(-1)
  const activeHasMessages = (activeChat?.messages.length ?? 0) > 0
  const lastUserMsgId = activeChat?.messages.findLast((m) => m.role === 'user')?.id
  const showNewChatBtn = activeHasMessages && !pendingNewChat && !editState

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chats])

  function handleSend() {
    if (!input.trim()) return
    if (editState) {
      onEditMessage(editState.chatId, editState.messageId, input.trim())
      setEditState(null)
    } else {
      onSend(input.trim())
    }
    setInput('')
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape' && editState) {
      cancelEdit()
    }
  }

  function startEdit(chatId: string, messageId: string, content: string) {
    setEditState({ chatId, messageId })
    setInput(content)
    inputRef.current?.focus()
  }

  function cancelEdit() {
    setEditState(null)
    setInput('')
  }

  return (
    <div className={styles.container}>
      <div className={styles.messages}>
        {chats.map((chat, chatIndex) => (
          <div key={chat.id} className={styles.chatGroup}>
            {chatIndex > 0 ? (
              <div className={styles.chatDivider}>
                <span>New conversation</span>
                <button
                  className={styles.deleteChatBtn}
                  onClick={() => onDeleteChat(chat.id)}
                  title="Delete conversation"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ) : (
              <div className={styles.firstChatActions}>
                <button
                  className={styles.deleteChatBtn}
                  onClick={() => onDeleteChat(chat.id)}
                  title="Delete conversation"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}

            {chat.messages.map((msg) =>
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
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isLastUserMessage={msg.id === lastUserMsgId}
                  onEdit={(content) => startEdit(chat.id, msg.id, content)}
                />
              )
            )}
          </div>
        ))}
        {pendingNewChat && (
          <div className={styles.chatDivider}>
            <span>New conversation</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className={styles.inputArea}>
        {showNewChatBtn && (
          <button className={styles.newChatBtn} onClick={onNewChat} title="New conversation">
            <Plus size={14} />
            New chat
          </button>
        )}
        {editState && (
          <div className={styles.editBanner}>
            <Pencil size={12} />
            Editing message
            <button className={styles.cancelEditBtn} onClick={cancelEdit}>
              <X size={13} />
            </button>
          </div>
        )}
        <div className={styles.inputWrap}>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder={editState ? 'Edit your message…' : 'Ask a question about your notes...'}
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
