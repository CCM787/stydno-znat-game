import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { fetchSession } from '../lib/api';

// Реальная защита данных остаётся на сервере (hostOk() в server.js);
// этот редирект — только клиентский UX, чтобы не показывать пустой /host до логина.
export default function ProtectedRoute() {
  const [host, setHost] = useState<boolean | null>(null);
  const location = useLocation();

  useEffect(() => {
    fetchSession().then((s) => setHost(s.host));
  }, []);

  if (host === null) return null;
  if (!host) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Outlet />;
}
