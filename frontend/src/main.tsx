import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { BASE } from './lib/base';
import './styles/tokens.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={BASE || '/'}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
