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
  const l = list[list.length - 1]; // Fixed: list.at(-1) breaks older Android/Lenovo tablet browsers
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

// ─── Predefined Shape Library Math (30 Shapes) ────────────────────────────────

export function getPredefinedShape(type, cx = 480, cy = 300, size = 120) {
  const r = size / 2;
  const t = size / 6;

  switch (type) {
    case 'rect':
      return [
        { x: cx - r, y: cy - r },
        { x: cx + r, y: cy - r },
        { x: cx + r, y: cy + r },
        { x: cx - r, y: cy + r },
        { x: cx - r, y: cy - r }
      ];

    case 'circle': {
      const pts = [];
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const rad = (i * 2 * Math.PI) / steps;
        pts.push({ x: Math.round(cx + Math.cos(rad) * r), y: Math.round(cy + Math.sin(rad) * r) });
      }
      return pts;
    }

    case 'triangle':
      return [
        { x: cx, y: cy - r },
        { x: cx + r, y: cy + r },
        { x: cx - r, y: cy + r },
        { x: cx, y: cy - r }
      ];

    case 'right_triangle':
      return [
        { x: cx - r, y: cy - r },
        { x: cx + r, y: cy + r },
        { x: cx - r, y: cy + r },
        { x: cx - r, y: cy - r }
      ];

    case 'pentagon': {
      const pts = [];
      for (let i = 0; i < 5; i++) {
        const rad = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        pts.push({ x: Math.round(cx + Math.cos(rad) * r), y: Math.round(cy + Math.sin(rad) * r) });
      }
      pts.push({ ...pts[0] });
      return pts;
    }

    case 'hexagon': {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const rad = (i * 2 * Math.PI) / 6 - Math.PI / 2;
        pts.push({ x: Math.round(cx + Math.cos(rad) * r), y: Math.round(cy + Math.sin(rad) * r) });
      }
      pts.push({ ...pts[0] });
      return pts;
    }

    case 'star_5': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const radDist = i % 2 === 0 ? r : r * 0.4;
        const rad = (i * Math.PI) / 5 - Math.PI / 2;
        pts.push({ x: Math.round(cx + Math.cos(rad) * radDist), y: Math.round(cy + Math.sin(rad) * radDist) });
      }
      pts.push({ ...pts[0] });
      return pts;
    }

    case 'star_4': {
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const radDist = i % 2 === 0 ? r : r * 0.35;
        const rad = (i * Math.PI) / 4 - Math.PI / 2;
        pts.push({ x: Math.round(cx + Math.cos(rad) * radDist), y: Math.round(cy + Math.sin(rad) * radDist) });
      }
      pts.push({ ...pts[0] });
      return pts;
    }

    case 'star_8': {
      const pts = [];
      for (let i = 0; i < 16; i++) {
        const radDist = i % 2 === 0 ? r : r * 0.5;
        const rad = (i * Math.PI) / 8 - Math.PI / 2;
        pts.push({ x: Math.round(cx + Math.cos(rad) * radDist), y: Math.round(cy + Math.sin(rad) * radDist) });
      }
      pts.push({ ...pts[0] });
      return pts;
    }

    case 'arrow_right':
      return [
        { x: cx - r, y: cy - r / 3 },
        { x: cx + r * 0.3, y: cy - r / 3 },
        { x: cx + r * 0.3, y: cy - r * 0.8 },
        { x: cx + r, y: cy },
        { x: cx + r * 0.3, y: cy + r * 0.8 },
        { x: cx + r * 0.3, y: cy + r / 3 },
        { x: cx - r, y: cy + r / 3 },
        { x: cx - r, y: cy - r / 3 }
      ];

    case 'arrow_left':
      return [
        { x: cx + r, y: cy - r / 3 },
        { x: cx - r * 0.3, y: cy - r / 3 },
        { x: cx - r * 0.3, y: cy - r * 0.8 },
        { x: cx - r, y: cy },
        { x: cx - r * 0.3, y: cy + r * 0.8 },
        { x: cx - r * 0.3, y: cy + r / 3 },
        { x: cx + r, y: cy + r / 3 },
        { x: cx + r, y: cy - r / 3 }
      ];

    case 'arrow_up':
      return [
        { x: cx - r / 3, y: cy + r },
        { x: cx - r / 3, y: cy - r * 0.3 },
        { x: cx - r * 0.8, y: cy - r * 0.3 },
        { x: cx, y: cy - r },
        { x: cx + r * 0.8, y: cy - r * 0.3 },
        { x: cx + r / 3, y: cy - r * 0.3 },
        { x: cx + r / 3, y: cy + r },
        { x: cx - r / 3, y: cy + r }
      ];

    case 'arrow_down':
      return [
        { x: cx - r / 3, y: cy - r },
        { x: cx - r / 3, y: cy + r * 0.3 },
        { x: cx - r * 0.8, y: cy + r * 0.3 },
        { x: cx, y: cy + r },
        { x: cx + r * 0.8, y: cy + r * 0.3 },
        { x: cx + r / 3, y: cy + r * 0.3 },
        { x: cx + r / 3, y: cy - r },
        { x: cx - r / 3, y: cy - r }
      ];

    case 'bent_arrow_right':
      return [
        { x: cx - r, y: cy + r },
        { x: cx - r, y: cy - r * 0.3 },
        { x: cx + r * 0.2, y: cy - r * 0.3 },
        { x: cx + r * 0.2, y: cy - r * 0.8 },
        { x: cx + r, y: cy - r * 0.05 },
        { x: cx + r * 0.2, y: cy + r * 0.7 },
        { x: cx + r * 0.2, y: cy + r * 0.2 },
        { x: cx - r * 0.4, y: cy + r * 0.2 },
        { x: cx - r * 0.4, y: cy + r },
        { x: cx - r, y: cy + r }
      ];

    case 'bent_arrow_left':
      return [
        { x: cx + r, y: cy + r },
        { x: cx + r, y: cy - r * 0.3 },
        { x: cx - r * 0.2, y: cy - r * 0.3 },
        { x: cx - r * 0.2, y: cy - r * 0.8 },
        { x: cx - r, y: cy - r * 0.05 },
        { x: cx - r * 0.2, y: cy + r * 0.7 },
        { x: cx - r * 0.2, y: cy + r * 0.2 },
        { x: cx + r * 0.4, y: cy + r * 0.2 },
        { x: cx + r * 0.4, y: cy + r },
        { x: cx + r, y: cy + r }
      ];

    case 'curved_line': {
      const pts = [];
      const steps = 18;
      for (let i = 0; i <= steps; i++) {
        const progress = i / steps;
        const x = cx - r + progress * size;
        const y = cy + Math.sin(progress * 2.5 * Math.PI) * (r * 0.5);
        pts.push({ x: Math.round(x), y: Math.round(y) });
      }
      return pts;
    }

    case 'heart': {
      const pts = [];
      const steps = 30;
      for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * 2 * Math.PI;
        const xt = 16 * Math.pow(Math.sin(angle), 3);
        const yt = 13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle);
        const scale = size / 34;
        pts.push({ x: Math.round(cx + xt * scale), y: Math.round(cy - yt * scale) });
      }
      pts.push({ ...pts[0] });
      return pts;
    }

    case 'diamond':
      return [
        { x: cx, y: cy - r },
        { x: cx + r, y: cy },
        { x: cx, y: cy + r },
        { x: cx - r, y: cy },
        { x: cx, y: cy - r }
      ];

    case 'cross':
      return [
        { x: cx - t, y: cy - r },
        { x: cx + t, y: cy - r },
        { x: cx + t, y: cy - t },
        { x: cx + r, y: cy - t },
        { x: cx + r, y: cy + t },
        { x: cx + t, y: cy + t },
        { x: cx + t, y: cy + r },
        { x: cx - t, y: cy + r },
        { x: cx - t, y: cy + t },
        { x: cx - r, y: cy + t },
        { x: cx - r, y: cy - t },
        { x: cx - t, y: cy - t },
        { x: cx - t, y: cy - r }
      ];

    case 'speech_bubble': {
      const pts = [];
      const steps = 24;
      const rx = r * 1.1;
      const ry = r * 0.75;
      for (let i = 0; i < steps; i++) {
        const angle = (i * 2 * Math.PI) / steps;
        if (i === 17) {
          pts.push({ x: Math.round(cx - rx * 0.4), y: Math.round(cy + ry * 0.8) });
          pts.push({ x: Math.round(cx - rx * 0.7), y: Math.round(cy + ry * 1.4) });
          pts.push({ x: Math.round(cx - rx * 0.1), y: Math.round(cy + ry * 0.95) });
        } else {
          pts.push({ x: Math.round(cx + Math.cos(angle) * rx), y: Math.round(cy + Math.sin(angle) * ry) });
        }
      }
      pts.push({ ...pts[0] });
      return pts;
    }

    case 'lightning':
      return [
        { x: cx + r * 0.25, y: cy - r },
        { x: cx - r * 0.5, y: cy + r * 0.1 },
        { x: cx - r * 0.1, y: cy + r * 0.1 },
        { x: cx - r * 0.35, y: cy + r },
        { x: cx + r * 0.5, y: cy - r * 0.1 },
        { x: cx + r * 0.1, y: cy - r * 0.1 },
        { x: cx + r * 0.25, y: cy - r }
      ];

    case 'moon': {
      const pts = [];
      const steps = 16;
      for (let i = 0; i <= steps; i++) {
        const rad = -Math.PI / 2 + (i * Math.PI) / steps;
        pts.push({ x: Math.round(cx + Math.cos(rad) * r), y: Math.round(cy + Math.sin(rad) * r) });
      }
      for (let i = steps; i >= 0; i--) {
        const rad = -Math.PI / 2 + (i * Math.PI) / steps;
        pts.push({ x: Math.round(cx + Math.cos(rad) * r * 0.65 + r * 0.35), y: Math.round(cy + Math.sin(rad) * r) });
      }
      pts.push({ ...pts[0] });
      return pts;
    }

    case 'cloud': {
      const pts = [];
      const steps = 28;
      for (let i = 0; i <= steps; i++) {
        const angle = (i * 2 * Math.PI) / steps;
        const hump = 1 + 0.14 * Math.abs(Math.sin(3.5 * angle));
        pts.push({
          x: Math.round(cx + Math.cos(angle) * r * hump),
          y: Math.round(cy + Math.sin(angle) * r * 0.68 * hump)
        });
      }
      return pts;
    }

    case 'gear': {
      const pts = [];
      const teeth = 8;
      const rOut = r;
      const rIn = r * 0.72;
      for (let i = 0; i < teeth * 4; i++) {
        const angle = (i * 2 * Math.PI) / (teeth * 4);
        const isOuter = (i % 4 === 0 || i % 4 === 1);
        const curR = isOuter ? rOut : rIn;
        pts.push({ x: Math.round(cx + Math.cos(angle) * curR), y: Math.round(cy + Math.sin(angle) * curR) });
      }
      pts.push({ ...pts[0] });
      return pts;
    }

    case 'infinity': {
      const pts = [];
      const steps = 30;
      for (let i = 0; i <= steps; i++) {
        const tVal = (i / steps) * 2 * Math.PI - Math.PI;
        const denom = 1 + Math.pow(Math.sin(tVal), 2);
        const scale = r * 1.3;
        const x = (scale * Math.cos(tVal)) / denom;
        const y = (scale * Math.sin(tVal) * Math.cos(tVal)) / denom;
        pts.push({ x: Math.round(cx + x), y: Math.round(cy + y) });
      }
      return pts;
    }

    case 'cylinder':
      return [
        { x: cx - r, y: cy - r * 0.7 },
        { x: cx + r, y: cy - r * 0.7 },
        { x: cx + r, y: cy + r * 0.7 },
        { x: cx - r, y: cy + r * 0.7 },
        { x: cx - r, y: cy - r * 0.7 },
        { x: cx + r, y: cy - r * 0.7 },
        { x: cx + r, y: cy - r * 0.45 },
        { x: cx - r, y: cy - r * 0.45 }
      ];

    case 'checkmark':
      return [
        { x: cx - r, y: cy + r * 0.1 },
        { x: cx - r * 0.2, y: cy + r * 0.9 },
        { x: cx + r, y: cy - r * 0.8 }
      ];

    case 'ribbon':
      return [
        { x: cx - r, y: cy - r * 0.6 },
        { x: cx + r, y: cy - r * 0.6 },
        { x: cx + r * 0.8, y: cy },
        { x: cx + r, y: cy + r * 0.6 },
        { x: cx - r, y: cy + r * 0.6 },
        { x: cx - r * 0.8, y: cy },
        { x: cx - r, y: cy - r * 0.6 }
      ];

    case 'cross_x':
      return [
        { x: cx - r, y: cy - r + t },
        { x: cx - r + t, y: cy - r },
        { x: cx, y: cy - t },
        { x: cx + r - t, y: cy - r },
        { x: cx + r, y: cy - r + t },
        { x: cx + t, y: cy },
        { x: cx + r, y: cy + r - t },
        { x: cx + r - t, y: cy + r },
        { x: cx, y: cy + t },
        { x: cx - r + t, y: cy + r },
        { x: cx - r, y: cy + r - t },
        { x: cx - t, y: cy }
      ];

    case 'trapezoid':
      return [
        { x: cx - r * 0.65, y: cy - r },
        { x: cx + r * 0.65, y: cy - r },
        { x: cx + r, y: cy + r },
        { x: cx - r, y: cy + r },
        { x: cx - r * 0.65, y: cy - r }
      ];

    default:
      return [];
  }
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
