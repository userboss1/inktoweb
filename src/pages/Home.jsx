import { Link } from 'react-router-dom';

const features = [
  { icon: '✏️', title: 'Freehand Drawing', desc: 'Pen and shape tools that capture every stroke as a crisp SVG path.' },
  { icon: '🎬', title: 'Motion Animation', desc: 'Record keyframe sequences, set duration & loop, then export as animated HTML.' },
  { icon: '⚡', title: 'Live Code Output', desc: 'See your SVG or full HTML update in real time as you draw.' },
  { icon: '📦', title: 'Export Ready', desc: 'One click exports a self-contained HTML file with all animations embedded.' },
  { icon: '↩️', title: 'Undo / Redo', desc: 'Full history stack — Ctrl+Z and Ctrl+Shift+Z work as expected.' },
  { icon: '🔍', title: 'Zoom Controls', desc: 'Zoom in to fine-tune details, zoom out to see the full composition.' },
];

export default function Home() {
  return (
    <div className="home">
      {/* Background decoration */}
      <div className="home-bg" aria-hidden="true">
        <div className="home-blob home-blob-1" />
        <div className="home-blob home-blob-2" />
        <div className="home-blob home-blob-3" />
        <div className="home-grid" />
      </div>

      {/* Nav */}
      <nav className="home-nav">
        <a className="brand" href="/">
          <span className="brand-mark">↝</span>
          <span className="brand-name">InkToWeb</span>
          <span className="brand-tag">Beta</span>
        </a>
        <div className="home-nav-actions">
          <Link to="/editor" className="btn btn-primary">Open Editor →</Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="home-hero">
        <div className="hero-badge">Draw it. Animate it. Ship it.</div>

        <h1 className="hero-title">
          Turn sketches into<br />
          <span className="hero-gradient">animated HTML.</span>
        </h1>

        <p className="hero-sub">
          Draw freely on a canvas. Every stroke becomes a real SVG path.
          Record motion sequences and export a ready-to-use animated HTML file — all inside your browser.
        </p>

        <div className="hero-actions">
          <Link to="/editor" className="btn btn-primary hero-cta">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
            Start Drawing
          </Link>
          <a href="#features" className="btn btn-ghost">See features</a>
        </div>

        {/* Preview card */}
        <div className="hero-preview">
          <div className="preview-card">
            <div className="preview-dots">
              <div className="preview-dot red" />
              <div className="preview-dot yellow" />
              <div className="preview-dot green" />
            </div>
            <svg viewBox="0 0 480 300" className="preview-svg" aria-label="Demo drawing preview">
              <rect width="480" height="300" fill="white" />
              <path d="M60 220 Q 120 80 200 160 Q 280 240 360 100 Q 400 50 440 140"
                fill="none" stroke="#6c63ff" strokeWidth="4" strokeLinecap="round" />
              <path d="M80 180 Q 140 120 220 200 Q 300 260 380 150"
                fill="none" stroke="#ff5c35" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
              <circle cx="240" cy="150" r="40" fill="none" stroke="#28c96f" strokeWidth="2" opacity="0.5" />
              <path d="M180 250 L 200 200 L 220 250 Z" fill="#6c63ff" opacity="0.3" />
              <path d="M320 240 Q 340 200 360 240" fill="none" stroke="#ff5c35" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </main>

      {/* Features grid */}
      <section className="home-features" id="features" aria-label="Features">
        {features.map(f => (
          <div className="feature-card" key={f.title}>
            <div className="feature-icon">{f.icon}</div>
            <strong>{f.title}</strong>
            <p>{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer className="home-footer">
        <span>Made with ↝ InkToWeb</span>
        <Link to="/editor" className="btn btn-primary">Open Editor →</Link>
      </footer>
    </div>
  );
}
