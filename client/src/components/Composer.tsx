import React, { useEffect, useRef, useState } from 'react'

export default function Composer({ placeholder, models, defaultModel, initialModel, labels, onSend }: { placeholder?: string, models: string[], defaultModel: string, initialModel?: string, labels?: Record<string, string>, onSend: (text: string, model: string) => void }) {
  const [text, setText] = useState('')
  const [model, setModel] = useState<string>(initialModel || defaultModel)
  const [open, setOpen] = useState(false)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    autoSize()
  }, [text])

  function autoSize() {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = '0px'
    ta.style.height = Math.min(280, Math.max(80, ta.scrollHeight)) + 'px'
  }

  function handleSend() {
    const t = text.trim()
    if (!t) return
    onSend(t, model)
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
            <div className="modal" style={{ position: 'absolute', left: 0, bottom: 'calc(100% + 6px)', width: 320 }} onMouseLeave={() => setOpen(false)}>
              <div className="modal-body" style={{ padding: 0 }}>
                {models.map(m => (
                  <div
                    key={m}
                    onClick={() => { setModel(m); setOpen(false) }}
                    className="mono"
                    style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: m === model ? '#182036' : 'transparent' }}
                  >
                    {labels?.[m] || m}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <button className="button accent" onClick={handleSend}>SEND</button>
      </div>
    </div>
  )
}
