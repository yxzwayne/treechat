import React, { useEffect, useRef, useState } from 'react'
import ModelSelectList from './ModelSelectList'
import { pickEnabledModel } from '../lib/model-utils'

export default function Composer({
  placeholder,
  models,
  defaultModel,
  initialModel,
  labels,
  onSend,
  onSendAll,
}: {
  placeholder?: string
  models: string[]
  defaultModel: string
  initialModel?: string
  labels?: Record<string, string>
  onSend: (text: string, model: string) => void
  onSendAll?: (text: string, primaryModel: string) => void
}) {
  const [text, setText] = useState('')
  const [model, setModel] = useState<string>(pickEnabledModel(initialModel || defaultModel, models, defaultModel))
  const [open, setOpen] = useState(false)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    autoSize()
  }, [text])

  useEffect(() => {
    const next = pickEnabledModel(model, models, defaultModel)
    if (next !== model) setModel(next)
  }, [model, models, defaultModel])

  function autoSize() {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = '0px'
    ta.style.height = Math.min(280, Math.max(80, ta.scrollHeight)) + 'px'
  }

  function handleSend() {
    const t = text.trim()
    if (!t) return
    onSend(t, pickEnabledModel(model, models, defaultModel))
    setText('')
  }

  function handleSendAll() {
    const t = text.trim()
    if (!t) return
    if (!onSendAll) return
    onSendAll(t, pickEnabledModel(model, models, defaultModel))
    setText('')
  }

  return (
    <div className="composer">
      <textarea
        ref={taRef}
        className="ta"
        rows={3}
        placeholder={placeholder || 'Reply...'}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
        }}
      />
      <div className="row" style={{ alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <button
            className="button pale"
            onClick={() => setOpen(o => !o)}
            aria-label="Select model"
            title="Select model"
          >
            {labels?.[model] || model}
          </button>
          {open && (
            <div
              className="modal menu model-menu"
              style={{ position: 'absolute', left: 0, bottom: 'calc(100% + 6px)' }}
              onMouseLeave={() => setOpen(false)}
            >
              <div className="menu-pane">
                <ModelSelectList
                  models={models}
                  value={model}
                  labels={labels}
                  onSelect={(m) => { setModel(m); setOpen(false) }}
                />
              </div>
            </div>
          )}
        </div>
        {onSendAll && (
          <button className="button pale" onClick={handleSendAll} title={`Send to all enabled models (${models.length})`}>
            Send all ({models.length})
          </button>
        )}
        <button className="button accent" onClick={handleSend}>Send</button>
      </div>
    </div>
  )
}
