import React, { useMemo, useState } from 'react'
import { PanelRightClose, SlidersHorizontal } from 'lucide-react'

import { ConversationState } from '../types'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Slider } from './ui/slider'
import { Textarea } from './ui/textarea'

export default function Sidebar({ state, onSetSystem, onClose, columnWidth, onSetColumnWidth }: { state: ConversationState, onSetSystem: (c: string) => void, onClose: () => void, columnWidth: number, onSetColumnWidth: (n: number) => void }) {
  const count = Object.keys(state.nodes).length - 1
  const sys = state.nodes[state.rootId]
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(sys.content)
  const COLLAPSE_THRESHOLD = 200
  const isLong = useMemo(() => (sys.content || '').length > COLLAPSE_THRESHOLD, [sys.content])
  const [collapsed, setCollapsed] = useState(true)
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <Button variant="ghost" size="icon" aria-label="Close right sidebar" onClick={onClose}>
          <PanelRightClose className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <SlidersHorizontal className="h-4 w-4" />
          Settings
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground">Column width</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Slider
            value={[columnWidth]}
            min={520}
            max={1440}
            step={10}
            onValueChange={([v]) => onSetColumnWidth(v)}
          />
          <div className="text-right text-sm text-muted-foreground mono">{columnWidth}px</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground">Stats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>Total nodes: {count}</div>
          <div>Selected: {state.selectedLeafId}</div>
        </CardContent>
      </Card>
      <Card className="flex-1">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold text-muted-foreground">System prompt</CardTitle>
          {!editing && isLong && (
            <Button variant="ghost" size="sm" onClick={() => setCollapsed(c => !c)}>
              {collapsed ? 'Show more' : 'Show less'}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {editing ? (
            <>
              <Textarea
                rows={6}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                className="bg-secondary/50"
              />
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => { setEditing(false); setDraft(sys.content) }}>Cancel</Button>
                <Button onClick={() => { setEditing(false); onSetSystem(draft) }}>Save</Button>
              </div>
            </>
          ) : (
            <div className={isLong && collapsed ? 'max-h-40 overflow-hidden text-sm leading-6 text-foreground/90' : 'text-sm leading-6 text-foreground/90'}>
              {sys.content || <span className="text-muted-foreground">(empty)</span>}
            </div>
          )}
          {!editing && (
            <Button variant="secondary" onClick={() => { setEditing(true); setDraft(sys.content) }}>Edit</Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
