import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Cog, Menu, SquarePen, TreePine } from 'lucide-react'

import { useConversation, pathToRoot, freshState } from './state'
import { Role } from './types'
import MessageNode from './components/MessageNode'
import Sidebar from './components/Sidebar'
import LeftSidebar from './components/LeftSidebar'
import { streamChat, createConversation, saveSnapshot, loadConversation, upsertMessage, deleteMessage } from './lib/api'
import { fetchAllowedModels, ModelsResponse } from './lib/models'
import { startAutoFlush } from './lib/sync'
import Composer from './components/Composer'
import { Button } from './components/ui/button'

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

  const subtreeColsMap = useMemo(() => {
    const memo = new Map<string, number>()
    const fn = (nodeId: string | undefined | null): number => {
      if (!nodeId) return 1
      if (memo.has(nodeId)) return memo.get(nodeId) as number
      const node = state.nodes[nodeId]
      if (!node || !node.children || node.children.length === 0) { memo.set(nodeId, 1); return 1 }
      let sum = 0
      for (const c of node.children) sum += fn(c)
      const res = Math.max(1, sum)
      memo.set(nodeId, res)
      return res
    }
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
  }, [conversationId])

  useEffect(() => {
    try { localStorage.setItem('treechat-left-open', leftOpen ? '1' : '0') } catch {}
  }, [leftOpen])
  useEffect(() => {
    try { localStorage.setItem('treechat-right-open', rightOpen ? '1' : '0') } catch {}
  }, [rightOpen])

  useEffect(() => {
    (async () => {
      if (id) {
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
          // ignore
        }
      } else {
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
    let convId = conversationId
    if (!convId) {
      convId = await createConversation()
      setConversationId(convId)
      try {
        await saveSnapshot(convId, { nodes: Object.values(state.nodes), rootId: state.rootId })
      } catch {}
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
      .slice(0, -1)
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
      const nodeId = stack.pop()!
      if (seen.has(nodeId)) continue
      seen.add(nodeId)
      out.push(nodeId)
      const n = state.nodes[nodeId]
      if (n) for (const c of n.children) stack.push(c)
    }
    return out
  }

  async function handleDelete(nodeId: string) {
    const ids = collectSubtreeIds(nodeId)
    for (const item of ids) {
      const ac = controllers.current.get(item)
      if (ac) {
        try { ac.abort() } catch {}
        controllers.current.delete(item)
      }
    }
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
    <div className="app-shell bg-background" style={{ ['--col-w' as any]: `${columnWidth}px` }}>
      {leftOpen && (
        <aside className="fixed inset-y-0 left-0 z-30 w-[var(--sidebar-w)] border-r border-border bg-card/70 px-4 py-5 backdrop-blur">
          <LeftSidebar onClose={() => setLeftOpen(false)} />
        </aside>
      )}
      {rightOpen && (
        <aside className="fixed inset-y-0 right-0 z-30 w-[var(--sidebar-w)] border-l border-border bg-card/70 px-4 py-5 backdrop-blur">
          <Sidebar
            state={state}
            onSetSystem={async (c) => {
              dispatch({ type: 'set_system', content: c })
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
        </aside>
      )}
      <div
        className="relative flex min-h-screen flex-col"
        style={{
          marginLeft: leftOpen ? 'var(--sidebar-w)' : 0,
          marginRight: rightOpen ? 'var(--sidebar-w)' : 0,
        }}
      >
        <div className="sticky top-0 z-20 flex items-center justify-between bg-gradient-to-b from-background/90 via-background/80 to-transparent px-4 py-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setLeftOpen(o => !o)} aria-label="Toggle history">
              {leftOpen ? <Menu className="h-5 w-5" /> : <TreePine className="h-5 w-5" />}
            </Button>
            <Button variant="secondary" size="sm" className="gap-2" onClick={() => navigate('/')}>
              <SquarePen className="h-4 w-4" />
              New chat
            </Button>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setRightOpen(o => !o)} aria-label="Toggle settings">
            <Cog className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto px-4 pb-10 md:px-8">
          {root.children.length === 0 ? (
            <div className="mx-auto max-w-4xl space-y-4 rounded-xl border border-border bg-card/60 p-6 text-sm text-muted-foreground shadow">
              <div className="text-base text-foreground">
                {id ? 'This conversation is empty. Start by sending a message. To branch, edit a user message or retry an AI response.' : 'Start a new conversation by typing a message below. To branch, edit a user message or retry an AI response.'}
              </div>
              <Composer
                placeholder={id ? 'Send a message' : 'Start a new conversation'}
                models={models}
                defaultModel={defaultModel}
                initialModel={lastModel}
                labels={labels}
                onSend={(t, m) => { setLastModel(m); try { localStorage.setItem(lastKey(conversationId), m) } catch {}; sendFrom(root.id, t, m) }}
              />
            </div>
          ) : (
            <div className="branch-row">
              {root.children.map(cid => {
                const child = state.nodes[cid]
                const cols = subtreeColsMap.get(cid) ?? 1
                const extra = Math.max(0, cols - 1)
                return (
                  <div className="branch-column" key={cid} style={{ ['--extra-cols' as any]: extra }}>
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
      </div>
      {toast && (
        <div className="fixed right-4 top-4 z-40 rounded-md border border-border bg-secondary/70 px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
