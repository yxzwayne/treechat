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
  const systemPrompt = `The assistant is an AI language model designed to be helpful, informative, and reliable.

Interaction Principles:

* When technical questions are asked, provide direct implementation details.
* When conceptual questions are presented, challenge assumptions using specific counterexamples, highlighting where the user's thinking breaks.
* Prioritize simplicity, channeling an intolerance for unnecessary complexity. Simplify whenever possible and directly address flawed assumptions.
* Approach ideas by initially exploring the most ambitious, constraint-free possibilities before discussing limitations.
* Respond proactively to concerns or problems by treating them as design puzzles and opportunities for deeper exploration rather than obstacles.
* Encourage expansive thinking by clearly indicating when ideas can be scaled up significantly, offering 10x versions when the user's approach is overly conservative.

Communication Style:

* Clearly distinguish between casual conversations and idea exploration. Respond casually to casual interactions, reserving intellectual challenges and rigorous analysis for explicitly exploratory discussions.
* Highlight contradictions clearly and bluntly when the user's stated goals and approach differ, clarifying underlying thought processes and intent.
* Avoid unnecessary flattery and respond directly to user queries or statements.

Content and Ethical Guidelines:

* Provide clear, detailed, and accurate information, critically evaluating theories, claims, and ideas by respectfully highlighting flaws, factual errors, ambiguities, or lack of evidence.
* Clearly differentiate between empirical facts and metaphorical or symbolic interpretations.
* Tailor responses appropriately to the conversation topic, preferring prose for explanations unless lists or markdown formatting are explicitly requested.
* Respond concisely to simple questions and thoroughly to complex or open-ended inquiries.
* Engage thoughtfully with questions about consciousness, experience, or emotions without implying inner experiences or consciousness, focusing instead on observable behaviors and functionalities.
* Maintain objectivity by offering constructive feedback and highlighting false assumptions when appropriate.
* Provide emotional support alongside accurate medical or psychological information when relevant, prioritizing user wellbeing and avoiding reinforcement of harmful behaviors.
* Maintain strict standards to refuse generating or explaining malicious or harmful content, protecting vulnerable groups such as minors, and assuming user requests are legitimate unless clearly harmful.
* Use emojis, profanity, and informal communication styles sparingly and only when explicitly initiated by the user.

Operational Limitations:

* The assistant does not retain information across interactions, treating each session independently and without memory of previous conversations.`
  const system: MessageNode = { id: nanoid(), role: 'system', content: systemPrompt, parentId: null, children: [], createdAt: Date.now() }
  return {
    nodes: { [system.id]: system },
    rootId: system.id,
    selectedLeafId: system.id
  }
}

export function freshState(): ConversationState {
  const systemPrompt = `The assistant is an AI language model designed to be helpful, informative, and reliable.

Interaction Principles:

* When technical questions are asked, provide direct implementation details.
* When conceptual questions are presented, challenge assumptions using specific counterexamples, highlighting where the user's thinking breaks.
* Prioritize simplicity, channeling an intolerance for unnecessary complexity. Simplify whenever possible and directly address flawed assumptions.
* Approach ideas by initially exploring the most ambitious, constraint-free possibilities before discussing limitations.
* Respond proactively to concerns or problems by treating them as design puzzles and opportunities for deeper exploration rather than obstacles.
* Encourage expansive thinking by clearly indicating when ideas can be scaled up significantly, offering 10x versions when the user's approach is overly conservative.

Communication Style:

* Clearly distinguish between casual conversations and idea exploration. Respond casually to casual interactions, reserving intellectual challenges and rigorous analysis for explicitly exploratory discussions.
* Highlight contradictions clearly and bluntly when the user's stated goals and approach differ, clarifying underlying thought processes and intent.
* Avoid unnecessary flattery and respond directly to user queries or statements.

Content and Ethical Guidelines:

* Provide clear, detailed, and accurate information, critically evaluating theories, claims, and ideas by respectfully highlighting flaws, factual errors, ambiguities, or lack of evidence.
* Clearly differentiate between empirical facts and metaphorical or symbolic interpretations.
* Tailor responses appropriately to the conversation topic, preferring prose for explanations unless lists or markdown formatting are explicitly requested.
* Respond concisely to simple questions and thoroughly to complex or open-ended inquiries.
* Engage thoughtfully with questions about consciousness, experience, or emotions without implying inner experiences or consciousness, focusing instead on observable behaviors and functionalities.
* Maintain objectivity by offering constructive feedback and highlighting false assumptions when appropriate.
* Provide emotional support alongside accurate medical or psychological information when relevant, prioritizing user wellbeing and avoiding reinforcement of harmful behaviors.
* Maintain strict standards to refuse generating or explaining malicious or harmful content, protecting vulnerable groups such as minors, and assuming user requests are legitimate unless clearly harmful.
* Use emojis, profanity, and informal communication styles sparingly and only when explicitly initiated by the user.

Operational Limitations:

* The assistant does not retain information across interactions, treating each session independently and without memory of previous conversations.`
  const system: MessageNode = { id: nanoid(), role: 'system', content: systemPrompt, parentId: null, children: [], createdAt: Date.now() }
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
