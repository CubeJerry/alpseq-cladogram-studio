'use strict';

const state = {
  trees: [],
  activeIndex: -1,
  styled: null,
  importName: '',
  toastTimer: null,
  plotlySource: null,
};

const $ = (id) => document.getElementById(id);
const ui = {};

const PRESETS = {
  original: {
    page: null, plot: null, branch: null, leaf: null, text: null, grid: null,
  },
  dark: {
    page: '#0a0a0f', plot: '#12121a', branch: '#d4d4d8', leaf: '#f59e0b', text: '#fafafa', grid: '#343440',
  },
  publication: {
    page: '#ffffff', plot: '#ffffff', branch: '#27272a', leaf: '#b45309', text: '#18181b', grid: '#e4e4e7',
  },
  mono: {
    page: '#ffffff', plot: '#ffffff', branch: '#111111', leaf: '#111111', text: '#111111', grid: '#d4d4d4',
  },
};

window.addEventListener('DOMContentLoaded', () => {
  cacheUi();
  bindEvents();
  syncOutputs();
});

function cacheUi() {
  [
    'fileInput', 'dropZone', 'loadDemoButton', 'emptyOpenButton', 'treeSelect', 'treeCountBadge',
    'importStatusDot', 'workspaceHeading', 'emptyState', 'plot', 'exportButton', 'exportMenu',
    'downloadDataButton', 'inspectButton', 'inspectDialog', 'inspectPre', 'closeInspectButton',
    'payloadHash', 'toast', 'resetButton', 'presetSelect', 'widthInput', 'heightInput',
    'marginInput', 'paddingInput', 'orientationSelect', 'lineWidthInput', 'markerSizeInput',
    'opacityInput', 'lineShapeSelect', 'branchColorInput', 'leafColorInput', 'leafOutlineColorInput', 'fontSizeInput',
    'fontSelect', 'textColorInput', 'titleInput', 'showLabelsInput', 'showLegendInput',
    'showHoverInput', 'showAxesInput', 'pageColorInput', 'plotColorInput', 'gridColorInput',
    'widthOutput', 'heightOutput', 'marginOutput', 'paddingOutput', 'lineWidthOutput',
    'markerSizeOutput', 'opacityOutput', 'fontSizeOutput', 'dataSummary', 'integrityBar',
  ].forEach((id) => { ui[id] = $(id); });
}

function bindEvents() {
  ui.fileInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) loadFile(file);
    event.target.value = '';
  });
  ui.emptyOpenButton.addEventListener('click', () => ui.fileInput.click());
  ui.loadDemoButton.addEventListener('click', loadDemo);

  ['dragenter', 'dragover'].forEach((name) => ui.dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    ui.dropZone.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach((name) => ui.dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    ui.dropZone.classList.remove('dragover');
  }));
  ui.dropZone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) loadFile(file);
  });

  ui.treeSelect.addEventListener('change', () => selectTree(Number(ui.treeSelect.value)));
  ui.resetButton.addEventListener('click', resetControls);
  ui.presetSelect.addEventListener('change', () => {
    applyPreset(ui.presetSelect.value);
    renderActive();
  });

  const controlIds = [
    'widthInput', 'heightInput', 'marginInput', 'paddingInput', 'orientationSelect',
    'lineWidthInput', 'markerSizeInput', 'opacityInput', 'lineShapeSelect', 'branchColorInput',
    'leafColorInput', 'leafOutlineColorInput', 'fontSizeInput', 'fontSelect', 'textColorInput', 'titleInput',
    'showLabelsInput', 'showLegendInput', 'showHoverInput', 'showAxesInput',
    'pageColorInput', 'plotColorInput', 'gridColorInput',
  ];
  controlIds.forEach((id) => {
    const element = ui[id];
    element.addEventListener(element.type === 'text' ? 'input' : 'change', renderActive);
    if (element.type === 'range' || element.type === 'color') element.addEventListener('input', renderActive);
  });

  ui.exportButton.addEventListener('click', () => {
    ui.exportMenu.hidden = !ui.exportMenu.hidden;
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.export-menu')) ui.exportMenu.hidden = true;
  });
  ui.exportMenu.addEventListener('click', (event) => {
    const button = event.target.closest('[data-export]');
    if (!button) return;
    ui.exportMenu.hidden = true;
    exportStyled(button.dataset.export);
  });

  ui.downloadDataButton.addEventListener('click', downloadOriginalJson);
  ui.inspectButton.addEventListener('click', openInspector);
  ui.closeInspectButton.addEventListener('click', () => ui.inspectDialog.close());
  ui.inspectDialog.addEventListener('click', (event) => {
    if (event.target === ui.inspectDialog) ui.inspectDialog.close();
  });
}

async function loadFile(file) {
  try {
    setBusy(true, `Reading ${file.name}`);
    const text = await file.text();
    const lower = file.name.toLowerCase();
    let trees;
    if (lower.endsWith('.html') || lower.endsWith('.htm')) {
      trees = extractTreesFromHtml(text, file.name);
    } else if (lower.endsWith('.json')) {
      trees = extractTreesFromJson(text, file.name);
    } else if (/\.(fa|fasta|fas)$/.test(lower)) {
      trees = [buildTreeFromSequences(parseFasta(text), file.name)];
    } else {
      trees = extractTreesFromDelimited(text, file.name);
    }
    if (!trees.length) throw new Error('No cladogram-compatible Plotly widget or sequence table was found.');
    loadTrees(trees, file.name);
    toast(`Loaded ${trees.length} cladogram${trees.length === 1 ? '' : 's'} from ${file.name}`);
  } catch (error) {
    console.error(error);
    toast(error.message || 'The file could not be read.', true);
  } finally {
    setBusy(false);
  }
}

function extractTreesFromHtml(html, sourceName) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const scripts = [...doc.querySelectorAll('script[type="application/json"][data-for]')];
  const candidates = [];

  scripts.forEach((script, index) => {
    try {
      const payload = JSON.parse(script.textContent);
      const plotly = normalisePlotlyPayload(payload);
      if (!plotly?.data?.some(isLineTrace)) return;
      const widgetId = script.getAttribute('data-for');
      const widget = doc.getElementById(widgetId);
      const context = getWidgetContext(widget, index);
      const score = scoreTreeCandidate(plotly, context);
      if (score < 2) return;
      candidates.push(makeTreeRecord({ ...plotly, name: context.title, sourceName, sourceType: 'alpseq-html', context, score }));
    } catch (error) {
      console.warn('Skipped an unreadable htmlwidget payload.', error);
    }
  });

  // Some Plotly exports store JSON directly in a data attribute rather than htmlwidgets.
  [...doc.querySelectorAll('[data-plotly]')].forEach((element, index) => {
    try {
      const payload = JSON.parse(element.getAttribute('data-plotly'));
      const plotly = normalisePlotlyPayload(payload);
      if (!plotly?.data?.some(isLineTrace)) return;
      const context = getWidgetContext(element, scripts.length + index);
      if (scoreTreeCandidate(plotly, context) >= 2) {
        candidates.push(makeTreeRecord({ ...plotly, name: context.title, sourceName, sourceType: 'plotly-html', context }));
      }
    } catch (_) { /* ignore unrelated attributes */ }
  });

  if (!candidates.length && scripts.length) {
    // Last-resort compatibility: retain line-based Plotly widgets so the user can choose manually.
    scripts.forEach((script, index) => {
      try {
        const plotly = normalisePlotlyPayload(JSON.parse(script.textContent));
        if (!plotly?.data?.some(isLineTrace)) return;
        const context = getWidgetContext(doc.getElementById(script.getAttribute('data-for')), index);
        candidates.push(makeTreeRecord({ ...plotly, name: context.title, sourceName, sourceType: 'alpseq-html-fallback', context }));
      } catch (_) { /* ignore */ }
    });
  }

  return deduplicateTrees(candidates);
}

function normalisePlotlyPayload(payload) {
  const x = payload?.x || payload;
  const data = x?.data || payload?.data;
  const layout = x?.layout || payload?.layout || {};
  const config = x?.config || payload?.config || {};
  const frames = x?.frames || payload?.frames || [];
  if (!Array.isArray(data)) return null;
  return { data, layout, config, frames };
}

function getWidgetContext(widget, index) {
  let node = widget;
  let title = '';
  let contextText = '';
  for (let steps = 0; node && steps < 35; steps += 1) {
    node = previousNode(node);
    if (!node) break;
    const text = (node.textContent || '').trim().replace(/\s+/g, ' ');
    if (!text) continue;
    contextText = `${text} ${contextText}`.slice(0, 1000);
    if (!title && /^H[1-6]$/.test(node.tagName || '')) title = text;
    if (title && contextText.length > 300) break;
  }
  return {
    title: title || `Detected tree ${index + 1}`,
    text: contextText,
  };
}

function previousNode(node) {
  if (node.previousElementSibling) {
    let candidate = node.previousElementSibling;
    while (candidate.lastElementChild) candidate = candidate.lastElementChild;
    return candidate;
  }
  return node.parentElement;
}

function scoreTreeCandidate(plotly, context) {
  const keywordText = `${context.title} ${context.text} ${plotly.layout?.title?.text || plotly.layout?.title || ''}`.toLowerCase();
  let score = 0;
  if (/cladogram|dendrogram|phylo|tree of|abundance tree|top 100|enriched cluster|round \d/.test(keywordText)) score += 5;
  const lineTraces = plotly.data.filter(isLineTrace);
  const markerTraces = plotly.data.filter(isMarkerTrace);
  if (lineTraces.length) score += 1;
  if (markerTraces.length) score += 1;
  const linePoints = lineTraces.reduce((sum, trace) => sum + Math.max(trace.x?.length || 0, trace.y?.length || 0), 0);
  if (linePoints > 25) score += 1;
  if (plotly.layout?.xaxis?.visible === false || plotly.layout?.yaxis?.visible === false ||
      plotly.layout?.xaxis?.showticklabels === false || plotly.layout?.yaxis?.showticklabels === false) score += 1;
  if (/pca|principal component|scatter plot/.test(keywordText)) score -= 5;
  if ((plotly.layout?.height || 999) < 180 && linePoints < 30) score -= 3;
  return score;
}

function extractTreesFromJson(text, sourceName) {
  const payload = JSON.parse(text);
  const objects = Array.isArray(payload) && payload.every((item) => item?.data) ? payload : [payload];
  return objects.map((item, index) => {
    const plotly = normalisePlotlyPayload(item);
    if (!plotly) throw new Error('JSON must contain Plotly data and layout objects.');
    return makeTreeRecord({ ...plotly, name: item.name || item.title || `Cladogram ${index + 1}`, sourceName, sourceType: 'plotly-json' });
  });
}

function extractTreesFromDelimited(text, sourceName) {
  const delimiter = detectDelimiter(text);
  const rows = parseDelimited(text, delimiter);
  if (!rows.length) throw new Error('The table is empty.');
  const columns = Object.keys(rows[0]);
  const lowerMap = new Map(columns.map((column) => [column.toLowerCase().trim(), column]));
  const xCol = findColumn(lowerMap, ['x', 'x_coord', 'xcoordinate']);
  const yCol = findColumn(lowerMap, ['y', 'y_coord', 'ycoordinate']);
  if (xCol && yCol) return [buildTreeFromCoordinates(rows, sourceName, lowerMap, xCol, yCol)];

  const sequenceCol = findColumn(lowerMap, [
    'sequence', 'aa_sequence', 'amino_acid_sequence', 'trimmed_aa_sequence', 'trimmed_nt_sequence',
    'nt_sequence', 'nucleotide_sequence', 'cdr3', 'cdr3_aa',
  ]);
  if (!sequenceCol) throw new Error(`No sequence column was found. Columns seen: ${columns.join(', ')}`);
  const labelCol = findColumn(lowerMap, ['id', 'name', 'sequence_id', 'clone', 'clone_id', 'cluster_lead', 'filename']);
  const entries = rows.map((row, index) => ({
    label: String(row[labelCol] || `Sequence ${index + 1}`),
    sequence: String(row[sequenceCol] || '').replace(/\s+/g, '').toUpperCase(),
    metadata: row,
  })).filter((entry) => entry.sequence);
  return [buildTreeFromSequences(entries, sourceName)];
}

function buildTreeFromCoordinates(rows, sourceName, lowerMap, xCol, yCol) {
  const traceCol = findColumn(lowerMap, ['trace', 'trace_id', 'group', 'series']);
  const modeCol = findColumn(lowerMap, ['mode']);
  const typeCol = findColumn(lowerMap, ['type']);
  const textCol = findColumn(lowerMap, ['text', 'label', 'name']);
  const groups = new Map();
  rows.forEach((row) => {
    const key = String(traceCol ? row[traceCol] : 'tree');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  const data = [...groups.entries()].map(([name, groupRows]) => ({
    type: typeCol ? groupRows[0][typeCol] || 'scatter' : 'scatter',
    mode: modeCol ? groupRows[0][modeCol] || 'lines' : 'lines',
    name,
    x: groupRows.map((row) => numberOrNull(row[xCol])),
    y: groupRows.map((row) => numberOrNull(row[yCol])),
    text: textCol ? groupRows.map((row) => row[textCol] || '') : undefined,
    customdata: groupRows,
    hovertemplate: textCol ? '%{text}<extra></extra>' : undefined,
  }));
  return makeTreeRecord({
    data,
    layout: defaultTreeLayout(sourceName.replace(/\.[^.]+$/, '')),
    config: { responsive: false, displaylogo: false },
    name: sourceName.replace(/\.[^.]+$/, ''), sourceName, sourceType: 'coordinate-table',
  });
}
