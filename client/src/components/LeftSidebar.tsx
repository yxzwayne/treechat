import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ConversationListItem, listConversations } from '../lib/api'

export default function LeftSidebar() {
  const [items, setItems] = useState<ConversationListItem[]>([])
  const navigate = useNavigate()
  const { id } = useParams()

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const list = await listConversations()
        if (alive) setItems(list)
      } catch {
        // ignore
      }
    })()
    return () => { alive = false }
  }, [id])

  return (
    <div>
      <div style={{ marginBottom: 16 }} className="title">TREECHAT</div>
      <div className="mono" style={{ color: '#9aa0ab', marginBottom: 8 }}>HISTORY</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map(it => (
          <button
            key={it.id}
            className={`chat-item ${id === it.id ? 'active' : ''}`}
            title={it.preview || '(empty)'}
            onClick={() => navigate(`/c/${it.id}`)}
          >
            {it.preview || '(empty)'}
          </button>
        ))}
        {items.length === 0 && (
          <div className="mono" style={{ color: '#666' }}>(no conversations)</div>
        )}
      </div>
    </div>
  )
}

