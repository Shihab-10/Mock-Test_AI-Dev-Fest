import { useEffect, useMemo, useRef, useState } from 'react'
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
import { fillTranslation, formatValidationIssue, t, type Language, type TranslationKey } from './i18n'
import './App.css'

type RouteStatus = 'ready' | 'noStart' | 'startBlocked' | 'allExitsClosed' | 'noRoute' | 'found'
type Theme = 'light' | 'dark'
type MapInspection = { kind: 'node'; id: string } | { kind: 'edge'; id: string }

interface ToastMessage {
  key: TranslationKey
  tone: 'success' | 'warning' | 'info'
}

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

function getInitialTheme(): Theme {
  try {
    return window.localStorage.getItem('smart-escape-theme') === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
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
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [mapInspection, setMapInspection] = useState<MapInspection | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([])
  const [uploadMessage, setUploadMessage] = useState<'unsupportedFile' | 'readError' | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const text = (key: TranslationKey) => t(language, key)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      theme === 'dark' ? '#071321' : '#edf2f7',
    )
    try {
      window.localStorage.setItem('smart-escape-theme', theme)
    } catch {
      return
    }
  }, [theme])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const announce = (key: TranslationKey, tone: ToastMessage['tone'] = 'info') => {
    setToast({ key, tone })
  }

  const route = useMemo(() => {
    if (!dataset || !hazards || !selectedStart || hazards.blockedNodes.has(selectedStart)) return null
    return findSafestRoute(dataset, hazards, selectedStart)
  }, [dataset, hazards, selectedStart])

  const openExitCount = dataset && hazards
    ? dataset.nodes.filter((node) => node.type === 'exit' && !hazards.closedExits.has(node.id)).length
    : 0
  const totalExitCount = dataset?.nodes.filter((node) => node.type === 'exit').length ?? 0
  const roomCount = dataset?.nodes.filter((node) => node.type === 'room').length ?? 0
  const junctionCount = dataset?.nodes.filter((node) => node.type === 'junction').length ?? 0
  const blockedNodeCount = hazards?.blockedNodes.size ?? 0
  const blockedEdgeCount = hazards?.blockedEdges.size ?? 0
  const closedExitCount = hazards?.closedExits.size ?? 0

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
      announce('invalidJsonToast', 'warning')
      return
    }

    try {
      const result = parseBuildingJson(await file.text())
      if (!result.dataset) {
        setValidationIssues(result.issues)
        announce('invalidJsonToast', 'warning')
        return
      }

      setDataset(result.dataset)
      setHazards(initialHazards(result.dataset))
      setSelectedStart('')
      setMapInspection(null)
      announce('datasetLoadedToast', 'success')
    } catch {
      setUploadMessage('readError')
      announce('invalidJsonToast', 'warning')
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
    announce(selectedStart ? 'routeChangedToast' : 'routeRecalculatedToast', 'info')
  }

  const resetHazards = () => {
    if (dataset) {
      setHazards(initialHazards(dataset))
      announce('simulationResetToast', 'success')
    }
  }

  const handleNodeKey = (event: KeyboardEvent<SVGGElement>, nodeId: string, canSelect: boolean) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setMapInspection({ kind: 'node', id: nodeId })
      if (canSelect) {
        setSelectedStart(nodeId)
        announce('routeRecalculatedToast', 'info')
      }
    }
  }

  const points = dataset ? projectNodes(dataset) : new Map<string, Point>()
  const activeRouteEdges = routeEdgeKeys(route)
  const routeNodes = new Set(route?.nodeIds ?? [])
  const nodeById = new Map(dataset?.nodes.map((node) => [node.id, node]) ?? [])
  const inspectedNode = mapInspection?.kind === 'node' ? nodeById.get(mapInspection.id) : undefined
  const inspectedEdge = mapInspection?.kind === 'edge'
    ? dataset?.edges.find((edge) => edge.id === mapInspection.id)
    : undefined

  return (
    <div className="app-shell" lang={language} data-theme={theme}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Smart Escape home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-copy">
            <strong>SMART ESCAPE</strong>
            <span>{text('brandSubtitle')}</span>
          </span>
        </a>
        <div className="header-building">
          <span>{text('currentBuilding')}</span>
          <strong title={dataset?.building ?? undefined}>{dataset?.building ?? text('awaitingBuilding')}</strong>
        </div>
        <div className="topbar-right header-actions">
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
          <div className="theme-switch" role="group" aria-label={text('theme')}>
            <button type="button" aria-label={text('lightMode')} aria-pressed={theme === 'light'} className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>
              <span aria-hidden="true">☼</span><span>{text('lightMode')}</span>
            </button>
            <button type="button" aria-label={text('darkMode')} aria-pressed={theme === 'dark'} className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
              <span aria-hidden="true">◐</span><span>{text('darkMode')}</span>
            </button>
          </div>
          <button type="button" className="header-button header-help" aria-expanded={guideOpen} onClick={() => setGuideOpen((current) => !current)}>
            <span aria-hidden="true">i</span>{text('help')}
          </button>
          <button type="button" className="header-button header-reset" disabled={!dataset} onClick={resetHazards}>
            <span aria-hidden="true">↺</span>{text('reset')}
          </button>
        </div>
      </header>

      {guideOpen && (
        <aside className="guide-popover" role="dialog" aria-label={text('help')}>
          <button className="guide-close" type="button" aria-label={text('close')} onClick={() => setGuideOpen(false)}>×</button>
          <strong>{text('routeIntelligence')}</strong>
          <p>{text('routeUpdatesDescription')}</p>
          <p>{text('routeUpdatesFootnote')}</p>
        </aside>
      )}

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

        {dataset && hazards && (
          <section className="stats-grid" aria-label={text('routeIntelligence')}>
            {[
              ['totalNodes', dataset.nodes.length, 'neutral'],
              ['roomsStat', roomCount, 'room'],
              ['junctionsStat', junctionCount, 'junction'],
              ['totalExits', totalExitCount, 'exit'],
              ['openExitsStat', openExitCount, 'safe'],
              ['closedExitsStat', closedExitCount, 'danger'],
              ['blockedNodesStat', blockedNodeCount, 'danger'],
              ['blockedCorridorsStat', blockedEdgeCount, 'warning'],
              ['currentCost', route?.cost ?? '—', route ? 'route' : 'neutral'],
            ].map(([key, value, tone]) => (
              <div className={`stat-card ${tone}`} key={key}>
                <span>{text(key as TranslationKey)}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </section>
        )}

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
                onChange={(event) => {
                  setSelectedStart(event.target.value)
                  setMapInspection(event.target.value ? { kind: 'node', id: event.target.value } : null)
                  if (event.target.value) announce('routeRecalculatedToast', 'info')
                }}
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
                            <span className={`state-badge ${blocked ? 'danger' : 'safe'}`}>{text(blocked ? 'stateBlocked' : 'stateAvailable')}</span>
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
                            <span className={`state-badge ${blocked ? 'danger' : 'safe'}`}>{text(blocked ? 'stateBlocked' : 'stateAvailable')}</span>
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
                            <span className={`state-badge ${closed ? 'danger' : 'safe'}`}>{text(closed ? 'stateClosed' : 'stateOpen')}</span>
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
                      const edgeDescription = `${text('edgeId')} ${edge.id}, ${text('fromLabel')} ${edge.from}, ${text('toLabel')} ${edge.to}, ${text('cost')} ${edge.cost}, ${text(blocked ? 'stateBlocked' : 'stateAvailable')}`
                      return (
                        <g
                          className={`edge-hit${blocked ? ' blocked' : ''}${isActive ? ' active' : ''}`}
                          key={edge.id}
                          role="button"
                          tabIndex={0}
                          aria-label={edgeDescription}
                          aria-pressed={blocked}
                          onClick={() => {
                            setMapInspection({ kind: 'edge', id: edge.id })
                            toggleHazard('blockedEdges', edge.id)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setMapInspection({ kind: 'edge', id: edge.id })
                              toggleHazard('blockedEdges', edge.id)
                            }
                          }}
                        >
                          <title>{edgeDescription}</title>
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
                      const nodeState = blocked ? 'stateBlocked' : closed ? 'stateClosed' : node.type === 'exit' ? 'stateOpen' : 'stateAvailable'
                      const nodeDescription = `${node.id}, ${node.label}, ${text(node.type)}, ${text(nodeState)}`
                      return (
                        <g
                          className={`node ${stateClass}${selected ? ' selected' : ''}${active ? ' on-route' : ''}${canSelect ? ' selectable' : ''}`}
                          key={node.id}
                          transform={`translate(${point.x} ${point.y})`}
                          role="button"
                          tabIndex={0}
                          aria-label={`${nodeDescription}${selected ? `, ${text('selected')}` : ''}`}
                          aria-pressed={canSelect ? selected : undefined}
                          onClick={() => {
                            setMapInspection({ kind: 'node', id: node.id })
                            if (canSelect) {
                              setSelectedStart(node.id)
                              announce('routeRecalculatedToast', 'info')
                            }
                          }}
                          onKeyDown={(event) => handleNodeKey(event, node.id, canSelect)}
                        >
                          <title>{nodeDescription}</title>
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
                {(inspectedNode || inspectedEdge) && (
                  <div className="map-inspector" role="status" aria-live="polite">
                    {inspectedNode ? (
                      <>
                        <strong>{inspectedNode.id}</strong>
                        <span>{inspectedNode.label}</span>
                        <span>{text(inspectedNode.type)}</span>
                        <span className={`state-badge ${hazards?.blockedNodes.has(inspectedNode.id) || hazards?.closedExits.has(inspectedNode.id) ? 'danger' : 'safe'}`}>
                          {text(hazards?.blockedNodes.has(inspectedNode.id) ? 'stateBlocked' : hazards?.closedExits.has(inspectedNode.id) ? 'stateClosed' : inspectedNode.type === 'exit' ? 'stateOpen' : 'stateAvailable')}
                        </span>
                      </>
                    ) : inspectedEdge ? (
                      <>
                        <strong>{inspectedEdge.id}</strong>
                        <span>{text('fromLabel')}: {inspectedEdge.from}</span>
                        <span>{text('toLabel')}: {inspectedEdge.to}</span>
                        <span>{text('cost')}: {inspectedEdge.cost}</span>
                        <span className={`state-badge ${hazards?.blockedEdges.has(inspectedEdge.id) ? 'danger' : 'safe'}`}>
                          {text(hazards?.blockedEdges.has(inspectedEdge.id) ? 'stateBlocked' : 'stateAvailable')}
                        </span>
                      </>
                    ) : null}
                  </div>
                )}
                <div className="map-footer">
                  <div className="map-legend" aria-label={text('legend')}>
                    <span><i className="legend-dot room" />{text('room')}</span>
                    <span><i className="legend-dot junction" />{text('junction')}</span>
                    <span><i className="legend-dot exit" />{text('exit')}</span>
                    <span><i className="legend-dot selected" />{text('selectedStart')}</span>
                    <span><i className="legend-dot route" />{text('activeRoute')}</span>
                    <span><i className="legend-dot blocked" />{text('blockedNode')}</span>
                    <span><i className="legend-dot blocked-edge" />{text('blockedCorridor')}</span>
                    <span><i className="legend-dot closed-exit" />{text('closedExit')}</span>
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
                    <strong title={nodeById.get(selectedStart)?.label ?? selectedStart}>{selectedStart}</strong>
                    <small>{nodeById.get(selectedStart)?.label}</small>
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
                  <div className="route-explanation">
                    <span>{text('whyRoute')}</span>
                    <p>{fillTranslation(language, 'routeExplanation', {
                      exit: route.exitId,
                      cost: route.cost,
                      blockedNodes: blockedNodeCount,
                      blockedEdges: blockedEdgeCount,
                      closedExits: closedExitCount,
                    })}</p>
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
      {toast && (
        <div className={`toast-message ${toast.tone}`} role="status" aria-live="polite">
          <span aria-hidden="true">{toast.tone === 'success' ? '✓' : toast.tone === 'warning' ? '!' : '↻'}</span>
          <strong>{text(toast.key)}</strong>
          <button type="button" aria-label={text('close')} onClick={() => setToast(null)}>×</button>
        </div>
      )}
    </div>
  )
}

export default App
