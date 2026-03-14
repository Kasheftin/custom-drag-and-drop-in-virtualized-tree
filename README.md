# Custom Drag & Drop in Virtualized Tree

A proof-of-concept for manual drag-and-drop in a virtualized, collapsible nested tree table — built from scratch in Vue 3 + TypeScript, without any drag-and-drop library.

**[Live demo](https://kasheftin.github.io/custom-drag-and-drop-in-virtualized-tree/)**

## What it demonstrates

- **Virtual scrolling** — only visible rows are in the DOM; handles 300K+ items without lag
- **Collapsible tree** — depth-first flat list with animated expand/collapse (JS height animation on `<tr>`)
- **Drag ghost** — custom ghost element following the mouse, capped at 5 preview rows
- **Drop highlight** — pure-JS overlay (no Vue reactivity) using `document.elementsFromPoint`; shows a line for before/after and a border for into-target
- **Depth-aware drop** — the insertion depth is inferred from the surrounding rows and refined by horizontal mouse displacement (20px per level)
- **LexoRank ordering** — items are sorted by a lexicographic rank string; drops compute a new rank via BigInt midpoint arithmetic

## Tech

- Vue 3 `<script setup>` + TypeScript
- Vite
- No external drag-and-drop library
- Custom `useDrag`, `useEdgeScroll`, `useDropHighlight` composables

## Development

```bash
pnpm install
pnpm dev
```
