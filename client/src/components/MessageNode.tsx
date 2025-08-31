import React, { useMemo, useState } from 'react'
import { ConversationState, MessageNode as TMessageNode } from '../types'
import Composer from './Composer'

type Props = {
  node: TMessageNode
  state: ConversationState
  onSelect: (id: string) => void
  onRetry: (parentId: string) => void
  onEditUser: (nodeId: string, newContent: string) => void
  onSendFrom: (parentId: string, text: string) => void
  onDelete: (nodeId: string) => void
}

export default function MessageNode({ node, state, onSelect, onRetry, onEditUser, onSendFrom, onDelete }: Props) {
  const children = useMemo(() => node.children.map(id => state.nodes[id]), [node, state.nodes])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(node.content)
  const [confirming, setConfirming] = useState(false)

  const roleClass = node.role === 'user' ? 'node-user' : node.role === 'assistant' ? 'node-assistant' : 'node-system'
  const isActive = state.selectedLeafId === node.id

  return (
    <div>
      <div className={`node-card ${roleClass} ${isActive ? 'active' : ''}`} onClick={() => onSelect(node.id)}>
        <div className="node-header">
          <span className="mono">{node.role.toUpperCase()}</span>
          <div className="controls" onClick={e => e.stopPropagation()}>
            {node.role === 'assistant' && (
              <>
                {node.model && (
                  <span className="mono" style={{ color: '#9aa0ab' }}>{node.model}</span>
                )}
                <button className="icon-button" aria-label="Delete message" title="Delete message" onClick={() => setConfirming(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 6h18" stroke="#9aa0ab" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="#9aa0ab" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="#9aa0ab" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M10 11v6M14 11v6" stroke="#9aa0ab" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
                {node.parentId && (
                  <button className="button ghost" onClick={() => onRetry(node.parentId!)}>RETRY</button>
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
        {editing ? (
          <div>
            <textarea className="text-input" rows={4} value={draft} onChange={e => setDraft(e.target.value)} />
            <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
              <button className="button" onClick={() => { setEditing(false) }}>CANCEL</button>
              <button className="button accent" onClick={() => { setEditing(false); onEditUser(node.id, draft) }}>SAVE TO NEW BRANCH</button>
            </div>
          </div>
        ) : (
          <div className="node-content">{node.content || <span style={{ color: '#666' }}>GENERATING...</span>}</div>
        )}
      </div>

      {node.role === 'assistant' && (
        <Composer placeholder="RESPOND TO THIS BRANCH (CREATE A NEW RESPONSE BRANCH)" onSend={(t) => onSendFrom(node.id, t)} />
      )}

      {children.length > 0 && (
        <div className="children-row">
          {children.map(child => (
            <div className="column" key={child.id}>
              <MessageNode node={child} state={state} onSelect={onSelect} onRetry={onRetry} onEditUser={onEditUser} onSendFrom={onSendFrom} onDelete={onDelete} />
            </div>
          ))}
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
