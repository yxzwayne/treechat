import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useConversation, pathToRoot, freshState } from './state'
import { Role } from './types'
import MessageNode from './components/MessageNode'
import Sidebar from './components/Sidebar'
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

  useEffect(() => {
    startAutoFlush()
  }, [])

  // When the route param changes, either load that conversation or reset to a fresh state
  useEffect(() => {
    (async () => {
      if (id) {
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
    try {
      await streamChat(model, messages, (delta) => dispatch({ type: 'append_assistant', id: assistantId, delta }), { conversationId: convId ?? undefined, assistantExternalId: assistantId })
      dispatch({ type: 'finalize_assistant', id: assistantId })
    } catch (e: any) {
      dispatch({ type: 'append_assistant', id: assistantId, delta: `\n[Error: ${e.message}]` })
    }
  }

  async function retryAtUser(userNodeId: string) {
    const assistantId = crypto.randomUUID()
    dispatch({ type: 'start_assistant', parentId: userNodeId, id: assistantId, model })
    if (conversationId) {
      try { await upsertMessage(conversationId, { external_id: assistantId, parent_external_id: userNodeId, role: 'assistant', content: '', model, created_ts: Date.now() }) } catch {}
    }
    const messages = pathToRoot(state, userNodeId).map(m => ({ role: m.role as Role, content: m.content }))
    try {
      await streamChat(model, messages, (delta) => dispatch({ type: 'append_assistant', id: assistantId, delta }), { conversationId: conversationId ?? undefined, assistantExternalId: assistantId })
      dispatch({ type: 'finalize_assistant', id: assistantId })
    } catch (e: any) {
      dispatch({ type: 'append_assistant', id: assistantId, delta: `\n[Error: ${e.message}]` })
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
    try {
      await streamChat(model, messages, (delta) => dispatch({ type: 'append_assistant', id: assistantId, delta }), { conversationId: conversationId ?? undefined, assistantExternalId: assistantId })
      dispatch({ type: 'finalize_assistant', id: assistantId })
    } catch (e: any) {
      dispatch({ type: 'append_assistant', id: assistantId, delta: `\n[Error: ${e.message}]` })
    }
  }

  async function handleDelete(nodeId: string) {
    // Optimistic: update UI immediately
    dispatch({ type: 'delete_subtree', nodeId })
    if (conversationId) {
      try { await deleteMessage(conversationId, nodeId) } catch {
        // ignore failures for now; UI remains consistent with local state
      }
    }
  }

  return (
    <div className="app-shell">
      <div className="header">
        <div className="title">TREECHAT</div>
      </div>
      <div className="container">
        <div className="tree-pane">
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
        <div className="side-pane">
          <Sidebar
            state={state}
            onSetSystem={(c) => dispatch({ type: 'set_system', content: c })}
            model={model}
            onSetModel={setModel}
          />
        </div>
      </div>
    </div>
  )
}
