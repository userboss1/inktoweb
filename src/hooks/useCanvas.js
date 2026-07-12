import { useEffect, useRef, useCallback } from 'react';
import useDrawingStore from '../store/useDrawingStore';
import { pointFromEvent, pathData, smoothPoints, snapPoint, clonePoints, moveItem, getItemCenter } from '../utils/canvasUtils';

const SVG_NS = 'http://www.w3.org/2000/svg';

export default function useCanvas(svgRef) {
  const store = useDrawingStore();

  // Refs for in-progress drawing (no re-render during stroke)
  const drawing = useRef(false);
  const points = useRef([]);
  const drawStart = useRef(null);
  const selectDragging = useRef(false);
  const selectLastPt = useRef(null);
  const spaceHeld = useRef(false);
  const isPanning = useRef(false);
  const panStart = useRef(null);
  const playbackFrame = useRef(null);

  // Draft SVG elements (created imperatively)
  const draftPathEl = useRef(null);
  const draftRectEl = useRef(null);
  const draftEllipseEl = useRef(null);
  const draftLineEl = useRef(null);

  function getStore() { return useDrawingStore.getState(); }

  // Create draft elements on mount
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const make = (tag, attrs) => {
      const el = document.createElementNS(SVG_NS, tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      el.setAttribute('pointer-events', 'none');
      svg.appendChild(el);
      return el;
    };
    draftPathEl.current = make('path', { d: '', fill: 'none', stroke: '#1a1a2e', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    draftRectEl.current = make('rect', { x: 0, y: 0, width: 0, height: 0, fill: 'none', stroke: '#1a1a2e', 'stroke-width': 2, 'stroke-dasharray': '6 4', display: 'none' });
    draftEllipseEl.current = make('ellipse', { cx: 0, cy: 0, rx: 0, ry: 0, fill: 'none', stroke: '#1a1a2e', 'stroke-width': 2, 'stroke-dasharray': '6 4', display: 'none' });
    draftLineEl.current = make('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: '#1a1a2e', 'stroke-width': 2, 'stroke-dasharray': '6 4', 'stroke-linecap': 'round', display: 'none' });
    return () => {
      [draftPathEl, draftRectEl, draftEllipseEl, draftLineEl].forEach(r => r.current?.remove());
    };
  }, [svgRef]);

  function clearDrafts() {
    draftPathEl.current?.setAttribute('d', '');
    draftRectEl.current?.setAttribute('display', 'none');
    draftEllipseEl.current?.setAttribute('display', 'none');
    draftLineEl.current?.setAttribute('display', 'none');
  }

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    const svg = svgRef.current;
    const s = getStore();

    if (spaceHeld.current) {
      isPanning.current = true;
      panStart.current = { x: e.clientX - s.panX, y: e.clientY - s.panY };
      svg.style.cursor = 'grabbing';
      return;
    }

    const pt = pointFromEvent(e, svg);
    const snapped = s.snapEnabled ? snapPoint(pt) : pt;

    if (s.tool === 'select') {
      e.preventDefault();
      const hit = e.target.closest('[data-index]');
      if (hit) {
        s.setSelectedIndex(Number(hit.dataset.index));
        selectDragging.current = true;
        selectLastPt.current = pt;
      } else {
        s.setSelectedIndex(-1);
      }
      try { svg.setPointerCapture(e.pointerId); } catch {}
      return;
    }

    if (s.tool === 'eraser') {
      const hit = e.target.closest('[data-index]');
      if (hit) {
        const idx = Number(hit.dataset.index);
        const layer = s.layers.find(l => l.id === s.paths[idx]?.layerId);
        if (layer?.locked) { s.showToast('Layer is locked', 'error'); return; }
        s.removePath(idx);
        s.showToast('Path erased');
      }
      return;
    }

    if (s.tool === 'text') {
      s.setTextPlacePoint(snapped);
      s.openModal('text');
      return;
    }

    e.preventDefault();
    drawing.current = true;
    drawStart.current = snapped;
    points.current = [snapped];

    try { svg.setPointerCapture(e.pointerId); } catch {}

    // Configure drafts
    const stroke = s.strokeColor;
    const w = s.strokeWidth;
    const fill = s.fillEnabled ? s.fillColor : 'none';

    draftPathEl.current.setAttribute('stroke', stroke);
    draftPathEl.current.setAttribute('stroke-width', w);
    draftPathEl.current.setAttribute('fill', fill);
    draftRectEl.current.setAttribute('stroke', stroke);
    draftRectEl.current.setAttribute('stroke-width', w);
    draftRectEl.current.setAttribute('fill', fill);
    draftEllipseEl.current.setAttribute('stroke', stroke);
    draftEllipseEl.current.setAttribute('stroke-width', w);
    draftEllipseEl.current.setAttribute('fill', fill);
    draftLineEl.current.setAttribute('stroke', stroke);
    draftLineEl.current.setAttribute('stroke-width', w);

    if (s.tool === 'rect') {
      draftRectEl.current.setAttribute('display', 'block');
      draftRectEl.current.setAttribute('x', snapped.x);
      draftRectEl.current.setAttribute('y', snapped.y);
      draftRectEl.current.setAttribute('width', 0);
      draftRectEl.current.setAttribute('height', 0);
    } else if (s.tool === 'ellipse') {
      draftEllipseEl.current.setAttribute('display', 'block');
      draftEllipseEl.current.setAttribute('cx', snapped.x);
      draftEllipseEl.current.setAttribute('cy', snapped.y);
      draftEllipseEl.current.setAttribute('rx', 0);
      draftEllipseEl.current.setAttribute('ry', 0);
    } else if (s.tool === 'line') {
      draftLineEl.current.setAttribute('display', 'block');
      draftLineEl.current.setAttribute('x1', snapped.x);
      draftLineEl.current.setAttribute('y1', snapped.y);
      draftLineEl.current.setAttribute('x2', snapped.x);
      draftLineEl.current.setAttribute('y2', snapped.y);
    }
  }, []);

  const onPointerMove = useCallback((e) => {
    const svg = svgRef.current;
    const s = getStore();

    if (isPanning.current && panStart.current) {
      s.setPan(e.clientX - panStart.current.x, e.clientY - panStart.current.y);
      return;
    }

    const pt = pointFromEvent(e, svg);
    const snapped = s.snapEnabled ? snapPoint(pt) : pt;

    // Update coordinates display
    useDrawingStore.setState({ coords: `x ${pt.x} · y ${pt.y}` });

    if (selectDragging.current && s.selectedIndex >= 0) {
      e.preventDefault();
      const dx = pt.x - selectLastPt.current.x;
      const dy = pt.y - selectLastPt.current.y;
      if (dx || dy) {
        const newPaths = [...s.paths];
        const item = JSON.parse(JSON.stringify(newPaths[s.selectedIndex]));
        moveItem(item, dx, dy);
        if (item.animation) {
          item.animation = { ...item.animation, keyframes: item.animation.keyframes.map(f => f.map(p => ({ x: p.x + dx, y: p.y + dy }))) };
        }
        newPaths[s.selectedIndex] = item;
        useDrawingStore.setState({ paths: newPaths });
        selectLastPt.current = pt;
      }
      return;
    }

    if (!drawing.current) return;
    e.preventDefault();

    const tool = s.tool;
    const start = drawStart.current;

    if (tool === 'rect' && start) {
      const x = Math.min(start.x, snapped.x), y = Math.min(start.y, snapped.y);
      draftRectEl.current.setAttribute('x', x);
      draftRectEl.current.setAttribute('y', y);
      draftRectEl.current.setAttribute('width', Math.abs(snapped.x - start.x));
      draftRectEl.current.setAttribute('height', Math.abs(snapped.y - start.y));
      return;
    }
    if (tool === 'ellipse' && start) {
      const rx = Math.abs(snapped.x - start.x) / 2;
      const ry = Math.abs(snapped.y - start.y) / 2;
      draftEllipseEl.current.setAttribute('cx', (start.x + snapped.x) / 2);
      draftEllipseEl.current.setAttribute('cy', (start.y + snapped.y) / 2);
      draftEllipseEl.current.setAttribute('rx', rx);
      draftEllipseEl.current.setAttribute('ry', ry);
      return;
    }
    if (tool === 'line' && start) {
      draftLineEl.current.setAttribute('x2', snapped.x);
      draftLineEl.current.setAttribute('y2', snapped.y);
      return;
    }

    const last = points.current[points.current.length - 1];
    if (Math.hypot(snapped.x - last.x, snapped.y - last.y) < 2) return;
    points.current.push(snapped);
    draftPathEl.current.setAttribute('d', pathData(points.current, tool === 'shape'));
  }, []);

  const onPointerUp = useCallback((e) => {
    const svg = svgRef.current;
    const s = getStore();

    if (isPanning.current) {
      isPanning.current = false;
      panStart.current = null;
      svg.style.cursor = '';
      return;
    }

    if (selectDragging.current) {
      selectDragging.current = false;
      selectLastPt.current = null;
      s.scheduleAutoSave();
      try { if (svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId); } catch {}
      return;
    }

    if (!drawing.current) return;
    e.preventDefault();
    drawing.current = false;

    const pt = pointFromEvent(e, svg);
    const snapped = s.snapEnabled ? snapPoint(pt) : pt;
    const start = drawStart.current;
    const layer = s.layers.find(l => l.id === s.activeLayerId);
    if (layer?.locked) { s.showToast('Active layer is locked', 'error'); clearDrafts(); return; }

    const base = {
      color: s.strokeColor,
      width: Number(s.strokeWidth),
      opacity: s.opacity < 100 ? s.opacity / 100 : 1,
      fill: s.fillEnabled,
      fillColor: s.fillColor,
      layerId: s.activeLayerId,
      name: null,
    };

    if (s.tool === 'rect' && start) {
      const w = Math.abs(snapped.x - start.x), h = Math.abs(snapped.y - start.y);
      if (w > 2 && h > 2) s.addPath({ ...base, type: 'rect', x: Math.min(start.x, snapped.x), y: Math.min(start.y, snapped.y), w, h, closed: true });
    } else if (s.tool === 'ellipse' && start) {
      const rx = Math.abs(snapped.x - start.x) / 2, ry = Math.abs(snapped.y - start.y) / 2;
      if (rx > 2 && ry > 2) s.addPath({ ...base, type: 'ellipse', cx: (start.x + snapped.x) / 2, cy: (start.y + snapped.y) / 2, rx, ry, closed: true });
    } else if (s.tool === 'line' && start) {
      if (Math.hypot(snapped.x - start.x, snapped.y - start.y) > 4)
        s.addPath({ ...base, type: 'line', x1: start.x, y1: start.y, x2: snapped.x, y2: snapped.y });
    } else if (points.current.length) {
      const pts = s.tool === 'brush' ? smoothPoints(points.current) : points.current;
      s.addPath({ ...base, type: s.tool === 'shape' ? 'shape' : 'pen', points: pts, closed: s.tool === 'shape' });
    }

    clearDrafts();
    points.current = [];
    drawStart.current = null;
    try { if (svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId); } catch {}
  }, []);

  // Playback for animation recording preview
  const playRecordingPreview = useCallback(() => {
    const s = getStore();
    if (!s.recording) return;
    s.captureKeyframe(false);
    const { recording, paths } = getStore();
    if (recording.keyframes.length < 2) { s.showToast('Add another position first'); return; }
    cancelAnimationFrame(playbackFrame.current);
    const frames = recording.keyframes.map(clonePoints);
    const item = paths[recording.index];
    const pathEl = svgRef.current?.querySelector(`[data-index="${recording.index}"]`);
    if (!pathEl || !item) return;
    const duration = 2000;
    let started = 0;
    function tick(now) {
      if (!started) started = now;
      const progress = Math.min(1, (now - started) / duration);
      const { pointsAtProgress } = require('../utils/canvasUtils');
      const pts = pointsAtProgress({ animation: { keyframes: frames } }, progress);
      pathEl.setAttribute('d', pathData(pts, item.closed));
      if (progress < 1) playbackFrame.current = requestAnimationFrame(tick);
      else pathEl.setAttribute('d', pathData(frames[frames.length - 1], item.closed));
    }
    playbackFrame.current = requestAnimationFrame(() => { playbackFrame.current = requestAnimationFrame(tick); });
  }, []);

  // Setup / teardown event listeners
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup', onPointerUp);
    svg.addEventListener('pointercancel', onPointerUp);
    svg.addEventListener('dragstart', e => e.preventDefault());
    return () => {
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerup', onPointerUp);
      svg.removeEventListener('pointercancel', onPointerUp);
    };
  }, [onPointerDown, onPointerMove, onPointerUp]);

  // Space = pan mode
  useEffect(() => {
    const down = (e) => { if (e.key === ' ' && !e.target.closest('input,textarea,select')) { spaceHeld.current = true; if (svgRef.current) svgRef.current.style.cursor = 'grab'; e.preventDefault(); } };
    const up = (e) => { if (e.key === ' ') { spaceHeld.current = false; if (!isPanning.current && svgRef.current) svgRef.current.style.cursor = ''; } };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  return { playRecordingPreview };
}
