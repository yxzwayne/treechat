import React, { useEffect, useMemo, useState } from 'react'
import { MessageSquare, Pencil, Redo, Trash2 } from 'lucide-react'

import { ConversationState, MessageNode as TMessageNode } from '../types'
import { cn } from '../lib/utils'
import Composer from './Composer'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Textarea } from './ui/textarea'

type Props = {
  node: TMessageNode
  state: ConversationState
  onSelect: (id: string) => void
  onRetry: (parentId: string, model?: string) => void
  onEditUser: (nodeId: string, newContent: string, model: string) => void
  onSendFrom: (parentId: string, text: string, model: string) => void
  onDelete: (nodeId: string) => void
  models: string[]
  defaultModel: string
  lastModel?: string
  labels?: Record<string, string>
  subtreeColsMap: Map<string, number>
}

export default function MessageNode({
  node,
  state,
  onSelect,
  onRetry,
  onEditUser,
  onSendFrom,
  onDelete,
  models,
  defaultModel,
  lastModel,
  labels,
  subtreeColsMap,
}: Props) {
  const children = useMemo(() => node.children.map(id => state.nodes[id]), [node, state.nodes])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(node.content)
  const parentAssistantModel = node.parentId ? state.nodes[node.parentId!]?.model : undefined
  const [editModel, setEditModel] = useState<string>(parentAssistantModel || lastModel || defaultModel)
  const [retryModel, setRetryModel] = useState<string>(node.model || lastModel || defaultModel)
  const [openConfirm, setOpenConfirm] = useState(false)

  useEffect(() => {
    setEditModel(parentAssistantModel || lastModel || defaultModel)
  }, [parentAssistantModel, lastModel, defaultModel])

  useEffect(() => {
    setRetryModel(node.model || lastModel || defaultModel)
  }, [node.model, lastModel, defaultModel])

  const isActive = state.selectedLeafId === node.id

  const roleStyles = {
    user: 'border-l-4 border-l-blue-500',
    assistant: 'border-l-4 border-l-cyan-400',
    system: 'border-l-4 border-l-amber-400',
  } as const

  return (
    <div>
      <Card
        className={cn(
          'cursor-pointer bg-card/80 backdrop-blur p-4 sm:p-5 transition ring-offset-background',
          roleStyles[node.role],
          isActive && 'ring-2 ring-primary/60'
        )}
        onClick={() => onSelect(node.id)}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <MessageSquare className="h-4 w-4" />
              <span className="mono">{node.role}</span>
              {node.role === 'assistant' && node.model && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                  {labels?.[node.model] || node.model}
                </span>
              )}
            </div>
            {editing ? (
              <div className="space-y-3">
                <Textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  rows={5}
                  className="bg-secondary/50 text-base"
                  autoFocus
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={editModel} onValueChange={setEditModel}>
                    <SelectTrigger className="w-64 bg-secondary/60">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent className="w-72">
                      {models.map(m => (
                        <SelectItem key={m} value={m}>
                          {labels?.[m] || m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="ml-auto flex items-center gap-2">
                    <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button onClick={() => { setEditing(false); onEditUser(node.id, draft, editModel) }}>
                      Save to new branch
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="whitespace-pre-wrap text-base leading-6 text-foreground/90">
                {node.content || <span className="text-muted-foreground">Generating…</span>}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2" onClick={e => e.stopPropagation()}>
            <Dialog open={openConfirm} onOpenChange={setOpenConfirm}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Delete message">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete this branch?</DialogTitle>
                  <DialogDescription>
                    Deleting a message removes every child in every branch beneath it. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-3">
                  <Button variant="ghost" onClick={() => setOpenConfirm(false)}>Cancel</Button>
                  <Button variant="destructive" onClick={() => { setOpenConfirm(false); onDelete(node.id) }}>
                    Delete
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {node.role === 'assistant' && node.parentId && (
              <div className="flex flex-col items-stretch gap-2">
                <Select value={retryModel} onValueChange={setRetryModel}>
                  <SelectTrigger className="w-44 bg-secondary/60">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent className="w-56">
                    {models.map(m => (
                      <SelectItem key={m} value={m}>
                        {labels?.[m] || m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-1"
                  onClick={() => onRetry(node.parentId!, retryModel)}
                >
                  <Redo className="h-4 w-4" />
                  Retry
                </Button>
              </div>
            )}
            {node.role === 'user' && (
              <Button variant="secondary" size="sm" className="gap-1" onClick={() => { setEditing(true); setDraft(node.content) }}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            )}
          </div>
        </div>
      </Card>

      {node.role === 'assistant' && (
        <div className="mt-3">
          <Composer
            placeholder="Respond to this branch (create a new response branch)"
            models={models}
            defaultModel={defaultModel}
            initialModel={node.model || lastModel || defaultModel}
            labels={labels}
            onSend={(t, m) => onSendFrom(node.id, t, m)}
          />
        </div>
      )}

      {children.length > 0 && (
        <div className="branch-row">
          {children.map(child => {
            const cols = subtreeColsMap.get(child.id) ?? 1
            const extra = Math.max(0, cols - 1)
            return (
              <div className="branch-column" key={child.id} style={{ ['--extra-cols' as any]: extra }}>
                <MessageNode
                  node={child}
                  state={state}
                  onSelect={onSelect}
                  onRetry={onRetry}
                  onEditUser={onEditUser}
                  onSendFrom={onSendFrom}
                  onDelete={onDelete}
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
  )
}
