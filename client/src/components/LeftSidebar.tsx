import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, Cog, PanelLeftClose, PenLine, SlidersHorizontal, SquarePen, Trash2, X } from 'lucide-react'
import { ConversationListItem, listConversations, deleteConversation, getConversationSummary, updateConversationSummary } from '../lib/api'

export default function LeftSidebar({ onClose, onOpenSettings }: { onClose: () => void, onOpenSettings: () => void }) {
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

  const commitEdit = async (conversationId: string) => {
    if (saving) return
    const length = [...editingValue].length
    if (length > 100) {
      setToast('Summary must be 100 chars or less')
      return
    }
    setSaving(true)
    try {
      await updateConversationSummary(conversationId, editingValue.trim() === '' ? null : editingValue)
      setItems(prev => prev.map(p => p.id === conversationId ? { ...p, preview: (editingValue.trim() === '' ? 'Untitled' : editingValue) } : p))
      setEditingId(null)
      setEditingValue('')
      setLimitNotice(false)
    } catch (err: any) {
      setToast(err?.message || 'Failed to save summary')
    } finally {
      setSaving(false)
    }
  }

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
    <div className="left-sidebar">
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="title">Treechat</div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close left sidebar"
          title="Close left sidebar"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>
      <div
        className="chat-row sidebar-new-chat-btn"
        onClick={() => navigate('/')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') navigate('/') }}
        title="Create new chat"
      >
        <SquarePen size={16} />
        <span>Create new chat</span>
      </div>
      <div className="chat-row history-header">History</div>
      <div className="history-list">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
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
              <div className="chat-item" style={{ display: 'flex', alignItems: 'center', gap: '0px', flex: 1 }}>
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
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        e.stopPropagation()
                        commitEdit(it.id)
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
                    <div className="field-popover" role="status">Limit to chat summary is 100 characters.</div>
                  )}
                  <button
                    className="icon-button chat-save"
                    title="Save"
                    aria-label="Save summary"
                    onClick={async (e) => {
                      e.stopPropagation()
                      await commitEdit(it.id)
                    }}
                  >
                    <Check size={16} />
                  </button>
                  <button
                    className="icon-button chat-cancel"
                    title="Cancel"
                    aria-label="Cancel editing"
                    onClick={(e) => { e.stopPropagation(); setEditingId(null); setEditingValue('') }}
                  >
                    <X size={16} />
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
                <div className="chat-actions">
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
                    <PenLine size={16} />
                  </button>
                  <button
                    className="icon-button chat-delete"
                    aria-label="Delete conversation"
                    title="Delete conversation"
                    onClick={(e) => { e.stopPropagation(); setConfirmId(it.id); setConfirmPreview(it.preview || 'Untitled') }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {items.length === 0 && (
            <div className="mono" style={{ color: 'var(--muted-2)' }}>(no conversations)</div>
          )}
        </div>
      </div>
      <div className="sidebar-bottom-strip">
        <button
          className="icon-button"
          onClick={() => navigate('/models')}
          aria-label="Open models"
          title="Open models"
        >
          <SlidersHorizontal size={16} />
        </button>
        <button
          className="icon-button"
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Open settings"
        >
          <Cog size={16} />
        </button>
      </div>
      {confirmId && (
        <div className="modal-overlay" onClick={() => setConfirmId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-body">
              Delete the entire conversation?
              <div style={{ color: 'var(--muted)', marginTop: 4 }}>
                {confirmPreview}
              </div>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setConfirmId(null)} disabled={deleting}>Cancel</button>
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
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast" onClick={() => setToast(null)}>{toast}</div>}
    </div>
  )
}
