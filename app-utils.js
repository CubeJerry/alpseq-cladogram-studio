async function loadDemo() {
  setBusy(true, 'Loading demo');
  try {
    const response = await fetch('sample-data/alpseq-demo-report.html?v=20260714-1');
    if (!response.ok) throw new Error('Demo fetch failed');
    const html = await response.text();
    const trees = extractTreesFromHtml(html, 'alpseq-demo-report.html');
    if (!trees.length) throw new Error('Demo contains no trees');
    loadTrees(trees, 'alpseq-demo-report.html');
    toast('Loaded two AlpSeq-style demo cladograms');
  } catch (error) {
    const tree = buildTreeFromSequences(demoSequences(), 'embedded-demo.fasta');
    loadTrees([tree], 'embedded-demo.fasta');
    toast('Loaded embedded demo');
  } finally {
    setBusy(false);
  }
}

function demoSequences() {
  return [
    ['Nb-01', 'QVQLVESGGGLVQAGGSLRLSCAASGRTFSSYAMGWFRQAPGKEREFVAAISWSGGSTYYADSVKGRFTISRDNAKNTVYLQMNSLKPEDTAVYYCAAGLPYDYWGQGTQVTVSS'],
    ['Nb-02', 'QVQLVESGGGLVQAGGSLRLSCAASGRTFSSYAMGWFRQAPGKEREFVAAISWSGGSTYYADSVKGRFTISRDNAKNTVYLQMNSLKPEDTAVYYCAAGLPYNYWGQGTQVTVSS'],
    ['Nb-03', 'QVQLVESGGGLVQAGGSLRLSCAASGRTFSSYAMGWFRQAPGKEREFVAAISWSGGSTYYADSVKGRFTISRDNAKNTVYLQMNSLKPEDTAVYYCAAGLPFDYWGQGTQVTVSS'],
    ['Nb-04', 'QVQLVESGGGLVQAGGSLRLSCAASGFTFSSYTMGWFRQAPGKEREFVAAISWSGGSTYYADSVKGRFTISRDNAKNTVYLQMNSLKPEDTAVYYCAAELRDPYWGQGTQVTVSS'],
    ['Nb-05', 'QVQLVESGGGLVQAGGSLRLSCAASGFTFSSYTMGWFRQAPGKEREFVAAISWSGGSTYYADSVKGRFTISRDNAKNTVYLQMNSLKPEDTAVYYCAAELRNPYWGQGTQVTVSS'],
    ['Nb-06', 'QVQLVESGGGLVQAGGSLRLSCAASGFTFSSYTMGWFRQAPGKEREFVAAISWSGGSTYYADSVKGRFTISRDNAKNTVYLQMNSLKPEDTAVYYCAAELRDPFWGQGTQVTVSS'],
  ].map(([label, sequence]) => ({ label, sequence, metadata: { clone: label, abundance_cpm: Math.floor(1000 + Math.random() * 9000) } }));
}

function updateDataSummary(tree) {
  const traces = tree.original.data.length;
  const points = tree.original.data.reduce((sum, trace) => sum + Math.max(trace.x?.length || 0, trace.y?.length || 0), 0);
  const customFields = tree.original.data.reduce((max, trace) => {
    const row = Array.isArray(trace.customdata) ? trace.customdata.find((item) => item != null) : null;
    if (Array.isArray(row)) return Math.max(max, row.length);
    if (row && typeof row === 'object') return Math.max(max, Object.keys(row).length);
    return max;
  }, 0);
  const values = [traces, points.toLocaleString(), customFields || '—'];
  [...ui.dataSummary.querySelectorAll('strong')].forEach((element, index) => { element.textContent = values[index]; });
}

async function updateHash(tree) {
  const text = JSON.stringify(tree.original);
  try {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
    ui.payloadHash.textContent = `SHA-256 ${hash}… · ${formatBytes(bytes.length)}`;
  } catch (_) {
    ui.payloadHash.textContent = `${formatBytes(text.length)} retained`;
  }
}

function setBusy(isBusy, message = '') {
  ui.loadDemoButton.disabled = isBusy;
  if (isBusy && message) toast(message);
}

function toast(message, isError = false) {
  clearTimeout(state.toastTimer);
  ui.toast.textContent = message;
  ui.toast.style.borderColor = isError ? 'rgba(239,68,68,.35)' : '';
  ui.toast.classList.add('show');
  state.toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 3000);
}

function isLineTrace(trace) {
  const mode = String(trace?.mode || '').toLowerCase();
  return (trace?.type === 'scatter' || trace?.type === 'scattergl' || !trace?.type) && mode.includes('lines');
}
function isMarkerTrace(trace) { return String(trace?.mode || '').toLowerCase().includes('markers'); }
function hasMeaningfulText(trace) {
  return String(trace?.mode || '').toLowerCase().includes('text') ||
    (Array.isArray(trace?.text) && trace.text.some((value) => value != null && String(value).trim()));
}
function isInternalNodeLabel(value) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  return /^(?:cdr3\s*:\s*)?node\d+$/i.test(text);
}
function formatRenderableLabel(value) {
  const text = String(value ?? '').trim();
  if (!text || isInternalNodeLabel(text)) return '';
  return text.replace(/^cdr3\s*:\s*/i, '');
}
function filterRenderableText(text) {
  if (Array.isArray(text)) return text.map(formatRenderableLabel);
  return formatRenderableLabel(text);
}
function hasRenderableText(text) {
  if (Array.isArray(text)) return text.some((value) => value != null && String(value).trim());
  return text != null && String(text).trim() !== '';
}
function toggleTextMode(mode, show) {
  const parts = String(mode || '').split('+').filter(Boolean).filter((part) => part !== 'text');
  if (show) parts.push('text');
  return [...new Set(parts)].join('+') || (show ? 'text' : 'markers');
}
function scaledMarkerSize(originalSize, target) {
  if (Array.isArray(originalSize)) {
    const numeric = originalSize.map(Number).filter(Number.isFinite);
    const median = numeric.length ? numeric.sort((a, b) => a - b)[Math.floor(numeric.length / 2)] || target : target;
    return originalSize.map((value) => Math.max(1, (Number(value) || median) * target / median));
  }
  return target;
}
function importedTitle(layout) {
  if (typeof layout?.title === 'string') return layout.title;
  return layout?.title?.text || '';
}
function numericValues(values) { return values.map(Number).filter(Number.isFinite); }
function paddedRange(values, padding) {
  if (!values.length) return [0, 1];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= .5; max += .5; }
  const span = max - min;
  return [min - span * padding, max + span * padding];
}
function deepClone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || '';
  const counts = { ',': countOutsideQuotes(firstLine, ','), '\t': countOutsideQuotes(firstLine, '\t'), ';': countOutsideQuotes(firstLine, ';') };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}
function countOutsideQuotes(line, char) {
  let count = 0; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"') quoted = !quoted;
    else if (!quoted && line[i] === char) count += 1;
  }
  return count;
}
function parseDelimited(text, delimiter) {
  const rows = [];
  let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((value, index) => value.trim() || `column_${index + 1}`);
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}
function findColumn(lowerMap, names) {
  for (const name of names) if (lowerMap.has(name)) return lowerMap.get(name);
  return null;
}
function numberOrNull(value) {
  if (value == null || String(value).trim() === '' || /^null|na$/i.test(String(value).trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function safeFilename(value) { return String(value).trim().replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'cladogram'; }
function downloadBlob(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
