import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CatalogModel,
  disableModel,
  enableModel,
  fetchEnabledModelsDetailed,
  searchCatalogModels,
  setDefaultModel,
} from './lib/models'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table'

function formatCreated(created: number): string {
  if (!created) return '-'
  return new Date(created * 1000).toLocaleDateString()
}

function formatContextLength(value: number): string {
  if (!value) return '-'
  return new Intl.NumberFormat().format(value)
}

export default function ModelsView() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [provider, setProvider] = useState('')
  const [providers, setProviders] = useState<string[]>([])
  const [searchRows, setSearchRows] = useState<CatalogModel[]>([])
  const [searchTotal, setSearchTotal] = useState(0)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [enabledRows, setEnabledRows] = useState<CatalogModel[]>([])
  const [defaultId, setDefaultId] = useState('')
  const [enabledLoading, setEnabledLoading] = useState(true)
  const [mutatingModelId, setMutatingModelId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const staleNoticeShown = useRef(false)

  const enabledSet = useMemo(() => new Set(enabledRows.map((row) => row.id)), [enabledRows])

  function applyEnabledPayload(payload: { models: CatalogModel[]; default: string; stale?: boolean }) {
    setEnabledRows(payload.models || [])
    setDefaultId(payload.default || '')
    if (payload.stale && !staleNoticeShown.current) {
      staleNoticeShown.current = true
      setToast('OpenRouter is unavailable. Showing cached model data.')
    }
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      setEnabledLoading(true)
      try {
        const payload = await fetchEnabledModelsDetailed()
        if (!active) return
        applyEnabledPayload(payload)
      } catch (error: any) {
        if (!active) return
        setToast(error?.message || 'Failed to load enabled models')
      } finally {
        if (active) setEnabledLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const handle = window.setTimeout(async () => {
      setSearchLoading(true)
      setSearchError(null)
      try {
        const payload = await searchCatalogModels({
          q: query.trim(),
          provider,
          limit: 10,
          offset: 0,
          random: true,
        })
        if (!active) return
        setSearchRows(payload.models || [])
        setSearchTotal(payload.total || 0)
        setProviders(payload.providers || [])
        if (payload.stale && !staleNoticeShown.current) {
          staleNoticeShown.current = true
          setToast('OpenRouter is unavailable. Showing cached model data.')
        }
      } catch (error: any) {
        if (!active) return
        setSearchRows([])
        setSearchTotal(0)
        setSearchError(error?.message || 'Failed to search models')
        setToast(error?.message || 'Failed to search models')
      } finally {
        if (active) setSearchLoading(false)
      }
    }, 180)

    return () => {
      active = false
      window.clearTimeout(handle)
    }
  }, [query, provider])

  async function handleEnable(id: string) {
    if (mutatingModelId) return
    setMutatingModelId(id)
    try {
      const payload = await enableModel(id)
      applyEnabledPayload(payload)
    } catch (error: any) {
      setToast(error?.message || 'Failed to enable model')
    } finally {
      setMutatingModelId(null)
    }
  }

  async function handleDisable(id: string) {
    if (mutatingModelId) return
    setMutatingModelId(id)
    try {
      const payload = await disableModel(id)
      applyEnabledPayload(payload)
    } catch (error: any) {
      setToast(error?.message || 'Failed to disable model')
    } finally {
      setMutatingModelId(null)
    }
  }

  async function handleSetDefault(id: string) {
    if (mutatingModelId) return
    setMutatingModelId(id)
    try {
      const payload = await setDefaultModel(id)
      applyEnabledPayload(payload)
    } catch (error: any) {
      setToast(error?.message || 'Failed to set default model')
    } finally {
      setMutatingModelId(null)
    }
  }

  return (
    <div className="models-page">
      <div className="models-header">
        <div className="title">Treechat</div>
        <button className="button" onClick={() => navigate('/')}>Back to chat</button>
      </div>

      <div className="models-main">
        <section className="models-section">
          <h1 className="models-section-title">Add model</h1>
          <div className="models-section-subtitle">Search model by name/slug</div>
          <div className="models-search-controls">
            <input
              className="text-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search model by name or slug"
              aria-label="Search model by name or slug"
            />
            <select
              className="select-input"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              aria-label="Filter models by provider"
            >
              <option value="">All providers</option>
              {providers.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
          <div className="models-search-meta">
            {searchLoading ? 'Loading models...' : `Showing ${searchRows.length} of ${searchTotal} models`}
          </div>
          {searchError && <div className="models-error">{searchError}</div>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>id</TableHead>
                <TableHead>name</TableHead>
                <TableHead>provider</TableHead>
                <TableHead>context_length</TableHead>
                <TableHead className="tc-align-right">action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {searchRows.map((row) => {
                const alreadyEnabled = enabledSet.has(row.id)
                return (
                  <TableRow key={row.id}>
                    <TableCell className="tc-mono-cell">{row.id}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.provider}</TableCell>
                    <TableCell>{formatContextLength(row.context_length)}</TableCell>
                    <TableCell className="tc-align-right">
                      <button
                        className="button pale"
                        onClick={() => handleEnable(row.id)}
                        disabled={alreadyEnabled || mutatingModelId === row.id}
                      >
                        {alreadyEnabled ? 'Enabled' : 'Enable'}
                      </button>
                    </TableCell>
                  </TableRow>
                )
              })}
              {searchRows.length === 0 && !searchLoading && (
                <TableRow>
                  <TableCell className="tc-empty-cell" colSpan={5}>
                    No matching models.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>

        <div className="models-gap" />

        <section className="models-section">
          <h1 className="models-section-title">Enabled models</h1>
          {enabledLoading ? (
            <div className="models-loading">Loading enabled models...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>id</TableHead>
                  <TableHead>canonical_slug</TableHead>
                  <TableHead>name</TableHead>
                  <TableHead>created</TableHead>
                  <TableHead>description</TableHead>
                  <TableHead>context_length</TableHead>
                  <TableHead>default</TableHead>
                  <TableHead className="tc-align-right">action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enabledRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="tc-mono-cell">{row.id}</TableCell>
                    <TableCell className="tc-mono-cell">{row.canonical_slug}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{formatCreated(row.created)}</TableCell>
                    <TableCell className="models-description-cell" title={row.description || ''}>
                      {row.description || '-'}
                    </TableCell>
                    <TableCell>{formatContextLength(row.context_length)}</TableCell>
                    <TableCell>
                      <input
                        type="radio"
                        name="default-model"
                        checked={defaultId === row.id}
                        onChange={() => handleSetDefault(row.id)}
                        disabled={mutatingModelId === row.id}
                        aria-label={`Set ${row.id} as default model`}
                      />
                    </TableCell>
                    <TableCell className="tc-align-right">
                      <button
                        className="button danger"
                        onClick={() => handleDisable(row.id)}
                        disabled={enabledRows.length <= 1 || mutatingModelId === row.id}
                      >
                        Remove
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {enabledRows.length === 0 && (
                  <TableRow>
                    <TableCell className="tc-empty-cell" colSpan={8}>
                      No enabled models.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </section>
      </div>

      {toast && <div className="toast" onClick={() => setToast(null)}>{toast}</div>}
    </div>
  )
}
