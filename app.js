const SVG_NS = "http://www.w3.org/2000/svg";
const canvas = document.querySelector("#drawingCanvas");
const artwork = document.querySelector("#artwork");
const draftPath = document.querySelector("#draftPath");
const selectionOutline = document.querySelector("#selectionOutline");
const codeOutput = document.querySelector("#codeOutput");
const previewFrame = document.querySelector("#previewFrame");
const codeView = document.querySelector("#codeView");
const canvasWrap = document.querySelector("#canvasWrap");
const canvasHint = document.querySelector("#canvasHint");
const strokeColor = document.querySelector("#strokeColor");
const fillColor = document.querySelector("#fillColor");
const strokeWidth = document.querySelector("#strokeWidth");
const fillToggle = document.querySelector("#fillToggle");

let paths = [];
let redoStack = [];
let drawing = false;
let points = [];
let tool = "pen";
let activeView = "svg";
let zoom = 1;
let toastTimer;
let selectedIndex = -1;
let selectDragging = false;
let selectLastPoint = null;
let recording = null;
let playbackFrame = 0;
let animationOrderCounter = 0;

const componentLabels = {
  button: "Button",
  card: "Card",
  input: "Input",
  panel: "Panel",
  label: "Label"
};

function pointFromEvent(event) {
  const matrix = canvas.getScreenCTM();
  return {
    x: Math.round((event.clientX - matrix.e) / matrix.a),
    y: Math.round((event.clientY - matrix.f) / matrix.d)
  };
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (!dx && !dy) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function simplifyPoints(list, tolerance = 1.8) {
  if (list.length < 3) return list;
  let farthestIndex = 0;
  let farthestDistance = 0;
  const lastIndex = list.length - 1;
  for (let i = 1; i < lastIndex; i++) {
    const distance = distanceToSegment(list[i], list[0], list[lastIndex]);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = i;
    }
  }
  if (farthestDistance <= tolerance) return [list[0], list[lastIndex]];
  return [
    ...simplifyPoints(list.slice(0, farthestIndex + 1), tolerance).slice(0, -1),
    ...simplifyPoints(list.slice(farthestIndex), tolerance)
  ];
}

function boundsOf(list) {
  const xs = list.map(point => point.x);
  const ys = list.map(point => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(...xs) - x;
  const height = Math.max(...ys) - y;
  return { x, y, width, height, cx: x + width / 2, cy: y + height / 2 };
}

function componentKindFor(item, preferred = "auto") {
  if (componentLabels[preferred]) return preferred;
  const box = boundsOf(item.points);
  const ratio = box.width / Math.max(1, box.height);
  if (box.height < 28 && box.width > 45) return "label";
  if (ratio > 3 && box.height < 64) return item.fill ? "button" : "input";
  if (box.width > 220 && box.height > 120) return "panel";
  if (box.width > 90 && box.height > 55) return "card";
  return "button";
}

function pathData(list, closed = false) {
  if (!list.length) return "";
  if (list.length === 1) return `M ${list[0].x} ${list[0].y} l .1 .1`;
  let d = `M ${list[0].x} ${list[0].y}`;
  for (let i = 1; i < list.length - 1; i++) {
    const midX = ((list[i].x + list[i + 1].x) / 2).toFixed(1);
    const midY = ((list[i].y + list[i + 1].y) / 2).toFixed(1);
    d += ` Q ${list[i].x} ${list[i].y} ${midX} ${midY}`;
  }
  const last = list.at(-1);
  d += ` L ${last.x} ${last.y}`;
  return closed ? `${d} Z` : d;
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function pathMarkup(item, indent = "  ", index = 0) {
  if (item.kind && componentLabels[item.kind]) return componentMarkup(item, indent, index);
  const fill = item.closed && item.fill ? item.fillColor : "none";
  const basePoints = item.animation?.keyframes?.[0] || item.points;
  const motionClass = item.animation?.keyframes?.length > 1 ? ` class="ink-motion-${index}"` : "";
  const attributes = `${motionClass} d="${pathData(basePoints, item.closed)}" fill="${fill}" stroke="${item.color}" stroke-width="${item.width}" stroke-linecap="round" stroke-linejoin="round"`;
  if (!item.animation?.keyframes || item.animation.keyframes.length < 2) return `${indent}<path ${attributes} />`;
  return `${indent}<path ${attributes} />`;
}

function componentMarkup(item, indent = "  ", index = 0) {
  const box = boundsOf(item.animation?.keyframes?.[0] || item.points);
  const className = item.animation?.keyframes?.length > 1 ? ` class="ink-motion-${index}"` : "";
  const meta = ` data-component="${item.kind}" aria-label="${componentLabels[item.kind]}"`;
  const fill = item.kind === "button" ? item.fillColor : item.kind === "input" ? "#ffffff" : item.fillColor || "#ffffff";
  const stroke = item.color;
  const label = componentLabels[item.kind];
  const wrap = markup => `${indent}<g${className}${meta}>\n${markup}\n${indent}</g>`;
  if (item.kind === "label") {
    return wrap(`${indent}  <text x="${box.x}" y="${box.y + Math.max(16, box.height)}" fill="${stroke}" font-family="Arial, sans-serif" font-size="${Math.max(16, Math.min(28, box.height + 8))}">${label}</text>`);
  }
  const radius = item.kind === "button" ? Math.min(14, box.height / 3) : 8;
  const text = item.kind === "button" || item.kind === "input"
    ? `\n${indent}  <text x="${box.cx}" y="${box.cy + 5}" text-anchor="middle" fill="${item.kind === "button" ? "#ffffff" : stroke}" font-family="Arial, sans-serif" font-size="${Math.max(14, Math.min(20, box.height / 2.8))}">${label}</text>`
    : "";
  return wrap(`${indent}  <rect x="${box.x}" y="${box.y}" width="${Math.max(1, box.width)}" height="${Math.max(1, box.height)}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${item.width}" />${text}`);
}

function animationCss(item, index) {
  if (!item.animation?.keyframes || item.animation.keyframes.length < 2) return "";
  const base = item.animation.keyframes[0];
  const lastIndex = item.animation.keyframes.length - 1;
  const frames = item.animation.keyframes.map((frame, frameIndex) => {
    const percent = Number(((frameIndex / lastIndex) * 100).toFixed(2));
    return `    ${percent}% { transform: matrix(${transformMatrix(base, frame, true)}); }`;
  }).join("\n");
  const iterations = item.animation.loop ? "infinite" : "1";
  const delay = Math.max(0, Number(item.animation.start) || 0);
  return `  .ink-motion-${index} {\n    transform-box: view-box;\n    transform-origin: 0 0;\n    animation: ink-motion-${index}-frames ${item.animation.duration}s linear ${delay}s ${iterations} forwards;\n  }\n  @keyframes ink-motion-${index}-frames {\n${frames}\n  }`;
}

function frameMotion(from, to) {
  const fromCenter = from.reduce((sum, point) => ({ x: sum.x + point.x / from.length, y: sum.y + point.y / from.length }), { x: 0, y: 0 });
  const toCenter = to.reduce((sum, point) => ({ x: sum.x + point.x / to.length, y: sum.y + point.y / to.length }), { x: 0, y: 0 });
  let dot = 0;
  let cross = 0;
  from.forEach((point, index) => {
    const ax = point.x - fromCenter.x;
    const ay = point.y - fromCenter.y;
    const bx = to[index].x - toCenter.x;
    const by = to[index].y - toCenter.y;
    dot += ax * bx + ay * by;
    cross += ax * by - ay * bx;
  });
  return { fromCenter, toCenter, angle: Math.atan2(cross, dot) };
}

function transformMatrix(base, target, css = false) {
  const motion = frameMotion(base, target);
  const cos = Math.cos(motion.angle);
  const sin = Math.sin(motion.angle);
  const e = motion.toCenter.x - cos * motion.fromCenter.x + sin * motion.fromCenter.y;
  const f = motion.toCenter.y - sin * motion.fromCenter.x - cos * motion.fromCenter.y;
  return [cos, sin, -sin, cos, e, f].map(value => Number(value.toFixed(5))).join(css ? ", " : " ");
}

function svgMarkup(draftItem = null) {
  const outputPaths = draftItem ? [...paths, draftItem] : paths;
  const body = outputPaths.map((item, index) => pathMarkup(item, "  ", index)).join("\n");
  const css = outputPaths.map(animationCss).filter(Boolean).join("\n");
  const style = css ? `\n  <style>\n${css}\n  </style>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" role="img" aria-label="Hand-drawn artwork">${style}\n  <rect width="960" height="600" fill="white" />${body ? `\n${body}` : ""}\n</svg>`;
}

function htmlMarkup(draftItem = null) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My InkToWeb Drawing</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f2f0ea; }
    svg { width: min(960px, 100%); height: auto; background: white; box-shadow: 0 18px 60px #0002; }
  </style>
</head>
<body>
${svgMarkup(draftItem).split("\n").map(line => `  ${line}`).join("\n")}
</body>
</html>`;
}

function updateSelectionOutline() {
  const selectedPath = artwork.querySelector(`[data-index="${selectedIndex}"]`);
  const controls = document.querySelector("#selectionControls");
  if (!selectedPath || tool !== "select") {
    selectionOutline.setAttribute("display", "none");
    controls.classList.remove("visible");
    return;
  }
  const box = selectedPath.getBBox();
  const rect = selectionOutline.querySelector("rect");
  const handle = selectionOutline.querySelector("circle");
  rect.setAttribute("x", box.x - 8);
  rect.setAttribute("y", box.y - 8);
  rect.setAttribute("width", Math.max(16, box.width + 16));
  rect.setAttribute("height", Math.max(16, box.height + 16));
  handle.setAttribute("cx", box.x + box.width / 2);
  handle.setAttribute("cy", box.y - 8);
  selectionOutline.setAttribute("display", "block");
  controls.classList.add("visible");
}

function renderArtwork(refreshCode = true) {
  artwork.replaceChildren();
  paths.forEach((item, index) => {
    if (item.kind && componentLabels[item.kind]) {
      const group = document.createElementNS(SVG_NS, "g");
      group.dataset.index = index;
      group.style.cursor = tool === "select" ? "move" : "";
      const sourcePoints = item.animation?.keyframes?.[0] || item.points;
      const box = boundsOf(sourcePoints);
      const fill = item.kind === "button" ? item.fillColor : item.kind === "input" ? "#ffffff" : item.fillColor || "#ffffff";
      if (item.kind === "label") {
        const text = document.createElementNS(SVG_NS, "text");
        text.setAttribute("x", box.x);
        text.setAttribute("y", box.y + Math.max(16, box.height));
        text.setAttribute("fill", item.color);
        text.setAttribute("font-family", "Arial, sans-serif");
        text.setAttribute("font-size", Math.max(16, Math.min(28, box.height + 8)));
        text.textContent = componentLabels[item.kind];
        group.append(text);
      } else {
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("x", box.x);
        rect.setAttribute("y", box.y);
        rect.setAttribute("width", Math.max(1, box.width));
        rect.setAttribute("height", Math.max(1, box.height));
        rect.setAttribute("rx", item.kind === "button" ? Math.min(14, box.height / 3) : 8);
        rect.setAttribute("fill", fill);
        rect.setAttribute("stroke", item.color);
        rect.setAttribute("stroke-width", item.width);
        group.append(rect);
        if (item.kind === "button" || item.kind === "input") {
          const text = document.createElementNS(SVG_NS, "text");
          text.setAttribute("x", box.cx);
          text.setAttribute("y", box.cy + 5);
          text.setAttribute("text-anchor", "middle");
          text.setAttribute("fill", item.kind === "button" ? "#ffffff" : item.color);
          text.setAttribute("font-family", "Arial, sans-serif");
          text.setAttribute("font-size", Math.max(14, Math.min(20, box.height / 2.8)));
          text.textContent = componentLabels[item.kind];
          group.append(text);
        }
      }
      artwork.append(group);
      return;
    }
    const el = document.createElementNS(SVG_NS, "path");
    el.setAttribute("d", pathData(item.points, item.closed));
    el.setAttribute("fill", item.closed && item.fill ? item.fillColor : "none");
    el.setAttribute("stroke", item.color);
    el.setAttribute("stroke-width", item.width);
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-linejoin", "round");
    el.dataset.index = index;
    artwork.append(el);
  });
  document.querySelector("#pathCount").textContent = paths.length;
  canvasHint.classList.toggle("hidden", paths.length > 0 || drawing);
  updateSelectionOutline();
  if (refreshCode) updateCode();
  updateHistoryButtons();
}

function updateCode(draftItem = null) {
  const markup = activeView === "html" ? htmlMarkup(draftItem) : svgMarkup(draftItem);
  codeOutput.innerHTML = syntaxColor(escapeHtml(markup));
  previewFrame.srcdoc = htmlMarkup(draftItem);
}

function syntaxColor(code) {
  return code
    .replace(/(&lt;\/?)([\w-]+)/g, '$1<span style="color:#ff805f">$2</span>')
    .replace(/ ([\w-]+)=/g, ' <span style="color:#74c7ec">$1</span>=')
    .replace(/(&quot;.*?&quot;)/g, '<span style="color:#a6d189">$1</span>');
}

function beginDraw(event) {
  event.preventDefault();
  if (event.button !== 0) return;
  const point = pointFromEvent(event);
  if (tool === "select") {
    const hit = event.target.closest("[data-index]");
    selectedIndex = hit ? Number(hit.dataset.index) : -1;
    selectDragging = selectedIndex >= 0;
    selectLastPoint = point;
    try { canvas.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
    updateSelectionOutline();
    return;
  }
  if (tool === "eraser") {
    const hit = event.target.closest("[data-index]");
    if (hit) {
      redoStack = [];
      paths.splice(Number(hit.dataset.index), 1);
      renderArtwork();
      showToast("Path erased");
    }
    return;
  }
  drawing = true;
  points = [point];
  try { canvas.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
  draftPath.setAttribute("stroke", strokeColor.value);
  draftPath.setAttribute("stroke-width", strokeWidth.value);
  draftPath.setAttribute("fill", tool === "shape" && fillToggle.checked ? fillColor.value : "none");
  canvasHint.classList.add("hidden");
}

function moveDraw(event) {
  if (selectDragging && selectedIndex >= 0) {
    event.preventDefault();
    const point = pointFromEvent(event);
    const dx = point.x - selectLastPoint.x;
    const dy = point.y - selectLastPoint.y;
    if (dx || dy) {
      paths[selectedIndex].points.forEach(item => { item.x += dx; item.y += dy; });
      if (!recording && paths[selectedIndex].animation) {
        paths[selectedIndex].animation.keyframes.forEach(frame => frame.forEach(item => { item.x += dx; item.y += dy; }));
      }
      selectLastPoint = point;
      renderArtwork(false);
    }
    document.querySelector("#coordinates").textContent = `x ${point.x} / y ${point.y}`;
    return;
  }
  if (drawing) {
    event.preventDefault();
  }
  const point = pointFromEvent(event);
  document.querySelector("#coordinates").textContent = `x ${point.x} / y ${point.y}`;
  if (!drawing) return;
  const last = points.at(-1);
  if (Math.hypot(point.x - last.x, point.y - last.y) < 2) return;
  points.push(point);
  draftPath.setAttribute("d", pathData(points, tool === "shape"));
}

function endDraw(event) {
  if (selectDragging) {
    selectDragging = false;
    selectLastPoint = null;
    renderArtwork();
    try {
      if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    } catch { /* The browser may have already released it. */ }
    return;
  }
  if (!drawing) return;
  event.preventDefault();
  drawing = false;
  if (points.length) {
    const smoothedPoints = simplifyPoints(points, Number(strokeWidth.value) > 12 ? 2.6 : 1.8);
    paths.push({
      points: smoothedPoints,
      color: strokeColor.value,
      width: Number(strokeWidth.value),
      closed: tool === "shape",
      fill: tool === "shape" && fillToggle.checked,
      fillColor: fillColor.value
    });
    redoStack = [];
  }
  points = [];
  draftPath.setAttribute("d", "");
  renderArtwork();
  try {
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  } catch { /* The browser may have already released it. */ }
}

function selectTool(nextTool) {
  tool = nextTool;
  document.querySelectorAll(".tool[data-tool]").forEach(button => button.classList.toggle("active", button.dataset.tool === tool));
  canvas.style.cursor = tool === "eraser" ? "cell" : tool === "select" ? "default" : "crosshair";
  if (tool === "shape") fillToggle.checked = true;
  if (tool !== "select") selectedIndex = -1;
  updateSelectionOutline();
}

function selectedBounds() {
  const item = paths[selectedIndex];
  if (!item) return null;
  const xs = item.points.map(point => point.x);
  const ys = item.points.map(point => point.y);
  return { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

function transformSelected(action) {
  if (selectedIndex < 0 || !paths[selectedIndex]) return;
  if (action === "animate") {
    startRecording();
    return;
  }
  if (action === "delete") {
    paths.splice(selectedIndex, 1);
    selectedIndex = -1;
    renderArtwork();
    showToast("Object deleted");
    return;
  }
  const center = selectedBounds();
  let angle = 0;
  if (action === "rotate-left") angle = -15 * Math.PI / 180;
  if (action === "rotate-right") angle = 15 * Math.PI / 180;
  const pointSets = [paths[selectedIndex].points];
  if (!recording && paths[selectedIndex].animation) pointSets.push(...paths[selectedIndex].animation.keyframes);
  pointSets.forEach(pointSet => pointSet.forEach(point => {
    const x = point.x - center.cx;
    const y = point.y - center.cy;
    if (angle) {
      point.x = Math.round(center.cx + x * Math.cos(angle) - y * Math.sin(angle));
      point.y = Math.round(center.cy + x * Math.sin(angle) + y * Math.cos(angle));
    } else if (action === "flip-horizontal") {
      point.x = Math.round(center.cx - x);
    } else if (action === "flip-vertical") {
      point.y = Math.round(center.cy - y);
    }
  }));
  renderArtwork();
}

function applyRecognition(item, preferred = "auto") {
  item.kind = componentKindFor(item, preferred);
  item.closed = true;
  item.fill = item.kind !== "label";
  if (item.kind === "input") item.fillColor = "#ffffff";
  if (item.kind === "label") item.fill = false;
  return item.kind;
}

function recognizeSelected() {
  if (selectedIndex < 0 || !paths[selectedIndex]) {
    showToast("Select an object first");
    return;
  }
  const preferred = document.querySelector("#smartType").value;
  const item = paths[selectedIndex];
  applyRecognition(item, preferred);
  renderArtwork();
  showToast(`Recognized as ${componentLabels[item.kind]}`);
}

function recognizeAll() {
  if (!paths.length) {
    showToast("Draw something first");
    return;
  }
  let count = 0;
  paths.forEach(item => {
    if (!item.kind) {
      applyRecognition(item);
      count++;
    }
  });
  renderArtwork();
  showToast(count ? `Recognized ${count} objects` : "Everything is already smart");
}

function clonePoints(list) {
  return list.map(point => ({ x: point.x, y: point.y }));
}

function sameFrame(a, b) {
  return a.length === b.length && a.every((point, index) => point.x === b[index].x && point.y === b[index].y);
}

function updateTimeline() {
  const timeline = document.querySelector("#timeline");
  timeline.replaceChildren();
  recording.keyframes.forEach((_, index) => {
    const marker = document.createElement("i");
    marker.className = `keyframe${index === recording.keyframes.length - 1 ? " active" : ""}`;
    timeline.append(marker);
  });
  const count = recording.keyframes.length;
  document.querySelector("#keyframeCount").textContent = `${count} keyframe${count === 1 ? "" : "s"} captured`;
}

function startRecording() {
  cancelAnimationFrame(playbackFrame);
  recording = { index: selectedIndex, keyframes: [clonePoints(paths[selectedIndex].points)] };
  document.querySelector("#animationPanel").classList.add("visible");
  updateTimeline();
  showToast("Move the object, then add a position");
}

function capturePosition(showMessage = true) {
  if (!recording || !paths[recording.index]) return false;
  const frame = clonePoints(paths[recording.index].points);
  if (sameFrame(frame, recording.keyframes.at(-1))) {
    if (showMessage) showToast("Move or rotate the object first");
    return false;
  }
  recording.keyframes.push(frame);
  updateTimeline();
  if (showMessage) showToast("Position captured");
  return true;
}

function playSequence() {
  if (!recording) return;
  capturePosition(false);
  if (recording.keyframes.length < 2) {
    showToast("Add another position to play");
    return;
  }
  cancelAnimationFrame(playbackFrame);
  const animationIndex = recording.index;
  const frames = recording.keyframes.map(clonePoints);
  const item = paths[animationIndex];
  const previewElement = artwork.querySelector(`[data-index="${animationIndex}"]`);
  if (!previewElement || !item) {
    showToast("Could not preview this object");
    return;
  }
  const seconds = Number(document.querySelector("#animationDuration").value);
  const duration = (Number.isFinite(seconds) ? Math.max(.2, seconds) : 2) * 1000;
  const playButton = document.querySelector("#playSequence");
  playButton.textContent = "Playing";
  playButton.disabled = true;
  selectionOutline.setAttribute("display", "none");
  if (item.kind) previewElement.setAttribute("transform", `matrix(${transformMatrix(frames[0], frames[0])})`);
  else previewElement.setAttribute("d", pathData(frames[0], item.closed));

  let started = 0;
  function tick(now) {
    if (!started) started = now;
    const progress = Math.min(1, (now - started) / duration);
    const scaled = progress * (frames.length - 1);
    const segment = Math.min(frames.length - 2, Math.floor(scaled));
    const mix = Math.min(1, scaled - segment);
    const from = frames[segment];
    const to = frames[segment + 1];
    const motion = frameMotion(from, to);
    const angle = motion.angle * mix;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const centerX = motion.fromCenter.x + (motion.toCenter.x - motion.fromCenter.x) * mix;
    const centerY = motion.fromCenter.y + (motion.toCenter.y - motion.fromCenter.y) * mix;
    const pointsNow = from.map(point => {
      const x = point.x - motion.fromCenter.x;
      const y = point.y - motion.fromCenter.y;
      return { x: centerX + x * cos - y * sin, y: centerY + x * sin + y * cos };
    });
    if (item.kind) previewElement.setAttribute("transform", `matrix(${transformMatrix(frames[0], pointsNow)})`);
    else previewElement.setAttribute("d", pathData(pointsNow, item.closed));
    if (progress < 1) playbackFrame = requestAnimationFrame(tick);
    else {
      if (item.kind) previewElement.setAttribute("transform", `matrix(${transformMatrix(frames[0], frames.at(-1))})`);
      else previewElement.setAttribute("d", pathData(frames.at(-1), item.closed));
      playButton.textContent = "Play";
      playButton.disabled = false;
      updateSelectionOutline();
    }
  }
  // Two frames guarantee the browser paints the starting position first.
  playbackFrame = requestAnimationFrame(() => {
    playbackFrame = requestAnimationFrame(tick);
  });
}

function finishRecording() {
  if (!recording) return;
  cancelAnimationFrame(playbackFrame);
  const playButton = document.querySelector("#playSequence");
  playButton.textContent = "Play";
  playButton.disabled = false;
  capturePosition(false);
  if (recording.keyframes.length < 2) {
    showToast("Move the object and capture a second position");
    return;
  }
  const item = paths[recording.index];
  item.animation = {
    keyframes: recording.keyframes,
    duration: Math.max(.2, Number(document.querySelector("#animationDuration").value)),
    loop: document.querySelector("#animationLoop").checked,
    start: nextSequenceStart(),
    order: animationOrderCounter++,
    step: nextSequenceStep()
  };
  recording = null;
  document.querySelector("#animationPanel").classList.remove("visible");
  renderArtwork();
  showToast("Motion sequence added to HTML");
}

function animatedItems() {
  return paths
    .map((item, index) => ({ item, index }))
    .filter(entry => entry.item.animation?.keyframes?.length > 1)
    .sort((a, b) => (a.item.animation.step ?? 1) - (b.item.animation.step ?? 1) || (a.item.animation.order ?? 0) - (b.item.animation.order ?? 0));
}

function nextSequenceStep() {
  return animatedItems().reduce((highest, entry) => Math.max(highest, Number(entry.item.animation.step) || 1), 0) + 1;
}

function nextSequenceStart() {
  return animatedItems().reduce((end, entry) => Math.max(end, (Number(entry.item.animation.start) || 0) + entry.item.animation.duration), 0);
}

function sequenceDuration() {
  return animatedItems().reduce((end, entry) => Math.max(end, (Number(entry.item.animation.start) || 0) + entry.item.animation.duration), 0);
}

function renderSequenceEditor() {
  const list = document.querySelector("#sequenceList");
  list.replaceChildren();
  const entries = animatedItems();
  entries.forEach((entry, position) => {
    const row = document.createElement("div");
    row.className = "sequence-row";
    row.dataset.index = entry.index;
    row.innerHTML = `
      <span class="sequence-order">${String(position + 1).padStart(2, "0")}</span>
      <span class="sequence-object"><i class="object-swatch" style="background:${entry.item.color}"></i>Object ${entry.index + 1}</span>
      <label>Step <input data-field="step" type="number" min="1" step="1" value="${Math.max(1, Number(entry.item.animation.step) || 1)}"></label>
      <label>Start <input data-field="start" type="number" value="${Number(entry.item.animation.start || 0).toFixed(1)}" readonly>s</label>
      <label>Duration <input data-field="duration" type="number" min="0.2" step="0.1" value="${Number(entry.item.animation.duration).toFixed(1)}">s</label>
      <span class="order-buttons"><button data-order="up" title="Move to an earlier step">^</button><button data-order="down" title="Move to a later step">v</button></span>`;
    list.append(row);
  });
  document.querySelector("#sequenceLength").textContent = `Sequence: ${sequenceDuration().toFixed(1)}s`;
}

function openSequenceEditor() {
  if (!animatedItems().length) {
    showToast("Animate at least one object first");
    return;
  }
  if (recording) finishRecording();
  document.querySelector("#animationPanel").classList.remove("visible");
  document.querySelector("#sequencePanel").classList.add("visible");
  renderSequenceEditor();
}

function closeSequenceEditor() {
  cancelAnimationFrame(playbackFrame);
  document.querySelector("#sequencePanel").classList.remove("visible");
  renderArtwork();
}

function scheduleAnimations(together) {
  animatedItems().forEach((entry, index) => {
    entry.item.animation.step = together ? 1 : index + 1;
    entry.item.animation.loop = false;
  });
  scheduleBySteps();
  renderSequenceEditor();
  updateCode();
}

function scheduleBySteps() {
  const groups = new Map();
  animatedItems().forEach(entry => {
    const step = Math.max(1, Math.round(Number(entry.item.animation.step) || 1));
    entry.item.animation.step = step;
    if (!groups.has(step)) groups.set(step, []);
    groups.get(step).push(entry);
  });
  let cursor = 0;
  [...groups.entries()].sort((a, b) => a[0] - b[0]).forEach(([, entries]) => {
    entries.forEach(entry => { entry.item.animation.start = cursor; });
    cursor += Math.max(...entries.map(entry => entry.item.animation.duration));
  });
}

function pointsAtProgress(item, progress) {
  const frames = item.animation.keyframes;
  const scaled = Math.max(0, Math.min(1, progress)) * (frames.length - 1);
  const segment = Math.min(frames.length - 2, Math.floor(scaled));
  const mix = Math.min(1, scaled - segment);
  const from = frames[segment];
  const to = frames[segment + 1];
  const motion = frameMotion(from, to);
  const angle = motion.angle * mix;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const centerX = motion.fromCenter.x + (motion.toCenter.x - motion.fromCenter.x) * mix;
  const centerY = motion.fromCenter.y + (motion.toCenter.y - motion.fromCenter.y) * mix;
  return from.map(point => {
    const x = point.x - motion.fromCenter.x;
    const y = point.y - motion.fromCenter.y;
    return { x: centerX + x * cos - y * sin, y: centerY + x * sin + y * cos };
  });
}

function previewFullSequence() {
  const entries = animatedItems();
  if (!entries.length) return;
  cancelAnimationFrame(playbackFrame);
  renderArtwork(false);
  selectionOutline.setAttribute("display", "none");
  const button = document.querySelector("#previewSequence");
  button.textContent = "Playing";
  button.disabled = true;
  const total = Math.max(.2, sequenceDuration()) * 1000;
  let started = 0;
  function tick(now) {
    if (!started) started = now;
    const elapsed = (now - started) / 1000;
    entries.forEach(entry => {
      const animation = entry.item.animation;
      const previewElement = artwork.querySelector(`[data-index="${entry.index}"]`);
      if (!previewElement) return;
      const local = elapsed < animation.start ? 0 : Math.min(1, (elapsed - animation.start) / animation.duration);
      const pointsNow = pointsAtProgress(entry.item, local);
      if (entry.item.kind) previewElement.setAttribute("transform", `matrix(${transformMatrix(animation.keyframes[0], pointsNow)})`);
      else previewElement.setAttribute("d", pathData(pointsNow, entry.item.closed));
    });
    if (now - started < total) playbackFrame = requestAnimationFrame(tick);
    else {
      button.textContent = "Preview all";
      button.disabled = false;
      updateSelectionOutline();
    }
  }
  playbackFrame = requestAnimationFrame(tick);
}

function cancelRecording() {
  if (!recording) return;
  cancelAnimationFrame(playbackFrame);
  const playButton = document.querySelector("#playSequence");
  playButton.textContent = "Play";
  playButton.disabled = false;
  paths[recording.index].points = clonePoints(recording.keyframes[0]);
  recording = null;
  document.querySelector("#animationPanel").classList.remove("visible");
  renderArtwork();
}

function undo() {
  if (!paths.length) return;
  redoStack.push(paths.pop());
  renderArtwork();
}

function redo() {
  if (!redoStack.length) return;
  paths.push(redoStack.pop());
  renderArtwork();
}

function updateHistoryButtons() {
  document.querySelector("#undoButton").disabled = !paths.length;
  document.querySelector("#redoButton").disabled = !redoStack.length;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function downloadHtml() {
  const blob = new Blob([htmlMarkup()], { type: "text/html" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "inktoweb-drawing.html";
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("HTML exported");
}

canvas.addEventListener("pointerdown", beginDraw);
canvas.addEventListener("pointermove", moveDraw);
canvas.addEventListener("pointerup", endDraw);
canvas.addEventListener("pointercancel", endDraw);
canvas.addEventListener("dragstart", event => event.preventDefault());
window.addEventListener("pointerup", endDraw);
window.addEventListener("pointercancel", endDraw);

document.querySelectorAll(".tool[data-tool]").forEach(button => button.addEventListener("click", () => selectTool(button.dataset.tool)));
document.querySelector("#undoButton").addEventListener("click", undo);
document.querySelector("#redoButton").addEventListener("click", redo);
document.querySelectorAll("[data-transform]").forEach(button => button.addEventListener("click", () => transformSelected(button.dataset.transform)));
document.querySelector("#recognizeButton").addEventListener("click", recognizeSelected);
document.querySelector("#recognizeAllButton").addEventListener("click", recognizeAll);
document.querySelector("#addKeyframe").addEventListener("click", () => capturePosition());
document.querySelector("#keyRotateLeft").addEventListener("click", () => transformSelected("rotate-left"));
document.querySelector("#keyRotateRight").addEventListener("click", () => transformSelected("rotate-right"));
document.querySelector("#playSequence").addEventListener("click", playSequence);
document.querySelector("#finishSequence").addEventListener("click", finishRecording);
document.querySelector("#cancelSequence").addEventListener("click", cancelRecording);
document.querySelector("#sequenceButton").addEventListener("click", openSequenceEditor);
document.querySelector("#closeSequence").addEventListener("click", closeSequenceEditor);
document.querySelector("#doneSequence").addEventListener("click", closeSequenceEditor);
document.querySelector("#scheduleInOrder").addEventListener("click", () => scheduleAnimations(false));
document.querySelector("#scheduleTogether").addEventListener("click", () => scheduleAnimations(true));
document.querySelector("#previewSequence").addEventListener("click", previewFullSequence);
document.querySelector("#sequenceList").addEventListener("input", event => {
  const input = event.target.closest("input[data-field]");
  if (!input) return;
  const item = paths[Number(input.closest(".sequence-row").dataset.index)];
  const value = Number(input.value);
  if (input.dataset.field === "step") item.animation.step = Math.max(1, Math.round(value || 1));
  if (input.dataset.field === "duration") item.animation.duration = Math.max(.2, value || .2);
  scheduleBySteps();
  renderSequenceEditor();
  updateCode();
});
document.querySelector("#sequenceList").addEventListener("click", event => {
  const button = event.target.closest("button[data-order]");
  if (!button) return;
  const index = Number(button.closest(".sequence-row").dataset.index);
  const animation = paths[index].animation;
  animation.step = button.dataset.order === "up" ? Math.max(1, animation.step - 1) : animation.step + 1;
  scheduleBySteps();
  renderSequenceEditor();
  updateCode();
});
strokeWidth.addEventListener("input", () => document.querySelector("#widthOutput").textContent = strokeWidth.value);
document.querySelector("#downloadButton").addEventListener("click", downloadHtml);
document.querySelector("#copyButton").addEventListener("click", async () => {
  const text = activeView === "svg" ? svgMarkup() : htmlMarkup();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.append(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }
  showToast("Code copied");
});
document.querySelector("#newButton").addEventListener("click", () => {
  if (paths.length && !confirm("Clear the canvas and start a new drawing?")) return;
  paths = [];
  redoStack = [];
  renderArtwork();
});

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
  activeView = tab.dataset.view;
  document.querySelectorAll(".tab").forEach(item => item.classList.toggle("active", item === tab));
  const previewing = activeView === "preview";
  codeView.style.display = previewing ? "none" : "block";
  previewFrame.style.display = previewing ? "block" : "none";
  document.querySelector("#copyButton").style.visibility = previewing ? "hidden" : "visible";
  updateCode();
}));

function setZoom(next) {
  zoom = Math.max(.5, Math.min(1.5, next));
  document.querySelector("#canvasScale").style.scale = zoom;
  document.querySelector("#zoomLabel").textContent = `${Math.round(zoom * 100)}%`;
}
document.querySelector("#zoomIn").addEventListener("click", () => setZoom(zoom + .1));
document.querySelector("#zoomOut").addEventListener("click", () => setZoom(zoom - .1));

window.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === "z") {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
  } else if ((key === "delete" || key === "backspace") && selectedIndex >= 0) {
    event.preventDefault();
    transformSelected("delete");
  } else if (!event.ctrlKey && !event.metaKey && ["v", "p", "s", "e"].includes(key)) {
    selectTool({ v: "select", p: "pen", s: "shape", e: "eraser" }[key]);
  }
});

renderArtwork();
