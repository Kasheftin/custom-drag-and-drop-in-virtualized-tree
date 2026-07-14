# Publication Asset Manifest

## Article figures

All article figures are 1600 × 900 SVGs and are referenced directly from
`docs/PUBLICATION_DRAFT.md`.

- [`publication/fig-ordering-domains.svg`](./publication/fig-ordering-domains.svg)
- [`publication/fig-rank-anatomy.svg`](./publication/fig-rank-anatomy.svg)
- [`publication/fig-partial-rerank.svg`](./publication/fig-partial-rerank.svg)
- [`publication/fig-escalation-flow.svg`](./publication/fig-escalation-flow.svg)
- [`publication/contact-sheet.png`](./publication/contact-sheet.png) — review-only composite

## Main publication hero

- [`publication/hero-lexorank-1920x1080.png`](./publication/hero-lexorank-1920x1080.png) — recommended
  high-resolution LinkedIn upload master.
- [`publication/hero-lexorank-632x355.png`](./publication/hero-lexorank-632x355.png) — exact requested
  display-size derivative.
- [`publication/hero-lexorank-background.png`](./publication/hero-lexorank-background.png) — generated
  artwork without typography.
- [`publication/hero-lexorank-overlay.svg`](./publication/hero-lexorank-overlay.svg) — deterministic
  typography and editorial overlay source.

The two final files share an effectively identical 16:9 crop. The master follows LinkedIn's current
1920 × 1080 article-cover recommendation; the smaller derivative is useful for previewing the
632 × 355 rendered size.

## LinkedIn carousel

- Nine PNG files in [`carousel/`](./carousel), each exactly 1080 × 1350 px.
- [`carousel/lexorank-carousel.pdf`](./carousel/lexorank-carousel.pdf) — nine equal-size pages with
  four secure hyperlink annotations on page 9.
- [`carousel/links.json`](./carousel/links.json) — editable link destinations used by the PDF build.
- [`carousel/contact-sheet.png`](./carousel/contact-sheet.png) — review-only composite.
- [`carousel/render.html`](./carousel/render.html) — deterministic HTML/CSS source for all slides.
- [`carousel/source/demo-ui.png`](./carousel/source/demo-ui.png) — real local-demo screenshot used on slide 8.

The PDF is generated without Canva by running `pnpm carousel:pdf`. Its pages remain flattened PNG
artwork; interactivity is added at the PDF annotation layer so the visible carousel design does not
depend on a converter preserving SVG anchors.

## Visual system

- Background: midnight navy (`#071522`).
- Bucket 0: teal (`#1ec8bb`).
- Bucket 1: orange (`#ff9b52`).
- Bucket 2: violet (`#8b7cf6`).
- Article canvas: warm paper (`#f7f4ec`).
- Rank strings: system monospace (`Cascadia Mono` / `Consolas`).

## Generated artwork

`generated/hero-drag-ordering.png` is the non-text illustration used on slide 1. All typography,
rank values, diagrams, and labels are rendered deterministically in HTML/CSS or SVG.

Prompt:

> Create a premium editorial technology illustration for a professional LinkedIn carousel about
> persistent ordering and LexoRank. Portrait 4:5 composition, no text, letters, numbers, or logos.
> Show a dark software interface with one list row lifted toward a luminous insertion gap. Beneath
> it, add subtle database-table layers and fine grid lines. Use restrained teal, warm orange, and
> violet accents, precise vector-meets-3D styling, and strong negative space for a headline.

The main publication hero uses a second generated background with a wide 16:9 composition: a dense
orange rank interval fans into three spacious teal, orange, and violet ordering lanes, with the left
45% reserved for editorial copy. Its final title and supporting copy come from the SVG overlay so
the words and bucket cycle remain exact.
