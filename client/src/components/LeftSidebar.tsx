import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ConversationListItem, listConversations, deleteConversation, getConversationSummary, updateConversationSummary } from '../lib/api'

export default function LeftSidebar({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ConversationListItem[]>([])
  const navigate = useNavigate()
  const { id } = useParams()
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmPreview, setConfirmPreview] = useState<string>('')
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [limitNotice, setLimitNotice] = useState(false)
  const noticeTimer = useRef<number | null>(null)
  const editRef = useRef<HTMLTextAreaElement | null>(null)

  const showLimitNotice = () => {
    setLimitNotice(true)
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setLimitNotice(false), 2000)
  }

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
        <button
          className="sidepanel-toggle-btn"
          onClick={onClose}
          aria-label="Close left sidebar"
          title="Close left sidebar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-panel-left-close-icon lucide-panel-left-close">
            <rect width="18" height="18" x="3" y="3" rx="2"/>
            <path d="M9 3v18"/>
            <path d="m16 15-3-3 3-3"/>
          </svg>
        </button>
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
            title={it.preview || 'Untitled'}
          >
            <div className="chat-item" style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              {editingId === it.id ? (
                <>
                  <textarea
                    autoFocus
                    ref={editRef}
                    rows={1}
                    wrap="off"
                    maxLength={100}
                    value={editingValue}
                    onChange={(e) => {
                      const prevLen = editingValue.length
                      const next = e.target.value.replace(/\r?\n/g, ' ')
                      if (prevLen < 100 && next.length === 100) {
                        showLimitNotice()
                      }
                      setEditingValue(next)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                      }
                    }}
                    onPaste={(e) => {
                      const ta = e.currentTarget
                      const raw = e.clipboardData.getData('text')
                      const insert = raw.replace(/\r?\n/g, ' ')
                      const selStart = ta.selectionStart ?? 0
                      const selEnd = ta.selectionEnd ?? 0
                      const value = ta.value
                      const selectionLen = Math.max(0, selEnd - selStart)
                      const remaining = 100 - (value.length - selectionLen)
                      if (insert.length > remaining) {
                        e.preventDefault()
                        showLimitNotice()
                        return
                      }
                      // Manually insert to preserve single-line and avoid surprises
                      e.preventDefault()
                      const next = value.slice(0, selStart) + insert + value.slice(selEnd)
                      setEditingValue(next)
                      // Restore caret after render
                      requestAnimationFrame(() => {
                        if (editRef.current) {
                          const pos = selStart + insert.length
                          editRef.current.selectionStart = pos
                          editRef.current.selectionEnd = pos
                        }
                      })
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className='edit-summary'
                    placeholder="Untitled"
                  />
                  {limitNotice && (
                    <div className="field-popover" role="status">limit to chat summary is 100 characters.</div>
                  )}
                  <button
                    className="icon-button chat-save"
                    title="Save"
                    aria-label="Save summary"
                    onClick={async (e) => {
                      e.stopPropagation()
                      if (saving) return
                      const length = [...editingValue].length
                      if (length > 100) {
                        setToast('Summary must be 100 chars or less')
                        return
                      }
                      setSaving(true)
                      try {
                        await updateConversationSummary(it.id, editingValue.trim() === '' ? null : editingValue)
                        setItems(prev => prev.map(p => p.id === it.id ? { ...p, preview: (editingValue.trim() === '' ? 'Untitled' : editingValue) } : p))
                        setEditingId(null)
                        setEditingValue('')
                        setLimitNotice(false)
                      } catch (err: any) {
                        setToast(err?.message || 'Failed to save summary')
                      } finally {
                        setSaving(false)
                      }
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-check-icon lucide-check"><path d="M20 6 9 17l-5-5"/></svg>
                  </button>
                  <button
                    className="icon-button chat-cancel"
                    title="Cancel"
                    aria-label="Cancel editing"
                    onClick={(e) => { e.stopPropagation(); setEditingId(null); setEditingValue('') }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.preview || 'Untitled'}
                  </span>
                </>
              )}
            </div>
            {editingId !== it.id && (
              <button
                className="icon-button chat-edit"
                aria-label="Edit summary"
                title="Edit summary"
                onClick={async (e) => {
                  e.stopPropagation()
                  try {
                    const s = await getConversationSummary(it.id)
                    setEditingId(it.id)
                    setEditingValue(s.summary ?? '')
                  } catch (err: any) {
                    setToast(err?.message || 'Failed to load summary')
                  }
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pen-line-icon lucide-pen-line"><path d="M13 21h8"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
              </button>
            )}
            <button
              className="icon-button chat-delete"
              aria-label="Delete conversation"
              title="Delete conversation"
              onClick={(e) => { e.stopPropagation(); setConfirmId(it.id); setConfirmPreview(it.preview || 'Untitled') }}
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
