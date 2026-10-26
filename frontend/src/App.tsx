import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from './routes/ProtectedRoute';
import HomePage from './pages/HomePage';
import ScreenPage from './pages/ScreenPage';
import PlayerPage from './pages/PlayerPage';
import HostPage from './pages/HostPage';
import BuilderPage from './pages/BuilderPage';
import LoginPage from './pages/LoginPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/screen" element={<ScreenPage />} />
      <Route path="/player" element={<PlayerPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/host" element={<HostPage />} />
        <Route path="/builder" element={<BuilderPage />} />
      </Route>
    </Routes>
  );
}
