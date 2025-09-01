import React, { useMemo, useState } from 'react'
import { ConversationState } from '../types'

export default function Sidebar({ state, onSetSystem, model, onSetModel, onClose, columnWidth, onSetColumnWidth }: { state: ConversationState, onSetSystem: (c: string) => void, model: string, onSetModel: (m: string) => void, onClose: () => void, columnWidth: number, onSetColumnWidth: (n: number) => void }) {
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
      <div style={{ color: '#9aa0ab', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div>TOOLS</div>
        <button
          className="sidepanel-toggle-btn"
          onClick={onClose}
          aria-label="Close right sidebar"
          title="Close right sidebar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-panel-right-close-icon lucide-panel-right-close">
            <rect width="18" height="18" x="3" y="3" rx="2"/>
            <path d="M15 3v18"/>
            <path d="m8 9 3 3-3 3"/>
          </svg>
        </button>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#9aa0ab' }}>MODEL</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <input className="text-input" style={{ fontFamily: "Berkeley Mono, monospace",  width: "100%" }} value={model} onChange={e => onSetModel(e.target.value)} />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#9aa0ab' }}>COLUMN WIDTH</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <input
            type="range"
            min={520}
            max={1440}
            step={10}
            value={columnWidth}
            onChange={e => onSetColumnWidth(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <div className="mono" style={{ width: 72, textAlign: 'right', color: '#9aa0ab' }}>{columnWidth}px</div>
        </div>
      </div>
      {null}
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#9aa0ab' }}>STATS</div>
        <div>Total nodes: {count}</div>
        <div>Selected: {state.selectedLeafId}</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#9aa0ab', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
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
    </div>
  )
}
