import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home';
import Editor from './pages/Editor';
import useDrawingStore from './store/useDrawingStore';

export default function App() {
  const init = useDrawingStore(s => s.init);
  useEffect(() => { init(); }, []);
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/editor" element={<Editor />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
