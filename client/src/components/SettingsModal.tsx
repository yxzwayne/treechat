import React, { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { ConversationState } from '../types'

export default function SettingsModal({ state, onSetSystem, onClose }: { state: ConversationState, onSetSystem: (c: string) => void, onClose: () => void }) {
  const sys = state.nodes[state.rootId]
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(sys.content)
  // Collapse long system prompts by default
  const COLLAPSE_THRESHOLD = 200
  const isLong = useMemo(() => (sys.content || '').length > COLLAPSE_THRESHOLD, [sys.content])
  const [collapsed, setCollapsed] = useState(true)
  return (
    <div className="modal settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="settings-header">
        <div className="settings-title">Settings</div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close settings"
          title="Close settings"
        >
          <X size={16} />
        </button>
      </div>

      <div className="settings-section">
        <div className="settings-section-head">
          <div className="settings-section-head-left">
            <div className="settings-label">System Prompt</div>
            {!editing && (
              <button className="button ghost small" onClick={() => { setEditing(true); setDraft(sys.content) }}>Edit</button>
            )}
          </div>
          <div className="settings-section-head-right">
            {!editing && isLong && (
              <button className="button ghost small" onClick={() => setCollapsed(c => !c)}>{collapsed ? 'Show More' : 'Show Less'}</button>
            )}
          </div>
        </div>
        <div className="node-card node-system" style={{ marginTop: 6 }}>
          {editing ? (
            <div>
              <textarea className="text-input" rows={5} value={draft} onChange={e => setDraft(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button className="button" onClick={() => { setEditing(false); setDraft(sys.content) }}>Cancel</button>
                <button className="button accent" onClick={() => { setEditing(false); onSetSystem(draft) }}>Save</button>
              </div>
            </div>
          ) : (
            <div style={{ whiteSpace: 'pre-wrap', ...(isLong && collapsed ? { maxHeight: 160, overflow: 'hidden' } : {}) }}>
              {sys.content || <span style={{ color: 'var(--muted-2)' }}>(empty)</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
