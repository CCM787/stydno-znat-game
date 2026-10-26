import { BASE } from './base';
import type { BankQuestion, GameDetail, GameListItem } from '../types/game';

export async function fetchSession(): Promise<{ host: boolean }> {
  const r = await fetch(`${BASE}/api/session`);
  return r.json();
}

export async function login(password: string): Promise<{ ok?: true; error?: string }> {
  const r = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return r.json();
}

export async function fetchGames(): Promise<GameListItem[]> {
  const r = await fetch(`${BASE}/api/games`);
  return r.json();
}

export async function fetchQuestions(type?: string): Promise<BankQuestion[]> {
  const qs = type ? `?type=${encodeURIComponent(type)}` : '';
  const r = await fetch(`${BASE}/api/questions${qs}`);
  return r.json();
}

export async function fetchGame(id: number): Promise<GameDetail & { error?: string }> {
  const r = await fetch(`${BASE}/api/game?id=${id}`);
  return r.json();
}
