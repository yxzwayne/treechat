import React from 'react'

export default function ModelSelectList({ models, value, labels, onSelect }: { models: string[], value?: string, labels?: Record<string, string>, onSelect: (model: string) => void }) {
  return (
    <>
      {models.map(m => {
        const label = labels?.[m] || m
        return (
          <button
            key={m}
            type="button"
            className={`menu-item ${m === value ? 'active' : ''}`}
            onClick={() => onSelect(m)}
            title={label}
          >
            {label}
          </button>
        )
      })}
    </>
  )
}

