# Slide 6 — Fix #2: Buckets & full rerank

**Purpose:** Second maintenance tool — when local repair isn't enough, migrate the whole domain safely.

**On-slide text**

- Headline: **When a whole list is exhausted, move it to a fresh bucket.**
- Body: The `bucket|body` prefix lets you rewrite an entire ordering domain online, in small batches.
- Cycle chip: **0 → 1 → 2 → 0**

**Visual**

- A rank string `0|0i0000:` with the leading `0` circled as the **bucket**.
- Three coloured lanes (bucket 0 / 1 / 2) with an arrow carrying a list from lane 0 to lane 1.

**Notes**

- Reuse the `fig-rank-anatomy` bucket call-out, minimised.
- Keep the three bucket colours consistent with the rest of the deck.
