# Slide 5 — Fix #1: Partial rerank (local repair)

**Rendered image:** [`slide-05.png`](../assets/carousel/slide-05.png)

**Purpose:** First maintenance tool — repair just the crowded region, cheaply.

**On-slide text**

- Headline: **Repair only the crowded stretch.**
- Body: Find the healthy rows on either side, hold them fixed, and re-spread everything between them.
- Badge: rewrites **k rows**, not the whole list.

**Visual**

- Before/after on one line: a dense cluster between two "anchor" rows (locked icon) →
  the same rows evenly spaced and short again. Anchors unchanged.

**Notes**

- Reuse the `fig-partial-rerank` idea, trimmed to a single before/after.
- Emphasise the two locked anchors — that's the whole intuition.
