import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { login } from '../lib/api';
import { useToast } from '../hooks/useToast';
import Toast from '../components/Toast';
import './LoginPage.css';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const { toastMessage, toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    document.title = 'Стыдно знать — вход';
  }, []);

  async function submit() {
    const r = await login(password);
    if (r && r.ok) {
      const from = (location.state as { from?: string } | null)?.from || '/host';
      navigate(from, { replace: true });
    } else {
      toast((r && r.error) || 'Ошибка входа');
    }
  }

  return (
    <div className="login-page">
      <div className="box">
        <h1>Пароль ведущего</h1>
        <div className="fields">
          <input
            type="password"
            placeholder="Пароль"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
          <button className="gold" onClick={submit}>
            Войти
          </button>
        </div>
      </div>
      <Toast message={toastMessage} />
    </div>
  );
}
