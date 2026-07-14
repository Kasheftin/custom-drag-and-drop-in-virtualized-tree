# Slide 4 — Ranks get dense

**Rendered image:** [`slide-04.png`](../assets/carousel/slide-04.png)

**Purpose:** Name the failure mode the whole article is about — density — and the three states.

**On-slide text**

- Headline: **Keep inserting in one spot and ranks grow long.**
- Body: A rank isn't wrong just because it's long — it's a signal the region is running out of room.
- Three labelled chips:
  - ❌ **Invalid** — doesn't parse → reject
  - ⚠️ **Duplicate** — two rows share a rank → repair
  - 🔶 **Dense** — valid but too long → repair

**Visual**

- A run of rows whose rank strings visibly get longer and longer (`…:z`, `…:zz`, `…:zzz`).
- The three chips as a small legend beneath.

**Notes**

- This is the conceptual pivot of the deck. The three-state chip row is worth making crisp.
- Simplified version of the `fig-partial-rerank` "before" state.
