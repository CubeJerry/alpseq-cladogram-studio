# AlpSeq Cladogram Studio

A static, GitHub Pages-ready web app for extracting, restyling, resizing and exporting the cladograms embedded in an [AlpSeq](https://github.com/kzeglinski/alpseq) analysis report.

The primary import path is the finished AlpSeq `.html` report. The app reads the embedded R `htmlwidgets` / Plotly JSON directly, then renders a deep-cloned copy. It does **not** recalculate the tree, reorder leaves, replace hover data or overwrite the imported payload.

## Why this preserves AlpSeq data

AlpSeq renders its final report with Quarto (`subworkflows/reporting.nf`). Its panning report template:

- creates a child section for each round from `_abundance_tree.qmd`;
- calls `make_interactive_tree_data(...)` to prepare tree and table data;
- calls `plot_interactive_tree(...)` to create the legend and interactive Plotly tree;
- embeds all report resources into one HTML file (`embed-resources: true`).

Cladogram Studio parses the inert `<script type="application/json" data-for="...">` payloads created by R htmlwidgets. Styling is applied to a separate clone, while **Original JSON** and **Inspect source data** always expose the untouched import.

## Features

- Import a complete AlpSeq HTML report and detect tree-like Plotly widgets.
- Select among round-specific abundance trees and enriched-cluster trees.
- Preserve trace arrays, labels, `customdata`, hover templates and original layout/config.
- Adjust figure width and height from 500–3200 px.
- Adjust margins, plot padding, orientation, branch width/shape, marker size, opacity, typography, labels, legend, hover and axes.
- Use dark amber, publication light, monochrome or original AlpSeq styling.
- Export PNG, SVG, styled Plotly JSON, untouched source JSON, or a **self-contained HTML** with Plotly embedded.
- Import Plotly JSON or coordinate CSV/TSV directly.
- Optional CSV/FASTA fallback: builds a browser-side UPGMA tree using normalised Levenshtein distance. This fallback preserves every input row in `customdata`, but is intentionally labelled as browser-generated rather than claimed to be an exact AlpSeq topology.
- No server, npm install, build step, analytics or data upload. Plotly.js is loaded from the official Plotly CDN.

## Run locally

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

## Deploy to GitHub Pages

The included workflow deploys the repository root whenever `main` is updated.

1. Open **Settings → Pages** in the GitHub repository.
2. Set **Source** to **GitHub Actions**.
3. Push to `main`, or run **Deploy static site to Pages** manually from Actions.

## Accepted inputs

### AlpSeq HTML

Preferred. The exact embedded Plotly payload is extracted.

### Plotly JSON

A single object containing `data`, `layout` and optionally `config`, or an array of such objects.

### Coordinate table

CSV/TSV columns containing at least `x` and `y`. Optional columns include `trace`, `mode`, `type`, `text` and `label`.

### Sequence table

CSV/TSV with a sequence column such as `sequence`, `aa_sequence`, `trimmed_nt_sequence`, `cdr3` or `cdr3_aa`. Common ID columns are detected automatically.

### FASTA

Standard nucleotide or amino-acid FASTA.

## Data safety

Files are read entirely in the browser using `File.text()` and `DOMParser`. Imported report scripts are never executed. The app does not send data to a backend.

## Repository layout

```text
index.html                  App shell
styles.css                  Minimalist dark design system
app.js                      Import, extraction, styling, clustering and export logic
Plotly.js                   Loaded from the official Plotly CDN
sample-data/                AlpSeq-style HTML and sequence CSV demos
.github/workflows/pages.yml GitHub Pages deployment
```

## Attribution

AlpSeq is developed by its original authors and licensed separately under GPL-3.0. This companion app does not contain AlpSeq pipeline code; it interoperates with the public report format. Plotly.js is Copyright Plotly, Inc. and licensed under MIT.
