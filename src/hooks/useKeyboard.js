import { useEffect } from 'react';
import useDrawingStore from '../store/useDrawingStore';

export default function useKeyboard() {
  useEffect(() => {
    const handler = (e) => {
      const s = useDrawingStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const inp = e.target.closest('input, textarea, select');
      if (inp) return;

      if (ctrl && key === 'z') { e.preventDefault(); e.shiftKey ? s.redo() : s.undo(); return; }
      if (ctrl && key === 'y') { e.preventDefault(); s.redo(); return; }
      if (ctrl && key === 'd') { e.preventDefault(); s.duplicateSelected(); return; }
      if (ctrl && key === 's') { e.preventDefault(); s.scheduleAutoSave(); s.showToast('Saved', 'success'); return; }
      if (ctrl && key === 'e') { e.preventDefault(); s.openModal('export'); return; }
      if (ctrl && key === 'a') { e.preventDefault(); if (s.paths.length) s.setSelectedIndex(s.paths.length - 1); return; }
      if (ctrl && key === '0') { e.preventDefault(); s.resetView(); return; }

      const toolMap = { v: 'select', p: 'pen', b: 'brush', s: 'shape', r: 'rect', o: 'ellipse', l: 'line', t: 'text', e: 'eraser' };
      if (!ctrl && toolMap[key]) { s.setTool(toolMap[key]); return; }

      if (key === 'g') { s.setGridEnabled(!s.gridEnabled); return; }
      if (key === '?' || key === '/') { s.openModal('shortcuts'); return; }
      if (key === '+' || key === '=') { s.setZoom(s.zoom + 0.1); return; }
      if (key === '-') { s.setZoom(s.zoom - 0.1); return; }
      if (key === 'escape') {
        if (s.recording) { s.cancelRecording(); return; }
        s.setSelectedIndex(-1);
        s.closeModal();
        return;
      }
      if ((key === 'delete' || key === 'backspace') && s.selectedIndex >= 0) { e.preventDefault(); s.deleteSelected(); return; }

      const arrows = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
      if (s.selectedIndex >= 0 && arrows[key]) {
        e.preventDefault();
        const [dx, dy] = arrows[key].map(v => v * (e.shiftKey ? 10 : 1));
        s.moveSelectedBy(dx, dy);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
