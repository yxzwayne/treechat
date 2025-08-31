import React, { useMemo, useState } from 'react'
import { ConversationState } from '../types'

export default function Sidebar({ state, onSetSystem, model, onSetModel }: { state: ConversationState, onSetSystem: (c: string) => void, model: string, onSetModel: (m: string) => void }) {
  const count = Object.keys(state.nodes).length - 1
  const sys = state.nodes[state.rootId]
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(sys.content)
  // Collapse long system prompts by default
  const COLLAPSE_THRESHOLD = 200
  const isLong = useMemo(() => (sys.content || '').length > COLLAPSE_THRESHOLD, [sys.content])
  const [collapsed, setCollapsed] = useState(true)
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div className="mono" style={{ color: '#9aa0ab' }}>MODEL</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <input className="text-input" style={{ width: "100%" }} value={model} onChange={e => onSetModel(e.target.value)} />
        </div>
      </div>
      {null}
      <div style={{ marginBottom: 12 }}>
        <div className="mono" style={{ color: '#9aa0ab' }}>STATS</div>
        <div>Total nodes: {count}</div>
        <div>Selected: {state.selectedLeafId}</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div className="mono" style={{ color: '#9aa0ab', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>SYSTEM PROMPT</div>
          {!editing && isLong && (
            <button className="button ghost small" onClick={() => setCollapsed(c => !c)}>{collapsed ? 'SHOW MORE' : 'SHOW LESS'}</button>
          )}
        </div>
        <div className="node-card node-system" style={{ marginTop: 6 }}>
          {editing ? (
            <div>
              <textarea className="text-input" rows={5} value={draft} onChange={e => setDraft(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button className="button" onClick={() => { setEditing(false); setDraft(sys.content) }}>CANCEL</button>
                <button className="button accent" onClick={() => { setEditing(false); onSetSystem(draft) }}>SAVE</button>
              </div>
            </div>
          ) : (
            <div style={{ whiteSpace: 'pre-wrap', ...(isLong && collapsed ? { maxHeight: 160, overflow: 'hidden' } : {}) }}>
              {sys.content || <span style={{ color: '#666' }}>(empty)</span>}
            </div>
          )}
        </div>
        {!editing && (
          <div style={{ marginTop: 6 }}>
            <button className="button ghost" onClick={() => { setEditing(true); setDraft(sys.content) }}>EDIT</button>
          </div>
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <div className="mono" style={{ color: '#9aa0ab' }}>TIPS</div>
        <ul>
          <li>Edit a user node to branch.</li>
          <li>Retry on a user node creates sibling answers.</li>
        </ul>
      </div>
    </div>
  )
}
