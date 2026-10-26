import { useCallback, useEffect, useRef, useState } from 'react';
import { BASE } from '../lib/base';
import { getToken } from '../lib/token';
import type { GameState, Stroke } from '../types/game';

export interface StreamHandlers {
  onDraw?: (stroke: Stroke) => void;
  onClear?: () => void;
}

// React-версия public/client.js: подписка на состояние (SSE) + отправка действий.
export function useGameStream(role: 'screen' | 'player' | 'host', handlers?: StreamHandlers) {
  const [state, setState] = useState<GameState | null>(null);
  const [connected, setConnected] = useState(true);
  const tokenRef = useRef(getToken());
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const token = tokenRef.current;
    const es = new EventSource(`${BASE}/api/stream?role=${role}&token=${encodeURIComponent(token)}`);
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.kind === 'state') setState(msg);
      else if (msg.kind === 'draw') handlersRef.current?.onDraw?.(msg.stroke);
      else if (msg.kind === 'clear') handlersRef.current?.onClear?.();
    };
    es.onerror = () => setConnected(false);
    es.onopen = () => setConnected(true);
    return () => es.close();
  }, [role]);

  const send = useCallback(
    async (action: string, data?: Record<string, unknown>) => {
      const res = await fetch(`${BASE}/api/action?role=${role}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, token: tokenRef.current, ...data }),
      });
      return res.json();
    },
    [role],
  );

  const sendStroke = useCallback((stroke: Stroke) => {
    fetch(`${BASE}/api/draw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenRef.current, stroke }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  return { state, connected, send, sendStroke, token: tokenRef.current };
}
