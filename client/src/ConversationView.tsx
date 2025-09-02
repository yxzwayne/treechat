import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useConversation, pathToRoot, freshState } from './state'
import { Role } from './types'
import MessageNode from './components/MessageNode'
import Sidebar from './components/Sidebar'
import LeftSidebar from './components/LeftSidebar'
import { streamChat, createConversation, saveSnapshot, loadConversation, upsertMessage, deleteMessage } from './lib/api'
import { fetchAllowedModels, ModelsResponse } from './lib/models'
import { startAutoFlush } from './lib/sync'
import Composer from './components/Composer'

export default function ConversationView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useConversation()
  const [models, setModels] = useState<string[]>([])
  const [defaultModel, setDefaultModel] = useState<string>('openai/gpt-5-mini')
  const [lastModel, setLastModel] = useState<string>('openai/gpt-5-mini')
  const [labels, setLabels] = useState<Record<string, string>>({})
  const lastKey = (cid: string | null) => `treechat-last-model:${cid ?? 'global'}`
  const [columnWidth, setColumnWidth] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('treechat-col-w')
      if (!raw) return 720
      const n = Number(raw)
      if (!Number.isFinite(n)) return 720
      return Math.min(1440, Math.max(520, Math.floor(n)))
    } catch {
      return 720
    }
  })

  useEffect(() => {
    try {
      const n = Math.min(1440, Math.max(520, Math.floor(columnWidth)))
      localStorage.setItem('treechat-col-w', String(n))
    } catch {}
  }, [columnWidth])
  const root = useMemo(() => state.nodes[state.rootId], [state])

  // Compute subtree column spans once per state change
  const subtreeColsMap = useMemo(() => {
    const memo = new Map<string, number>()
    const fn = (id: string | undefined | null): number => {
      if (!id) return 1
      if (memo.has(id)) return memo.get(id) as number
      const n = state.nodes[id]
      if (!n || !n.children || n.children.length === 0) { memo.set(id, 1); return 1 }
      let sum = 0
      for (const c of n.children) sum += fn(c)
      const res = Math.max(1, sum)
      memo.set(id, res)
      return res
    }
    // Ensure we populate the map for all reachable nodes
    Object.keys(state.nodes).forEach(k => fn(k))
    return memo
  }, [state.nodes])
  const [conversationId, setConversationId] = useState<string | null>(() => (id ? String(id) : null))
  const controllers = useRef<Map<string, AbortController>>(new Map())
  const [toast, setToast] = useState<string | null>(null)
  const [leftOpen, setLeftOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('treechat-left-open')
      if (v == null) return true
      return v === '1' || v === 'true'
    } catch {
      return true
    }
  })
  const [rightOpen, setRightOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('treechat-right-open')
      if (v == null) return false
      return v === '1' || v === 'true'
    } catch {
      return false
    }
  })
  // One-shot flag to prevent wiping in-memory state right after creating a conversation
  const suppressNextLoad = useRef(false)

  useEffect(() => {
    startAutoFlush()
  }, [])

  useEffect(() => {
    (async () => {
      const r: ModelsResponse = await fetchAllowedModels()
      setModels(r.models)
      setDefaultModel(r.default)
      setLabels(r.labels || {})
      try {
        const stored = localStorage.getItem(lastKey(conversationId))
        const initial = stored && r.models.includes(stored) ? stored : r.default
        setLastModel(initial)
      } catch {
        setLastModel(r.default)
      }
    })()
    // also update when conversation changes
  }, [conversationId])

  useEffect(() => {
    try { localStorage.setItem('treechat-left-open', leftOpen ? '1' : '0') } catch {}
  }, [leftOpen])
  useEffect(() => {
    try { localStorage.setItem('treechat-right-open', rightOpen ? '1' : '0') } catch {}
  }, [rightOpen])

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

  async function sendFrom(parentAssistantId: string, content: string, model: string) {
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

  async function retryAtUser(userNodeId: string, modelOverride?: string) {
    const model = modelOverride || lastModel || defaultModel
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

  async function editUser(nodeId: string, newContent: string, model: string) {
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
      <div className="container" style={{ ['--col-w' as any]: `${columnWidth}px` }}>
        <div className="top-bar">
          <div style={{ display: 'flex', gap: 8 }}>
            {!leftOpen && (
              <>
                <button
                  className="sidepanel-toggle-btn"
                  onClick={() => setLeftOpen(true)}
                  aria-label="Open left sidebar"
                  title="Open left sidebar"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-tree-pine-icon lucide-tree-pine">
                    <path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"/>
                    <path d="M12 22v-3"/>
                  </svg>
                </button>
                <button
                  className="sidepanel-toggle-btn"
                  onClick={() => navigate('/')}
                  aria-label="Create new chat"
                  title="Create new chat"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-square-pen-icon lucide-square-pen">
                    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>
                  </svg>
                </button>
              </>
            )}
          </div>
          <div>
            {!rightOpen && (
              <button
                className="sidepanel-toggle-btn"
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
        </div>
        {leftOpen && (
          <div className="left-pane">
            <LeftSidebar onClose={() => setLeftOpen(false)} />
          </div>
        )}
        <div className="tree-pane" style={{ marginLeft: leftOpen ? 'var(--sidebar-w)' as any : 0, marginRight: rightOpen ? 'var(--sidebar-w)' as any : 0 }}>
          {root.children.length === 0 ? (
            <>
              <div className="node-card">
                {id ? 'This conversation is empty. Start by sending a message. To branch, edit a user message or retry an AI response.' : 'Start a new conversation by typing a message below. To branch, edit a user message or retry an AI response.'}
              </div>
              <div style={{ marginTop: 12 }}>
                <Composer
                  placeholder={id ? 'SEND A MESSAGE' : 'START A NEW CONVERSATION'}
                  models={models}
                  defaultModel={defaultModel}
                  initialModel={lastModel}
                  labels={labels}
                  onSend={(t, m) => { setLastModel(m); try { localStorage.setItem(lastKey(conversationId), m) } catch {}; sendFrom(root.id, t, m) }}
                />
              </div>
            </>
          ) : (
            <div className="children-row" style={{ marginLeft: 0 }}>
              {root.children.map(cid => {
                const child = state.nodes[cid]
                const cols = subtreeColsMap.get(cid) ?? 1
                const extra = Math.max(0, cols - 1)
                return (
                  <div className="column" key={cid} style={{ ['--extra-cols' as any]: extra }}>
                    <MessageNode
                      node={child}
                      state={state}
                      onSelect={(leafId) => dispatch({ type: 'select', id: leafId })}
                      onRetry={(userId, m) => { if (m) { setLastModel(m); try { localStorage.setItem(lastKey(conversationId), m) } catch {} } retryAtUser(userId, m) }}
                      onEditUser={(nodeId, text, m) => { setLastModel(m); try { localStorage.setItem(lastKey(conversationId), m) } catch {}; editUser(nodeId, text, m) }}
                      onSendFrom={(parentId, text, m) => { setLastModel(m); try { localStorage.setItem(lastKey(conversationId), m) } catch {}; sendFrom(parentId, text, m) }}
                      onDelete={handleDelete}
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
            columnWidth={columnWidth}
            onSetColumnWidth={setColumnWidth}
            onClose={() => setRightOpen(false)}
          />
          </div>
        )}
      </div>
      {toast && (
        <div className="toast">{toast}</div>
      )}
    </div>
  )
}
