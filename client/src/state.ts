import { useEffect, useMemo, useReducer } from 'react'
import { ConversationState, MessageNode, Role } from './types'
import { nanoid } from './uid'

type Action =
  | { type: 'select'; id: string }
  | { type: 'send_user'; parentId: string; content: string; id?: string }
  | { type: 'start_assistant'; parentId: string; id?: string; model?: string }
  | { type: 'append_assistant'; id: string; delta: string }
  | { type: 'finalize_assistant'; id: string }
  | { type: 'retry_assistant'; parentId: string }
  | { type: 'edit_user'; nodeId: string; newContent: string; newId?: string }
  | { type: 'set_system'; content: string }
  | { type: 'delete_subtree'; nodeId: string }
  | { type: 'replace_all'; state: ConversationState }

function createNode(role: Role, content: string, parentId?: string | null): MessageNode {
  return { id: nanoid(), role, content, parentId: parentId ?? null, children: [], createdAt: Date.now() }
}

function reducer(state: ConversationState, action: Action): ConversationState {
  switch (action.type) {
    case 'replace_all':
      return action.state
    case 'select':
      return { ...state, selectedLeafId: action.id }
    case 'send_user': {
      const parent = state.nodes[action.parentId]
      const node: MessageNode = { id: action.id ?? nanoid(), role: 'user', content: action.content, parentId: parent?.id ?? null, children: [], createdAt: Date.now() }
      return applyInsert(state, node)
    }
    case 'start_assistant': {
      const node: MessageNode = { id: action.id ?? nanoid(), role: 'assistant', content: '', parentId: action.parentId, children: [], createdAt: Date.now(), model: action.model }
      return applyInsert(state, node)
    }
    case 'append_assistant': {
      const msg = state.nodes[action.id]
      if (!msg) return state
      return { ...state, nodes: { ...state.nodes, [msg.id]: { ...msg, content: msg.content + action.delta } } }
    }
    case 'finalize_assistant':
      return state
    case 'retry_assistant': {
      // Start a new assistant sibling under the same parent as last user message
      const parentId = action.parentId
      const assist = createNode('assistant', '', parentId)
      return applyInsert(state, assist)
    }
    case 'edit_user': {
      const original = state.nodes[action.nodeId]
      if (!original || original.role !== 'user') return state
      // Create a new sibling user node under the same parent with new content
      const edited = { id: action.newId ?? nanoid(), role: 'user' as const, content: action.newContent, parentId: original.parentId ?? null, children: [], createdAt: Date.now() }
      const st1 = applyInsert(state, edited)
      return { ...st1, selectedLeafId: edited.id }
    }
    case 'set_system': {
      const sys = state.nodes[state.rootId]
      const updated = { ...sys, content: action.content }
      return { ...state, nodes: { ...state.nodes, [state.rootId]: updated } }
    }
    case 'delete_subtree': {
      const target = state.nodes[action.nodeId]
      if (!target) return state
      // collect all descendants (including target)
      const toDelete = new Set<string>()
      const stack = [action.nodeId]
      while (stack.length) {
        const id = stack.pop()!
        if (toDelete.has(id)) continue
        toDelete.add(id)
        const n = state.nodes[id]
        if (n) for (const c of n.children) stack.push(c)
      }
      // build new nodes map excluding deleted
      const nodes: Record<string, MessageNode> = {}
      for (const [id, n] of Object.entries(state.nodes)) {
        if (toDelete.has(id)) continue
        nodes[id] = { ...n, children: n.children.filter(cid => !toDelete.has(cid)) }
      }
      // compute new selected leaf: if current selection was deleted, select the closest surviving ancestor or root
      let selectedLeafId = state.selectedLeafId
      if (toDelete.has(selectedLeafId)) {
        // walk up from target until we find a surviving ancestor
        let curParent = target.parentId
        while (curParent && toDelete.has(curParent)) {
          curParent = state.nodes[curParent]?.parentId ?? null
        }
        selectedLeafId = curParent ?? state.rootId
      }
      return { ...state, nodes, selectedLeafId }
    }
    default:
      return state
  }
}

function applyInsert(state: ConversationState, node: MessageNode): ConversationState {
  const nodes = { ...state.nodes, [node.id]: node }
  if (node.parentId) {
    const p = nodes[node.parentId]
    nodes[node.parentId] = { ...p, children: [...p.children, node.id] }
  }
  const selectedLeafId = node.id
  return { ...state, nodes, selectedLeafId }
}

export function useConversation() {
  const initial = useMemo(() => makeInitialState(), [])
  const [state, dispatch] = useReducer(reducer, initial)

  useEffect(() => {
    localStorage.setItem('treechat-state', JSON.stringify(state))
  }, [state])

  return { state, dispatch }
}

export function makeInitialState(): ConversationState {
  try {
    const raw = localStorage.getItem('treechat-state')
    if (raw) return JSON.parse(raw)
  } catch {}
  const system: MessageNode = { id: nanoid(), role: 'system', content: 'You are a helpful assistant.', parentId: null, children: [], createdAt: Date.now() }
  return {
    nodes: { [system.id]: system },
    rootId: system.id,
    selectedLeafId: system.id
  }
}

export function freshState(): ConversationState {
  const system: MessageNode = { id: nanoid(), role: 'system', content: 'You are a helpful assistant.', parentId: null, children: [], createdAt: Date.now() }
  return {
    nodes: { [system.id]: system },
    rootId: system.id,
    selectedLeafId: system.id
  }
}

export function pathToRoot(state: ConversationState, id: string): MessageNode[] {
  const out: MessageNode[] = []
  let cur: MessageNode | undefined = state.nodes[id]
  while (cur) {
    out.push(cur)
    if (!cur.parentId) break
    cur = state.nodes[cur.parentId]
  }
  return out.reverse()
}

export function pickLeaf(state: ConversationState, id?: string): MessageNode | undefined {
  if (!id) return undefined
  return state.nodes[id]
}
