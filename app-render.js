function renderActive() {
  syncOutputs();
  const tree = state.trees[state.activeIndex];
  if (!tree || typeof Plotly === 'undefined') return;
  const styled = styleTree(tree);
  state.styled = styled;
  Plotly.react(ui.plot, styled.data, styled.layout, styled.config).catch((error) => {
    console.error(error);
    toast('Plotly could not render this widget.', true);
  });
}

function styleTree(tree) {
  const source = tree.original;
  const data = deepClone(source.data);
  const layout = deepClone(source.layout || {});
  const config = { ...deepClone(source.config || {}), responsive: false, displaylogo: false };
  const presetName = ui.presetSelect.value;
  const preset = PRESETS[presetName];

  const branchColor = presetName === 'original' ? null : ui.branchColorInput.value;
  const leafColor = presetName === 'original' ? null : ui.leafColorInput.value;
  const textColor = presetName === 'original' ? (layout.font?.color || '#18181b') : ui.textColorInput.value;
  const orientation = ui.orientationSelect.value;

  data.forEach((trace, index) => {
    const originalTrace = source.data[index] || {};
    const branch = isLineTrace(trace);
    const leaf = isMarkerTrace(trace) || hasMeaningfulText(trace);

    if (orientation === 'ttb' || orientation === 'btt') {
      [trace.x, trace.y] = [deepClone(originalTrace.y), deepClone(originalTrace.x)];
    } else {
      trace.x = deepClone(originalTrace.x);
      trace.y = deepClone(originalTrace.y);
    }

    if (branch) {
      trace.line = { ...(trace.line || {}) };
      if (branchColor) trace.line.color = branchColor;
      trace.line.width = Number(ui.lineWidthInput.value);
      trace.line.shape = ui.lineShapeSelect.value;
    }

    if (leaf) {
      trace.marker = { ...(trace.marker || {}) };
      if (leafColor) trace.marker.color = leafColor;
      trace.marker.size = scaledMarkerSize(originalTrace.marker?.size, Number(ui.markerSizeInput.value));
      trace.textfont = { ...(trace.textfont || {}), family: ui.fontSelect.value, size: Number(ui.fontSizeInput.value), color: textColor };
      trace.textposition = trace.textposition || ((orientation === 'ttb' || orientation === 'btt') ? 'bottom center' : 'middle right');
      trace.cliponaxis = false;
    }

    trace.opacity = Number(ui.opacityInput.value) / 100;
    trace.hoverinfo = ui.showHoverInput.checked ? (originalTrace.hoverinfo || trace.hoverinfo) : 'skip';
    trace.hovertemplate = ui.showHoverInput.checked ? originalTrace.hovertemplate : undefined;
    if (hasMeaningfulText(originalTrace)) {
      trace.mode = toggleTextMode(originalTrace.mode || trace.mode || 'markers', ui.showLabelsInput.checked);
      trace.text = ui.showLabelsInput.checked ? deepClone(originalTrace.text) : undefined;
    }
  });

  layout.width = Number(ui.widthInput.value);
  layout.height = Number(ui.heightInput.value);
  const margin = Number(ui.marginInput.value);
  const importedMargin = source.layout?.margin || {};
  layout.margin = {
    l: Math.max(margin, Number(importedMargin.l) || 0),
    r: ui.showLabelsInput.checked ? Math.max(margin + 150, Number(importedMargin.r) || 0) : Math.max(margin, Number(importedMargin.r) || 0),
    t: Math.max(margin, Number(importedMargin.t) || 0, 48),
    b: Math.max(margin, Number(importedMargin.b) || 0),
    pad: Number(importedMargin.pad) || 0,
  };
  layout.paper_bgcolor = presetName === 'original' ? (source.layout?.paper_bgcolor || '#ffffff') : ui.pageColorInput.value;
  layout.plot_bgcolor = presetName === 'original' ? (source.layout?.plot_bgcolor || layout.paper_bgcolor) : ui.plotColorInput.value;
  layout.font = { ...(layout.font || {}), family: ui.fontSelect.value, size: Number(ui.fontSizeInput.value), color: textColor };
  layout.showlegend = ui.showLegendInput.checked;
  layout.hovermode = ui.showHoverInput.checked ? (source.layout?.hovermode || 'closest') : false;
  layout.autosize = false;

  const titleText = ui.titleInput.value.trim() || importedTitle(source.layout);
  if (titleText) {
    layout.title = typeof layout.title === 'object'
      ? { ...layout.title, text: titleText, font: { ...(layout.title.font || {}), color: textColor, family: ui.fontSelect.value } }
      : { text: titleText, x: 0.01, xanchor: 'left', font: { color: textColor, family: ui.fontSelect.value } };
  } else {
    layout.title = undefined;
  }

  layout.xaxis = styleAxis(layout.xaxis, source.layout?.xaxis, textColor);
  layout.yaxis = styleAxis(layout.yaxis, source.layout?.yaxis, textColor);
  applyOrientationAndPadding(data, layout, orientation, Number(ui.paddingInput.value) / 100);
  return { data, layout, config, frames: deepClone(source.frames || []) };
}

function styleAxis(axis = {}, originalAxis = {}, textColor) {
  const show = ui.showAxesInput.checked;
  return {
    ...axis,
    visible: show,
    showticklabels: show,
    showline: show,
    ticks: show ? 'outside' : '',
    zeroline: false,
    showgrid: show,
    gridcolor: ui.gridColorInput.value,
    linecolor: ui.gridColorInput.value,
    tickfont: { ...(axis.tickfont || {}), color: textColor, family: ui.fontSelect.value },
    title: axis.title || originalAxis?.title,
  };
}

function applyOrientationAndPadding(data, layout, orientation, padding) {
  const xValues = numericValues(data.flatMap((trace) => trace.x || []));
  const yValues = numericValues(data.flatMap((trace) => trace.y || []));
  const xRange = paddedRange(xValues, padding);
  const yRange = paddedRange(yValues, padding);

  layout.xaxis.autorange = undefined;
  layout.yaxis.autorange = undefined;
  layout.xaxis.range = xRange;
  layout.yaxis.range = yRange;

  if (orientation === 'rtl') layout.xaxis.range = [...xRange].reverse();
  if (orientation === 'ttb') layout.yaxis.range = [...yRange].reverse();
  if (orientation === 'btt') layout.yaxis.range = yRange;
}

function resetControls() {
  ui.widthInput.value = '1400';
  ui.heightInput.value = '1000';
  ui.marginInput.value = '38';
  ui.paddingInput.value = '4';
  ui.orientationSelect.value = 'ltr';
  ui.lineWidthInput.value = '1.8';
  ui.markerSizeInput.value = '7';
  ui.opacityInput.value = '100';
  ui.lineShapeSelect.value = 'linear';
  ui.fontSizeInput.value = '12';
  ui.fontSelect.value = 'Inter, sans-serif';
  ui.titleInput.value = '';
  ui.showLabelsInput.checked = true;
  ui.showLegendInput.checked = false;
  ui.showHoverInput.checked = true;
  ui.showAxesInput.checked = false;
  ui.presetSelect.value = 'dark';
  applyPreset('dark');
  renderActive();
}

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset || name === 'original') return;
  ui.pageColorInput.value = preset.page;
  ui.plotColorInput.value = preset.plot;
  ui.branchColorInput.value = preset.branch;
  ui.leafColorInput.value = preset.leaf;
  ui.textColorInput.value = preset.text;
  ui.gridColorInput.value = preset.grid;
}

function syncOutputs() {
  if (!ui.widthOutput) return;
  ui.widthOutput.value = `${ui.widthInput.value} px`;
  ui.heightOutput.value = `${ui.heightInput.value} px`;
  ui.marginOutput.value = `${ui.marginInput.value} px`;
  ui.paddingOutput.value = `${ui.paddingInput.value}%`;
  ui.lineWidthOutput.value = ui.lineWidthInput.value;
  ui.markerSizeOutput.value = ui.markerSizeInput.value;
  ui.opacityOutput.value = `${ui.opacityInput.value}%`;
  ui.fontSizeOutput.value = `${ui.fontSizeInput.value} px`;
}

async function exportStyled(format) {
  if (!state.styled) return;
  const tree = state.trees[state.activeIndex];
  const baseName = safeFilename(tree.name || 'cladogram');
  try {
    if (format === 'png' || format === 'svg') {
      await Plotly.downloadImage(ui.plot, {
        format,
        filename: baseName,
        width: Number(ui.widthInput.value),
        height: Number(ui.heightInput.value),
        scale: format === 'png' ? 2 : 1,
      });
    } else if (format === 'json') {
      downloadBlob(JSON.stringify(state.styled, null, 2), `${baseName}.plotly.json`, 'application/json');
    } else if (format === 'html') {
      if (!state.plotlySource) {
        const response = await fetch('https://cdn.plot.ly/plotly-3.3.1.min.js');
        if (!response.ok) throw new Error('Could not load Plotly for standalone export.');
        state.plotlySource = await response.text();
      }
      const html = makeStandaloneHtml(state.styled, tree.name, state.plotlySource);
      downloadBlob(html, `${baseName}.html`, 'text/html');
    }
    toast(`Exported ${format.toUpperCase()}`);
  } catch (error) {
    console.error(error);
    toast(`Could not export ${format.toUpperCase()}.`, true);
  }
}

function makeStandaloneHtml(plotly, title, plotlySource) {
  const safeTitle = escapeHtml(title || 'Cladogram');
  const json = JSON.stringify(plotly).replace(/<\//g, '<\\/');
  const library = String(plotlySource || '').replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title><script>${library}<\/script>
<style>html,body,#plot{margin:0;min-height:100%;}body{display:grid;place-items:start center;background:${plotly.layout.paper_bgcolor || '#fff'};}<\/style></head>
<body><div id="plot"></div><script>const figure=${json};Plotly.newPlot('plot',figure.data,figure.layout,figure.config);<\/script></body></html>`;
}

function downloadOriginalJson() {
  const tree = state.trees[state.activeIndex];
  if (!tree) return;
  downloadBlob(JSON.stringify(tree.original, null, 2), `${safeFilename(tree.name)}.original.json`, 'application/json');
  toast('Downloaded untouched Plotly payload');
}

function openInspector() {
  const tree = state.trees[state.activeIndex];
  if (!tree) return;
  ui.inspectPre.textContent = JSON.stringify(tree.original, null, 2);
  ui.inspectDialog.showModal();
}
