import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useConversation, pathToRoot, freshState } from './state'
import { Role } from './types'
import MessageNode from './components/MessageNode'
import Sidebar from './components/Sidebar'
import LeftSidebar from './components/LeftSidebar'
import { streamChat, createConversation, saveSnapshot, loadConversation, upsertMessage, deleteMessage } from './lib/api'
import { startAutoFlush } from './lib/sync'
import Composer from './components/Composer'

export default function ConversationView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useConversation()
  const [model, setModel] = useState('gpt-5-mini')
  const root = useMemo(() => state.nodes[state.rootId], [state])
  const [conversationId, setConversationId] = useState<string | null>(() => (id ? String(id) : null))
  const controllers = useRef<Map<string, AbortController>>(new Map())
  const [toast, setToast] = useState<string | null>(null)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  // One-shot flag to prevent wiping in-memory state right after creating a conversation
  const suppressNextLoad = useRef(false)

  useEffect(() => {
    startAutoFlush()
  }, [])

  // When the route param changes, either load that conversation or reset to a fresh state
  useEffect(() => {
    (async () => {
      if (id) {
        // If we just created a conversation and navigated to it, keep current in-memory streaming state
        if (suppressNextLoad.current) {
          setConversationId(String(id))
          suppressNextLoad.current = false
          return
        }
        try {
          const snap = await loadConversation(id)
          if (snap && snap.rootId && snap.nodes) {
            dispatch({ type: 'replace_all', state: snap })
            setConversationId(String(id))
          }
        } catch {
          // failed to load; stay as-is
        }
      } else {
        // root path (new conversation composer): clear any persisted state and reset
        try { localStorage.removeItem('treechat-state') } catch {}
        try { localStorage.removeItem('treechat-conv-id') } catch {}
        dispatch({ type: 'replace_all', state: freshState() })
        setConversationId(null)
      }
    })()
  }, [id, dispatch])

  async function sendFrom(parentAssistantId: string, content: string) {
    const t = content.trim()
    if (!t) return
    // Ensure a conversation exists on first send and seed initial snapshot (system prompt only)
    let convId = conversationId
    if (!convId) {
      convId = await createConversation()
      setConversationId(convId)
      try {
        await saveSnapshot(convId, { nodes: Object.values(state.nodes), rootId: state.rootId })
      } catch {}
      // Navigate to the conversation route
      // Suppress the next loader-triggered state replace so streaming UI isn't wiped
      suppressNextLoad.current = true
      navigate(`/c/${convId}`)
    }
    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()
    dispatch({ type: 'send_user', parentId: parentAssistantId, content: t, id: userId })
    if (convId) {
      try { await upsertMessage(convId, { external_id: userId, parent_external_id: parentAssistantId, role: 'user', content: t, created_ts: Date.now() }) } catch {}
    }
    dispatch({ type: 'start_assistant', parentId: userId, id: assistantId, model })
    if (convId) {
      try { await upsertMessage(convId, { external_id: assistantId, parent_external_id: userId, role: 'assistant', content: '', model, created_ts: Date.now() }) } catch {}
    }
    const messages = pathToRoot(state, parentAssistantId)
      .map(m => ({ role: m.role as Role, content: m.content }))
      .concat([{ role: 'user' as Role, content: t }])
    const ac = new AbortController()
    controllers.current.set(assistantId, ac)
    try {
      await streamChat(
        model,
        messages,
        (delta) => dispatch({ type: 'append_assistant', id: assistantId, delta }),
        { conversationId: convId ?? undefined, assistantExternalId: assistantId, signal: ac.signal }
      )
      dispatch({ type: 'finalize_assistant', id: assistantId })
    } catch (e: any) {
      if (!(e?.name === 'AbortError' || /aborted/i.test(String(e?.message)))) {
        dispatch({ type: 'append_assistant', id: assistantId, delta: `\n[Error: ${e.message}]` })
      }
    } finally {
      controllers.current.delete(assistantId)
    }
  }

  async function retryAtUser(userNodeId: string) {
    const assistantId = crypto.randomUUID()
    dispatch({ type: 'start_assistant', parentId: userNodeId, id: assistantId, model })
    if (conversationId) {
      try { await upsertMessage(conversationId, { external_id: assistantId, parent_external_id: userNodeId, role: 'assistant', content: '', model, created_ts: Date.now() }) } catch {}
    }
    const messages = pathToRoot(state, userNodeId).map(m => ({ role: m.role as Role, content: m.content }))
    const ac = new AbortController()
    controllers.current.set(assistantId, ac)
    try {
      await streamChat(
        model,
        messages,
        (delta) => dispatch({ type: 'append_assistant', id: assistantId, delta }),
        { conversationId: conversationId ?? undefined, assistantExternalId: assistantId, signal: ac.signal }
      )
      dispatch({ type: 'finalize_assistant', id: assistantId })
    } catch (e: any) {
      if (!(e?.name === 'AbortError' || /aborted/i.test(String(e?.message)))) {
        dispatch({ type: 'append_assistant', id: assistantId, delta: `\n[Error: ${e.message}]` })
      }
    } finally {
      controllers.current.delete(assistantId)
    }
  }

  async function editUser(nodeId: string, newContent: string) {
    const newUserId = crypto.randomUUID()
    dispatch({ type: 'edit_user', nodeId, newContent, newId: newUserId })
    if (conversationId) {
      const parent = state.nodes[nodeId].parentId ?? null
      try { await upsertMessage(conversationId, { external_id: newUserId, parent_external_id: parent, role: 'user', content: newContent, created_ts: Date.now() }) } catch {}
    }
    const assistantId = crypto.randomUUID()
    dispatch({ type: 'start_assistant', parentId: newUserId, id: assistantId, model })
    if (conversationId) {
      try { await upsertMessage(conversationId, { external_id: assistantId, parent_external_id: newUserId, role: 'assistant', content: '', model, created_ts: Date.now() }) } catch {}
    }
    const messages = pathToRoot(state, nodeId)
      .slice(0, -1) // up to original's parent
      .map(m => ({ role: m.role as Role, content: m.content }))
      .concat([{ role: 'user' as Role, content: newContent }])
    const ac = new AbortController()
    controllers.current.set(assistantId, ac)
    try {
      await streamChat(
        model,
        messages,
        (delta) => dispatch({ type: 'append_assistant', id: assistantId, delta }),
        { conversationId: conversationId ?? undefined, assistantExternalId: assistantId, signal: ac.signal }
      )
      dispatch({ type: 'finalize_assistant', id: assistantId })
    } catch (e: any) {
      if (!(e?.name === 'AbortError' || /aborted/i.test(String(e?.message)))) {
        dispatch({ type: 'append_assistant', id: assistantId, delta: `\n[Error: ${e.message}]` })
      }
    } finally {
      controllers.current.delete(assistantId)
    }
  }

  function collectSubtreeIds(startId: string): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    const stack = [startId]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      out.push(id)
      const n = state.nodes[id]
      if (n) for (const c of n.children) stack.push(c)
    }
    return out
  }

  async function handleDelete(nodeId: string) {
    // Abort any in-flight assistant stream within this subtree
    const ids = collectSubtreeIds(nodeId)
    for (const id of ids) {
      const ac = controllers.current.get(id)
      if (ac) {
        try { ac.abort() } catch {}
        controllers.current.delete(id)
      }
    }
    // Optimistic UI update
    dispatch({ type: 'delete_subtree', nodeId })
    if (conversationId) {
      try {
        await deleteMessage(conversationId, nodeId)
      } catch (e: any) {
        setToast(`Delete failed: ${e?.message || 'server error'}`)
        setTimeout(() => setToast(null), 3000)
      }
    }
  }

  return (
    <div className="app-shell">
      <div className="container">
        {leftOpen && (
          <div className="left-pane">
            <LeftSidebar onClose={() => setLeftOpen(false)} />
          </div>
        )}
        {!leftOpen && (
          <button
            className="floating-toggle left button"
            onClick={() => setLeftOpen(true)}
            aria-label="Open left sidebar"
            title="Open left sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-tree-pine-icon lucide-tree-pine">
              <path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"/>
              <path d="M12 22v-3"/>
            </svg>
          </button>
        )}
        <div className="tree-pane" style={{ marginLeft: leftOpen ? 'var(--sidebar-w)' as any : 0, marginRight: rightOpen ? 'var(--sidebar-w)' as any : 0 }}>
          {root.children.length === 0 ? (
            <>
              <div className="node-card">
                {id ? 'This conversation is empty. Start by sending a message.' : 'Start a new conversation by typing a message below.'}
              </div>
              <div style={{ marginTop: 12 }}>
                <Composer placeholder={id ? 'SEND A MESSAGE' : 'START A NEW CONVERSATION'} onSend={(t) => sendFrom(root.id, t)} />
              </div>
            </>
          ) : (
            <div className="children-row" style={{ marginLeft: 0 }}>
              {root.children.map(cid => {
                const child = state.nodes[cid]
                return (
                  <div className="column" key={cid}>
                    <MessageNode node={child} state={state} onSelect={(leafId) => dispatch({ type: 'select', id: leafId })} onRetry={retryAtUser} onEditUser={editUser} onSendFrom={sendFrom} onDelete={handleDelete} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {rightOpen && (
          <div className="side-pane">
            <Sidebar
            state={state}
            onSetSystem={async (c) => {
              // Update local state immediately
              dispatch({ type: 'set_system', content: c })
              // If this conversation already exists, persist the root system message
              if (conversationId) {
                try {
                  await upsertMessage(conversationId, {
                    external_id: state.rootId,
                    parent_external_id: null,
                    role: 'system',
                    content: c,
                    created_ts: Date.now(),
                  })
                } catch {}
              }
            }}
            model={model}
            onSetModel={setModel}
            onClose={() => setRightOpen(false)}
          />
          </div>
        )}
        {!rightOpen && (
          <button
            className="floating-toggle right button"
            onClick={() => setRightOpen(true)}
            aria-label="Open right sidebar"
            title="Open right sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-cog-icon lucide-cog">
              <path d="M11 10.27 7 3.34"/>
              <path d="m11 13.73-4 6.93"/>
              <path d="M12 22v-2"/>
              <path d="M12 2v2"/>
              <path d="M14 12h8"/>
              <path d="m17 20.66-1-1.73"/>
              <path d="m17 3.34-1 1.73"/>
              <path d="M2 12h2"/>
              <path d="m20.66 17-1.73-1"/>
              <path d="m20.66 7-1.73 1"/>
              <path d="m3.34 17 1.73-1"/>
              <path d="m3.34 7 1.73 1"/>
              <circle cx="12" cy="12" r="2"/>
              <circle cx="12" cy="12" r="8"/>
            </svg>
          </button>
        )}
      </div>
      {toast && (
        <div className="toast">{toast}</div>
      )}
    </div>
  )
}
