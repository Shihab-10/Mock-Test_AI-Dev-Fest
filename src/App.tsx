import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react'
import {
  findSafestRoute,
  initialHazards,
  parseBuildingJson,
  type BuildingDataset,
  type HazardState,
  type SafeRoute,
  type ValidationIssue,
} from './domain'
import { formatValidationIssue, t, type Language, type TranslationKey } from './i18n'
import './App.css'

type RouteStatus = 'ready' | 'noStart' | 'startBlocked' | 'allExitsClosed' | 'noRoute' | 'found'

interface Point {
  x: number
  y: number
}

function projectNodes(dataset: BuildingDataset): Map<string, Point> {
  const xs = dataset.nodes.map((node) => node.x)
  const ys = dataset.nodes.map((node) => node.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const projectCoordinate = (value: number, min: number, max: number, center: number, offset: number, span: number) => {
    const magnitude = Math.max(Math.abs(min), Math.abs(max), 1)
    const scaledMin = min / magnitude
    const scaledMax = max / magnitude
    const range = scaledMax - scaledMin
    return range === 0 ? center : offset + ((value / magnitude - scaledMin) / range) * span
  }

  return new Map(
    dataset.nodes.map((node) => [
      node.id,
      {
        x: projectCoordinate(node.x, minX, maxX, 500, 80, 840),
        y: projectCoordinate(node.y, minY, maxY, 280, 70, 420),
      },
    ]),
  )
}

function routeEdgeKeys(route: SafeRoute | null): Set<string> {
  const keys = new Set<string>()
  if (!route) return keys

  for (let index = 1; index < route.nodeIds.length; index += 1) {
    const previous = route.nodeIds[index - 1]
    const current = route.nodeIds[index]
    keys.add(previous < current ? `${previous}\u0000${current}` : `${current}\u0000${previous}`)
  }
  return keys
}

function App() {
  const [dataset, setDataset] = useState<BuildingDataset | null>(null)
  const [hazards, setHazards] = useState<HazardState | null>(null)
  const [selectedStart, setSelectedStart] = useState('')
  const [language, setLanguage] = useState<Language>('en')
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([])
  const [uploadMessage, setUploadMessage] = useState<'unsupportedFile' | 'readError' | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const text = (key: TranslationKey) => t(language, key)

  const route = useMemo(() => {
    if (!dataset || !hazards || !selectedStart || hazards.blockedNodes.has(selectedStart)) return null
    return findSafestRoute(dataset, hazards, selectedStart)
  }, [dataset, hazards, selectedStart])

  const openExitCount = dataset && hazards
    ? dataset.nodes.filter((node) => node.type === 'exit' && !hazards.closedExits.has(node.id)).length
    : 0
  const totalExitCount = dataset?.nodes.filter((node) => node.type === 'exit').length ?? 0

  const routeStatus: RouteStatus = !dataset
    ? 'ready'
    : !selectedStart
      ? 'noStart'
      : hazards?.blockedNodes.has(selectedStart)
        ? 'startBlocked'
        : totalExitCount > 0 && openExitCount === 0
          ? 'allExitsClosed'
          : route
            ? 'found'
            : 'noRoute'

  const startOptions = dataset?.nodes.filter(
    (node) =>
      (node.type === 'room' || node.type === 'junction') &&
      (!hazards?.blockedNodes.has(node.id) || node.id === selectedStart),
  ) ?? []

  const importFile = async (file: File | undefined) => {
    if (!file) return
    setUploadMessage(null)
    setValidationIssues([])

    if (!file.name.toLowerCase().endsWith('.json')) {
      setUploadMessage('unsupportedFile')
      return
    }

    try {
      const result = parseBuildingJson(await file.text())
      if (!result.dataset) {
        setValidationIssues(result.issues)
        return
      }

      setDataset(result.dataset)
      setHazards(initialHazards(result.dataset))
      setSelectedStart('')
    } catch {
      setUploadMessage('readError')
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void importFile(event.target.files?.[0])
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    void importFile(event.dataTransfer.files[0])
  }

  const toggleHazard = (kind: keyof HazardState, id: string) => {
    setHazards((current) => {
      if (!current) return current
      const nextSet = new Set(current[kind])
      if (nextSet.has(id)) nextSet.delete(id)
      else nextSet.add(id)
      return { ...current, [kind]: nextSet }
    })
  }

  const resetHazards = () => {
    if (dataset) setHazards(initialHazards(dataset))
  }

  const handleNodeKey = (event: KeyboardEvent<SVGGElement>, nodeId: string, canSelect: boolean) => {
    if (canSelect && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      setSelectedStart(nodeId)
    }
  }

  const points = dataset ? projectNodes(dataset) : new Map<string, Point>()
  const activeRouteEdges = routeEdgeKeys(route)
  const routeNodes = new Set(route?.nodeIds ?? [])
  const nodeById = new Map(dataset?.nodes.map((node) => [node.id, node]) ?? [])

  return (
    <div className="app-shell" lang={language}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Smart Escape home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-copy">
            <strong>SMART ESCAPE</strong>
            <span>{text('brandSubtitle')}</span>
          </span>
        </a>
        <div className="topbar-right">
          <span className="live-indicator"><i />{text('simulationLabel')}</span>
          <div className="language-switch" role="group" aria-label={text('language')}>
            <button
              type="button"
              className={language === 'en' ? 'active' : ''}
              aria-pressed={language === 'en'}
              onClick={() => setLanguage('en')}
            >English</button>
            <button
              type="button"
              className={language === 'bn' ? 'active' : ''}
              aria-pressed={language === 'bn'}
              onClick={() => setLanguage('bn')}
            >বাংলা</button>
          </div>
        </div>
      </header>

      <main id="top" className="page-content">
        <section className="page-heading">
          <div>
            <p className="eyebrow">{text('phaseLabel')}</p>
            <h1>{text('pageTitle')}</h1>
            <p className="page-description">{text('pageDescription')}</p>
          </div>
          {dataset && (
            <div className="building-summary">
              <span className="summary-label">{text('activeBuilding')}</span>
              <strong title={dataset.building}>{dataset.building}</strong>
              <span>{dataset.nodes.length} {text('nodes')} · {dataset.edges.length} {text('corridors')}</span>
            </div>
          )}
        </section>

        <div className="workspace-grid">
          <aside className="control-column" aria-label={text('controls')}>
            <section className="panel upload-panel">
              <div className="panel-heading">
                <span className="step-number">01</span>
                <div>
                  <h2>{text('importTitle')}</h2>
                  <p>{text('importDescription')}</p>
                </div>
              </div>
              <div
                className={`drop-zone${isDragging ? ' is-dragging' : ''}`}
                onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false)
                }}
                onDrop={handleDrop}
              >
                <span className="file-mark" aria-hidden="true">.JSON</span>
                <p>{text('dropPrompt')}</p>
                <button type="button" className="button button-secondary browse-button" onClick={() => fileInputRef.current?.click()}>
                  {text('browseFiles')}
                </button>
                <span className="file-limit">{text('fileLimit')}</span>
                <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleFileChange} hidden />
              </div>
              {uploadMessage && <p className="form-error" role="alert">{text(uploadMessage)}</p>}
              {validationIssues.length > 0 && (
                <div className="validation-errors" role="alert">
                  <strong>{text('invalidDataset')}</strong>
                  <ul>
                    {validationIssues.map((issue, index) => (
                      <li key={`${issue.code}-${index}`}>{formatValidationIssue(issue, language)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="panel controls-panel">
              <div className="panel-heading">
                <span className="step-number">02</span>
                <div>
                  <h2>{text('controlsTitle')}</h2>
                  <p>{text('controlsDescription')}</p>
                </div>
              </div>

              <label className="field-label" htmlFor="start-location">{text('startLocation')}</label>
              <select
                id="start-location"
                className="start-select"
                value={selectedStart}
                disabled={!dataset}
                onChange={(event) => setSelectedStart(event.target.value)}
              >
                <option value="">{text('chooseStart')}</option>
                {startOptions.map((node) => <option key={node.id} value={node.id}>{node.label} ({node.id})</option>)}
              </select>

              <div className="hazard-heading">
                <div>
                  <h3>{text('hazardsTitle')}</h3>
                  <span>{text('hazardsDescription')}</span>
                </div>
                <button type="button" className="text-button" disabled={!dataset} onClick={resetHazards}>
                  {text('reset')}
                </button>
              </div>

              {!dataset ? (
                <p className="empty-hazards">{text('importFirst')}</p>
              ) : (
                <div className="hazard-sections">
                  <div className="hazard-section">
                    <h4>{text('locations')}</h4>
                    <div className="hazard-list">
                      {dataset.nodes.filter((node) => node.type !== 'exit').map((node) => {
                        const blocked = hazards?.blockedNodes.has(node.id) ?? false
                        return (
                          <div className={`hazard-row${blocked ? ' is-blocked' : ''}`} key={node.id}>
                            <span className={`mini-node ${node.type}`} />
                            <span className="hazard-name" title={node.label}>{node.label}<small>{node.id}</small></span>
                            <button type="button" className="state-button" aria-pressed={blocked} onClick={() => toggleHazard('blockedNodes', node.id)}>
                              {text(blocked ? 'unblock' : 'block')}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div className="hazard-section">
                    <h4>{text('corridors')}</h4>
                    <div className="hazard-list">
                      {dataset.edges.map((edge) => {
                        const blocked = hazards?.blockedEdges.has(edge.id) ?? false
                        return (
                          <div className={`hazard-row${blocked ? ' is-blocked' : ''}`} key={edge.id}>
                            <span className="mini-corridor" />
                            <span className="hazard-name" title={`${edge.from} — ${edge.to}`}>
                              {edge.from} — {edge.to}<small>{text('cost')} {edge.cost}</small>
                            </span>
                            <button type="button" className="state-button" aria-pressed={blocked} onClick={() => toggleHazard('blockedEdges', edge.id)}>
                              {text(blocked ? 'unblock' : 'block')}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div className="hazard-section">
                    <h4>{text('exits')}</h4>
                    <div className="hazard-list">
                      {dataset.nodes.filter((node) => node.type === 'exit').map((node) => {
                        const closed = hazards?.closedExits.has(node.id) ?? false
                        return (
                          <div className={`hazard-row${closed ? ' is-blocked' : ''}`} key={node.id}>
                            <span className="mini-node exit" />
                            <span className="hazard-name" title={node.label}>{node.label}<small>{node.id}</small></span>
                            <button type="button" className="state-button" aria-pressed={closed} onClick={() => toggleHazard('closedExits', node.id)}>
                              {text(closed ? 'reopen' : 'close')}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </aside>

          <section className="panel map-panel" aria-label={text('mapTitle')}>
            <div className="map-heading">
              <div>
                <span className="section-index">03 / {text('mapLabel')}</span>
                <h2>{dataset?.building ?? text('mapTitle')}</h2>
              </div>
              {dataset && <span className="map-count">{dataset.nodes.length} {text('nodes')}</span>}
            </div>
            {dataset ? (
              <>
                <div className="map-canvas">
                  <svg viewBox="0 0 1000 560" role="img" aria-label={`${text('mapTitle')}: ${dataset.building}`}>
                    <defs>
                      <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect width="1000" height="560" fill="url(#map-grid)" className="map-grid" />
                    {dataset.edges.map((edge) => {
                      const from = points.get(edge.from)!
                      const to = points.get(edge.to)!
                      const blocked = hazards?.blockedEdges.has(edge.id) ?? false
                      const key = edge.from < edge.to ? `${edge.from}\u0000${edge.to}` : `${edge.to}\u0000${edge.from}`
                      const isActive = activeRouteEdges.has(key)
                      const ariaLabel = `${text('corridor')} ${edge.from} ${text('to')} ${edge.to}, ${text('cost')} ${edge.cost}, ${text(blocked ? 'blocked' : 'open')}`
                      return (
                        <g
                          className={`edge-hit${blocked ? ' blocked' : ''}${isActive ? ' active' : ''}`}
                          key={edge.id}
                          role="button"
                          tabIndex={0}
                          aria-label={ariaLabel}
                          aria-pressed={blocked}
                          onClick={() => toggleHazard('blockedEdges', edge.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              toggleHazard('blockedEdges', edge.id)
                            }
                          }}
                        >
                          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="edge-hit-area" />
                          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="edge-line" />
                          <g className="edge-cost" transform={`translate(${(from.x + to.x) / 2} ${(from.y + to.y) / 2})`} aria-hidden="true">
                            <rect x="-21" y="-13" width="42" height="26" rx="4" />
                            <text y="1">{edge.cost}</text>
                          </g>
                        </g>
                      )
                    })}
                    {dataset.nodes.map((node) => {
                      const point = points.get(node.id)!
                      const blocked = hazards?.blockedNodes.has(node.id) ?? false
                      const closed = hazards?.closedExits.has(node.id) ?? false
                      const canSelect = node.type !== 'exit' && !blocked
                      const selected = selectedStart === node.id
                      const active = routeNodes.has(node.id)
                      const stateClass = blocked ? 'blocked' : closed ? 'closed' : node.type
                      return (
                        <g
                          className={`node ${stateClass}${selected ? ' selected' : ''}${active ? ' on-route' : ''}${canSelect ? ' selectable' : ''}`}
                          key={node.id}
                          transform={`translate(${point.x} ${point.y})`}
                          role={canSelect ? 'button' : 'img'}
                          tabIndex={canSelect ? 0 : undefined}
                          aria-label={`${node.label} (${node.id}), ${text(node.type)}, ${text(blocked ? 'blocked' : closed ? 'closed' : 'open')}${selected ? `, ${text('selected')}` : ''}`}
                          aria-pressed={canSelect ? selected : undefined}
                          onClick={() => { if (canSelect) setSelectedStart(node.id) }}
                          onKeyDown={(event) => handleNodeKey(event, node.id, canSelect)}
                        >
                          {selected && <circle className="selection-ring" r="31" />}
                          {node.type === 'room' && <rect className="node-shape" x="-21" y="-17" width="42" height="34" rx="9" />}
                          {node.type === 'junction' && <rect className="node-shape junction-shape" x="-16" y="-16" width="32" height="32" rx="5" transform="rotate(45)" />}
                          {node.type === 'exit' && <><circle className="exit-outer" r="21" /><circle className="node-shape" r="14" /></>}
                          {(blocked || closed) && <path className="hazard-mark" d="M -6 -6 L 6 6 M 6 -6 L -6 6" />}
                          <text className="node-label" y="43" textAnchor="middle">{node.label}</text>
                          <text className="node-id" y="59" textAnchor="middle">{node.id}</text>
                        </g>
                      )
                    })}
                  </svg>
                </div>
                <div className="map-footer">
                  <div className="map-legend" aria-label={text('legend')}>
                    <span><i className="legend-dot room" />{text('room')}</span>
                    <span><i className="legend-dot junction" />{text('junction')}</span>
                    <span><i className="legend-dot exit" />{text('exit')}</span>
                    <span><i className="legend-dot blocked" />{text('blocked')}</span>
                  </div>
                  <p>{text('mapInteractionHint')}</p>
                </div>
              </>
            ) : (
              <div className="map-empty-state">
                <div className="empty-map-lines" aria-hidden="true"><i /><i /><i /><b /><b /><b /></div>
                <strong>{text('waitingForMap')}</strong>
                <span>{text('waitingDescription')}</span>
              </div>
            )}
          </section>

          <aside className="result-column" aria-label={text('routeResult')}>
            <section className={`panel result-panel status-${routeStatus}`} aria-live="polite">
              <div className="result-topline">
                <span className="section-index">04 / {text('resultLabel')}</span>
                <span className={`status-indicator ${routeStatus}`}><i />{text(`status_${routeStatus}` as TranslationKey)}</span>
              </div>
              <h2>{text('routeResult')}</h2>
              <div className="result-message">
                {routeStatus === 'found' ? (
                  <>
                    <span className="success-mark" aria-hidden="true">✓</span>
                    <strong>{text('safeRouteFound')}</strong>
                    <span>{text('routeReadyDescription')}</span>
                  </>
                ) : (
                  <>
                    <span className="warning-mark" aria-hidden="true">!</span>
                    <strong>{text(`message_${routeStatus}` as TranslationKey)}</strong>
                    <span>{text(`detail_${routeStatus}` as TranslationKey)}</span>
                  </>
                )}
              </div>

              {routeStatus === 'found' && route && (
                <div className="route-details">
                  <div className="route-start-line">
                    <span>{text('startingLocation')}</span>
                    <strong>{nodeById.get(selectedStart)?.label ?? selectedStart}</strong>
                  </div>
                  <div className="route-sequence-block">
                    <span>{text('nodeSequence')}</span>
                    <div className="route-sequence">
                      {route.nodeIds.map((id, index) => (
                        <span className="route-node-token" key={`${id}-${index}`}>
                          {id}{index < route.nodeIds.length - 1 && <i aria-hidden="true">→</i>}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="route-metrics">
                    <div><span>{text('destination')}</span><strong>{route.exitId}</strong></div>
                    <div><span>{text('totalCost')}</span><strong>{route.cost}</strong></div>
                  </div>
                </div>
              )}
              {dataset && hazards && (
                <div className="route-footnote">
                  <span>{text('openExits')}</span>
                  <strong>{openExitCount} / {totalExitCount}</strong>
                </div>
              )}
            </section>

            <section className="panel guidance-panel">
              <span className="section-index">{text('liveUpdates')}</span>
              <h3>{text('routeUpdatesTitle')}</h3>
              <p>{text('routeUpdatesDescription')}</p>
              <div className="update-line"><i />{text('routeUpdatesFootnote')}</div>
            </section>
          </aside>
        </div>
        <footer className="page-footer">
          <span>SMART ESCAPE</span>
          <span>{text('footerText')}</span>
        </footer>
      </main>
    </div>
  )
}

export default App
