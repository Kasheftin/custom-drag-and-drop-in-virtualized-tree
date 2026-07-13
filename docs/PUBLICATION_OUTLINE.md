# Publication Blueprint — LexoRank Beyond the Midpoint

## Working title

**LexoRank Beyond the Midpoint: Buckets, Local Repair, and Online Rebalancing**

Alternative titles:

- **From Drag-and-Drop to Durable Order: A Deep Dive into LexoRank**
- **When There Is No Rank Between Two Ranks: Rebalancing LexoRank at Scale**
- **LexoRank in Practice: Dense Intervals, Buckets, and Hierarchical Ordering**

## Thesis

The previous publication ended with lexicographic ranks as the persistence layer for a data-driven drag-and-drop tree. Midpoint generation solves cheap insertion, but it is only the first half of a production ordering system. A complete design also needs bounded repair when a local interval becomes dense, a full online rebalance for pathological cases, explicit per-domain state, and a concurrency policy.

The central conclusion is:

> Local reranking and bucket-based rebalancing are not competing algorithms. They are two levels of the same maintenance strategy.

## Relationship to the previous publication

Open with a direct bridge to “Data-Driven Drag-and-Drop in Vue: A Virtualized 100K Row Tree.” Reuse its professional, engineering-first structure:

- begin with a concrete failure hidden behind a seemingly simple UI operation;
- establish the data model before presenting code;
- separate conceptual invariants from framework details;
- use small rank sequences and diagrams before the 100K-row demo;
- state complexity and operational trade-offs explicitly;
- finish with source/demo links and production caveats.

Do not repeat the drag lifecycle, virtualization, tree flattening, or geometry sections in full. Summarize them in one short “where we left off” section and link to the previous article.

## Narrative structure

### 1. From stored order to LexoRank

Begin at the database problem rather than assuming prior knowledge:

- an ordered list needs a persistent ordering value;
- the common model assigns unique integer ranks `1, 2, 3, ...`;
- inserting between adjacent integers either shifts many rows or needs a midpoint strategy;
- fractional ranks and integer gaps make normal insertion a one-row write;
- finite numeric precision means repeated midpoint insertion still exhausts an interval;
- an integer gap `G` supports roughly `log₂(G)` repeated same-side midpoint insertions;
- lexicographic strings can add precision by growing, for example `aaa < aaan < aab`;
- string growth postpones exhaustion but does not eliminate maintenance.

End with the article's two maintenance levels: partial boundary rerank and full bucket rerank.

Keep a scientific caveat: mathematical real numbers are infinitely dense, but database decimals have finite precision. Also state that real implementations need controlled alphabets, collation, sentinels, and normalization beyond the simplified `aaa/aaan/aab` example.

### 2. Where the previous article stopped

Recap:

- drag-and-drop updates application state rather than mutating DOM order;
- tree rows are flattened for virtualization;
- a drop persists order by generating a rank between destination siblings;
- the original demo used a custom BigInt midpoint implementation.

Introduce the missing question: what happens after repeated insertions consume useful space?

### 3. Ordering is local, not global

Define the ordering domain before defining the algorithm.

For this tree, only siblings compare ranks:

```text
domain = parentId
```

Explain why a 100K-node tree does not imply a 100K-row rebalance. A branch with 50 children needs at most a 50-row domain operation.

### 4. Lexicographic order and midpoint insertion

Explain complete reference ranks such as `0|0i0000:`.

Cover:

- bucket prefix;
- base-36 rank body;
- lexical comparison;
- `between`, `genPrev`, and `genNext`;
- why longer fractional suffixes provide more positions;
- why midpoint insertion is usually an `O(1)` record update.

Replace the previous custom implementation with `kvandake/lexorank-ts` and explain why using a reference implementation is preferable to maintaining subtle numeral-system edge cases in demo code.

### 5. Rank density is inevitable

Use a repeated-insertion example. Show rank growth and the collision-style strategy from the original discussion:

```text
... mmk, mmm, mmm, mmn ...
```

Distinguish three conditions:

- syntactic invalidity;
- duplicate/non-unique rank;
- valid but increasingly precise/dense rank.

Emphasize that rank length is a maintenance signal, not a correctness failure by itself.

### 6. Level one: partial rerank by boundaries

Present the small repair algorithm:

1. identify the dense/colliding run;
2. find the nearest strictly smaller and larger boundary rows;
3. keep external anchors fixed;
4. redistribute only the enclosed window;
5. commit the small change atomically.

Use the demo's manual rank editor to duplicate a rank, then the row action to repair it.

Discuss:

- small write set;
- why uniqueness constraints and retry still matter;
- when to expand the window;
- a practical maximum local-window size;
- why partial repair is the preferred first response.

### 7. Why local repair is not sufficient forever

Pathological cases:

- a hot insertion point repeatedly exhausts repaired space;
- rank bodies exceed a configured threshold;
- a partial window grows beyond its safe transaction size;
- historical corruption leaves an entire domain uneven.

Introduce full rebalance as the rare fallback.

### 8. The bucket concept

Explain the three buckets and cycle:

```text
0 → 1 → 2 → 0
```

State the key point precisely:

> Buckets do not reduce the total number of rewritten ranks. They let the rewrite happen online as many small coordinated operations.

Describe idle and running invariants and why source/destination regions must remain contiguous.

### 9. Full rerank target distribution

Explain capacity and deliberate headroom conceptually:

```text
capacity = base^length
position(i) = floor(i × (capacity - 1) / (count + 1))
```

Clearly label proportional fixed-width spacing as a general derivation; Atlassian documents even distribution but not its private exact arithmetic.

Then explain that the demo delegates rank arithmetic to `lexorank-ts` and produces balanced targets by recursive midpoint subdivision between bucket sentinels. This avoids reintroducing a custom BigInt rank engine while preserving monotonic, unique, broadly distributed targets.

### 10. Online migration direction

Visualize:

```text
0 → 1: source prefix | destination suffix, migrate tail → head
1 → 2: source prefix | destination suffix, migrate tail → head
2 → 0: destination prefix | source suffix, migrate head → tail
```

Explain why direction is not cosmetic: it preserves one contiguous boundary during migration.

### 11. Inserts and moves during a mixed-bucket state

Decision table:

| Previous | Next | New item's bucket |
|---|---|---|
| Source | Source | Source |
| Destination | Destination | Destination |
| Mixed boundary | Mixed | Source (chosen policy) |

Never calculate a normal midpoint across two full ranks from different buckets.

For drag-and-drop, determine the bucket from the destination interval; the item's old bucket is irrelevant.

Be explicit that “mixed-boundary inserts stay in the source bucket” is the publication/demo policy, not a claim about Jira's undisclosed branch implementation.

### 12. Persisted state is part of the algorithm

Explain why inspecting neighbors alone is insufficient for empty domains, edge insertion, crash recovery, and concurrent balancers.

Present a sparse `OrderingState` schema with:

- missing row meaning stable bucket 0 with no operation;
- an explicit stable bucket only for active/non-default contexts;
- operation type/status;
- source/destination bucket;
- direction;
- progress/heartbeat;
- version.

Explain the lifecycle: create a row when a rebalance begins, retain it while a nonzero bucket is established, and delete/reset it when the domain becomes empty or returns to the default state. Compare this with Jira's documented marker-row approach without claiming they are identical.

### 13. Concurrency and database constraints

Production transaction outline:

1. lock or version-check ordering state;
2. read/lock current neighbors;
3. confirm adjacency;
4. choose bucket from state plus interval;
5. generate rank;
6. write item;
7. commit and retry on conflict.

Include:

- unique `(domainId, fullRank)` constraint;
- compare-and-swap scheduling to prevent two rebalances;
- consistent lock order;
- lease/heartbeat recovery;
- verification that no source rows remain before completion.

State that the frontend demo serializes conflicting controls and therefore illustrates the state machine, not database isolation.

### 14. Cost model and alternatives

Compare:

| Operation | Rows rewritten | Typical role |
|---|---:|---|
| Midpoint insert/move | 1 | Normal path |
| Partial rerank | `k` | Dense local interval |
| Full bucket rerank | `n` in one domain | Rare fallback |

Explain that buckets solve availability and operational safety, not write amplification.

Briefly mention, without expanding the main scope:

- shadow rank generations;
- segmented/block ordering;
- append-only generation tables.

### 15. Walking through the demo

Suggested sequence for screenshots/GIF:

1. Load the familiar 100K-row virtualized tree.
2. Click a rank and copy its neighbor's value to create a collision.
3. Show deterministic rendering despite duplicate ranks.
4. Trigger Partial rerank and highlight the affected boundary window.
5. Trigger Full rerank for the root domain.
6. Show root bucket-prefixed ranks changing and progress advancing while expanded child domains keep their own buckets.
7. Repeat until the root domain's `2 → 0` direction becomes visible.
8. Drag an item after maintenance and show a new destination-derived rank.

### 16. Practical trigger policy

Recommend a layered policy:

```text
normal midpoint
  → rank-length/density threshold
  → local window (expand to a configured maximum)
  → full bucket rerank for that sibling domain
```

Triggers can be synchronous after an insertion, scheduled asynchronously, or detected by periodic integrity scans. The correct choice depends on latency and write-load requirements; the invariant matters more than the scheduler.

### 17. Conclusion

Return to the broader theme of the first article: complex UI behavior becomes tractable when the data model is explicit.

Final principles:

- define the ordering domain first;
- use midpoint ranks for the normal path;
- repair locally before rewriting globally;
- treat buckets as an online migration protocol;
- persist operation state;
- coordinate every insertion with that state;
- distinguish public Jira behavior from implementation inference.

## Scientific and editorial standards

- Use “LexoRank-like” when describing general behavior not guaranteed by Jira.
- Cite Atlassian documentation/Javadoc for bucket cycles, balance operations, marker rows, and availability during balancing.
- Cite `kvandake/lexorank-ts` for the reference TypeScript API used in the demo.
- Mark the proportional spacing formula and mixed-boundary insertion policy as engineering derivations/policy choices.
- Avoid implying that amortized insertion is always `O(1)` once maintenance and collision retries are included.
- Separate algorithmic complexity from database operational cost.
- Keep code snippets small and align them with the checked-in demo.

## Planned deliverables

- Updated runnable Vue proof of concept.
- Unit tests for rank and rerank invariants.
- Updated repository README.
- Full publication draft in `docs/PUBLICATION_DRAFT.md`.
- Source list with direct links and a fact/inference distinction.
