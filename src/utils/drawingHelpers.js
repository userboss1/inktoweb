// ─── Path math ───────────────────────────────────────────────────────────────

function distanceToSegment(pt, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (!dx && !dy) return Math.hypot(pt.x - a.x, pt.y - a.y);
  const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy));
}

export function simplifyPoints(list, tolerance = 1.8) {
  if (list.length < 3) return list;
  let fi = 0, fd = 0;
  const last = list.length - 1;
  for (let i = 1; i < last; i++) {
    const d = distanceToSegment(list[i], list[0], list[last]);
    if (d > fd) { fd = d; fi = i; }
  }
  if (fd <= tolerance) return [list[0], list[last]];
  return [
    ...simplifyPoints(list.slice(0, fi + 1), tolerance).slice(0, -1),
    ...simplifyPoints(list.slice(fi), tolerance),
  ];
}

export function boundsOf(list) {
  if (!list?.length) return { x: 0, y: 0, width: 0, height: 0, cx: 0, cy: 0 };
  const xs = list.map(p => p.x), ys = list.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
  return { x, y, width: w, height: h, cx: x + w / 2, cy: y + h / 2 };
}

export function pathData(list, closed = false) {
  if (!list?.length) return '';
  if (list.length === 1) return `M ${list[0].x} ${list[0].y} l .1 .1`;
  let d = `M ${list[0].x} ${list[0].y}`;
  for (let i = 1; i < list.length - 1; i++) {
    const mx = ((list[i].x + list[i + 1].x) / 2).toFixed(1);
    const my = ((list[i].y + list[i + 1].y) / 2).toFixed(1);
    d += ` Q ${list[i].x} ${list[i].y} ${mx} ${my}`;
  }
  const l = list.at(-1);
  d += ` L ${l.x} ${l.y}`;
  return closed ? `${d} Z` : d;
}

export function clonePoints(list) {
  return list.map(p => ({ x: p.x, y: p.y }));
}

export function sameFrame(a, b) {
  return a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);
}

// ─── Animation interpolation (used for in-editor preview) ────────────────────

export function frameMotion(from, to) {
  const fc = from.reduce((s, p) => ({ x: s.x + p.x / from.length, y: s.y + p.y / from.length }), { x: 0, y: 0 });
  const tc = to.reduce((s, p) => ({ x: s.x + p.x / to.length, y: s.y + p.y / to.length }), { x: 0, y: 0 });
  let dot = 0, cross = 0;
  from.forEach((p, i) => {
    const ax = p.x - fc.x, ay = p.y - fc.y;
    const bx = to[i].x - tc.x, by = to[i].y - tc.y;
    dot += ax * bx + ay * by;
    cross += ax * by - ay * bx;
  });
  return { fromCenter: fc, toCenter: tc, angle: Math.atan2(cross, dot) };
}

export function pointsAtProgress(item, progress) {
  const frames = item.animation.keyframes;
  const scaled = Math.max(0, Math.min(1, progress)) * (frames.length - 1);
  const seg = Math.min(frames.length - 2, Math.floor(scaled));
  const mix = Math.min(1, scaled - seg);
  const from = frames[seg], to = frames[seg + 1];
  const m = frameMotion(from, to);
  const angle = m.angle * mix;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const cx = m.fromCenter.x + (m.toCenter.x - m.fromCenter.x) * mix;
  const cy = m.fromCenter.y + (m.toCenter.y - m.fromCenter.y) * mix;
  return from.map(p => {
    const x = p.x - m.fromCenter.x;
    const y = p.y - m.fromCenter.y;
    return { x: cx + x * cos - y * sin, y: cy + x * sin + y * cos };
  });
}

// ─── Code / HTML generation ───────────────────────────────────────────────────
//
// Animation strategy for the EXPORTED HTML:
//   We use SVG SMIL <animate attributeName="d" ...> elements embedded inside
//   each <path>. This directly animates the path shape between recorded keyframe
//   positions — exactly matching what the in-editor preview does — and works
//   reliably across all modern browsers without any CSS matrix math.
//
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * Given an animated path item, build the SMIL <animate> element string.
 * The values= attribute holds semicolon-separated path-data strings for each
 * keyframe. Because every keyframe was recorded from the SAME set of points
 * (just translated/rotated), the topology is identical — so SVG path
 * interpolation works perfectly.
 */
function smilAnimate(item) {
  const kf = item.animation.keyframes;
  // Build the semicolon-separated list of path-data values
  const values = kf.map(f => pathData(f, item.closed)).join(';');

  // keyTimes = evenly spaced 0..1 values, one per keyframe
  const keyTimes = kf.map((_, i) => (i / (kf.length - 1)).toFixed(3)).join(';');

  const dur = `${item.animation.duration}s`;
  const begin = `${Math.max(0, item.animation.start || 0)}s`;
  const repeat = item.animation.loop ? 'indefinite' : '1';
  const fill = item.animation.loop ? 'remove' : 'freeze';

  return `<animate attributeName="d" dur="${dur}" begin="${begin}" repeatCount="${repeat}" fill="${fill}" calcMode="linear" keyTimes="${keyTimes}" values="${values}"/>`;
}

function pathMarkup(item) {
  const fillAttr = item.closed && item.fill ? item.fillColor : 'none';
  // Always start the path at the first recorded keyframe (origin position)
  const pts = item.animation?.keyframes?.[0] || item.points;
  const hasAnim = item.animation?.keyframes?.length > 1;

  const attrs = `d="${pathData(pts, item.closed)}" fill="${fillAttr}" stroke="${item.color}" stroke-width="${item.width}" stroke-linecap="round" stroke-linejoin="round"`;

  if (!hasAnim) {
    return `  <path ${attrs}/>`;
  }

  // Embed the SMIL element as a child — requires open/close tags
  return `  <path ${attrs}>\n    ${smilAnimate(item)}\n  </path>`;
}

export function svgMarkup(paths, draft = null) {
  const all = draft ? [...paths, draft] : paths;
  const body = all.map(item => pathMarkup(item)).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600">\n  <rect width="960" height="600" fill="white"/>${body ? `\n${body}` : ''}\n</svg>`;
}

export function htmlMarkup(paths, draft = null) {
  const svg = svgMarkup(paths, draft);
  const indented = svg.split('\n').map(l => `  ${l}`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>InkToWeb Export</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f2f0ea; font-family: sans-serif; }
    svg { width: min(960px, 100%); height: auto; background: white; box-shadow: 0 18px 60px rgba(0,0,0,.13); border-radius: 4px; }
  </style>
</head>
<body>
${indented}
</body>
</html>`;
}

export function syntaxColor(code) {
  return code
    .replace(/(&lt;\/?)([\w-]+)/g, '$1<span style="color:#ff805f">$2</span>')
    .replace(/ ([\w-:]+)=/g, ' <span style="color:#74c7ec">$1</span>=')
    .replace(/(&quot;[^"]*?&quot;)/g, '<span style="color:#a6d189">$1</span>');
}

export { escapeHtml };
