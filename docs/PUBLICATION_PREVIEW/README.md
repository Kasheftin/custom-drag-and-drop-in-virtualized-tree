# LinkedIn Carousel Preview

A short teaser carousel for the deep-dive article
**"LexoRank Beyond the Midpoint: Buckets, Local Repair, and Online Rebalancing."**

Goal: give the scroll-stopping version of the idea in ~9 slides, then send people to the full
article and the interactive demo.

## How to use this folder

Each `slide-NN.md` is the spec for one slide, in order. Convert them into real slides in your tool
of choice (Figma / Canva / Google Slides / Keynote), export the deck as a **single PDF**, and upload
that PDF to LinkedIn as a document post — LinkedIn renders a multi-page PDF as a swipeable carousel.

Each spec has the same shape:

- **Purpose** — why the slide exists in the flow (not printed on the slide).
- **On-slide text** — the exact words to put on the slide. Keep them; carousels die from too much text.
- **Visual** — what to draw / show.
- **Notes** — layout, emphasis, or where to reuse an article figure.

## Deck settings (suggested)

- **Aspect ratio:** 4:5 portrait, **1080 × 1350 px** (fills the most feed height on mobile).
- **Slide count:** 9.
- **Type:** one big idea per slide. Headline large; supporting line small; almost no paragraphs.
- **Consistency:** reuse the article's bucket colours (bucket 0 / 1 / 2 as three consistent hues) and
  a monospace font for any rank strings like `0|0i0000:`.
- **Footer:** a small persistent handle/name + "1/9 … 9/9" page marker helps retention.

## Reusable figures

Slides 4, 6, and 7 can reuse the diagram concepts already specced inside `PUBLICATION_DRAFT.md`
(`fig-partial-rerank`, `fig-rank-anatomy`, `fig-escalation-flow`) — simplified to a single glanceable
idea each, since a carousel slide is read in ~2 seconds.

## Links to place on the final slide

- Full article: _(paste the LinkedIn article URL once published)_
- Interactive demo: _(paste the deployed demo URL)_
- Previous article: "Data-Driven Drag-and-Drop in Vue: A Virtualized 100K Row Tree"
