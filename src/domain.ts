export type NodeType = 'room' | 'junction' | 'exit'

export interface BuildingNode {
  id: string
  label: string
  type: NodeType
  x: number
  y: number
}

export interface BuildingEdge {
  id: string
  from: string
  to: string
  cost: number
}

export interface InitialState {
  blocked_nodes: string[]
  blocked_edges: string[]
  closed_exits: string[]
}

export interface BuildingDataset {
  building: string
  nodes: BuildingNode[]
  edges: BuildingEdge[]
  initial_state: InitialState
}

export interface HazardState {
  blockedNodes: Set<string>
  blockedEdges: Set<string>
  closedExits: Set<string>
}

export interface SafeRoute {
  nodeIds: string[]
  exitId: string
  cost: number
}

export type ValidationIssueCode =
  | 'invalidJson'
  | 'invalidRoot'
  | 'invalidBuilding'
  | 'invalidNodes'
  | 'nodeCount'
  | 'invalidNode'
  | 'duplicateNodeId'
  | 'invalidNodeLabel'
  | 'invalidNodeType'
  | 'invalidCoordinates'
  | 'invalidEdges'
  | 'edgeCount'
  | 'invalidEdge'
  | 'duplicateEdgeId'
  | 'unknownEdgeNode'
  | 'selfLoop'
  | 'duplicateEdgePair'
  | 'invalidEdgeCost'
  | 'invalidInitialState'
  | 'invalidHazardList'
  | 'unknownBlockedNode'
  | 'blockedExit'
  | 'unknownBlockedEdge'
  | 'unknownClosedExit'
  | 'closedIdNotExit'

export interface ValidationIssue {
  code: ValidationIssueCode
  params?: Record<string, string | number>
}

export interface ValidationResult {
  dataset?: BuildingDataset
  issues: ValidationIssue[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

export function parseBuildingJson(text: string): ValidationResult {
  let value: unknown

  try {
    value = JSON.parse(text)
  } catch {
    return { issues: [{ code: 'invalidJson' }] }
  }

  return validateBuildingDataset(value)
}

export function validateBuildingDataset(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = []

  if (!isRecord(value)) {
    return { issues: [{ code: 'invalidRoot' }] }
  }

  if (!isNonEmptyString(value.building)) {
    issues.push({ code: 'invalidBuilding' })
  }

  if (!Array.isArray(value.nodes)) {
    issues.push({ code: 'invalidNodes' })
  } else if (value.nodes.length < 2 || value.nodes.length > 60) {
    issues.push({ code: 'nodeCount', params: { count: value.nodes.length } })
  }

  if (!Array.isArray(value.edges)) {
    issues.push({ code: 'invalidEdges' })
  } else if (value.edges.length < 1 || value.edges.length > 150) {
    issues.push({ code: 'edgeCount', params: { count: value.edges.length } })
  }

  if (!isRecord(value.initial_state)) {
    issues.push({ code: 'invalidInitialState' })
  }

  if (
    issues.some((issue) =>
      ['invalidBuilding', 'invalidNodes', 'nodeCount', 'invalidEdges', 'edgeCount', 'invalidInitialState'].includes(issue.code),
    )
  ) {
    return { issues }
  }

  const rawNodes = value.nodes as unknown[]
  const rawEdges = value.edges as unknown[]
  const rawInitialState = value.initial_state as Record<string, unknown>
  const nodes: BuildingNode[] = []
  const nodeIds = new Set<string>()

  rawNodes.forEach((rawNode, index) => {
    if (!isRecord(rawNode)) {
      issues.push({ code: 'invalidNode', params: { index: index + 1 } })
      return
    }

    const id = rawNode.id
    if (!isNonEmptyString(id)) {
      issues.push({ code: 'invalidNode', params: { index: index + 1 } })
      return
    }
    if (nodeIds.has(id)) {
      issues.push({ code: 'duplicateNodeId', params: { id } })
      return
    }
    nodeIds.add(id)

    if (!isNonEmptyString(rawNode.label)) {
      issues.push({ code: 'invalidNodeLabel', params: { id } })
      return
    }
    if (rawNode.type !== 'room' && rawNode.type !== 'junction' && rawNode.type !== 'exit') {
      issues.push({ code: 'invalidNodeType', params: { id } })
      return
    }
    if (
      typeof rawNode.x !== 'number' ||
      !Number.isFinite(rawNode.x) ||
      typeof rawNode.y !== 'number' ||
      !Number.isFinite(rawNode.y)
    ) {
      issues.push({ code: 'invalidCoordinates', params: { id } })
      return
    }

    nodes.push({ id, label: rawNode.label, type: rawNode.type, x: rawNode.x, y: rawNode.y })
  })

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const edges: BuildingEdge[] = []
  const edgeIds = new Set<string>()
  const nodePairs = new Set<string>()

  rawEdges.forEach((rawEdge, index) => {
    if (!isRecord(rawEdge) || !isNonEmptyString(rawEdge.id)) {
      issues.push({ code: 'invalidEdge', params: { index: index + 1 } })
      return
    }

    const { id, from, to, cost } = rawEdge
    if (edgeIds.has(id)) {
      issues.push({ code: 'duplicateEdgeId', params: { id } })
      return
    }
    edgeIds.add(id)

    if (!isNonEmptyString(from) || !nodeById.has(from)) {
      issues.push({ code: 'unknownEdgeNode', params: { edgeId: id, nodeId: String(from ?? '') } })
      return
    }
    if (!isNonEmptyString(to) || !nodeById.has(to)) {
      issues.push({ code: 'unknownEdgeNode', params: { edgeId: id, nodeId: String(to ?? '') } })
      return
    }
    if (from === to) {
      issues.push({ code: 'selfLoop', params: { id } })
      return
    }

    const pair = from < to ? `${from}\u0000${to}` : `${to}\u0000${from}`
    if (nodePairs.has(pair)) {
      issues.push({ code: 'duplicateEdgePair', params: { id } })
      return
    }
    nodePairs.add(pair)

    if (typeof cost !== 'number' || !Number.isInteger(cost) || cost <= 0) {
      issues.push({ code: 'invalidEdgeCost', params: { id } })
      return
    }

    edges.push({ id, from, to, cost })
  })

  const initialState: InitialState = {
    blocked_nodes: [],
    blocked_edges: [],
    closed_exits: [],
  }

  const readHazardList = (key: keyof InitialState): string[] => {
    const list = rawInitialState[key]
    if (!Array.isArray(list) || !list.every(isNonEmptyString)) {
      issues.push({ code: 'invalidHazardList', params: { list: key } })
      return []
    }
    return [...list]
  }

  initialState.blocked_nodes = readHazardList('blocked_nodes')
  initialState.blocked_edges = readHazardList('blocked_edges')
  initialState.closed_exits = readHazardList('closed_exits')

  for (const id of initialState.blocked_nodes) {
    const node = nodeById.get(id)
    if (!node) issues.push({ code: 'unknownBlockedNode', params: { id } })
    else if (node.type === 'exit') issues.push({ code: 'blockedExit', params: { id } })
  }

  for (const id of initialState.blocked_edges) {
    if (!edgeIds.has(id)) issues.push({ code: 'unknownBlockedEdge', params: { id } })
  }

  for (const id of initialState.closed_exits) {
    const node = nodeById.get(id)
    if (!node) issues.push({ code: 'unknownClosedExit', params: { id } })
    else if (node.type !== 'exit') issues.push({ code: 'closedIdNotExit', params: { id } })
  }

  if (issues.length > 0 || !isNonEmptyString(value.building)) {
    return { issues }
  }

  return {
    dataset: {
      building: value.building,
      nodes,
      edges,
      initial_state: initialState,
    },
    issues: [],
  }
}

export function initialHazards(dataset: BuildingDataset): HazardState {
  return {
    blockedNodes: new Set(dataset.initial_state.blocked_nodes),
    blockedEdges: new Set(dataset.initial_state.blocked_edges),
    closedExits: new Set(dataset.initial_state.closed_exits),
  }
}

const compareStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0

const comparePaths = (left: string[], right: string[]): number => {
  const sharedLength = Math.min(left.length, right.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const comparison = compareStrings(left[index], right[index])
    if (comparison !== 0) return comparison
  }
  return left.length - right.length
}

interface Candidate {
  cost: number
  path: string[]
}

const compareCandidates = (left: Candidate, right: Candidate): number =>
  left.cost - right.cost || comparePaths(left.path, right.path)

export function findSafestRoute(
  dataset: BuildingDataset,
  hazards: HazardState,
  startId: string,
): SafeRoute | null {
  const nodeById = new Map(dataset.nodes.map((node) => [node.id, node]))
  const startNode = nodeById.get(startId)
  if (!startNode || startNode.type === 'exit' || hazards.blockedNodes.has(startId)) return null

  const availableNodes = new Set(
    dataset.nodes
      .filter((node) => !hazards.blockedNodes.has(node.id))
      .filter((node) => node.type !== 'exit' || !hazards.closedExits.has(node.id))
      .map((node) => node.id),
  )
  if (!availableNodes.has(startId)) return null

  const adjacency = new Map<string, Array<{ nodeId: string; cost: number }>>()
  for (const id of availableNodes) adjacency.set(id, [])

  for (const edge of dataset.edges) {
    if (hazards.blockedEdges.has(edge.id)) continue
    if (!availableNodes.has(edge.from) || !availableNodes.has(edge.to)) continue
    adjacency.get(edge.from)?.push({ nodeId: edge.to, cost: edge.cost })
    adjacency.get(edge.to)?.push({ nodeId: edge.from, cost: edge.cost })
  }

  const best = new Map<string, Candidate>([[startId, { cost: 0, path: [startId] }]])
  const settled = new Set<string>()

  while (true) {
    let currentId: string | undefined
    let currentCandidate: Candidate | undefined

    for (const [id, candidate] of best) {
      if (settled.has(id)) continue
      if (!currentCandidate || compareCandidates(candidate, currentCandidate) < 0) {
        currentId = id
        currentCandidate = candidate
      }
    }

    if (!currentId || !currentCandidate) break
    settled.add(currentId)

    for (const neighbor of adjacency.get(currentId) ?? []) {
      if (settled.has(neighbor.nodeId)) continue
      const candidate: Candidate = {
        cost: currentCandidate.cost + neighbor.cost,
        path: [...currentCandidate.path, neighbor.nodeId],
      }
      const known = best.get(neighbor.nodeId)
      if (!known || compareCandidates(candidate, known) < 0) {
        best.set(neighbor.nodeId, candidate)
      }
    }
  }

  const destinations = dataset.nodes
    .filter((node) => node.type === 'exit' && availableNodes.has(node.id))
    .flatMap((node) => {
      const candidate = best.get(node.id)
      return candidate ? [{ node, candidate }] : []
    })
    .sort(
      (left, right) =>
        left.candidate.cost - right.candidate.cost || compareStrings(left.node.id, right.node.id),
    )

  const destination = destinations[0]
  if (!destination) return null

  return {
    nodeIds: destination.candidate.path,
    exitId: destination.node.id,
    cost: destination.candidate.cost,
  }
}