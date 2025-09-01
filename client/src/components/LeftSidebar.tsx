import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ConversationListItem, listConversations, deleteConversation } from '../lib/api'

export default function LeftSidebar({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ConversationListItem[]>([])
  const navigate = useNavigate()
  const { id } = useParams()
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmPreview, setConfirmPreview] = useState<string>('')
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

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
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div className="title">TREECHAT</div>
        <button className="button ghost" onClick={onClose}>HIDE</button>
      </div>
      <div className="mono" style={{ color: '#9aa0ab', marginBottom: 8 }}>HISTORY</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map(it => (
          <div
            key={it.id}
            className={`chat-row ${id === it.id ? 'active' : ''}`}
            onClick={() => navigate(`/c/${it.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/c/${it.id}`) }}
            title={it.preview || '(empty)'}
          >
            <div className="chat-item">
              {it.preview || '(empty)'}
            </div>
            <button
              className="icon-button chat-delete"
              aria-label="Delete conversation"
              title="Delete conversation"
              onClick={(e) => { e.stopPropagation(); setConfirmId(it.id); setConfirmPreview(it.preview || '(empty)') }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6h18" stroke="#9aa0ab" strokeWidth="2" strokeLinecap="round"/>
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="#9aa0ab" strokeWidth="2" strokeLinecap="round"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="#9aa0ab" strokeWidth="2" strokeLinecap="round"/>
                <path d="M10 11v6M14 11v6" stroke="#9aa0ab" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <div className="mono" style={{ color: '#666' }}>(no conversations)</div>
        )}
      </div>
      {confirmId && (
        <div className="modal-overlay" onClick={() => setConfirmId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-body">
              Delete the entire conversation?
              <div style={{ color: '#9aa0ab', marginTop: 4 }}>
                {confirmPreview}
              </div>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setConfirmId(null)} disabled={deleting}>CANCEL</button>
              <button
                className="button danger"
                disabled={deleting}
                onClick={async () => {
                  const toDelete = confirmId as string
                  setDeleting(true)
                  try {
                    await deleteConversation(toDelete)
                    // Refresh list from server to ensure DB state is reflected
                    const list = await listConversations()
                    setItems(list)
                    if (id === toDelete) navigate('/')
                    setConfirmId(null)
                  } catch (e: any) {
                    setToast(`Delete failed: ${e?.message || 'server error'}`)
                  } finally {
                    setDeleting(false)
                  }
                }}
              >
                {deleting ? 'DELETING…' : 'DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast" onClick={() => setToast(null)}>{toast}</div>}
    </div>
  )
}
