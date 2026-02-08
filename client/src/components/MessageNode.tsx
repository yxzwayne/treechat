import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minimize2, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { ConversationState, MessageNode as TMessageNode } from '../types'
import Composer from './Composer'
import ModelSelectList from './ModelSelectList'

type Props = {
  node: TMessageNode
  state: ConversationState
  onSelect: (id: string) => void
  onRetry: (parentId: string, model?: string) => void
  onRetryAll: (parentId: string, primaryModel?: string) => void
  onEditUser: (nodeId: string, newContent: string, model: string) => void
  onSendFrom: (parentId: string, text: string, model: string) => void
  onSendAllFrom: (parentId: string, text: string, primaryModel: string) => void
  onDelete: (nodeId: string) => void
  models: string[]
  defaultModel: string
  lastModel?: string
  labels?: Record<string, string>
  subtreeColsMap: Map<string, number>
}

export default function MessageNode({ node, state, onSelect, onRetry, onRetryAll, onEditUser, onSendFrom, onSendAllFrom, onDelete, models, defaultModel, lastModel, labels, subtreeColsMap }: Props) {
  const children = useMemo(() => node.children.map(id => state.nodes[id]), [node, state.nodes])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(node.content)
  const [confirming, setConfirming] = useState(false)
  const [editModelOpen, setEditModelOpen] = useState(false)
  const editMenuRef = useRef<HTMLDivElement | null>(null)
  const [userExpanded, setUserExpanded] = useState(false)

  const cancelDelete = () => setConfirming(false)
  const confirmDelete = () => { setConfirming(false); onDelete(node.id) }

  const [retryMenuOpen, setRetryMenuOpen] = useState(false)
  const [retryMenuPane, setRetryMenuPane] = useState<'root' | 'models'>('root')
  const retryMenuRef = useRef<HTMLDivElement | null>(null)
  const [retryMenuShiftX, setRetryMenuShiftX] = useState(0)
  const retryMenuShiftXRef = useRef(0)
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!editModelOpen) return
      const el = editMenuRef.current
      if (!el) { setEditModelOpen(false); return }
      if (!(e.target instanceof Node)) { setEditModelOpen(false); return }
      if (!el.contains(e.target)) setEditModelOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => { document.removeEventListener('click', onDocClick) }
  }, [editModelOpen])
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!retryMenuOpen) return
      const el = retryMenuRef.current
      if (!el) { setRetryMenuOpen(false); setRetryMenuPane('root'); return }
      if (!(e.target instanceof Node)) { setRetryMenuOpen(false); setRetryMenuPane('root'); return }
      if (!el.contains(e.target)) { setRetryMenuOpen(false); setRetryMenuPane('root') }
    }
    document.addEventListener('click', onDocClick)
    return () => { document.removeEventListener('click', onDocClick) }
  }, [retryMenuOpen])

  useEffect(() => {
    if (!confirming) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (!confirming) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        confirmDelete()
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        e.stopPropagation()
        cancelDelete()
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => { window.removeEventListener('keydown', onKeyDown, { capture: true }) }
  }, [confirming, node.id])
  useLayoutEffect(() => {
    if (!retryMenuOpen) {
      retryMenuShiftXRef.current = 0
      setRetryMenuShiftX(0)
      return
    }

    const el = retryMenuRef.current
    if (!el) return
    const boundsEl = el.closest('.tree-pane') as HTMLElement | null
    const bounds = boundsEl ?? document.documentElement
    const PAD = 8

    const clamp = () => {
      const menu = retryMenuRef.current
      if (!menu) return
      const boundsRect = bounds.getBoundingClientRect()
      const rect = menu.getBoundingClientRect()
      const minLeft = boundsRect.left + PAD
      const maxRight = boundsRect.right - PAD
      let next = retryMenuShiftXRef.current
      if (rect.left < minLeft) next += (minLeft - rect.left)
      else if (rect.right > maxRight) next += (maxRight - rect.right)
      next = Math.round(next)
      if (next !== retryMenuShiftXRef.current) {
        retryMenuShiftXRef.current = next
        setRetryMenuShiftX(next)
      }
    }

    clamp()
    // Keep the menu from drifting under fixed sidebars when the tree pane scrolls/resizes.
    boundsEl?.addEventListener('scroll', clamp, { passive: true })
    window.addEventListener('resize', clamp)
    return () => {
      boundsEl?.removeEventListener('scroll', clamp as any)
      window.removeEventListener('resize', clamp)
    }
  }, [retryMenuOpen, retryMenuPane])
  const parentAssistantModel = node.parentId ? state.nodes[node.parentId!]?.model : undefined
  const [editModel, setEditModel] = useState<string>(parentAssistantModel || lastModel || defaultModel)

  const roleClass = node.role === 'user' ? 'node-user' : node.role === 'assistant' ? 'node-assistant' : 'node-system'
  const isActive = state.selectedLeafId === node.id
  const roleLabel = node.role.charAt(0).toUpperCase() + node.role.slice(1).toLowerCase()
  const isLongUserContent = useMemo(() => {
    if (node.role !== 'user') return false
    if (editing) return false
    if (!node.content) return false
    const content = node.content
    const lines = content.split('\n')
    const lineCount = lines.length
    const longestLine = lines.reduce((m, l) => Math.max(m, l.length), 0)
    return content.length >= 800 || lineCount >= 14 || longestLine >= 240
  }, [editing, node.content, node.role])
  useEffect(() => {
    if (!isLongUserContent && userExpanded) setUserExpanded(false)
  }, [isLongUserContent, userExpanded])
  useEffect(() => {
    if (node.role !== 'user') return
    setUserExpanded(false)
  }, [node.content, node.id, node.role])

  return (
    <div>
      <div className={`node-card ${roleClass} ${isActive ? 'active' : ''}`} onClick={() => onSelect(node.id)}>
        {editing ? (
          <div>
            <textarea className="text-input" rows={4} value={draft} onChange={e => setDraft(e.target.value)} />
            <div style={{ marginTop: '12px', display: 'flex', gap: 8, alignItems: 'center' }}>
	              <div style={{ position: 'relative', marginLeft: 'auto' }}>
	                <button className="button pale" onClick={(e) => { e.stopPropagation(); setRetryMenuOpen(false); setRetryMenuPane('root'); setEditModelOpen(o => !o) }}>Model: {labels?.[editModel] || editModel}</button>
	                {editModelOpen && (
	                  <div ref={editMenuRef} className="modal menu model-menu" style={{ position: 'absolute', right: 0, bottom: 'calc(100% + 6px)' }}>
	                    <div className="menu-pane">
	                      <ModelSelectList
	                        models={models}
	                        value={editModel}
	                        labels={labels}
	                        onSelect={(m) => { setEditModel(m); setEditModelOpen(false) }}
	                      />
	                    </div>
	                  </div>
	                )}
	              </div>
	              <button className="button" onClick={() => { setEditing(false) }}>Cancel</button>
	              <button className="button accent" onClick={() => { setEditing(false); onEditUser(node.id, draft, editModel) }}>Save</button>
            </div>
          </div>
        ) : (
          <>
            {node.role === 'assistant' ? (
              <div className="node-content markdown">
                {node.content ? (
                  <ReactMarkdown
                    components={{
                      a: ({ node: _node, href, children, ...props }) => (
                        <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {node.content}
                  </ReactMarkdown>
                ) : (
                  <span style={{ color: 'var(--muted-2)' }}>GENERATING...</span>
                )}
              </div>
            ) : (
              <div className={`node-content plain ${isLongUserContent ? (userExpanded ? 'long expanded' : 'long') : ''}`}>{node.content || <span style={{ color: 'var(--muted-2)' }}>GENERATING...</span>}</div>
            )}
          </>
        )}
        <div className="node-header">
          {node.role !== 'assistant' && (
            <span className="mono" style={{ paddingRight: node.role === 'user' ? '8px' : undefined }}>{roleLabel}</span>
          )}
          <div className="controls" onClick={e => e.stopPropagation()}>
	            {node.role === 'assistant' && (
	              <>
	                {node.model && (
	                  <span style={{ color: 'var(--muted)', paddingRight: '8px' }}>{labels?.[node.model] || node.model}</span>
	                )}
	                {node.parentId && (
	                  <div style={{ position: 'relative' }}>
	                    <button
	                      className="icon-button"
	                      aria-label="Retry message"
	                      title="Retry"
	                      onClick={() => { setEditModelOpen(false); setRetryMenuPane('root'); setRetryMenuOpen(o => !o) }}
	                    >
	                      <RefreshCw size={16} strokeWidth={2} />
	                    </button>
	                    {retryMenuOpen && (
	                      <div
	                        ref={retryMenuRef}
	                        className="retry-menu-wrap"
	                        style={{ position: 'absolute', right: 0, bottom: 'calc(100% + 6px)', transform: `translateX(${retryMenuShiftX}px)` }}
	                      >
	                        <div className="modal menu retry-menu">
	                          <div className="menu-pane">
	                            <button className="menu-item" onClick={() => { setRetryMenuOpen(false); setRetryMenuPane('root'); onRetry(node.parentId!, node.model || defaultModel) }}>
	                              Retry
	                            </button>
	                            <button className="menu-item" onClick={() => { setRetryMenuOpen(false); setRetryMenuPane('root'); onRetryAll(node.parentId!, node.model || defaultModel) }}>
	                              Retry all enabled models ({models.length})
	                            </button>
	                            <button
	                              className={`menu-item ${retryMenuPane === 'models' ? 'active' : ''}`}
	                              onClick={() => setRetryMenuPane(p => (p === 'models' ? 'root' : 'models'))}
	                            >
	                              Retry with model
	                            </button>
	                          </div>
	                        </div>
	                        {retryMenuPane === 'models' && (
	                          <div className="modal menu model-menu">
	                            <div className="menu-pane">
	                              <ModelSelectList
	                                models={models}
	                                value={node.model || defaultModel}
	                                labels={labels}
	                                onSelect={(m) => { setRetryMenuOpen(false); setRetryMenuPane('root'); onRetry(node.parentId!, m) }}
	                              />
	                            </div>
	                          </div>
	                        )}
	                      </div>
	                    )}
	                  </div>
	                )}
	                <button className="icon-button" aria-label="Delete message" title="Delete message" onClick={() => setConfirming(true)}>
	                  <Trash2 size={16} strokeWidth={2} />
	                </button>
	              </>
	            )}
            {node.role === 'user' && (
              <>
                {isLongUserContent && (
                  <button
                    className="icon-button"
                    aria-label={userExpanded ? 'Collapse long message' : 'Expand long message'}
                    title={userExpanded ? 'Collapse' : 'Expand'}
                    onClick={() => setUserExpanded(e => !e)}
                  >
                    {userExpanded ? <Minimize2 size={16} strokeWidth={2} /> : <Maximize2 size={16} strokeWidth={2} />}
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label="Edit message"
                  title="Edit message"
                  onClick={() => { setEditing(true); setDraft(node.content) }}
                >
                  <Pencil size={16} strokeWidth={2} />
                </button>
                <button className="icon-button" aria-label="Delete message" title="Delete message" onClick={() => setConfirming(true)}>
                  <Trash2 size={16} strokeWidth={2} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {node.role === 'assistant' && (
        <Composer
          placeholder="Respond to this branch (creates a new branch)"
          models={models}
          defaultModel={defaultModel}
          initialModel={node.model || lastModel || defaultModel}
          labels={labels}
          onSend={(t, m) => onSendFrom(node.id, t, m)}
          onSendAll={(t, m) => onSendAllFrom(node.id, t, m)}
        />
      )}

      {children.length > 0 && (
        <div className="children-row">
          {children.map(child => {
            const cols = subtreeColsMap.get(child.id) ?? 1
            const extra = Math.max(0, cols - 1)
            return (
              <div className="column" key={child.id} style={{ ['--extra-cols' as any]: extra }}>
                <MessageNode
                  node={child}
                  state={state}
                  onSelect={onSelect}
                  onRetry={onRetry}
                  onRetryAll={onRetryAll}
                  onEditUser={onEditUser}
                  onSendFrom={onSendFrom}
                  onSendAllFrom={onSendAllFrom}
                  onDelete={onDelete}
                  models={models}
                  defaultModel={defaultModel}
                  lastModel={lastModel}
                  labels={labels}
                  subtreeColsMap={subtreeColsMap}
                />
              </div>
            )
          })}
        </div>
      )}

      {confirming && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-body">
              Deleting a message deletes EVERY child messages in EVERY branch. Confirmation to delete?
            </div>
            <div className="modal-actions">
              <button className="button pale" onClick={cancelDelete}>No</button>
              <button className="button danger" onClick={confirmDelete}>Yes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
