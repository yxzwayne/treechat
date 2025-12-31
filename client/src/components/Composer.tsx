import React, { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'

import { Button } from './ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Textarea } from './ui/textarea'

type Props = {
  placeholder?: string
  models: string[]
  defaultModel: string
  initialModel?: string
  labels?: Record<string, string>
  onSend: (text: string, model: string) => void
}

export default function Composer({ placeholder, models, defaultModel, initialModel, labels, onSend }: Props) {
  const [text, setText] = useState('')
  const [model, setModel] = useState<string>(initialModel || defaultModel)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    autoSize()
  }, [text])

  function autoSize() {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = '0px'
    ta.style.height = Math.min(320, Math.max(96, ta.scrollHeight)) + 'px'
  }

  function handleSend() {
    const t = text.trim()
    if (!t) return
    onSend(t, model)
    setText('')
  }

  return (
    <div className="space-y-3">
      <Textarea
        ref={taRef}
        rows={4}
        placeholder={placeholder || 'Reply...'}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
        }}
        className="min-h-[120px] resize-none bg-secondary/50 text-base"
      />
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <Select value={model} onValueChange={setModel}>
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
        <Button onClick={handleSend} className="gap-2">
          <Send className="h-4 w-4" />
          Send
        </Button>
      </div>
    </div>
  )
}
