import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useConversation, pathToRoot, freshState } from './state'
import { Role } from './types'
import MessageNode from './components/MessageNode'
import LeftSidebar from './components/LeftSidebar'
import { streamChat, createConversation, saveSnapshot, loadConversation, upsertMessage, deleteMessage } from './lib/api'
import { fetchAllowedModels, ModelsResponse } from './lib/models'
import { pickEnabledModel } from './lib/model-utils'
import { startAutoFlush } from './lib/sync'
import Composer from './components/Composer'
import SettingsModal from './components/SettingsModal'
import { Monitor, Moon, PanelLeftOpen, SquarePen, Sun } from 'lucide-react'

export default function ConversationView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useConversation()
  const [theme, setTheme] = useState<'dark' | 'light' | 'auto'>(() => {
    try {
      const raw = localStorage.getItem('treechat-theme')
      if (raw === 'light' || raw === 'auto') return raw
      return 'dark'
    } catch {
      return 'dark'
    }
  })
  const [models, setModels] = useState<string[]>([])
  const [defaultModel, setDefaultModel] = useState<string>('openai/gpt-5.2-chat')
  const [lastModel, setLastModel] = useState<string>('openai/gpt-5.2-chat')
  const [labels, setLabels] = useState<Record<string, string>>({})
  const lastKey = (cid: string | null) => `treechat-last-model:${cid ?? 'global'}`
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
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false)
  // One-shot flag to prevent wiping in-memory state right after creating a conversation
  const suppressNextLoad = useRef(false)

  useEffect(() => {
    startAutoFlush()
  }, [])

  useEffect(() => {
    try { localStorage.setItem('treechat-theme', theme) } catch {}

    function applyResolved(resolved: 'dark' | 'light') {
      document.documentElement.dataset.theme = resolved
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta && meta instanceof HTMLMetaElement) {
        meta.content = resolved === 'dark' ? '#100F0F' : '#FFFCF0'
      }
    }

    if (theme === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyResolved(mq.matches ? 'dark' : 'light')
      const handler = (e: MediaQueryListEvent) => applyResolved(e.matches ? 'dark' : 'light')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    } else {
      applyResolved(theme)
    }
  }, [theme])

  useEffect(() => {
    (async () => {
      const r: ModelsResponse = await fetchAllowedModels()
      setModels(r.models)
      setDefaultModel(r.default)
      setLabels(r.labels || {})
      try {
        const stored = localStorage.getItem(lastKey(conversationId))
        const initial = pickEnabledModel(stored, r.models, r.default)
        setLastModel(initial)
      } catch {
        setLastModel(pickEnabledModel(null, r.models, r.default))
      }
    })()
    // also update when conversation changes
  }, [conversationId])

  useEffect(() => {
    setLastModel(prev => pickEnabledModel(prev, models, defaultModel))
  }, [models, defaultModel])

  useEffect(() => {
    try { localStorage.setItem('treechat-left-open', leftOpen ? '1' : '0') } catch {}
  }, [leftOpen])

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
    const chosenModel = pickEnabledModel(model, models, defaultModel)
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
    dispatch({ type: 'start_assistant', parentId: userId, id: assistantId, model: chosenModel })
    if (convId) {
      try { await upsertMessage(convId, { external_id: assistantId, parent_external_id: userId, role: 'assistant', content: '', model: chosenModel, created_ts: Date.now() }) } catch {}
    }
    const messages = pathToRoot(state, parentAssistantId)
      .map(m => ({ role: m.role as Role, content: m.content }))
      .concat([{ role: 'user' as Role, content: t }])
    const ac = new AbortController()
    controllers.current.set(assistantId, ac)
    try {
      await streamChat(
        chosenModel,
        messages,
        (delta) => dispatch({ type: 'append_assistant', id: assistantId, delta }),
        { conversationId: convId ?? undefined, assistantExternalId: assistantId, signal: ac.signal, strict: true }
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

  async function sendFromAll(parentAssistantId: string, content: string, primaryModel: string) {
    const t = content.trim()
    if (!t) return
    const chosenPrimary = pickEnabledModel(primaryModel, models, defaultModel)
    const enabledModels = models.length > 0 ? models : [chosenPrimary]

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

    const baseTs = Date.now()
    const userId = crypto.randomUUID()
    dispatch({ type: 'send_user', parentId: parentAssistantId, content: t, id: userId })
    if (convId) {
      try {
        await upsertMessage(convId, {
          external_id: userId,
          parent_external_id: parentAssistantId,
          role: 'user',
          content: t,
          created_ts: baseTs,
        })
      } catch {}
    }

    const messages = pathToRoot(state, parentAssistantId)
      .map(m => ({ role: m.role as Role, content: m.content }))
      .concat([{ role: 'user' as Role, content: t }])

    const assistants = enabledModels.map((modelId, idx) => ({
      model: modelId,
      id: crypto.randomUUID(),
      createdTs: baseTs + 1 + idx,
    }))
    const primaryAssistantId = assistants.find(a => a.model === chosenPrimary)?.id || assistants[0]?.id

    for (const a of assistants) {
      dispatch({ type: 'start_assistant', parentId: userId, id: a.id, model: a.model })
      if (convId) {
        try {
          await upsertMessage(convId, {
            external_id: a.id,
            parent_external_id: userId,
            role: 'assistant',
            content: '',
            model: a.model,
            created_ts: a.createdTs,
          })
        } catch {}
      }
    }
    if (primaryAssistantId) dispatch({ type: 'select', id: primaryAssistantId })

    const isAbort = (e: any) => e?.name === 'AbortError' || /aborted/i.test(String(e?.message))
    await Promise.allSettled(assistants.map(async (a) => {
      const ac = new AbortController()
      controllers.current.set(a.id, ac)
      try {
        await streamChat(
          a.model,
          messages,
          (delta) => dispatch({ type: 'append_assistant', id: a.id, delta }),
          { conversationId: convId ?? undefined, assistantExternalId: a.id, signal: ac.signal, strict: true }
        )
        dispatch({ type: 'finalize_assistant', id: a.id })
      } catch (e: any) {
        if (!isAbort(e)) {
          dispatch({ type: 'append_assistant', id: a.id, delta: `\n[Error: ${e?.message || String(e)}]` })
        }
      } finally {
        controllers.current.delete(a.id)
      }
    }))
  }

  async function retryAtUser(userNodeId: string, modelOverride?: string) {
    const model = pickEnabledModel(modelOverride || lastModel || defaultModel, models, defaultModel)
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
        { conversationId: conversationId ?? undefined, assistantExternalId: assistantId, signal: ac.signal, strict: true }
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

  async function retryAllAtUser(userNodeId: string, primaryModelOverride?: string) {
    const chosenPrimary = pickEnabledModel(primaryModelOverride || lastModel || defaultModel, models, defaultModel)
    const enabledModels = models.length > 0 ? models : [chosenPrimary]
    const baseTs = Date.now()

    const messages = pathToRoot(state, userNodeId).map(m => ({ role: m.role as Role, content: m.content }))

    const assistants = enabledModels.map((modelId, idx) => ({
      model: modelId,
      id: crypto.randomUUID(),
      createdTs: baseTs + idx,
    }))
    const primaryAssistantId = assistants.find(a => a.model === chosenPrimary)?.id || assistants[0]?.id

    for (const a of assistants) {
      dispatch({ type: 'start_assistant', parentId: userNodeId, id: a.id, model: a.model })
      if (conversationId) {
        try {
          await upsertMessage(conversationId, {
            external_id: a.id,
            parent_external_id: userNodeId,
            role: 'assistant',
            content: '',
            model: a.model,
            created_ts: a.createdTs,
          })
        } catch {}
      }
    }
    if (primaryAssistantId) dispatch({ type: 'select', id: primaryAssistantId })

    const isAbort = (e: any) => e?.name === 'AbortError' || /aborted/i.test(String(e?.message))
    await Promise.allSettled(assistants.map(async (a) => {
      const ac = new AbortController()
      controllers.current.set(a.id, ac)
      try {
        await streamChat(
          a.model,
          messages,
          (delta) => dispatch({ type: 'append_assistant', id: a.id, delta }),
          { conversationId: conversationId ?? undefined, assistantExternalId: a.id, signal: ac.signal, strict: true }
        )
        dispatch({ type: 'finalize_assistant', id: a.id })
      } catch (e: any) {
        if (!isAbort(e)) {
          dispatch({ type: 'append_assistant', id: a.id, delta: `\n[Error: ${e?.message || String(e)}]` })
        }
      } finally {
        controllers.current.delete(a.id)
      }
    }))
  }

  async function editUser(nodeId: string, newContent: string, model: string) {
    const chosenModel = pickEnabledModel(model, models, defaultModel)
    const newUserId = crypto.randomUUID()
    dispatch({ type: 'edit_user', nodeId, newContent, newId: newUserId })
    if (conversationId) {
      const parent = state.nodes[nodeId].parentId ?? null
      try { await upsertMessage(conversationId, { external_id: newUserId, parent_external_id: parent, role: 'user', content: newContent, created_ts: Date.now() }) } catch {}
    }
    const assistantId = crypto.randomUUID()
    dispatch({ type: 'start_assistant', parentId: newUserId, id: assistantId, model: chosenModel })
    if (conversationId) {
      try { await upsertMessage(conversationId, { external_id: assistantId, parent_external_id: newUserId, role: 'assistant', content: '', model: chosenModel, created_ts: Date.now() }) } catch {}
    }
    const messages = pathToRoot(state, nodeId)
      .slice(0, -1) // up to original's parent
      .map(m => ({ role: m.role as Role, content: m.content }))
      .concat([{ role: 'user' as Role, content: newContent }])
    const ac = new AbortController()
    controllers.current.set(assistantId, ac)
    try {
      await streamChat(
        chosenModel,
        messages,
        (delta) => dispatch({ type: 'append_assistant', id: assistantId, delta }),
        { conversationId: conversationId ?? undefined, assistantExternalId: assistantId, signal: ac.signal, strict: true }
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
      <div
        className="container"
        style={{
          ['--chat-left' as any]: leftOpen ? 'var(--sidebar-w)' : '0px',
          ['--chat-right' as any]: '0px',
        }}
      >
        <div className="top-bar">
          <div style={{ display: 'flex', gap: 8 }}>
            {!leftOpen && (
              <>
                <button
                  className="icon-button"
                  onClick={() => setLeftOpen(true)}
                  aria-label="Open left sidebar"
                  title="Open left sidebar"
                >
                  <PanelLeftOpen size={16} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => navigate('/')}
                  aria-label="Create new chat"
                  title="Create new chat"
                >
                  <SquarePen size={16} />
                </button>
              </>
            )}
          </div>
          <div>
            <button
              className="icon-button"
              onClick={() => setTheme(t => t === 'dark' ? 'light' : t === 'light' ? 'auto' : 'dark')}
              aria-label={theme === 'dark' ? 'Switch to light mode' : theme === 'light' ? 'Switch to auto mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : theme === 'light' ? 'Switch to auto (system)' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={16} /> : theme === 'light' ? <Monitor size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
        {leftOpen && (
          <div className="left-pane">
            <LeftSidebar onClose={() => setLeftOpen(false)} onOpenSettings={() => setSettingsOpen(true)} />
          </div>
        )}
        <div className="tree-pane" style={{ marginLeft: leftOpen ? 'var(--sidebar-w)' as any : 0, marginRight: 0 }}>
          {root.children.length === 0 ? (
            <>
              {id && (
                <div className="node-card">
                  This conversation is empty. Start by sending a message. To branch, edit a user message or retry an AI response.
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <Composer
                  placeholder={id ? 'SEND A MESSAGE' : 'START A NEW CONVERSATION'}
                  models={models}
                  defaultModel={defaultModel}
                  initialModel={lastModel}
                  labels={labels}
                  onSend={(t, m) => {
                    const safeModel = pickEnabledModel(m, models, defaultModel)
                    setLastModel(safeModel)
                    try { localStorage.setItem(lastKey(conversationId), safeModel) } catch {}
                    sendFrom(root.id, t, safeModel)
                  }}
                  onSendAll={(t, m) => {
                    const safeModel = pickEnabledModel(m, models, defaultModel)
                    setLastModel(safeModel)
                    try { localStorage.setItem(lastKey(conversationId), safeModel) } catch {}
                    sendFromAll(root.id, t, safeModel)
                  }}
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
                      onRetry={(userId, m) => {
                        const safeModel = pickEnabledModel(m, models, defaultModel)
                        setLastModel(safeModel)
                        try { localStorage.setItem(lastKey(conversationId), safeModel) } catch {}
                        retryAtUser(userId, safeModel)
                      }}
                      onRetryAll={(userId, m) => {
                        const safeModel = pickEnabledModel(m, models, defaultModel)
                        setLastModel(safeModel)
                        try { localStorage.setItem(lastKey(conversationId), safeModel) } catch {}
                        retryAllAtUser(userId, safeModel)
                      }}
                      onEditUser={(nodeId, text, m) => {
                        const safeModel = pickEnabledModel(m, models, defaultModel)
                        setLastModel(safeModel)
                        try { localStorage.setItem(lastKey(conversationId), safeModel) } catch {}
                        editUser(nodeId, text, safeModel)
                      }}
                      onSendFrom={(parentId, text, m) => {
                        const safeModel = pickEnabledModel(m, models, defaultModel)
                        setLastModel(safeModel)
                        try { localStorage.setItem(lastKey(conversationId), safeModel) } catch {}
                        sendFrom(parentId, text, safeModel)
                      }}
                      onSendAllFrom={(parentId, text, m) => {
                        const safeModel = pickEnabledModel(m, models, defaultModel)
                        setLastModel(safeModel)
                        try { localStorage.setItem(lastKey(conversationId), safeModel) } catch {}
                        sendFromAll(parentId, text, safeModel)
                      }}
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
        {settingsOpen && (
          <div className="pane-modal-overlay" onClick={() => setSettingsOpen(false)}>
            <div onClick={e => e.stopPropagation()}>
              <SettingsModal
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
                onClose={() => setSettingsOpen(false)}
              />
            </div>
          </div>
        )}
      </div>
      {toast && (
        <div className="toast">{toast}</div>
      )}
    </div>
  )
}
