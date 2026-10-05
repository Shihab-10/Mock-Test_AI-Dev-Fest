# Smart Escape

Smart Escape is a browser-only evacuation route simulator. Import a building graph, select a room or junction, and recalculate the lowest-cost open exit as hazards change. The SVG map uses node coordinates for display only; routing uses corridor costs.

## Run

```sh
npm install
npm run dev
```

Run the checks with:

```sh
npm exec vitest -- run
npm run lint
npm run build
```

## Building JSON

Import a `.json` file with this structure:

```json
{
  "building": "Example building",
  "nodes": [
    { "id": "A", "label": "Room A", "type": "room", "x": 0, "y": 0 },
    { "id": "X", "label": "North exit", "type": "exit", "x": 1, "y": 0 }
  ],
  "edges": [
    { "id": "hall-a", "from": "A", "to": "X", "cost": 4 }
  ],
  "initial_state": {
    "blocked_nodes": [],
    "blocked_edges": [],
    "closed_exits": []
  }
}
```

A dataset must contain 2–60 uniquely identified nodes and 1–150 uniquely identified corridors. Nodes are rooms, junctions, or exits. Corridor connections are undirected, costs are positive integers, and duplicate node pairs/self-loops are not allowed. Initial hazard arrays may be empty; blocked nodes cannot be exits.

## Behavior

The route solver runs in the browser and sums corridor costs. It excludes blocked nodes, blocked corridors, and closed exits, then breaks equal-cost ties by exit ID and complete node-ID sequence. Reset restores the imported initial hazards. The interface supports English and Bangla without a reload.

No backend, remote storage, credentials, or API keys are used. The static build in `dist/` can be deployed to a static hosting provider.
