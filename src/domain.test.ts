import { describe, expect, it } from 'vitest'
import {
  findSafestRoute,
  initialHazards,
  parseBuildingJson,
  type BuildingDataset,
  type HazardState,
} from './domain'

const sample: BuildingDataset = {
  building: 'Test Building',
  nodes: [
    { id: 'R1', label: 'Room 1', type: 'room', x: 0, y: 0 },
    { id: 'R2', label: 'Room 2', type: 'room', x: 0, y: 2 },
    { id: 'C1', label: 'Cross 1', type: 'junction', x: 1, y: 0 },
    { id: 'C2', label: 'Cross 2', type: 'junction', x: 2, y: 0 },
    { id: 'C3', label: 'Cross 3', type: 'junction', x: 1, y: 2 },
    { id: 'C4', label: 'Cross 4', type: 'junction', x: 2, y: 2 },
    { id: 'E1', label: 'Exit 1', type: 'exit', x: 3, y: 0 },
    { id: 'E2', label: 'Exit 2', type: 'exit', x: 3, y: 2 },
  ],
  edges: [
    { id: 'a', from: 'R1', to: 'C1', cost: 2 },
    { id: 'b', from: 'C1', to: 'C2', cost: 2 },
    { id: 'c', from: 'C2', to: 'E1', cost: 3 },
    { id: 'd', from: 'R1', to: 'C3', cost: 5 },
    { id: 'e', from: 'C3', to: 'C4', cost: 1 },
    { id: 'f', from: 'C4', to: 'E2', cost: 5 },
    { id: 'g', from: 'R2', to: 'C3', cost: 1 },
  ],
  initial_state: { blocked_nodes: [], blocked_edges: [], closed_exits: [] },
}

const route = (startId: string, hazards: HazardState = initialHazards(sample)) =>
  findSafestRoute(sample, hazards, startId)

describe('findSafestRoute', () => {
  it('uses edge costs and recomputes around hazards', () => {
    expect(route('R1')).toMatchObject({ nodeIds: ['R1', 'C1', 'C2', 'E1'], cost: 7, exitId: 'E1' })

    const blocked = initialHazards(sample)
    blocked.blockedNodes.add('C2')
    expect(route('R1', blocked)).toMatchObject({
      nodeIds: ['R1', 'C3', 'C4', 'E2'],
      cost: 11,
      exitId: 'E2',
    })

    const closed = initialHazards(sample)
    closed.closedExits.add('E1')
    closed.closedExits.add('E2')
    expect(route('R1', closed)).toBeNull()
    expect(route('R2')).toMatchObject({ nodeIds: ['R2', 'C3', 'C4', 'E2'], cost: 7, exitId: 'E2' })
  })

  it('chooses the lexicographically smallest exit and then the smallest full path', () => {
    const tied: BuildingDataset = {
      building: 'Tie case',
      nodes: [
        { id: 'S', label: 'Start', type: 'room', x: 0, y: 0 },
        { id: 'A', label: 'A', type: 'junction', x: 0, y: 1 },
        { id: 'B', label: 'B', type: 'junction', x: 0, y: 2 },
        { id: 'E1', label: 'Exit 1', type: 'exit', x: 1, y: 0 },
        { id: 'E2', label: 'Exit 2', type: 'exit', x: 1, y: 1 },
      ],
      edges: [
        { id: 'sa', from: 'S', to: 'A', cost: 1 },
        { id: 'sb', from: 'S', to: 'B', cost: 1 },
        { id: 'ae', from: 'A', to: 'E2', cost: 1 },
        { id: 'be', from: 'B', to: 'E2', cost: 1 },
        { id: 'a1', from: 'A', to: 'E1', cost: 1 },
      ],
      initial_state: { blocked_nodes: [], blocked_edges: [], closed_exits: [] },
    }

    expect(findSafestRoute(tied, initialHazards(tied), 'S')).toEqual({
      nodeIds: ['S', 'A', 'E1'],
      exitId: 'E1',
      cost: 2,
    })

    const oneExit: BuildingDataset = {
      ...tied,
      nodes: tied.nodes.filter((node) => node.id !== 'E1'),
      edges: tied.edges.filter((edge) => edge.to !== 'E1' && edge.from !== 'E1'),
    }
    expect(findSafestRoute(oneExit, initialHazards(oneExit), 'S')?.nodeIds).toEqual(['S', 'A', 'E2'])
  })

  it('does not route from a blocked start or through closed exits', () => {
    const hazards = initialHazards(sample)
    hazards.blockedNodes.add('R1')
    expect(route('R1', hazards)).toBeNull()

    const closed = initialHazards(sample)
    closed.closedExits.add('E1')
    expect(route('R1', closed)?.exitId).toBe('E2')
  })

  it('ignores display coordinates and excludes blocked or disconnected edges', () => {
    const moved = structuredClone(sample)
    moved.nodes.forEach((node, index) => {
      node.x = (index + 1) * 100_000
      node.y = (index - 2) * -50_000
    })
    expect(findSafestRoute(moved, initialHazards(moved), 'R1')).toMatchObject({
      nodeIds: ['R1', 'C1', 'C2', 'E1'],
      cost: 7,
    })

    const blockedEdge = initialHazards(sample)
    blockedEdge.blockedEdges.add('a')
    expect(route('R1', blockedEdge)).toMatchObject({
      nodeIds: ['R1', 'C3', 'C4', 'E2'],
      cost: 11,
    })

    const disconnected = initialHazards(sample)
    disconnected.blockedEdges.add('a')
    disconnected.blockedEdges.add('d')
    expect(route('R1', disconnected)).toBeNull()
  })

  it('does not use a closed exit as an intermediate node', () => {
    const bridge: BuildingDataset = {
      building: 'Closed exit bridge',
      nodes: [
        { id: 'S', label: 'Start', type: 'room', x: 0, y: 0 },
        { id: 'E1', label: 'Closed bridge', type: 'exit', x: 1, y: 0 },
        { id: 'J', label: 'Junction', type: 'junction', x: 2, y: 0 },
        { id: 'E2', label: 'Destination', type: 'exit', x: 3, y: 0 },
      ],
      edges: [
        { id: 'se', from: 'S', to: 'E1', cost: 1 },
        { id: 'ej', from: 'E1', to: 'J', cost: 1 },
        { id: 'je', from: 'J', to: 'E2', cost: 1 },
      ],
      initial_state: { blocked_nodes: [], blocked_edges: [], closed_exits: [] },
    }
    const hazards = initialHazards(bridge)
    hazards.closedExits.add('E1')
    expect(findSafestRoute(bridge, hazards, 'S')).toBeNull()
  })
})

describe('parseBuildingJson', () => {
  it('accepts empty initial hazard arrays and rejects malformed graph data', () => {
    const valid = parseBuildingJson(JSON.stringify(sample))
    expect(valid.issues).toEqual([])
    expect(valid.dataset?.initial_state).toEqual({ blocked_nodes: [], blocked_edges: [], closed_exits: [] })

    expect(parseBuildingJson('{')).toMatchObject({ issues: [{ code: 'invalidJson' }] })

    const invalid = structuredClone(sample)
    invalid.nodes[0].type = 'exit'
    invalid.edges[0].cost = 0
    invalid.initial_state.blocked_nodes = ['R1', 'missing']
    const result = parseBuildingJson(JSON.stringify(invalid))
    expect(result.dataset).toBeUndefined()
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['blockedExit', 'unknownBlockedNode', 'invalidEdgeCost']),
    )
  })

  it('does not confuse distinct undirected pairs when IDs contain separators', () => {
    const unusualIds: BuildingDataset = {
      building: 'Unusual IDs',
      nodes: [
        { id: 'A\u0000B', label: 'Room AB', type: 'room', x: 0, y: 0 },
        { id: 'C', label: 'Cross C', type: 'junction', x: 1, y: 0 },
        { id: 'A', label: 'Room A', type: 'room', x: 0, y: 1 },
        { id: 'B\u0000C', label: 'Cross BC', type: 'junction', x: 1, y: 1 },
        { id: 'E', label: 'Exit', type: 'exit', x: 2, y: 0 },
      ],
      edges: [
        { id: 'first', from: 'A\u0000B', to: 'C', cost: 1 },
        { id: 'second', from: 'A', to: 'B\u0000C', cost: 1 },
        { id: 'third', from: 'C', to: 'E', cost: 1 },
      ],
      initial_state: { blocked_nodes: [], blocked_edges: [], closed_exits: [] },
    }

    expect(parseBuildingJson(JSON.stringify(unusualIds)).dataset).toBeDefined()
  })
})