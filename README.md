# Smart Escape

Interactive Evacuation Route Simulator

- **Participant:** Shihabul Alam
- **Registration Number:** Not provided; add the competition registration number before submission.
- **Repository:** https://github.com/Shihab-10/Mock-Test_AI-Dev-Fest
- **Live Website:** Not deployed yet.

## Overview

Smart Escape is a browser-based emergency intelligence command center. Import a building graph, select a starting room or junction, and find the lowest-cost open exit while dynamically changing hazards.

## Main Features

- Drag/drop and browse import for validated building JSON.
- Interactive SVG graph with coordinate-based display, node/corridor details, route highlighting, and semantic hazard states.
- Undirected weighted shortest-path routing with deterministic exit and complete-path lexicographic tie-breaking.
- Live hazard controls, automatic rerouting, and reset to the imported `initial_state`.
- Bilingual English/Bangla interface, persistent light/dark themes, live statistics, route rationale, and accessible notifications.
- Responsive command-center layout, keyboard-inspectable map, reduced-motion support, and a short skippable intro.

## Mandatory Requirements

JSON validation, arbitrary compatible graph datasets, weighted Dijkstra routing, exact tie-breaking, start selection, blocked-node/edge and closed-exit filtering, dynamic rerouting, reset, failure states, route result, bilingual UI, responsive map, and static frontend deployment support are implemented.

## Bonus Features

Persistent themes, live status/stat cards, deterministic route explanation, map inspection details, toasts, cinematic intro, and subtle route/guide animations. A route walkthrough is not implemented.

## Tech Stack

React, TypeScript, Vite, CSS, SVG, browser storage, and Vitest.

## How to Run

```sh
npm install
npm run dev
```

## Production Build

```sh
npm run build
```

Additional checks:

```sh
npm exec vitest -- run
npm run lint
```

## Routing Algorithm

The validated building is an undirected weighted graph. Dijkstra's algorithm sums positive integer corridor costs; coordinates are only for drawing. Blocked nodes and their incident edges, blocked corridors, and closed exits are excluded. The minimum-cost reachable open exit is selected; equal-cost exits use lexicographically smallest exit ID, then equal-cost paths use the lexicographically smallest complete node-ID sequence.

## Input JSON Format

Required fields are `building`, `nodes`, `edges`, and `initial_state`. A building name must be nonempty. Supply 2–60 nodes (`id`, `label`, `type`, numeric `x`/`y`) and 1–150 corridors (`id`, `from`, `to`, positive integer `cost`). Node types are `room`, `junction`, and `exit`. Connections are undirected; self-loops and duplicate node pairs are invalid. `initial_state` requires `blocked_nodes`, `blocked_edges`, and `closed_exits` arrays; empty arrays are valid. Exits are closed, not blocked as nodes.

## AI Tools Used

GitHub Copilot was used as the coding agent for implementation and verification.

## Most Useful Prompt

Build a frontend-only bilingual evacuation simulator with strict arbitrary JSON graph validation, exact weighted shortest paths and lexicographic tie-breaking, live hazards, and reliable reset.

## Known Issues

- The app has not yet been deployed to a live static host.
- The participant registration number was not supplied.

## Competition Compliance

Frontend-only. No backend, participant-controlled persistent remote database, embedded secrets, or API keys. Theme preference uses browser local storage; the intro-seen flag uses session storage.
