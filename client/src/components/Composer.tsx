import React, { useEffect, useRef, useState } from 'react'

export default function Composer({ placeholder, onSend }: { placeholder?: string, onSend: (text: string) => void }) {
  const [text, setText] = useState('')
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
    onSend(t)
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
      <div className="row">
        <button className="button accent" onClick={handleSend}>SEND</button>
      </div>
    </div>
  )
}

