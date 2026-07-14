function parseFasta(text) {
  const entries = [];
  let current = null;
  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    if (line.startsWith('>')) {
      current = { label: line.slice(1).trim() || `Sequence ${entries.length + 1}`, sequence: '', metadata: {} };
      entries.push(current);
    } else if (current) {
      current.sequence += line.replace(/\s+/g, '').toUpperCase();
    }
  });
  return entries.filter((entry) => entry.sequence);
}

function buildTreeFromSequences(entries, sourceName) {
  if (entries.length < 2) throw new Error('At least two sequences are needed to build a cladogram.');
  if (entries.length > 300) throw new Error('Browser clustering is limited to 300 sequences. Import the AlpSeq HTML for larger exact trees.');

  const clusters = entries.map((entry, index) => ({
    id: index, members: [index], left: null, right: null, height: 0, label: entry.label,
  }));
  const distances = new Map();
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      distances.set(pairKey(i, j), normalisedEditDistance(entries[i].sequence, entries[j].sequence));
    }
  }

  let nextId = entries.length;
  const active = new Map(clusters.map((cluster) => [cluster.id, cluster]));
  while (active.size > 1) {
    const ids = [...active.keys()];
    let best = [ids[0], ids[1]];
    let bestDistance = Infinity;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const distance = clusterAverageDistance(active.get(ids[i]), active.get(ids[j]), distances);
        if (distance < bestDistance) { bestDistance = distance; best = [ids[i], ids[j]]; }
      }
    }
    const left = active.get(best[0]);
    const right = active.get(best[1]);
    active.delete(left.id);
    active.delete(right.id);
    active.set(nextId, {
      id: nextId, members: [...left.members, ...right.members], left, right,
      height: Math.max(bestDistance / 2, left.height, right.height), label: null,
    });
    nextId += 1;
  }

  const root = [...active.values()][0];
  const leaves = [];
  collectLeaves(root, leaves);
  const yByMember = new Map(leaves.map((leaf, index) => [leaf.members[0], index]));
  const lineX = [];
  const lineY = [];
  const maxHeight = root.height || 1;
  assignCoordinates(root, yByMember, lineX, lineY, maxHeight);
  const leafX = entries.map(() => maxHeight);
  const leafY = entries.map((_, index) => yByMember.get(index));
  const labels = entries.map((entry) => entry.label);
  const metadataKeys = [...new Set(entries.flatMap((entry) => Object.keys(entry.metadata || {})))];
  const customdata = entries.map((entry) => metadataKeys.map((key) => entry.metadata?.[key] ?? ''));
  const hoverLines = metadataKeys.slice(0, 12).map((key, index) => `${escapeHtml(key)}: %{customdata[${index}]}`).join('<br>');

  const data = [
    {
      type: 'scatter', mode: 'lines', name: 'Branches', x: lineX, y: lineY,
      line: { color: '#52525b', width: 1.5, shape: 'linear' }, hoverinfo: 'skip',
    },
    {
      type: 'scatter', mode: 'markers+text', name: 'Sequences', x: leafX, y: leafY, text: labels,
      textposition: 'middle right', cliponaxis: false, marker: { color: '#e83e8c', size: 7 },
      customdata, hovertemplate: `<b>%{text}</b>${hoverLines ? `<br>${hoverLines}` : ''}<extra></extra>`,
    },
  ];
  const title = sourceName.replace(/\.[^.]+$/, '');
  return makeTreeRecord({
    data,
    layout: defaultTreeLayout(title),
    config: { responsive: false, displaylogo: false, scrollZoom: true },
    name: `${title} · browser UPGMA`, sourceName, sourceType: 'sequence-upgma',
    context: { text: 'UPGMA tree generated in the browser from normalised Levenshtein distances. Row data preserved in customdata.' },
  });
}

function defaultTreeLayout(title) {
  return {
    title: { text: title, x: 0.01, xanchor: 'left' },
    xaxis: { visible: false, zeroline: false, showgrid: false },
    yaxis: { visible: false, zeroline: false, showgrid: false },
    hovermode: 'closest', showlegend: false,
    margin: { l: 35, r: 220, t: 70, b: 35 },
    paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff',
  };
}

function assignCoordinates(node, yByMember, x, y, maxHeight) {
  if (!node.left && !node.right) {
    node.x = maxHeight - node.height;
    node.y = yByMember.get(node.members[0]);
    return;
  }
  assignCoordinates(node.left, yByMember, x, y, maxHeight);
  assignCoordinates(node.right, yByMember, x, y, maxHeight);
  node.x = maxHeight - node.height;
  node.y = (node.left.y + node.right.y) / 2;
  // Classic rectangular cladogram: two horizontal children and one vertical connector.
  x.push(node.left.x, node.x, null, node.right.x, node.x, null, node.x, node.x, null);
  y.push(node.left.y, node.left.y, null, node.right.y, node.right.y, null, node.left.y, node.right.y, null);
}

function collectLeaves(node, result) {
  if (!node.left && !node.right) { result.push(node); return; }
  collectLeaves(node.left, result);
  collectLeaves(node.right, result);
}

function clusterAverageDistance(a, b, distances) {
  let total = 0;
  let count = 0;
  a.members.forEach((i) => b.members.forEach((j) => {
    total += distances.get(pairKey(i, j)) || 0;
    count += 1;
  }));
  return total / Math.max(count, 1);
}

function pairKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }

function normalisedEditDistance(a, b) {
  if (a === b) return 0;
  const maxLength = Math.max(a.length, b.length, 1);
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length] / maxLength;
}

function loadTrees(trees, importName) {
  state.trees = trees;
  state.importName = importName;
  ui.treeSelect.innerHTML = '';
  trees.forEach((tree, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = tree.name;
    ui.treeSelect.appendChild(option);
  });
  ui.treeSelect.disabled = false;
  ui.treeCountBadge.textContent = String(trees.length);
  ui.importStatusDot.classList.add('active');
  ui.exportButton.disabled = false;
  ui.downloadDataButton.disabled = false;
  ui.inspectButton.disabled = false;
  document.querySelector('.live-indicator')?.classList.add('active');
  selectTree(0);
}

function selectTree(index) {
  if (!state.trees[index]) return;
  state.activeIndex = index;
  ui.treeSelect.value = String(index);
  const tree = state.trees[index];
  ui.workspaceHeading.textContent = tree.name;
  ui.titleInput.placeholder = importedTitle(tree.layout) || tree.name;
  ui.emptyState.style.display = 'none';
  ui.plot.style.display = 'block';
  updateDataSummary(tree);
  updateHash(tree);
  renderActive();
}

function makeTreeRecord({ data, layout = {}, config = {}, frames = [], name, sourceName, sourceType, context = {}, score = 0 }) {
  const original = deepClone({ data, layout, config, frames });
  return {
    name: String(name || importedTitle(layout) || 'Cladogram'),
    sourceName, sourceType, context, score,
    original,
  };
}

function deduplicateTrees(trees) {
  const seen = new Set();
  return trees.filter((tree) => {
    const signature = JSON.stringify(tree.original.data).slice(0, 3000);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}
