import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import Setup from './pages/Setup';
import Job from './pages/Job';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/configurar" element={<Setup />} />
      <Route path="/copia/:id" element={<Job />} />
      <Route path="/configuracoes" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
