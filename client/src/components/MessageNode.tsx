import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ConversationState, MessageNode as TMessageNode } from '../types'
import Composer from './Composer'

type Props = {
  node: TMessageNode
  state: ConversationState
  onSelect: (id: string) => void
  onRetry: (parentId: string, model?: string) => void
  onEditUser: (nodeId: string, newContent: string, model: string) => void
  onSendFrom: (parentId: string, text: string, model: string) => void
  onDelete: (nodeId: string) => void
  models: string[]
  defaultModel: string
  lastModel?: string
  labels?: Record<string, string>
}

export default function MessageNode({ node, state, onSelect, onRetry, onEditUser, onSendFrom, onDelete, models, defaultModel, lastModel, labels }: Props) {
  // Layout constants: keep in sync with CSS variables
  const COL_W = 720
  const COL_GAP = 12

  const subtreeCols = useMemo(() => {
    const memo = new Map<string, number>()
    const fn = (id: string | undefined | null): number => {
      if (!id) return 1
      if (memo.has(id)) return memo.get(id) as number
      const n = state.nodes[id]
      if (!n) { memo.set(id, 1); return 1 }
      if (!n.children || n.children.length === 0) { memo.set(id, 1); return 1 }
      let sum = 0
      for (const cid of n.children) sum += fn(cid)
      const res = Math.max(1, sum)
      memo.set(id, res)
      return res
    }
    return fn
  }, [state.nodes])
  const children = useMemo(() => node.children.map(id => state.nodes[id]), [node, state.nodes])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(node.content)
  const [confirming, setConfirming] = useState(false)
  const [retryOpen, setRetryOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!retryOpen) return
      const el = menuRef.current
      if (!el) { setRetryOpen(false); return }
      if (!(e.target instanceof Node)) { setRetryOpen(false); return }
      if (!el.contains(e.target)) setRetryOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => { document.removeEventListener('click', onDocClick) }
  }, [retryOpen])
  const parentAssistantModel = node.parentId ? state.nodes[node.parentId!]?.model : undefined
  const [editModel, setEditModel] = useState<string>(parentAssistantModel || lastModel || defaultModel)

  const roleClass = node.role === 'user' ? 'node-user' : node.role === 'assistant' ? 'node-assistant' : 'node-system'
  const isActive = state.selectedLeafId === node.id

  return (
    <div>
      <div className={`node-card ${roleClass} ${isActive ? 'active' : ''}`} onClick={() => onSelect(node.id)}>
        {editing ? (
          <div>
            <textarea className="text-input" rows={4} value={draft} onChange={e => setDraft(e.target.value)} />
            <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="button" onClick={() => { setEditing(false) }}>CANCEL</button>
              <button className="button accent" onClick={() => { setEditing(false); onEditUser(node.id, draft, editModel) }}>SAVE TO NEW BRANCH</button>
              <div style={{ position: 'relative', marginLeft: 'auto' }}>
                <button className="button pale" onClick={(e) => { e.stopPropagation(); setRetryOpen(o => !o) }}>MODEL: {labels?.[editModel] || editModel}</button>
                {retryOpen && (
                  <div ref={menuRef} className="modal" style={{ position: 'absolute', right: 0, bottom: 'calc(100% + 6px)', width: 320 }}>
                    <div className="modal-body" style={{ padding: 0 }}>
                      {models.map(m => (
                        <div key={m} onClick={() => { setEditModel(m); setRetryOpen(false) }} className="mono" style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: m === editModel ? '#182036' : 'transparent' }}>{labels?.[m] || m}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="node-content">{node.content || <span style={{ color: '#666' }}>GENERATING...</span>}</div>
        )}
        <div className="node-header">
          <span className="mono">{node.role.toUpperCase()}</span>
          <div className="controls" onClick={e => e.stopPropagation()}>
            {node.role === 'assistant' && (
              <>
                {node.model && (
                  <span className="mono" style={{ color: '#9aa0ab' }}>{labels?.[node.model] || node.model}</span>
                )}
                <button className="icon-button" aria-label="Delete message" title="Delete message" onClick={() => setConfirming(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 6h18" stroke="#9aa0ab" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="#9aa0ab" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="#9aa0ab" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M10 11v6M14 11v6" stroke="#9aa0ab" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
                <div style={{ position: 'relative' }}>
                  <button className="button ghost" onClick={() => setRetryOpen(o => !o)}>RETRY WITH</button>
                  {retryOpen && (
                    <div ref={menuRef} className="modal" style={{ position: 'absolute', right: 0, bottom: 'calc(100% + 6px)', width: 320 }}>
                      <div className="modal-body" style={{ padding: 0 }}>
                        {models.map(m => (
                          <div key={m} onClick={() => { setRetryOpen(false); if (node.parentId) onRetry(node.parentId, m) }} className="mono" style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>{labels?.[m] || m}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {node.parentId && (
                  <button className="button ghost" onClick={() => onRetry(node.parentId!, node.model || defaultModel)}>RETRY</button>
                )}
              </>
            )}
            {node.role === 'user' && (
              <>
                <button className="icon-button" aria-label="Delete message" title="Delete message" onClick={() => setConfirming(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 6h18" stroke="#9aa0ab" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="#9aa0ab" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="#9aa0ab" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M10 11v6M14 11v6" stroke="#9aa0ab" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
                <button className="button ghost" onClick={() => { setEditing(true); setDraft(node.content) }}>EDIT</button>
              </>
            )}
          </div>
        </div>
      </div>

      {node.role === 'assistant' && (
        <Composer
          placeholder="RESPOND TO THIS BRANCH (CREATE A NEW RESPONSE BRANCH)"
          models={models}
          defaultModel={defaultModel}
          initialModel={node.model || lastModel || defaultModel}
          labels={labels}
          onSend={(t, m) => onSendFrom(node.id, t, m)}
        />
      )}

      {children.length > 0 && (
        <div className="children-row">
          {children.map(child => {
            const cols = subtreeCols(child.id)
            const extra = Math.max(0, cols - 1)
            const mr = extra * (COL_W + COL_GAP)
            return (
              <div className="column" key={child.id} style={{ marginRight: mr }}>
                <MessageNode
                  node={child}
                  state={state}
                  onSelect={onSelect}
                  onRetry={onRetry}
                  onEditUser={onEditUser}
                  onSendFrom={onSendFrom}
                  onDelete={onDelete}
                  models={models}
                  defaultModel={defaultModel}
                  lastModel={lastModel}
                  labels={labels}
                />
              </div>
            )
          })}
        </div>
      )}

      {confirming && (
        <div className="modal-overlay" onClick={() => setConfirming(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-body">
              Deleting a message deletes EVERY child messages in EVERY branch. Confirmation to delete?
            </div>
            <div className="modal-actions">
              <button className="button pale" onClick={() => setConfirming(false)}>NO</button>
              <button className="button danger" onClick={() => { setConfirming(false); onDelete(node.id) }}>YES</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
