# LexoRank Demo Extension — Implementation Specification

## 1. Purpose

Extend the existing Vue 3 virtualized drag-and-drop tree so it can act as the executable companion to a deep-dive publication about LexoRank.

The demo must preserve the original proof of concept—large virtualized tree, collapse/expand, drag ghost, depth-aware drop, and edge scrolling—while making rank maintenance visible and intentionally breakable.

The implementation has two maintenance levels:

1. **Partial rerank** repairs one small, dense or colliding interval inside a sibling list.
2. **Full rerank** migrates a complete sibling list into the next LexoRank bucket and redistributes every rank.

The application is browser-only. All item data, ordering-domain state, and operation progress remain in memory.

## 2. Non-goals

- No backend, persistence, worker queue, or database locking implementation.
- No claim that the demo reproduces Jira's private implementation exactly.
- No concurrent edits from multiple browser clients.
- No custom replacement for the reference LexoRank midpoint algorithm.
- No rebalance of unrelated branches merely because one sibling list is dense.

Concurrency, transactions, resumability, and database constraints are publication topics, but the browser demo only models their state transitions.

## 3. Ordering model

### 3.1 Rank representation

Replace the custom `src/lexirank/LexoRank.ts` BigInt implementation with the `lexorank` package from `kvandake/lexorank-ts`.

Every item stores the complete rank string:

```text
bucket|rank-body
0|0i0000:
1|0i0000:
2|0i0000:
```

All parsing, comparison, midpoint, previous-rank, next-rank, and bucket transitions go through the reference library.

### 3.2 Ordering domain

Ranks are only comparable among siblings. The independently ordered domain is therefore:

```text
parentId
```

Root items use a reserved root-domain identifier. A full tree may contain 100,000 items while an individual domain contains only a few siblings.

### 3.3 Stable deterministic ordering

Siblings sort by parsed LexoRank. Equal ranks are permitted so users can create a deliberate collision. Equal values use a deterministic item-id tie-breaker so the UI remains renderable until the interval is repaired.

Syntactically invalid manual ranks are rejected by the editor. This keeps “broken” data precise: a user can create duplicates, dense intervals, or switch a bucket, but cannot crash the comparator with an unparsable value.

## 4. Sparse ordering-domain state

Do not create an in-memory or conceptual database state record for every non-empty sibling list. Use a sparse convention:

```text
missing state record = stable bucket 0, no active operation
```

Create an explicit state record only when a full rerank starts, the stable bucket becomes nonzero, or future non-default ordering configuration requires it:

```ts
type BucketId = 0 | 1 | 2

type OrderingState = {
  domainId: string
  stableBucket: BucketId
  operation: null | {
    type: 'full-rerank'
    sourceBucket: BucketId
    destinationBucket: BucketId
    direction: 'head-to-tail' | 'tail-to-head'
    processed: number
    total: number
  }
  version: number
}
```

Invariants:

- Default idle: no record exists; every healthy item uses bucket 0.
- Explicit idle: `operation === null`; every healthy item in the domain uses `stableBucket`.
- Running: exactly one operation exists; items use only source or destination bucket; the two bucket regions remain contiguous.
- Complete: no source-bucket items remain; `stableBucket` changes to the destination bucket; the operation is cleared and `version` increments.
- Empty: the record can be deleted/reset, making bucket 0 the next insertion's implicit default.
- Partial and full reranks cannot overlap in the same in-memory demo.

Bucket transitions follow the cycle `0 → 1 → 2 → 0`.

## 5. Rank utility module

Create a focused `src/ranking` module that isolates the reference-library API from Vue components.

Responsibilities:

- strict parse and normalization;
- safe rank comparison plus deterministic item tie-breaking;
- bucket extraction and bucket conversion;
- `before`, `after`, and `between` generation;
- insertion-rank generation for a destination interval;
- balanced rank generation between two sentinels;
- full-bucket target generation;
- partial-window boundary discovery;
- invariant validation helpers used by tests and UI feedback.

Balanced rank generation uses recursive subdivision with the library's `between()` operation. It does not reimplement LexoRank arithmetic with BigInt.

## 6. Initial data generation

Generate each sibling list directly in bucket 0 using balanced reference-library ranks between `LexoRank.min()` and `LexoRank.max()`.

Regeneration cancels any active operation and clears the sparse state map. All generated domains therefore use implicit stable bucket 0 without extra records.

## 7. Drag-and-drop rank generation

The dragged item's old bucket is irrelevant. Its new rank is determined by the destination sibling interval.

Idle rules:

- no neighbors: use the middle of the domain's stable bucket;
- one next neighbor: generate before it in that bucket;
- one previous neighbor: generate after it in that bucket;
- two same-bucket neighbors: generate `between()` them;
- mixed buckets without an active full rerank: report a domain-integrity error and ask the user to repair/rerank it.

Running full-rerank rules are documented in the article, but the demo serializes user mutations while its fast in-memory migration is active. This prevents the UI shortcut from pretending to demonstrate database concurrency that it does not implement.

## 8. Manual rank editor

### Interaction

- Clicking a displayed rank replaces it with an inline text input.
- `Enter` or blur attempts to commit.
- `Escape` cancels.
- A valid value is normalized through `LexoRank.parse(...).toString()`.
- An invalid value remains in the input and displays an inline validation state.
- Duplicate ranks and valid bucket changes are intentionally allowed.

### Drag safety

Mouse-down on inputs, buttons, links, or other interactive controls must not begin a row drag.

## 9. Partial rerank

Each row has a **Partial rerank** action. It operates only on that row's sibling domain.

Boundary algorithm:

1. Sort the siblings by rank with the stable tie-breaker.
2. Locate the selected row.
3. Walk left across equal/colliding ranks until the first strictly smaller rank; include that row as the left affected boundary when present.
4. Walk right across equal/colliding ranks until the first strictly larger rank; include that row as the right affected boundary when present.
5. For a unique selected rank, include its immediate previous and next siblings when present. This makes the action a useful local redistribution rather than a no-op.
6. Treat the rows immediately outside the affected window as fixed anchors. At a list edge, use the bucket minimum or maximum sentinel.
7. Generate evenly spread replacement ranks for only the inclusive affected window by recursively applying `between()` to the anchors.
8. Apply the replacements atomically in memory and leave the domain bucket unchanged.

The operation reports the affected range and number of rewritten rows. It is disabled while a full rerank is running.

Complexity for a window of `k` rows is `O(k log k)` including sorting and balanced target generation; only `k` item records are rewritten.

## 10. Full bucket rerank

The header has a **Full rerank** button. It operates only on the root ordering domain. Child domains keep their own independent stable buckets and operation state.

This is intentional and visible in the demo: root items may be in bucket 1 while the children of one parent remain in bucket 0 and another parent's children have independently advanced to bucket 2. A production interface could expose a domain-specific full-rerank action for any parent, but that is outside the initial UI scope.

For each domain:

1. Read `stableBucket` as the source bucket.
2. Select the next bucket in `0 → 1 → 2 → 0` (a missing root state means source bucket 0).
3. Snapshot the current sibling order.
4. Generate one balanced destination rank per item between the destination bucket's min/max sentinels.
5. Set the domain operation state.
6. Migrate in the direction that preserves contiguous bucket regions:
   - `0 → 1` and `1 → 2`: tail to head;
   - `2 → 0`: head to tail.
7. Process bounded batches per animation frame so a large in-memory tree does not freeze the browser.
8. After the last source item is migrated, atomically advance `stableBucket`, clear the operation, and increment `version`. If the destination is bucket 0 and no non-default configuration remains, delete the now-default state record.

The global UI exposes total progress, disables conflicting controls, and reports completion.

The algorithm still rewrites every rank: `O(n)` rank changes. Buckets improve availability, throttling, restartability, and lock scope in a real system; they do not remove write amplification.

## 11. User interface changes

Header:

- retain data-generation controls;
- add **Full rerank**;
- add operation progress/status;
- show a concise last-operation message.

Table:

- keep Name and Rank columns;
- widen Rank for complete bucket-prefixed values;
- add Actions column;
- render bucket 0/1/2 with subtle distinct visual markers;
- make rank text visibly editable;
- add per-row **Partial rerank** button.

Accessibility:

- controls use native buttons and inputs;
- editable rank exposes an accessible label containing the item name;
- progress uses textual status in addition to color;
- validation is not color-only.

## 12. Error handling

The demo must remain interactive after deliberate corruption.

Report, rather than throw through Vue rendering, when:

- a manual rank is unparsable;
- a midpoint cannot be generated because adjacent ranks are equal;
- idle neighbors are in inconsistent buckets;
- a rerank is requested during an incompatible operation;
- domain invariants fail after an operation.

## 13. Tests

Add focused unit tests for:

- parse/normalize/compare;
- bucket cycle and bucket conversion;
- balanced target monotonicity and uniqueness;
- insertion before, between, and after;
- duplicate-boundary discovery;
- partial rerank modifies only the selected sibling window;
- full rerank preserves item order, changes every item to the next bucket, and keeps ranks unique;
- `2 → 0` migration direction;
- domain-state completion invariants.

Verification also includes a production build and a browser smoke test of regeneration, inline editing, partial repair, drag/drop, and full-rerank progress.

## 14. Repository changes

Expected structure:

```text
src/
  ranking/
    lexorank.ts
    rerank.ts
    types.ts
    *.spec.ts
  App.vue
  mockData.ts
  types.ts
  components/
    StickyTableRow.vue
docs/
  IMPLEMENTATION_SPEC.md
  PUBLICATION_OUTLINE.md
  PUBLICATION_DRAFT.md
```

Remove the old `src/lexirank` implementation after all imports use the reference package.

Update `README.md` to describe both the original drag-and-drop proof of concept and the new LexoRank laboratory controls.

## 15. Acceptance criteria

- Existing virtualized tree and drag-and-drop behavior still work.
- Initial ranks are valid complete ranks from `lexorank-ts`.
- No application code imports the old custom BigInt rank class.
- A rank can be edited inline and duplicated intentionally.
- A row's Partial rerank repairs its local sibling interval without touching unrelated domains.
- Full rerank advances the root ordering domain by exactly one bucket and leaves all child domains unchanged.
- Full migration preserves visible sibling order and bucket contiguity.
- UI remains responsive during a large full rerank.
- Unit tests and production build pass.
- The publication draft accurately distinguishes demonstrated behavior, production requirements, and undocumented Jira internals.
