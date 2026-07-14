# Slide 2 — The naive way breaks

**Rendered image:** [`slide-02.png`](../assets/carousel/slide-02.png)

**Purpose:** Show why integer positions don't survive reordering — the problem everyone hits first.

**On-slide text**

- Headline: **Numbering rows 1, 2, 3… falls apart fast.**
- Body: Insert one row in the middle and you renumber everything after it. One move, hundreds of writes.

**Visual**

- A column `1 2 3 4 5`. A new row wedged between 2 and 3.
- Red arrows showing 3→4, 4→5, 5→6 … all shifting down. Label: "every following row rewritten."

**Notes**

- This is the "before." The rest of the deck is the fix.
- Keep the cascade of red shifts prominent — it's the pain point.
