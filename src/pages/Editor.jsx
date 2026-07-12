import { useState, useRef, useEffect, useCallback } from 'react';
import useDrawingStore from '../store/useDrawingStore';
import {
  simplifyPoints,
  boundsOf,
  pathData,
  escapeHtml,
  frameMotion,
  svgMarkup,
  htmlMarkup,
  syntaxColor,
  clonePoints,
  sameFrame,
  pointsAtProgress,
} from '../utils/drawingHelpers';

// SVG icons as inline components
const icons = {
  pen: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
    </svg>
  ),
  shape: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  select: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 4 7.07 17 2.51-7.39L21 11.07z"/>
    </svg>
  ),
  eraser: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/>
      <path d="M22 21H7"/>
      <path d="m5 11 9 9"/>
    </svg>
  ),
  undo: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
    </svg>
  ),
  redo: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>
    </svg>
  ),
  rotateLeft: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 2v6h6"/><path d="M2.66 15.57a10 10 0 1 0 .57-8.38"/>
    </svg>
  ),
  rotateRight: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/>
    </svg>
  ),
  flipH: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/>
    </svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  ),
  anim: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
    </svg>
  ),
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPoint(e, svgEl) {
  const m = svgEl.getScreenCTM();
  return {
    x: Math.round((e.clientX - m.e) / m.a),
    y: Math.round((e.clientY - m.f) / m.d),
  };
}

// ── Sequence Panel ────────────────────────────────────────────────────────────
// A rich visual timeline editor: shows each animated path as a horizontal bar
// track, lets you drag-to-reorder (via start-time adjustment), set duration,
// toggle loop, and preview or export the whole sequence.
function SequencePanel({ open, onClose, animatedItems, totalDuration, playingPreview,
  onPreviewAll, onSchedule, onUpdateAnim, onRemove, onExport }) {

  const RULER_WIDTH = 460; // px
  const scale = totalDuration > 0 ? RULER_WIDTH / Math.max(totalDuration, 1) : 60;

  // Ruler tick marks (every 0.5s up to totalDuration + 1s buffer)
  const rulerEnd = Math.max(totalDuration, 1) + 0.5;
  const ticks = [];
  for (let t = 0; t <= rulerEnd; t += 0.5) {
    ticks.push(+(t.toFixed(1)));
  }

  return (
    <div className={`tl-panel ${open ? 'tl-panel--open' : ''}`} aria-label="Animation timeline" role="dialog">
      {/* Header */}
      <div className="tl-head">
        <div className="tl-head-left">
          <div className="tl-head-badge">TIMELINE</div>
          <strong className="tl-head-title">Animation Sequence</strong>
          <span className="tl-head-total">{totalDuration.toFixed(1)}s total</span>
        </div>
        <div className="tl-head-right">
          <button className="tl-btn" onClick={() => onSchedule('together')} title="All animations start at 0s">
            ⚡ Together
          </button>
          <button className="tl-btn" onClick={() => onSchedule('stagger')} title="Chain animations one after another">
            ↪ Stagger
          </button>
          <button
            className={`tl-btn tl-btn--play ${playingPreview ? 'tl-btn--playing' : ''}`}
            onClick={onPreviewAll}
            disabled={playingPreview || animatedItems.length === 0}
          >
            {playingPreview ? '■ Stop' : '▶ Preview all'}
          </button>
          <button className="tl-btn tl-btn--export" onClick={onExport}>↓ Export</button>
          <button className="tl-close" onClick={onClose} aria-label="Close timeline">✕</button>
        </div>
      </div>

      {/* Empty state */}
      {animatedItems.length === 0 && (
        <div className="tl-empty">
          <div className="tl-empty-icon">🎬</div>
          <p>No animations yet.</p>
          <small>Select a path on the canvas, then press <strong>Animate</strong> in the toolbar.</small>
        </div>
      )}

      {/* Track list */}
      {animatedItems.length > 0 && (
        <div className="tl-body">
          {/* Ruler */}
          <div className="tl-ruler-row">
            <div className="tl-track-label" />
            <div className="tl-ruler">
              {ticks.map(t => (
                <div key={t} className="tl-tick" style={{ left: t * scale }}>
                  {Number.isInteger(t * 2) && t % 1 === 0
                    ? <span>{t}s</span>
                    : t % 0.5 === 0 ? <span className="tl-tick--half" /> : null}
                </div>
              ))}
            </div>
          </div>

          {/* One row per animated path */}
          {animatedItems.map(({ item, index }, pos) => {
            const start = item.animation.start || 0;
            const dur = item.animation.duration || 1;
            const barLeft = start * scale;
            const barWidth = Math.max(16, dur * scale);

            return (
              <div className="tl-track" key={index}>
                {/* Label column */}
                <div className="tl-track-label">
                  <span className="tl-swatch" style={{ background: item.color }} />
                  <span className="tl-track-name">Path {index + 1}</span>
                  <span className="tl-track-kf">{item.animation.keyframes.length} kf</span>
                </div>

                {/* Bar track */}
                <div className="tl-track-area">
                  <div
                    className="tl-bar"
                    style={{ left: barLeft, width: barWidth }}
                    title={`Start: ${start.toFixed(1)}s  Duration: ${dur.toFixed(1)}s`}
                  >
                    <span className="tl-bar-label">{dur.toFixed(1)}s</span>
                  </div>
                </div>

                {/* Controls column */}
                <div className="tl-track-controls">
                  <label className="tl-field">
                    <span>Start</span>
                    <input
                      type="number" step="0.1" min="0"
                      value={start.toFixed(1)}
                      onChange={e => onUpdateAnim(index, { start: Math.max(0, +e.target.value || 0) })}
                    />
                    <span>s</span>
                  </label>
                  <label className="tl-field">
                    <span>Dur</span>
                    <input
                      type="number" step="0.1" min="0.1"
                      value={dur.toFixed(1)}
                      onChange={e => onUpdateAnim(index, { duration: Math.max(0.1, +e.target.value || 0.5) })}
                    />
                    <span>s</span>
                  </label>
                  <label className="tl-field tl-field--check">
                    <input
                      type="checkbox"
                      checked={!!item.animation.loop}
                      onChange={e => onUpdateAnim(index, { loop: e.target.checked })}
                    />
                    <span>Loop</span>
                  </label>
                  <button
                    className="tl-remove"
                    onClick={() => onRemove(index)}
                    title="Remove this animation"
                  >✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Editor() {
  const {
    paths, redoStack, tool, strokeColor, fillColor, strokeWidth, fillToggle,
    selectedIndex, zoom, activeView, recording, toast, coordinates,
    setTool, setStrokeColor, setFillColor, setStrokeWidth, setFillToggle,
    setSelectedIndex, setZoom, setActiveView, setRecording, setCoordinates,
    showToast, addPath, setPaths, deletePath, undo, redo, clearCanvas,
  } = useDrawingStore();

  // Refs — used for direct DOM updates during draw/playback to avoid React re-renders
  const svgRef = useRef(null);
  const draftRef = useRef(null);
  const artworkRef = useRef(null);
  const rafRef = useRef(null);

  // Local state (no store needed)
  const [drawing, setDrawing] = useState(false);
  const drawingRef = useRef(false);    // mirrors drawing state for use inside rAF
  const pointsRef = useRef([]);        // raw points buffer — NOT in state for performance

  const [dragging, setDragging] = useState(false);
  const dragLastRef = useRef(null);

  const [animDuration, setAnimDuration] = useState(2);
  const [animLoop, setAnimLoop] = useState(false);
  const [playingPreview, setPlayingPreview] = useState(false);
  const [seqOpen, setSeqOpen] = useState(false);
  const [coordText, setCoordText] = useState('x 0 / y 0');
  const [mobileTab, setMobileTab] = useState('draw'); // 'draw' | 'animate' | 'timeline' | 'code'

  // ── Pointer events ──────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const pt = getPoint(e, svgRef.current);

    if (tool === 'select') {
      const hit = e.target.closest('[data-index]');
      const idx = hit ? +hit.dataset.index : -1;
      setSelectedIndex(idx);
      setDragging(idx >= 0);
      dragLastRef.current = pt;
      try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
      return;
    }

    if (tool === 'eraser') {
      const hit = e.target.closest('[data-index]');
      if (hit) { deletePath(+hit.dataset.index); showToast('Erased'); }
      return;
    }

    // Pen / shape — start drawing
    drawingRef.current = true;
    setDrawing(true);
    pointsRef.current = [pt];

    if (draftRef.current) {
      draftRef.current.setAttribute('stroke', strokeColor);
      draftRef.current.setAttribute('stroke-width', strokeWidth);
      draftRef.current.setAttribute('fill', tool === 'shape' && fillToggle ? fillColor : 'none');
      draftRef.current.setAttribute('d', '');
    }
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
  }, [tool, strokeColor, fillColor, strokeWidth, fillToggle, deletePath, setSelectedIndex, showToast]);

  const onPointerMove = useCallback((e) => {
    // Always update coords
    const pt = getPoint(e, svgRef.current);
    setCoordText(`x ${pt.x} / y ${pt.y}`);

    // Drag selected path
    if (dragging && selectedIndex >= 0 && paths[selectedIndex]) {
      e.preventDefault();
      const prev = dragLastRef.current;
      const dx = pt.x - prev.x, dy = pt.y - prev.y;
      if (dx || dy) {
        // Mutate directly for perf, then trigger single state update
        const next = paths.map((item, i) => {
          if (i !== selectedIndex) return item;
          const p2 = { ...item, points: item.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
          if (!recording && item.animation) {
            p2.animation = {
              ...item.animation,
              keyframes: item.animation.keyframes.map(f => f.map(p => ({ x: p.x + dx, y: p.y + dy }))),
            };
          }
          return p2;
        });
        setPaths(next);
        dragLastRef.current = pt;
      }
      return;
    }

    if (!drawingRef.current) return;
    e.preventDefault();
    const pts = pointsRef.current;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 2) return;
    pts.push(pt);

    // Update draft path directly in DOM — no React setState = buttery smooth
    if (draftRef.current) {
      draftRef.current.setAttribute('d', pathData(pts, tool === 'shape'));
    }
  }, [dragging, selectedIndex, paths, tool, recording, setPaths]);

  const onPointerUp = useCallback((e) => {
    if (dragging) {
      setDragging(false);
      dragLastRef.current = null;
      try { if (svgRef.current?.hasPointerCapture?.(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId); } catch {}
      return;
    }
    if (!drawingRef.current) return;
    e.preventDefault();
    drawingRef.current = false;
    setDrawing(false);

    const pts = pointsRef.current;
    if (pts.length > 1) {
      const smooth = simplifyPoints(pts, strokeWidth > 12 ? 2.8 : 1.8);
      addPath({
        points: smooth,
        color: strokeColor,
        width: +strokeWidth,
        closed: tool === 'shape',
        fill: tool === 'shape' && fillToggle,
        fillColor,
      });
    }
    pointsRef.current = [];
    if (draftRef.current) draftRef.current.setAttribute('d', '');
    try { if (svgRef.current?.hasPointerCapture?.(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId); } catch {}
  }, [dragging, strokeColor, fillColor, strokeWidth, fillToggle, tool, addPath]);

  // ── Transforms ──────────────────────────────────────────────────────────────
  const getCenter = () => {
    const item = paths[selectedIndex];
    if (!item) return null;
    const xs = item.points.map(p => p.x), ys = item.points.map(p => p.y);
    return { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 };
  };

  const applyTransform = (action) => {
    if (selectedIndex < 0 || !paths[selectedIndex]) return;
    if (action === 'animate') { startRecording(); return; }
    if (action === 'delete') { deletePath(selectedIndex); showToast('Deleted'); return; }

    const c = getCenter(); if (!c) return;
    const angle = action === 'rotate-left' ? -15 * Math.PI / 180 : action === 'rotate-right' ? 15 * Math.PI / 180 : 0;

    const next = [...paths];
    const target = next[selectedIndex];
    const sets = [target.points, ...(!recording && target.animation ? target.animation.keyframes : [])];
    sets.forEach(set => set.forEach(p => {
      const x = p.x - c.cx, y = p.y - c.cy;
      if (angle) {
        p.x = Math.round(c.cx + x * Math.cos(angle) - y * Math.sin(angle));
        p.y = Math.round(c.cy + x * Math.sin(angle) + y * Math.cos(angle));
      } else if (action === 'flip-h') { p.x = Math.round(c.cx - x); }
      else if (action === 'flip-v') { p.y = Math.round(c.cy - y); }
    }));
    setPaths(next);
  };

  // ── Animation recording ──────────────────────────────────────────────────────
  const startRecording = () => {
    cancelAnimationFrame(rafRef.current);
    setRecording({ index: selectedIndex, keyframes: [clonePoints(paths[selectedIndex].points)] });
    showToast('Move the object, then press + Position');
  };

  const capturePosition = (notify = true) => {
    if (!recording || !paths[recording.index]) return false;
    const frame = clonePoints(paths[recording.index].points);
    if (sameFrame(frame, recording.keyframes.at(-1))) {
      if (notify) showToast('Move or rotate the object first');
      return false;
    }
    setRecording({ ...recording, keyframes: [...recording.keyframes, frame] });
    if (notify) showToast('Position captured ✓');
    return true;
  };

  const playRecording = () => {
    if (!recording) return;
    cancelAnimationFrame(rafRef.current);

    // Build final keyframes synchronously — do NOT call capturePosition() and then
    // immediately read recording.keyframes, because setRecording is async (stale closure).
    const currentFrame = paths[recording.index] ? clonePoints(paths[recording.index].points) : null;
    const frames = [...recording.keyframes.map(clonePoints)];
    if (currentFrame && !sameFrame(currentFrame, frames.at(-1))) {
      frames.push(currentFrame);
    }
    if (frames.length < 2) { showToast('Move the object and add a position first'); return; }

    const idx = recording.index;
    const item = paths[idx];
    const el = artworkRef.current?.querySelector(`[data-index="${idx}"]`);
    if (!el || !item) { showToast('Cannot preview'); return; }

    const dur = Math.max(0.2, animDuration) * 1000;
    setPlayingPreview(true);
    let t0 = 0;

    const tick = (now) => {
      if (!t0) t0 = now;
      const prog = Math.min(1, (now - t0) / dur);
      const scaled = prog * (frames.length - 1);
      const seg = Math.min(frames.length - 2, Math.floor(scaled));
      const mix = Math.min(1, scaled - seg);
      const from = frames[seg], to = frames[seg + 1];
      const m = frameMotion(from, to);
      const angle = m.angle * mix;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const cx = m.fromCenter.x + (m.toCenter.x - m.fromCenter.x) * mix;
      const cy = m.fromCenter.y + (m.toCenter.y - m.fromCenter.y) * mix;
      const pts = from.map(p => ({
        x: cx + (p.x - m.fromCenter.x) * cos - (p.y - m.fromCenter.y) * sin,
        y: cy + (p.x - m.fromCenter.x) * sin + (p.y - m.fromCenter.y) * cos,
      }));
      el.setAttribute('d', pathData(pts, item.closed));
      if (prog < 1) rafRef.current = requestAnimationFrame(tick);
      else {
        // After playback ends, reset the DOM path to keyframes[0] position
        el.setAttribute('d', pathData(frames[0], item.closed));
        setPlayingPreview(false);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const commitRecording = () => {
    if (!recording) return;
    cancelAnimationFrame(rafRef.current);
    setPlayingPreview(false);

    // Build final keyframes synchronously — never call capturePosition() and then
    // read recording.keyframes right after; setRecording is async so you'd read
    // stale state and lose the last captured frame.
    const currentFrame = paths[recording.index] ? clonePoints(paths[recording.index].points) : null;
    const finalKeyframes = [...recording.keyframes];
    if (currentFrame && !sameFrame(currentFrame, finalKeyframes.at(-1))) {
      finalKeyframes.push(currentFrame);
    }

    if (finalKeyframes.length < 2) {
      showToast('Move the object and capture at least one more position');
      return;
    }

    // Compute start offset so this animation plays after all existing ones
    const prevEnd = paths.reduce((end, item) => {
      if (!item.animation?.keyframes || item.animation.keyframes.length < 2) return end;
      return Math.max(end, (item.animation.start || 0) + item.animation.duration);
    }, 0);

    const next = paths.map((item, i) => {
      if (i !== recording.index) return item;
      return {
        ...item,
        // Reset points to keyframes[0] so the editor display matches the
        // exported HTML's starting position (which also uses keyframes[0]).
        points: clonePoints(finalKeyframes[0]),
        animation: {
          keyframes: finalKeyframes,
          duration: Math.max(0.2, animDuration),
          loop: animLoop,
          start: prevEnd,
        },
      };
    });
    setPaths(next);
    setRecording(null);
    showToast('Animation saved! 🎉');
  };

  const cancelRecording = () => {
    if (!recording) return;
    cancelAnimationFrame(rafRef.current);
    setPlayingPreview(false);
    // Restore original position
    const next = paths.map((item, i) =>
      i !== recording.index ? item : { ...item, points: clonePoints(recording.keyframes[0]) }
    );
    setPaths(next);
    setRecording(null);
  };

  // ── Sequence / master timeline ────────────────────────────────────────────────
  const getAnimated = () =>
    paths
      .map((item, index) => ({ item, index }))
      .filter(e => e.item.animation?.keyframes?.length > 1)
      .sort((a, b) => (a.item.animation.start || 0) - (b.item.animation.start || 0));

  const totalDuration = () =>
    paths.reduce((end, item) => {
      if (!item.animation?.keyframes?.length || item.animation.keyframes.length < 2) return end;
      return Math.max(end, (item.animation.start || 0) + item.animation.duration);
    }, 0);

  const previewAll = () => {
    const entries = getAnimated();
    if (!entries.length) return;
    cancelAnimationFrame(rafRef.current);
    const total = Math.max(0.2, totalDuration()) * 1000;
    let t0 = 0;
    setPlayingPreview(true);

    const tick = (now) => {
      if (!t0) t0 = now;
      const elapsed = (now - t0) / 1000;
      entries.forEach(({ item, index }) => {
        const el = artworkRef.current?.querySelector(`[data-index="${index}"]`);
        if (!el) return;
        const anim = item.animation;
        const local = elapsed < anim.start ? 0 : Math.min(1, (elapsed - anim.start) / anim.duration);
        const pts = pointsAtProgress(item, local);
        el.setAttribute('d', pathData(pts, item.closed));
      });
      if (now - t0 < total) rafRef.current = requestAnimationFrame(tick);
      else { setPlayingPreview(false); setPaths([...paths]); }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  // Update a single animation field on a path
  const updateAnim = (index, patch) => {
    setPaths(paths.map((item, i) =>
      i !== index ? item : { ...item, animation: { ...item.animation, ...patch } }
    ));
  };

  const removeAnimation = (index) => {
    setPaths(paths.map((item, i) => {
      if (i !== index) return item;
      const { animation, ...rest } = item;
      return { ...rest, points: item.animation?.keyframes?.[0] ? clonePoints(item.animation.keyframes[0]) : item.points };
    }));
  };

  // Schedule: play all together (start=0), or stagger one after another
  const scheduleAll = (mode) => {
    const animated = paths.filter(item => item.animation?.keyframes?.length > 1);
    if (!animated.length) return;
    if (mode === 'together') {
      setPaths(paths.map(item =>
        item.animation?.keyframes?.length > 1
          ? { ...item, animation: { ...item.animation, start: 0 } }
          : item
      ));
    } else {
      // stagger: chain one after another in draw order
      let cursor = 0;
      const next = paths.map(item => {
        if (!item.animation?.keyframes?.length || item.animation.keyframes.length < 2) return item;
        const updated = { ...item, animation: { ...item.animation, start: cursor } };
        cursor += item.animation.duration;
        return updated;
      });
      setPaths(next);
    }
  };

  // ── Export ───────────────────────────────────────────────────────────────────
  const downloadHtml = () => {
    const blob = new Blob([htmlMarkup(paths)], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'inktoweb.html';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('HTML exported 📦');
  };

  const copyCode = async () => {
    const text = activeView === 'html' ? htmlMarkup(paths) : svgMarkup(paths);
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      Object.assign(ta.style, { position: 'fixed', opacity: '0' });
      document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    showToast('Copied to clipboard ✓');
  };

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault(); e.shiftKey ? redo() : undo();
      } else if ((k === 'delete' || k === 'backspace') && selectedIndex >= 0) {
        e.preventDefault(); applyTransform('delete');
      } else if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (k === 'v') setTool('select');
        if (k === 'p') setTool('pen');
        if (k === 's') setTool('shape');
        if (k === 'e') setTool('eraser');
        if (k === 'escape' && recording) cancelRecording();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIndex, paths, recording, tool]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ── Selection outline ────────────────────────────────────────────────────────
  const selPath = selectedIndex >= 0 ? paths[selectedIndex] : null;
  const selBox = selPath ? boundsOf(selPath.animation?.keyframes?.[0] || selPath.points) : null;

  // ── Code output ──────────────────────────────────────────────────────────────
  const codeHtml = syntaxColor(escapeHtml(activeView === 'html' ? htmlMarkup(paths) : svgMarkup(paths)));
  const animatedItems = getAnimated();

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="editor-page-container">
      {/* ── Header ── */}
      <header className="topbar">
        <a className="brand" href="#" aria-label="InkToWeb">
          <span className="brand-mark">↝</span>
          <span className="brand-title-text">InkToWeb</span>
        </a>

        <div className="top-actions">
          <span className="save-indicator">
            <span className="save-indicator-dot" />
            Session
          </span>
          {animatedItems.length > 0 && (
            <button className="btn btn-ghost" onClick={() => { if (recording) commitRecording(); setSeqOpen(true); }}>
              Timeline ({animatedItems.length})
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => { if (paths.length && !confirm('Clear canvas?')) return; clearCanvas(); }}>
            New
          </button>
          <button className="btn btn-primary" onClick={downloadHtml}>
            Export HTML
          </button>
        </div>
      </header>

      <main className={`workspace show-${mobileTab}`}>
        {/* ── Tool sidebar ── */}
        <aside className="tools" aria-label="Drawing tools">
          {[
            { id: 'pen', label: 'Pen', key: 'P', icon: icons.pen },
            { id: 'shape', label: 'Shape', key: 'S', icon: icons.shape },
            { id: 'select', label: 'Select', key: 'V', icon: icons.select },
            { id: 'eraser', label: 'Erase', key: 'E', icon: icons.eraser },
          ].map(t => (
            <button
              key={t.id}
              className={`tool-btn ${tool === t.id ? 'active' : ''}`}
              onClick={() => setTool(t.id)}
              title={`${t.label} (${t.key})`}
            >
              <span className="tool-icon">{t.icon}</span>
              <span className="tool-label">{t.label}</span>
            </button>
          ))}
          <div className="tool-divider" />
          <button className="tool-btn" onClick={undo} disabled={!paths.length} title="Undo (Ctrl+Z)">
            <span className="tool-icon">{icons.undo}</span>
            <span className="tool-label">Undo</span>
          </button>
          <button className="tool-btn" onClick={redo} disabled={!redoStack.length} title="Redo (Ctrl+Shift+Z)">
            <span className="tool-icon">{icons.redo}</span>
            <span className="tool-label">Redo</span>
          </button>
        </aside>

        {/* ── Stage ── */}
        <section className="stage-panel">
          {/* Control bar */}
          <div className="controlbar" role="toolbar" aria-label="Drawing options">
            {/* Stroke */}
            <div className="ctrl-group">
              <span className="ctrl-label">Stroke</span>
              <input type="color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)} title="Stroke color" />
            </div>

            {/* Fill */}
            <div className="ctrl-group">
              <span className="ctrl-label">Fill</span>
              <input type="color" value={fillColor} onChange={e => setFillColor(e.target.value)} title="Fill color" />
              <label className="toggle" title="Enable fill">
                <input type="checkbox" checked={fillToggle} onChange={e => setFillToggle(e.target.checked)} />
                <span className="toggle-track" />
              </label>
            </div>

            {/* Size */}
            <div className="ctrl-group">
              <span className="ctrl-label">Size</span>
              <input type="range" min="1" max="40" value={strokeWidth} onChange={e => setStrokeWidth(+e.target.value)} />
              <span className="size-output">{strokeWidth}</span>
            </div>

            {/* Selection actions — only show when a path is selected in select mode */}
            <div className={`selection-bar ${selectedIndex >= 0 && tool === 'select' ? 'visible' : ''}`} aria-label="Selection tools">
              <span className="selection-bar-label">Selected</span>
              <button className="btn-icon" onClick={() => applyTransform('rotate-left')} title="Rotate left 15°">{icons.rotateLeft}</button>
              <button className="btn-icon" onClick={() => applyTransform('rotate-right')} title="Rotate right 15°">{icons.rotateRight}</button>
              <button className="btn-icon" onClick={() => applyTransform('flip-h')} title="Flip horizontal">{icons.flipH}</button>
              <button
                className="btn btn-sm"
                style={{ background: '#705aef', border: 'none', color: 'white', fontWeight: 800 }}
                onClick={() => applyTransform('animate')}
                title="Record animation"
              >
                {icons.anim} Animate
              </button>
              <button className="btn-icon danger" onClick={() => applyTransform('delete')} title="Delete (Del)">{icons.trash}</button>
            </div>

            {/* Zoom */}
            <div className="zoom-group">
              <button className="btn-icon" onClick={() => setZoom(zoom - 0.1)} title="Zoom out">−</button>
              <span className="zoom-label">{Math.round(zoom * 100)}%</span>
              <button className="btn-icon" onClick={() => setZoom(zoom + 0.1)} title="Zoom in">+</button>
            </div>
          </div>

          {/* Canvas */}
          <div className="canvas-wrap">
            <div
              className="canvas-scale"
              style={{ scale: zoom }}
            >
              <svg
                ref={svgRef}
                id="drawingCanvas"
                viewBox="0 0 960 600"
                aria-label="Drawing canvas"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDragStart={e => e.preventDefault()}
                style={{ cursor: tool === 'eraser' ? 'cell' : tool === 'select' ? 'default' : 'crosshair' }}
              >
                <rect width="960" height="600" fill="white" />

                {/* Artwork */}
                <g ref={artworkRef}>
                  {paths.map((item, index) => (
                    <path
                      key={index}
                      data-index={index}
                      d={pathData(item.points, item.closed)}
                      fill={item.closed && item.fill ? item.fillColor : 'none'}
                      stroke={item.color}
                      strokeWidth={item.width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ cursor: tool === 'select' ? 'move' : 'default' }}
                    />
                  ))}
                </g>

                {/* Draft stroke — updated directly via ref, no React re-render */}
                <path
                  ref={draftRef}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Selection outline */}
                {selBox && tool === 'select' && (
                  <g pointerEvents="none">
                    <rect
                      x={selBox.x - 8} y={selBox.y - 8}
                      width={Math.max(16, selBox.width + 16)}
                      height={Math.max(16, selBox.height + 16)}
                      fill="none"
                      stroke="#356dff"
                      strokeWidth="1.5"
                      strokeDasharray="6 4"
                      rx="4"
                    />
                    <circle
                      cx={selBox.cx} cy={selBox.y - 8}
                      r="5" fill="white" stroke="#356dff" strokeWidth="1.5"
                    />
                  </g>
                )}
              </svg>
            </div>

            {/* Canvas hint */}
            <div className={`canvas-hint ${paths.length > 0 || drawing ? 'hidden' : ''}`} aria-hidden="true">
              <div className="canvas-hint-box">
                <div className="hint-key">P</div>
                <p>Pick a tool and draw anywhere<br />to create your first path</p>
              </div>
            </div>

            {/* ── Animation recorder ── */}
            <section className={`anim-panel ${recording ? 'visible' : ''}`} aria-label="Animation recorder">
              <div className="anim-record-dot" />
              <div className="anim-info">
                <strong>Recording motion</strong>
                <small>
                  {recording ? `${recording.keyframes.length} keyframe${recording.keyframes.length !== 1 ? 's' : ''}` : ''}
                </small>
              </div>

              {/* Timeline dots */}
              <div className="anim-timeline">
                {recording?.keyframes.map((_, i) => (
                  <div key={i} className={`kf-dot ${i === recording.keyframes.length - 1 ? 'active' : ''}`} />
                ))}
              </div>

              <label className="anim-field">
                Duration
                <input type="number" min="0.2" max="30" step="0.1" value={animDuration}
                  onChange={e => setAnimDuration(+e.target.value)} />
                s
              </label>
              <label className="anim-field">
                <input type="checkbox" checked={animLoop} onChange={e => setAnimLoop(e.target.checked)} />
                Loop
              </label>

              <button className="anim-btn" onClick={() => applyTransform('rotate-left')} title="Rotate 15° left">↺ 15°</button>
              <button className="anim-btn" onClick={() => applyTransform('rotate-right')} title="Rotate 15° right">↻ 15°</button>
              <button className="anim-btn" onClick={() => capturePosition()}>+ Position</button>
              <button className="anim-btn play" disabled={playingPreview} onClick={playRecording}>
                {playingPreview ? '▶ Playing…' : '▶ Preview'}
              </button>
              <button className="anim-btn cancel" onClick={cancelRecording}>Cancel</button>
              <button className="anim-btn confirm" onClick={commitRecording}>Save ✓</button>
            </section>
          </div>

          {/* Status bar */}
          <footer className="statusbar" aria-label="Canvas status">
            <span><b>{paths.length}</b> {paths.length === 1 ? 'path' : 'paths'}</span>
            <span>960 × 600</span>
            <span>{coordText}</span>
          </footer>
        </section>

        {/* ── Code panel ── */}
        <aside className="code-panel">
          <div className="panel-head">
            <div>
              <p className="panel-eyebrow">Live Output</p>
              <h2 className="panel-title">Your drawing<br/>is code.</h2>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              {activeView !== 'preview' && (
                <button className="btn-copy" onClick={copyCode} title="Copy to clipboard">Copy</button>
              )}
              <button className="btn-copy" onClick={downloadHtml} title="Download as HTML file"
                style={{ background: '#ff5c35', border: 'none', color: 'white' }}>
                ↓ HTML
              </button>
            </div>
          </div>

          <div className="tabs" role="tablist">
            {['svg', 'html', 'preview'].map(v => (
              <button
                key={v}
                className={`tab ${activeView === v ? 'active' : ''}`}
                onClick={() => setActiveView(v)}
                role="tab"
              >
                {v === 'svg' ? 'SVG' : v === 'html' ? 'HTML' : 'Preview'}
              </button>
            ))}
          </div>

          <div className="code-view" style={{ display: activeView === 'preview' ? 'none' : 'block' }}>
            <pre><code dangerouslySetInnerHTML={{ __html: codeHtml }} /></pre>
          </div>
          <iframe
            id="previewFrame"
            title="Preview"
            srcDoc={htmlMarkup(paths)}
            style={{ display: activeView === 'preview' ? 'block' : 'none', width: '100%', height: '100%', border: 0 }}
          />

          <div className="code-footer">
            <span className="code-footer-dot">✦</span>
            Every stroke is a real SVG path — sharp at any size.
          </div>
        </aside>
      </main>

      {/* ── Mobile Bottom Navigation Tab Bar ── */}
      <nav className="mobile-nav-tabs" role="tablist">
        <button
          className={`mobile-tab-item ${mobileTab === 'draw' ? 'active' : ''}`}
          onClick={() => { setMobileTab('draw'); setSelectedIndex(-1); }}
          role="tab"
          aria-selected={mobileTab === 'draw'}
        >
          <span className="tab-icon">✏️</span>
          <span className="tab-text">Draw</span>
        </button>
        <button
          className={`mobile-tab-item ${mobileTab === 'animate' ? 'active' : ''}`}
          onClick={() => {
            setMobileTab('animate');
            setTool('select');
            if (selectedIndex < 0 && paths.length > 0) {
              setSelectedIndex(0); // auto-select first path for convenience
            }
          }}
          role="tab"
          aria-selected={mobileTab === 'animate'}
        >
          <span className="tab-icon">🎬</span>
          <span className="tab-text">Animate</span>
        </button>
        <button
          className={`mobile-tab-item ${mobileTab === 'timeline' ? 'active' : ''}`}
          onClick={() => {
            setMobileTab('timeline');
            setSeqOpen(true);
          }}
          role="tab"
          aria-selected={mobileTab === 'timeline'}
        >
          <span className="tab-icon">📊</span>
          <span className="tab-text">Timeline</span>
        </button>
        <button
          className={`mobile-tab-item ${mobileTab === 'code' ? 'active' : ''}`}
          onClick={() => setMobileTab('code')}
          role="tab"
          aria-selected={mobileTab === 'code'}
        >
          <span className="tab-icon">💻</span>
          <span className="tab-text">Code</span>
        </button>
      </nav>

      {/* ── Sequence / Timeline panel (extricated from stage to render independently) ── */}
      <SequencePanel
        open={seqOpen || mobileTab === 'timeline'}
        onClose={() => {
          setSeqOpen(false);
          if (mobileTab === 'timeline') setMobileTab('draw');
          setPaths([...paths]);
        }}
        animatedItems={animatedItems}
        totalDuration={totalDuration()}
        playingPreview={playingPreview}
        onPreviewAll={previewAll}
        onSchedule={scheduleAll}
        onUpdateAnim={updateAnim}
        onRemove={removeAnimation}
        onExport={downloadHtml}
      />

      {/* Toast */}
      <div className={`toast ${toast?.visible ? 'show' : ''}`} role="status" aria-live="polite">
        {toast?.message}
      </div>
    </div>
  );
}
