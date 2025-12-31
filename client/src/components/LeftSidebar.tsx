import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, PanelLeftClose, PenLine, SquarePen, Trash2, X } from 'lucide-react'

import { ConversationListItem, deleteConversation, getConversationSummary, listConversations, updateConversationSummary } from '../lib/api'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { ScrollArea } from './ui/scroll-area'
import { Textarea } from './ui/textarea'

export default function LeftSidebar({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ConversationListItem[]>([])
  const navigate = useNavigate()
  const { id } = useParams()
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmPreview, setConfirmPreview] = useState<string>('')
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [limitNotice, setLimitNotice] = useState(false)
  const noticeTimer = useRef<number | null>(null)
  const editRef = useRef<HTMLTextAreaElement | null>(null)

  const showLimitNotice = () => {
    setLimitNotice(true)
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setLimitNotice(false), 2000)
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const list = await listConversations()
        if (alive) setItems(list)
      } catch {
        // ignore
      }
    })()
    return () => { alive = false }
  }, [id])

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-lg font-semibold tracking-[0.2em] text-foreground" style={{ fontFamily: 'Eurostile, sans-serif' }}>
          TREECHAT
        </div>
        <Button variant="ghost" size="icon" aria-label="Close left sidebar" onClick={onClose}>
          <PanelLeftClose className="h-5 w-5" />
        </Button>
      </div>
      <Button
        variant="secondary"
        className="mb-4 w-full justify-start gap-2"
        onClick={() => navigate('/')}
      >
        <SquarePen className="h-4 w-4" />
        Create new chat
      </Button>
      <div className="mb-2 text-sm font-semibold text-muted-foreground">History</div>
      <ScrollArea className="h-full pr-1">
        <div className="space-y-2">
          {items.map(it => {
            const active = id === it.id
            return (
              <div
                key={it.id}
                className={cn(
                  'group flex items-start gap-2 rounded-lg border border-transparent px-2 py-2 transition hover:border-border hover:bg-secondary/60',
                  active && 'border-border bg-secondary/80'
                )}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/c/${it.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/c/${it.id}`) }}
                title={it.preview || 'Untitled'}
              >
                <div className="flex-1 space-y-1 overflow-hidden">
                  {editingId === it.id ? (
                    <div className="space-y-1">
                      <Textarea
                        autoFocus
                        ref={editRef}
                        rows={1}
                        wrap="off"
                        maxLength={100}
                        value={editingValue}
                        onChange={(e) => {
                          const prevLen = editingValue.length
                          const next = e.target.value.replace(/\r?\n/g, ' ')
                          if (prevLen < 100 && next.length === 100) {
                            showLimitNotice()
                          }
                          setEditingValue(next)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                          }
                        }}
                        onPaste={(e) => {
                          const ta = e.currentTarget
                          const raw = e.clipboardData.getData('text')
                          const insert = raw.replace(/\r?\n/g, ' ')
                          const selStart = ta.selectionStart ?? 0
                          const selEnd = ta.selectionEnd ?? 0
                          const value = ta.value
                          const selectionLen = Math.max(0, selEnd - selStart)
                          const remaining = 100 - (value.length - selectionLen)
                          if (insert.length > remaining) {
                            e.preventDefault()
                            showLimitNotice()
                            return
                          }
                          e.preventDefault()
                          const next = value.slice(0, selStart) + insert + value.slice(selEnd)
                          setEditingValue(next)
                          requestAnimationFrame(() => {
                            if (editRef.current) {
                              const pos = selStart + insert.length
                              editRef.current.selectionStart = pos
                              editRef.current.selectionEnd = pos
                            }
                          })
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="min-h-[38px] resize-none bg-secondary/50 text-sm"
                        placeholder="Untitled"
                      />
                      {limitNotice && (
                        <div className="text-xs text-muted-foreground">Limit to chat summary is 100 characters.</div>
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Save summary"
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (saving) return
                            const length = [...editingValue].length
                            if (length > 100) {
                              setToast('Summary must be 100 chars or less')
                              return
                            }
                            setSaving(true)
                            try {
                              await updateConversationSummary(it.id, editingValue.trim() === '' ? null : editingValue)
                              setItems(prev => prev.map(p => p.id === it.id ? { ...p, preview: (editingValue.trim() === '' ? 'Untitled' : editingValue) } : p))
                              setEditingId(null)
                              setEditingValue('')
                              setLimitNotice(false)
                            } catch (err: any) {
                              setToast(err?.message || 'Failed to save summary')
                            } finally {
                              setSaving(false)
                            }
                          }}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Cancel editing"
                          onClick={(e) => { e.stopPropagation(); setEditingId(null); setEditingValue('') }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {it.preview || 'Untitled'}
                      </span>
                    </div>
                  )}
                </div>
                {editingId !== it.id && (
                  <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit summary"
                      onClick={async (e) => {
                        e.stopPropagation()
                        try {
                          const s = await getConversationSummary(it.id)
                          setEditingId(it.id)
                          setEditingValue(s.summary ?? '')
                        } catch (err: any) {
                          setToast(err?.message || 'Failed to load summary')
                        }
                      }}
                    >
                      <PenLine className="h-4 w-4" />
                    </Button>
                    <Dialog open={confirmId === it.id} onOpenChange={(open) => { setConfirmId(open ? it.id : null); setConfirmPreview(it.preview || 'Untitled') }}>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete conversation"
                          onClick={(e) => { e.stopPropagation(); setConfirmId(it.id); setConfirmPreview(it.preview || 'Untitled') }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete the conversation?</DialogTitle>
                          <DialogDescription className="truncate text-sm text-muted-foreground">
                            {confirmPreview || 'Untitled'}
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="gap-2 sm:gap-3">
                          <Button variant="ghost" onClick={() => setConfirmId(null)}>Cancel</Button>
                          <Button
                            variant="destructive"
                            disabled={deleting}
                            onClick={async () => {
                              const toDelete = confirmId as string
                              setDeleting(true)
                              try {
                                await deleteConversation(toDelete)
                                const list = await listConversations()
                                setItems(list)
                                if (id === toDelete) navigate('/')
                                setConfirmId(null)
                              } catch (e: any) {
                                setToast(`Delete failed: ${e?.message || 'server error'}`)
                              } finally {
                                setDeleting(false)
                              }
                            }}
                          >
                            {deleting ? 'Deleting…' : 'Delete'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </div>
            )
          })}
          {items.length === 0 && (
            <div className="text-sm text-muted-foreground">(no conversations)</div>
          )}
        </div>
      </ScrollArea>
      {toast && <div className="mt-3 rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground" onClick={() => setToast(null)}>{toast}</div>}
    </div>
  )
}
