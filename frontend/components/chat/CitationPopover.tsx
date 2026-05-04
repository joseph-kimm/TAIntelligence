'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import styles from './CitationPopover.module.css'
import chatStyles from './ChatTab.module.css'
import type { ChunkCitation } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function prepareContent(content: string, citations: ChunkCitation[]) {
  const citationMap = new Map<string, ChunkCitation>()
  citations.forEach((c) => citationMap.set(c.id, c))

  const indexMap = new Map<string, number>()
  let counter = 1

  const processedContent = content.replace(
    /<<([0-9a-f-]+(?:,[0-9a-f-]+)*)>>/g,
    (_, raw: string) => {
      const uuids = raw.split(',').map((s: string) => s.trim())
      return uuids
        .map((uuid: string) => {
          if (!citationMap.has(uuid)) return ''
          if (!indexMap.has(uuid)) indexMap.set(uuid, counter++)
          return `[${indexMap.get(uuid)}](cite://${uuid})`
        })
        .filter(Boolean)
        .join('')
    },
  )

  return { processedContent, citationMap }
}

// ---------------------------------------------------------------------------
// CitationCard — fixed-position overlay rendered via a portal-like approach
// ---------------------------------------------------------------------------

const CARD_WIDTH = 320
const GAP = 8

interface PopoverState {
  citation: ChunkCitation
  top?: number
  bottom?: number
  left: number
}

function computePosition(rect: DOMRect): Pick<PopoverState, 'top' | 'bottom' | 'left'> {
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top

  const vertical =
    spaceBelow >= 180 || spaceBelow >= spaceAbove
      ? { top: rect.bottom + GAP }
      : { bottom: window.innerHeight - rect.top + GAP }

  const left = Math.max(GAP, Math.min(rect.left, window.innerWidth - CARD_WIDTH - GAP))

  return { ...vertical, left }
}

interface CitationCardProps {
  citation: ChunkCitation
  top?: number
  bottom?: number
  left: number
  onClose: () => void
}

function CitationCard({ citation, top, bottom, left, onClose }: CitationCardProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return (
    <div
      className={styles.citationCard}
      style={{ top, bottom, left }}
      ref={ref}
    >
      <div className={styles.citationDocTitle}>{citation.documentTitle}</div>
      <div className={styles.citationChunkText}>{citation.text}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CitationMessage — replaces ReactMarkdown in ChatTab for assistant messages
// ---------------------------------------------------------------------------

interface CitationMessageProps {
  content: string
  citations?: ChunkCitation[]
}

export function CitationMessage({ content, citations }: CitationMessageProps) {
  const [popover, setPopover] = useState<PopoverState | null>(null)

  const hasCitations = citations && citations.length > 0
  const { processedContent, citationMap } = hasCitations
    ? prepareContent(content, citations)
    : { processedContent: content, citationMap: new Map<string, ChunkCitation>() }

  const markdownComponents = hasCitations
    ? {
        a({ href, children }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
          if (!href?.startsWith('cite://')) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            )
          }
          const uuid = href.slice(7)
          const citation = citationMap.get(uuid)
          if (!citation) return <span>{children}</span>
          return (
            <button
              className={styles.citationBtn}
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                setPopover((p) =>
                  p?.citation.id === citation.id
                    ? null
                    : { citation, ...computePosition(rect) },
                )
              }}
            >
              {children}
            </button>
          )
        },
      }
    : undefined

  return (
    <div className={chatStyles.aiText}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
        urlTransform={(url) => (url.startsWith('cite://') ? url : defaultUrlTransform(url))}
      >
        {processedContent}
      </ReactMarkdown>
      {popover && (
        <CitationCard
          citation={popover.citation}
          top={popover.top}
          bottom={popover.bottom}
          left={popover.left}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  )
}
