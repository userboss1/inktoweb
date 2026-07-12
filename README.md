# InkToWeb ↝

**Draw. Animate. Export as real code.**

InkToWeb is a browser-based SVG drawing and animation tool that converts your sketches into clean, production-ready HTML/SVG code — instantly, with no plugins.

![InkToWeb Preview](https://raw.githubusercontent.com/YOUR_USERNAME/inktoweb/main/preview.png)

---

## ✨ Features

- **Freehand pen** — smooth Bézier curves from hand-drawn strokes
- **Shapes** — closed freehand shapes with optional fill
- **Select & Move** — drag paths, rotate (±15°), flip, and delete
- **Animation recorder** — move a path through positions, capture keyframes, and save the motion
- **Visual Timeline** — sequence multiple animations with a proper track editor (stagger, together, per-item timing)
- **Live code panel** — watch your SVG/HTML update as you draw
- **Export HTML** — self-contained animated HTML file using SVG SMIL `<animate>`, works in any browser with no dependencies
- **Copy SVG/HTML** — paste clean code directly into your project

---

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Build for production
npm run build
```

Open [http://localhost:5173](http://localhost:5173) and start drawing.

---

## 🎬 How Animation Works

1. Select a path with the **Select** tool (V)
2. Click **Animate** in the toolbar
3. Drag the path to a new position → click **+ Position** to capture
4. Repeat for more keyframes
5. Click **Save ✓** — the animation is stored
6. Open **Timeline** to adjust timing, loop, and sequence multiple animations
7. **Export HTML** → the file uses SVG SMIL `<animate attributeName="d">` for zero-dependency animation that works everywhere

---

## 🛠 Tech Stack

| Layer | Tech |
|-------|------|
| UI Framework | React 18 |
| Build | Vite 5 |
| State | Zustand |
| Styling | Vanilla CSS |
| Animation export | SVG SMIL |

No Tailwind. No heavy animation libraries. Pure SVG math.

---

## 📁 Project Structure

```
src/
├── pages/
│   ├── Editor.jsx       # Main drawing + animation editor
│   └── Home.jsx         # Landing page
├── store/
│   └── useDrawingStore.js  # Zustand state (paths, tools, recording)
├── styles/
│   └── index.css        # All styles (design system + components)
└── utils/
    └── drawingHelpers.js   # Path math, animation interpolation, SVG/HTML export
```

---

## 📄 License

MIT — do whatever you want with it.
