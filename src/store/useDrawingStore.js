import { create } from 'zustand';

const useDrawingStore = create((set, get) => ({
  paths: [],
  redoStack: [],
  tool: 'pen',
  strokeColor: '#171717',
  fillColor: '#ff5c35',
  strokeWidth: 6,
  fillToggle: false,
  selectedIndex: -1,
  zoom: 1,
  activeView: 'svg',
  recording: null,
  toast: { message: '', visible: false },
  coordinates: { x: 0, y: 0 },

  init: () => {},

  setTool: (tool) =>
    set((s) => ({
      tool,
      fillToggle: tool === 'shape' ? true : s.fillToggle,
      selectedIndex: tool !== 'select' ? -1 : s.selectedIndex,
    })),

  setStrokeColor: (strokeColor) => set({ strokeColor }),
  setFillColor: (fillColor) => set({ fillColor }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
  setFillToggle: (fillToggle) => set({ fillToggle }),
  setSelectedIndex: (selectedIndex) => set({ selectedIndex }),
  setZoom: (zoom) => set({ zoom: Math.max(0.3, Math.min(2.5, zoom)) }),
  setActiveView: (activeView) => set({ activeView }),
  setRecording: (recording) => set({ recording }),
  setCoordinates: (coordinates) => set({ coordinates }),

  showToast: (message) => {
    // Clear any existing timer via a flag approach
    set({ toast: { message, visible: true } });
    // We cancel in a timeout — simple and effective
    setTimeout(() => {
      set((s) => s.toast.message === message ? { toast: { ...s.toast, visible: false } } : s);
    }, 2000);
  },

  addPath: (path) =>
    set((s) => ({ paths: [...s.paths, path], redoStack: [] })),

  setPaths: (paths) => set({ paths }),

  deletePath: (index) =>
    set((s) => {
      const paths = s.paths.filter((_, i) => i !== index);
      const selectedIndex = s.selectedIndex === index ? -1
        : s.selectedIndex > index ? s.selectedIndex - 1
        : s.selectedIndex;
      return { paths, selectedIndex };
    }),

  undo: () =>
    set((s) => {
      if (!s.paths.length) return s;
      const paths = [...s.paths];
      const popped = paths.pop();
      return { paths, redoStack: [...s.redoStack, popped], selectedIndex: -1 };
    }),

  redo: () =>
    set((s) => {
      if (!s.redoStack.length) return s;
      const redoStack = [...s.redoStack];
      const popped = redoStack.pop();
      return { paths: [...s.paths, popped], redoStack, selectedIndex: -1 };
    }),

  clearCanvas: () =>
    set({ paths: [], redoStack: [], selectedIndex: -1, recording: null }),
}));

export default useDrawingStore;
