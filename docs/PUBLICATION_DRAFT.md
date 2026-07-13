# LexoRank Beyond the Midpoint: Buckets, Local Repair, and Online Rebalancing

Modern drag-and-drop interfaces make reordering look deceptively simple. A user moves one row, the row appears in a new place, and the operation is finished.

The data model has a more difficult problem. It must preserve that position without rewriting every neighboring record, remain stable under repeated insertions, and eventually repair the rank space when some region becomes too dense.

In my previous publication, [Data-Driven Drag-and-Drop in Vue: A Virtualized 100K Row Tree](https://www.linkedin.com/pulse/data-driven-drag-and-drop-vue-virtualized-100k-row-tree-kuznetsov-mjpuf/), I described a drag-and-drop architecture built around application state and geometry rather than DOM mutation. The proof-of-concept application renders a virtualized hierarchical table, flattens the visible part of the tree, calculates a depth-aware drop position, and stores the final order using lexicographic ranks.

That article stopped at midpoint generation. Given two adjacent ranks, the application generated a third rank between them and updated one item.

This is the normal path of a ranking system, but it is not the complete system.

The missing questions are more operational:

- What happens after many insertions target the same narrow interval?
- When should a local interval be repaired?
- When is a full rewrite unavoidable?
- What do LexoRank buckets actually solve?
- Where does bucket state belong in a tree?
- Can we avoid storing an additional state record for every small sibling list?
- How should insertion coordinate with a rebalance that is already running?

This article develops those parts and extends the original Vue proof of concept into a small LexoRank laboratory.

Links:

- [Source code](https://github.com/Kasheftin/custom-drag-and-drop-in-virtualized-tree)
- [Original demo](https://kasheftin.github.io/custom-drag-and-drop-in-virtualized-tree/)
- [TypeScript LexoRank reference implementation](https://github.com/kvandake/lexorank-ts)

---

## From Integer Positions to Lexicographic Ranks

Before examining buckets and rebalancing, let us begin with the basic problem LexoRank is intended to solve.

Suppose an application displays an ordered list:

```text
Task A
Task B
Task C
```

If that order must survive a page reload, it has to be stored somewhere. Keeping the items in a JavaScript array is not enough; after loading them from a database, the application needs a persistent value by which they can be sorted.

There are several possible data models. We could store linked-list pointers, keep positions in a separate relation table, or encode the order in a more complex tree structure. The most common model is much simpler: assign every item a rank.

At first, a rank can be an integer:

```text
Task A    rank 1
Task B    rank 2
Task C    rank 3
```

In a healthy list, each item has a unique rank. Sorting by that value reconstructs the stored order.

The query is straightforward:

```sql
SELECT *
FROM task
ORDER BY rank;
```

The difficulty appears when a new item must be inserted between `Task A` and `Task B`. There is no integer between 1 and 2.

One solution is to shift every following item:

```text
before
Task A    rank 1
Task B    rank 2
Task C    rank 3

insert Task X between A and B

after
Task A    rank 1
Task X    rank 2
Task B    rank 3
Task C    rank 4
```

This is correct, but an insertion near the start of a large list may rewrite almost every row.

### Fractional ranks and rank gaps

A better first approximation is to leave space.

We can use fractional values:

```text
1, 2, 3

insert between 1 and 2

1, 1.5, 2, 3
```

Or we can initialize integer ranks with a fixed gap:

```text
1000, 2000, 3000

insert between 1000 and 2000

1000, 1500, 2000, 3000
```

In both cases, normal insertion changes only one row. We take the midpoint between the previous and next ranks.

The problem has only been postponed. Real databases do not store numbers with infinite precision. A decimal column has a finite scale, and an integer gap contains a finite number of integer positions.

If every new item is inserted into the same half of an interval of size `G`, the remaining interval is approximately:

```text
G / 2^k
```

after `k` insertions. With an initial gap of 1000, repeated midpoint insertion into the same side exhausts the integer space after roughly:

```text
log₂(1000) ≈ 10
```

steps. Eventually the ranks become adjacent:

```text
1000, 1001, 1002, ...
```

There is again no integer rank available between 1000 and 1001. The affected ranks must be redistributed.

### Turning the rank into a string

Lexicographic ranking applies a similar idea to strings. Instead of comparing numeric positions, the application compares rank strings constructed from an ordered alphabet.

For a simplified alphabet, ranks might look like:

```text
aaa
aab
aac
```

If there is useful space between two strings, the application chooses a middle string. If the adjacent ranks are `aaa` and `aab`, their fixed-width forms have no value between them. Unlike a fixed-width integer, however, a string can grow.

By appending a middle character—`n` in this simplified alphabet—we can create:

```text
aaa
aaan
aab
```

because the intended lexical order is:

```text
aaa < aaan < aab
```

This is the central intuition behind LexoRank: when a fixed-width interval is exhausted, create additional precision by extending the string.

A production implementation needs more care than this small example suggests. The alphabet order must agree with the comparison/collation rules; minimum and maximum values need explicit treatment; equivalent representations should be normalized; and midpoint generation must handle prefix boundaries correctly. That is why the demo delegates those details to a reference implementation rather than maintaining another custom string algorithm.

String growth also does not remove rebalancing. Repeated insertion into the same narrow interval can produce ranks conceptually resembling:

```text
aan
aann
aannn
aannnn
...
```

The list remains sortable, but ranks cannot grow indefinitely in a practical database schema. Long strings consume storage and index space, and eventually reach configured limits.

Therefore a complete LexoRank-like system needs two operations:

1. **Normal insertion:** generate one rank between two neighbors, extending the string when required.
2. **Maintenance:** redistribute ranks when a local region or an entire ordering domain becomes too dense.

The remainder of this article considers two complementary maintenance algorithms:

- **partial rerank**, which repairs a bounded local interval — a collision or a dense region — between stable boundaries;
- **full bucket rerank**, which incrementally redistributes a complete ordering domain.

The first minimizes writes in the common repair case. The second provides a safe fallback when local repair is no longer sufficient.

---

## Where We Left Off

The previous demo stores an item independently from its parent-child relation:

```ts
type Item = {
  id: string
  name: string
  rank: string
}

type ItemRelation = {
  fromId: string
  toId: string
}
```

The relation determines hierarchy. The rank determines order among siblings.

When an item is dropped, the application determines its new parent and its previous and next sibling. A rank is then generated for that destination interval.

Conceptually:

```ts
newRank = previousRank.between(nextRank)
```

Only the moved item changes. This is why a midpoint-based rank is attractive: a normal reorder requires one persistent write rather than renumbering the entire list.

The old proof of concept used a custom BigInt implementation for midpoint arithmetic. The extended version removes it and uses the open-source [`lexorank` package](https://www.npmjs.com/package/lexorank) (pinned to `1.0.5` for reproducibility), whose source is available in [`kvandake/lexorank-ts`](https://github.com/kvandake/lexorank-ts).

The library exposes the operations needed by the demo:

```ts
const left = LexoRank.parse('0|0i0000:')
const right = left.genNext()

const middle = left.between(right)
const before = left.genPrev()
const after = right.genNext()
```

Using a reference implementation does not make every design decision disappear. It removes low-level numeral-system arithmetic from our application, but the application must still define ordering domains, triggers, boundary policies, rebalance state, and concurrency.

---

## The First Design Decision: What Is Being Ordered?

Before discussing buckets, we must define the set inside which ranks are comparable.

In a flat Jira rank field, the rank field identifies one ordered space. In our tree, ranks do not order the entire tree. They order siblings.

Consider:

```text
Root
├── A
│   ├── A1
│   └── A2
└── B
    ├── B1
    └── B2
```

The ranks of `A` and `B` are comparable. The ranks of `A1` and `A2` are comparable. The rank of `A1` has no ordering relationship with the rank of `B1`.

The ordering domain is therefore:

```ts
type OrderingDomain = {
  treeId: string
  parentId: string | null
}
```

`parentId = null` identifies the root list. Every actual item identifies a separate potential domain for its children.

This produces an important result:

```text
Root items:    bucket 1
Children of A: bucket 0
Children of B: bucket 2
```

There is no conflict. The complete rank is only compared inside its domain.

> **🖼 Figure suggestion — `fig-ordering-domains.svg`**
> **Draw:** the `Root / A / B / A1 A2 / B1 B2` tree, but with each sibling list boxed as its own **ordering domain** and tinted a different colour: the root list (A, B), A's children (A1, A2), and B's children (B1, B2). Label each box with its own bucket (e.g. root = bucket 1, A's children = bucket 0, B's children = bucket 2) to show buckets are per-domain. Add a green "✓ comparable" arrow between A1 and A2, and a red "✗ never compared" arrow between A1 and B1, to drive home that ranks only mean something within one box.

It also changes the cost model. A tree can contain one million nodes while its largest sibling list contains fifty items. A full rebalance of that sibling domain rewrites fifty ranks, not one million.

This parent-scoped model is our adaptation for a hierarchical application. It should not be presented as a claim that Jira itself creates a bucket context for every arbitrary tree parent.

---

## Anatomy of a Complete Rank

The reference implementation produces values such as:

```text
0|0i0000:
1|0i0000:
2|0i0000:
```

The prefix before `|` is the bucket. The remaining part is the rank body.

> **🖼 Figure suggestion — `fig-rank-anatomy.svg`**
> **Draw:** a single rank string, e.g. `1 | 0i0000 :`, blown up large with call-out labels pointing at each part: the leading `1` labelled **bucket** (0/1/2), the `|` as a **separator**, `0i0000` labelled **rank body (base‑36)**, and the trailing `:` labelled **integer/decimal marker**. Underneath, a small horizontal number line showing the three buckets as adjacent bands — everything in bucket 0 sorts before bucket 1 before bucket 2 — to make "the whole string sorts" visually obvious.

The complete string participates in ordering. Consequently, all bucket-0 values sort before bucket-1 values, which sort before bucket-2 values.

The reference implementation uses a base-36 numeral system and a decimal-like rank representation. Its minimum and maximum markers are formatted like:

```text
0|000000:
0|zzzzzz:
```

The same numerical body can be moved to another bucket:

```ts
const rankInBucket1 = rankInBucket0.inNextBucket()
```

Atlassian's public documentation confirms that Jira uses three buckets—0, 1, and 2—and that balance transitions follow the cycle `0 → 1 → 2 → 0`. The public Javadoc also describes a single balance operation as moving one rank row between buckets. It does not publish every internal calculation or every concurrent insertion branch. Those distinctions matter later.

---

## Why Midpoints Eventually Become Dense

Assume that two ranks have substantial space between them:

```text
A    0|a00000:
B    0|m00000:
```

Inserting between them is easy. Repeatedly inserting into the same half of the same interval is different:

```text
0|a00000:
0|a00000:i
0|a00000:i0000:i
...
0|m00000:
```

The exact strings depend on the implementation, but the structural result is universal: fractional precision grows because each insertion consumes part of the remaining interval.

A longer rank is not immediately incorrect. Lexicographic ranks are specifically designed to extend when necessary. Rank length is, however, an operational signal. At some threshold, storage, indexes, comparison cost, and maximum field length make continued growth undesirable.

Atlassian's current Data Center support article documents version-dependent Jira behavior in terms of maximum rank length. For newer versions it describes a scheduled balance at 128–159 characters, an immediate balance at 160–253 characters, and failure only for operations that would produce values beyond the supported maximum. These are Jira product thresholds, not universal constants for every LexoRank-like system.

For our tree, the trigger should be measured per sibling domain:

```sql
SELECT MAX(LENGTH(rank))
FROM item
WHERE tree_id = :treeId
  AND parent_id = :parentId;
```

One dense branch should not force maintenance of unrelated branches.

---

## Level One: Partial Rerank by Boundaries

The cheapest repair is local.

Suppose an insertion or a deliberate manual edit creates a collision:

```text
Item K    0|0g0000:
Item M    0|0i0000:
Item X    0|0i0000:
Item N    0|0k0000:
Item P    0|0m0000:
```

`M` and `X` have equal ranks. A uniqueness constraint would reject this state in a production database, but it is useful in the demo because it makes the repair window visible.

The partial algorithm is:

1. Locate the selected row in its ordered sibling domain.
2. Walk across the entire equal or dense run.
3. Find the first strictly smaller row and include it as the left affected boundary.
4. Find the first strictly greater row and include it as the right affected boundary.
5. Keep the rows immediately outside that window fixed as external anchors.
6. Redistribute only the affected window between those anchors.
7. Commit the small set of replacements atomically.

In the example, `K`, `M`, `X`, and `N` may be rewritten while `P` and every other domain remain unchanged.

The demo generates the replacement ranks through recursive midpoint subdivision:

```ts
function fill(
  start: number,
  end: number,
  lower: LexoRank,
  upper: LexoRank,
) {
  if (start >= end) return

  const index = Math.floor((start + end) / 2)
  const middle = lower.between(upper)

  result[index] = middle
  fill(start, index, lower, middle)
  fill(index + 1, end, middle, upper)
}
```

This is deliberately built on the library's `between()` operation. We do not reintroduce a separate BigInt rank engine.

The generated gaps are broadly distributed but not claimed to be mathematically identical. For a small repair window, the goal is useful headroom with a bounded write set.

If `k` items are repaired, the persistent cost is `k` rank updates. Locating the interval can be close to `O(k)` when the database already returns the domain in rank order. The in-memory demo sorts the sibling array first, so its planning cost also includes that sort.

### Expanding the window

A collision is only one trigger. A valid interval can also be too *dense*: every rank is unique and well-formed, but the bodies have grown long because insertions kept subdividing the same interval. There are really three distinct conditions to keep separate:

- **syntactically invalid** — the value does not parse; reject it outright;
- **duplicate** — two rows share a rank; repair the equal-rank run;
- **valid but dense** — the ranks are fine individually, but the region has run low on cheap headroom.

The demo detects the third case with a simple proxy: the length of a rank's base-36 body. Freshly balanced ranks stay short (a six-character integer body addresses billions of positions), so a body noticeably longer than that baseline is the operational signal of a hot interval. The repair seeds a window at the selected row and expands outward across every neighbouring row that is duplicate, dense, or in the wrong bucket, stopping at the first healthy short rank on each side. Those healthy rows become the fixed external anchors, so redistribution lands the whole region back in short, well-spaced ranks.

> **🖼 Figure suggestion — `fig-partial-rerank.svg`**
> **Draw:** a before/after of one sibling list rendered as a horizontal number line. **Before:** two short "healthy" anchor rows at the edges, and between them a cluster of rows whose ranks are visibly long (draw them crammed together with long strings) — the dense run. **After:** the same two anchors unchanged (highlight them as fixed), with the middle rows now evenly spaced and short again. Annotate that only the rows between the anchors were rewritten, and the anchors themselves never moved. A small inset can show the escalation case: if the anchors are too far apart (window > 256), the arrow points to "full rerank" instead.

Crucially the window has a hard maximum:

```text
expansion signal:        rank body length above the healthy baseline
maximum expanded window: PARTIAL_RERANK_MAX_WINDOW (256 rows in the demo)
past the maximum:         escalate to a full rerank of the domain
```

The exact limit depends on transaction latency and write capacity. The important rule is that partial repair has a maximum. Otherwise a supposedly local operation gradually becomes an unbounded full rewrite without the operational protections of a full rebalance — so past the cap the demo throws rather than proceeding, and the UI points the user at the full rerank instead.

Atlassian has a public, unresolved suggestion for localized LexoRank rebalancing, [JSWSERVER-16471](https://jira.atlassian.com/browse/JSWSERVER-16471). The issue explicitly describes cases where long values are concentrated in a small region while Jira's full balance touches the entire rank space. Our partial algorithm is an application-level exploration of that general idea, not a claim that Jira currently implements this exact boundary procedure.

---

## Why We Still Need a Full Rerank

Local repair is the preferred first response, but it cannot guarantee that every domain remains healthy forever.

A full domain rerank becomes appropriate when:

- repeated hot-spot insertion exhausts newly created local space;
- the local window grows beyond its transaction limit;
- rank bodies exceed a configured safety threshold;
- many separated dense regions exist;
- historical corruption makes local boundaries unreliable;
- an integrity scan requests full normalization.

The full operation generates a fresh target rank for every item in one ordering domain.

For the demo's root list:

```text
before
A  0|old-a
B  0|old-b
C  0|old-c

after
A  1|new-a
B  1|new-b
C  1|new-c
```

All three rows change. The bucket makes that rewrite manageable online; it does not make the rewrite disappear.

---

## What Buckets Actually Solve

Without buckets, a full rerank is naturally expressed as one large transaction:

```text
lock domain
rewrite every rank
commit
```

For a large domain, this holds locks for too long and creates a difficult failure boundary.

Buckets allow a different protocol:

```text
select destination bucket
calculate target ranks
migrate a bounded number of rows
commit
repeat
```

The total number of rank writes remains `O(n)`. Buckets transform one large transaction into many small, resumable operations.

The operational benefits are:

- bounded lock scope;
- throttled database load;
- progress reporting;
- resumability after process failure;
- continued read availability;
- in a carefully coordinated implementation, continued ranking availability.

The cost remains:

- every row in the domain receives a new rank;
- every affected index entry changes;
- downstream search indexes or caches may also need updates;
- a large domain still produces write amplification.

Atlassian documents this effect directly: its support material states that a rebalance updates and reindexes every issue in the affected Jira rank field, and that the resulting read/write amplification can affect a Data Center cluster.

So the concise conclusion is:

> Buckets solve availability and operational safety, not write amplification.

---

## Generating Balanced Destination Ranks

If a domain contains `X` items and a fixed-width base-`N` rank body provides `N^L` values, a proportional distribution can be derived as:

```text
capacity = N^L
maximum  = capacity - 1

position(i) = floor(i × maximum / (X + 1))
```

for `i = 1 ... X`.

The division by `X + 1` reserves a gap before the first item and after the last item. Integer flooring makes the distances differ by at most one numerical unit.

This derivation is useful for understanding capacity and deliberate headroom. It should not be presented as Jira's published internal formula; Atlassian describes redistribution but does not publish the complete private spacing arithmetic.

The demo takes a different implementation route. It asks the reference library for the minimum and maximum sentinels of the destination bucket and recursively subdivides the interval with `between()`.

This has several advantages for a proof of concept:

- all rank arithmetic stays inside the reference library;
- results are monotonic and unique;
- the full interval is used;
- no second custom encoder must be maintained;
- the same primitive powers midpoint insertion, partial repair, and full targets.

The trade-off is that the gaps are balanced by recursive subdivision rather than by the exact proportional integer formula. They can differ by roughly a factor of two. That is sufficient to restore substantial headroom, and concurrent inserts would make a perfectly equal distribution temporary anyway.

---

## Migration Direction Preserves One Boundary

The destination bucket's lexical position determines migration direction.

For `0 → 1` and `1 → 2`, the destination bucket sorts after the source bucket. The valid intermediate layout is:

```text
source prefix | destination suffix
```

Therefore the migration proceeds from tail to head:

```text
initial
A 0|...
B 0|...
C 0|...
D 0|...

step 1
A 0|...
B 0|...
C 0|...
D 1|target-d

step 2
A 0|...
B 0|...
C 1|target-c
D 1|target-d
```

For `2 → 0`, the destination bucket sorts before the source bucket. The layout reverses:

```text
destination prefix | source suffix
```

Migration proceeds from head to tail:

```text
initial
A 2|...
B 2|...
C 2|...

step 1
A 0|target-a
B 2|...
C 2|...
```

This preserves one contiguous mixed-bucket boundary.

Atlassian's public Javadoc describes the same three-bucket cycle, moving one row per balance operation, and acquiring locks on the row being moved plus the rows around its destination. It also distinguishes moving to a greater bucket from moving from the largest bucket to the smallest.

---

## The Mixed-Bucket Insertion Problem

During migration, two neighboring rows can belong to different buckets:

```text
P  0|h00000:
N  1|k00000:
```

There is no ordinary midpoint across the complete strings. The bucket boundary is not a continuous part of the rank body.

When both destination neighbors are in the same bucket, insertion is straightforward:

```text
0|a...  0|b...  → insert into bucket 0
1|a...  1|b...  → insert into bucket 1
```

At the mixed boundary, the application needs an explicit policy. The policy used in our design is:

> Insert into the source bucket and let the balancer migrate the new row later.

For `0 → 1`, generate after the last source row and before the maximum source marker. For `2 → 0`, generate before the first source row and after the minimum source marker.

This keeps user operations from advancing the destination boundary unexpectedly. It may add one more row for the balancer to migrate.

The public Atlassian material establishes that ranking and balancing require coordination, but it does not document the exact internal branch Jira uses for every insertion at a mixed boundary. Therefore the source-bucket rule is identified here as an engineering policy, not an assertion about undisclosed Jira code.

The browser demo completes its in-memory root migration quickly and disables conflicting drag/edit/partial controls while it runs. This makes bucket progress visible without pretending to implement database isolation. A backend implementation that permits concurrent ranking must implement the mixed-boundary policy and transactional coordination explicitly.

---

## Moving a Tree Node

The moved item's old bucket does not determine its new rank.

Suppose `A2` moves from the children of `A` into the children of `B`:

```text
before
A children: A1 0|..., A2 0|...
B children: B1 2|..., B2 2|...
```

After dropping `A2` between `B1` and `B2`:

```text
A children: A1 0|...
B children: B1 2|..., A2 2|..., B2 2|...
```

Only the rank of `A2` changes. Its new rank belongs to `B`'s child ordering domain.

The children of `A2` remain untouched. Their ranks belong to a different domain whose owner is `A2` itself.

Put simply, there are two rules:

- An item's rank only means something **next to its siblings** — the other children of the same parent.
- Each item **owns the list of its own children**, which is a separate ordering space.

That is why moving an item is cheap. It gets one new rank in its new parent's list, and its own children come along untouched: their ranks live in the moved item's private list, not in the parent's.

---

## Sparse Context State

An independent domain needs a stable bucket and an active-operation record during full migration. A naive implementation could create one state row for every non-empty sibling list.

That is wasteful for a sparse tree. Many nodes have no children; many other sibling lists will remain small and never leave bucket 0.

We can use a sparse convention:

```text
no context row
  = stable bucket 0
  = no active operation
```

Create an explicit record only when:

- a full rebalance is scheduled or begins;
- the domain completes into bucket 1 or 2;
- a failed operation needs recovery;
- future non-default configuration requires persistence.

A conceptual record — the demo calls it `OrderingState` (see `src/ranking/types.ts`) — is:

```ts
type OrderingState = {
  domainKey: string
  stableBucket: 0 | 1 | 2
  operation: null | {
    status: 'scheduled' | 'running' | 'failed'
    sourceBucket: 0 | 1 | 2
    destinationBucket: 0 | 1 | 2
    direction: 'head-to-tail' | 'tail-to-head'
    processed: number
    total: number
  }
  version: number
}
```

The demo's concrete type is a leaner version of this — same idea, fewer fields (`domainId`, `stableBucket`, `operation`, `version`). A backend would use a monotonically increasing integer `version` for optimistic concurrency, exactly as the compare-and-swap examples below rely on.

For the tree:

```text
tree-1:root       → root ordering context
tree-1:parent:A   → children of A
tree-1:parent:B   → children of B
```

### Why keep a record after bucket 1 or 2 is established?

If a non-empty domain contains:

```text
1|abc
1|def
```

and the record is deleted, a new insertion may incorrectly assume bucket 0:

```text
0|xyz   ← sorts before every existing bucket-1 row
```

The established nonzero bucket must therefore remain explicit while the domain remains populated.

### Empty domains return to the default

An empty list has no ranks that must remain compatible with an old bucket. If every child is removed, the context can be deleted or reset to bucket 0.

The next inserted child receives a bucket-0 middle rank.

The cleanup must be transactional in a backend:

1. Lock or version-check the context.
2. Confirm that no items exist in the domain.
3. Clear any operation.
4. Delete or reset the context.
5. Commit.

An insertion into the same domain must coordinate with the same lock or version. Otherwise one process can observe an empty list while another inserts using the old nonzero bucket.

In the frontend demo, the context map starts empty. Partial reranking does not add records. The root Full rerank button creates the root context while migration runs, retains it after transitions into bucket 1 or 2, and removes it after the `2 → 0` cycle returns to the implicit default.

---

## Scheduling Exactly One Full Rebalance

Checking for an active operation and then creating one in two independent statements is unsafe:

```text
worker A reads idle
worker B reads idle
worker A schedules
worker B schedules
```

The fix is a single atomic "claim the domain" step, keyed by the domain. As pseudocode:

```text
atomically, for this domainKey:
  if no context exists:
      create { stableBucket: 0, operation: scheduled(0 → 1), version: 1 }
      → claimed
  else if the context has no active operation:
      set operation = scheduled(stableBucket → nextBucket)
      bump version
      → claimed
  else:
      → already busy; do nothing
```

The invariant is what matters, not the mechanism: one atomic step either acquires the domain or reports that another operation already owns it. A backend expresses this with whatever compare-and-swap its store provides; the browser demo simply runs one migration at a time and disables the controls that could start a second.

One practical note that survives the move to a backend: identify each domain by a single string key such as `tree-1:root` or `tree-1:parent:A`. It sidesteps the awkward "the root parent is null" case that a two-column `(treeId, parentId)` key runs into.

---

## Transactional Ranking During a Rebalance

A production insertion or move should not independently read stale neighbors and stale context state.

A safe pessimistic outline is:

1. Lock the rank context or acquire its current version.
2. Read and lock the previous and next rows.
3. Confirm that they are still adjacent.
4. Choose a bucket from the operation state and destination interval.
5. Generate the rank.
6. Insert or update the row.
7. Commit.

An optimistic alternative reads a context version and retries if it changes:

```text
read context version 17
read neighbors
calculate rank
write only if context version is still 17
otherwise retry
```

The database should also enforce uniqueness for the complete rank inside the ordering domain:

```sql
UNIQUE(domain_key, full_rank)
```

If two concurrent inserts calculate the same value, one succeeds and the other retries with fresh neighbors.

The balancer must use a compatible lock order. Inconsistent ordering between user operations and maintenance operations creates deadlock risk even if both are individually transactional.

---

## When Each Rerank Fires

Midpoint insertion, partial rerank, and full rerank are not competing systems. They fire in order, and each heavier step runs only when the cheaper one below it runs out of room. Concretely, an insertion or move flows through these steps:

1. **Insert the normal way.** Generate one midpoint rank between the item's new neighbours and write that single row. Almost every operation stops here.

2. **Look at the rank you just produced.** If its body is still short, you are done. If it has grown past the length threshold, this interval is getting dense and needs repair.

3. **Try a partial rerank — but count as you go.** Walk outward from the dense spot toward the nearest healthy row on each side, which will serve as the fixed anchors, keeping a running count of the rows inside that window. If the window stays under the maximum, redistribute it and stop: the repair is local and fits in one transaction.

4. **If a boundary is too far away, escalate.** If the nearest healthy anchor is so distant that the window would exceed the maximum, cancel the partial rerank and run a full rerank of that one sibling domain instead. This is the rare, heavier path — and the reason full rerank exists.

So the length threshold in step 2 is what decides *whether* to repair, and the window count in step 3 is what decides *which* repair — partial or full.

> **🖼 Figure suggestion — `fig-escalation-flow.svg`**
> **Draw:** a top-to-bottom flowchart of the four steps. Box 1 "Insert midpoint (1 write)" → diamond "rank too long?" with a **No → done** exit. **Yes** flows to box "Partial rerank: expand window to nearest healthy anchors" → diamond "window ≤ max?". **Yes → redistribute window (k writes), done.** **No → Full rerank of the whole sibling domain (n writes).** Keep the happy path (the No-at-step-2 exit) visually dominant to reinforce that almost every operation stops at step 1.

When step 2's check runs is an implementation choice: right after each insertion that crosses the threshold, on a scheduled maintenance pass for the affected domain, during a periodic integrity scan, or from a manual admin action. The timing is less important than the invariants: a partial repair must stay small enough for one transaction, while a full rerank needs explicit state, progress, recovery, and coordination.

---

## Cost Model

The three maintenance levels have different write costs:

| Operation | Rank rows rewritten | Purpose |
|---|---:|---|
| Midpoint insert or move | 1 | Normal path |
| Partial boundary rerank | `k` | Repair one dense interval |
| Full bucket rerank | `n` in one domain | Rare fallback |

The normal operation is constant with respect to list length. It is not accurate to call the complete system unconditionally `O(1)`, because collision retries and maintenance work still exist.

A better description is:

- normal writes are `O(1)`;
- local maintenance is bounded by `k`;
- full maintenance is `O(n)` but rare, incremental, and limited to one ordering domain.

For systems where even that full rewrite is unacceptable, alternative representations exist:

- an append-only shadow rank generation followed by an atomic generation-pointer switch;
- block rank plus within-block rank, conceptually closer to a B-tree;
- segmented ordering with local block splits.

These approaches move complexity into queries, joins, garbage collection, and block management. Buckets remain an attractive design when simple `ORDER BY rank` queries and direct row ownership are important.

---

## Walking Through the Demo

The extended proof of concept keeps the original virtualized tree and adds four experiments.

### 1. Break a rank deliberately

Click any displayed rank. The text becomes an input containing the complete value.

Copy a sibling's rank and press Enter. The demo allows the duplicate and applies a deterministic item-id tie-breaker so rendering remains stable.

Syntactically invalid values are rejected. This keeps deliberate corruption precise rather than allowing an unparsable value to crash every sort.

### 2. Repair a collision

Click **Partial rerank** on one of the duplicated rows.

The application finds the equal-rank run, includes the adjacent boundary rows, keeps the external anchors fixed, and rewrites only that small window. The status message reports the number of affected siblings and their positions in the domain.

### 3. Create and repair a dense interval

Manually editing enough neighbouring rows into a dense state is tedious, so the header has a **Densify root** button. It inserts a short run of long, adjacent ranks into a single root interval — the same shape a hot spot accumulates when insertions repeatedly target one gap over time. (Reaching those lengths through real midpoint insertion takes many operations; the button just fast-forwards to the interesting state.)

Now click **Partial rerank** on any row inside that run. The repair walks the whole dense run using the rank-body-length signal, pulls in one healthy boundary row on each side as fixed anchors, and redistributes the entire region into short, well-spaced ranks. The status message shows that **more than the target's two neighbours** were rewritten — the affected count is bounded by the size of the dense region, not fixed at three. This is the behaviour the earlier "expanding the window" section describes, made visible.

If the dense region ever grows past the configured maximum window, partial repair refuses and directs you to a full rerank instead, so a "local" operation can never silently become an unbounded rewrite.

### 4. Migrate a domain

Click **Full rerank (root)** to migrate the root list, or **Rerank children** on any parent row to migrate that parent's child domain. Only the chosen domain advances to the next bucket; every other domain keeps its independent bucket value. This makes the domain boundary visible directly in the table.

The browser processes bounded batches per animation frame. That batching models throttling and keeps a large in-memory tree responsive; it is not a substitute for backend transactions.

Click the action repeatedly to observe:

```text
0 → 1: tail to head
1 → 2: tail to head
2 → 0: head to tail
```

After the third transition, the domain's context returns to implicit bucket 0 and its sparse state record disappears.

---

## What the Demo Does Not Prove

The demo is intentionally frontend-only. It demonstrates rank mathematics, domain boundaries, bucket direction, sparse context lifecycle, and operation progress.

It does not demonstrate:

- database row locks;
- cross-node scheduling;
- transaction retries;
- leases and heartbeats;
- crash recovery;
- concurrent ranking at a mixed-bucket boundary;
- replication or search-index amplification.

Those are not optional details in a production implementation. They are the difference between a mathematically ordered list and an operational ranking service.

---

## Conclusion

Midpoint generation is the elegant part of LexoRank, but the maintenance protocol is the part that makes it durable.

The complete strategy developed here is:

- define the ordering domain before assigning ranks;
- use a tested reference implementation for rank arithmetic;
- generate one midpoint rank on the normal path;
- repair dense regions locally by finding boundaries;
- cap the local window;
- use a full bucket migration only as a fallback;
- migrate in the direction that preserves one contiguous bucket boundary;
- store explicit state only for active or non-default contexts;
- reset an empty domain to the implicit bucket-0 default;
- coordinate insertions, moves, and balancing through one transactional context.

The most important conclusion is not about a particular alphabet or string format:

> Local reranking and bucket-based rebalancing are two levels of the same maintenance strategy.

The first keeps the common repair cheap. The second ensures that even a full rewrite can happen as a controlled online operation.

This continues the architectural theme of the original drag-and-drop article. Complex UI behavior becomes easier to reason about when the state model is made explicit. In the first article, that meant moving drag logic from DOM mutation into application state and geometry. Here, it means moving rank maintenance from an implicit string trick into explicit domains, boundaries, buckets, and operation state.

---

## References

- Alexey Kuznetsov, [Data-Driven Drag-and-Drop in Vue: A Virtualized 100K Row Tree](https://www.linkedin.com/pulse/data-driven-drag-and-drop-vue-virtualized-100k-row-tree-kuznetsov-mjpuf/)
- kvandake, [`lexorank-ts`](https://github.com/kvandake/lexorank-ts), TypeScript reference implementation
- Atlassian, [LexoRankBalanceOperation Javadoc](https://docs.atlassian.com/jira-software/10.4.0/com/atlassian/greenhopper/service/lexorank/balance/LexoRankBalanceOperation.html)
- Atlassian Support, [Troubleshooting LexoRank System Issues](https://support.atlassian.com/jira/kb/troubleshooting-lexorank-system-issues/)
- Atlassian Support, [Understanding and Managing LexoRank in Jira Server](https://support.atlassian.com/jira/kb/understanding-and-managing-lexorank-in-jira-server/)
- Atlassian, [JSWSERVER-16471: Add option to do local Lexorank rebalancing](https://jira.atlassian.com/browse/JSWSERVER-16471)
- Atlassian Support, [Jira Software Data Center Lexorank Indexing Lag](https://support.atlassian.com/jira/kb/jira-software-data-center-lexorank-indexing-lag/)
