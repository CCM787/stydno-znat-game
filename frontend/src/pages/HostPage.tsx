import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGameStream } from '../hooks/useGameStream';
import { fetchGames } from '../lib/api';
import { useToast } from '../hooks/useToast';
import Toast from '../components/Toast';
import type { GameListItem, TeamId } from '../types/game';
import './HostPage.css';

const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е'];
const COLORS: Record<TeamId, string> = { A: 'var(--p1)', B: 'var(--p2)' };

export default function HostPage() {
  const { state: s, send } = useGameStream('host');
  const { toastMessage, toast } = useToast();
  const [games, setGames] = useState<GameListItem[]>([]);
  const [gameId, setGameId] = useState('random');
  const [nameA, setNameA] = useState('');
  const [nameB, setNameB] = useState('');
  const setupRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    document.title = 'Стыдно знать — пульт';
  }, []);

  useEffect(() => {
    fetchGames().then(setGames);
  }, []);

  useEffect(() => {
    if (s && !s.packName && setupRef.current) setupRef.current.open = true;
  }, [s?.packName]);

  async function act(action: string, data?: Record<string, unknown>) {
    try {
      const r = await send(action, data);
      if (r && r.error) toast(r.error);
    } catch {
      toast('Ошибка сети — попробуйте ещё раз');
    }
  }

  if (!s) return null;

  const q = s.question;
  const joined = Object.values(s.players).filter((p) => p.taken);
  const isDraw = !!q && q.type === 'draw';
  const open = s.phase === 'question';
  const openLabel = open
    ? 'Открыть заново'
    : q && q.image
      ? 'Показать картинку'
      : q && q.type === 'choice'
        ? 'Открыть варианты'
        : 'Начать вопрос';
  const isLast = !!s.packName && s.roundIndex === s.roundCount - 1 && s.qIndex === s.qCount - 1;

  const qHead = q
    ? `${s.roundTitle || ''} · вопрос ${s.qIndex + 1}/${s.qCount} · ${
        { question: 'идёт', reveal: 'ответ показан', preview: 'не открыт', lobby: 'не открыт', results: 'не открыт' }[s.phase]
      }`
    : 'вопрос';

  function startGame() {
    if (!gameId) return toast('Нет доступных игр — добавьте вопросы в конструкторе');
    const data: Record<string, unknown> = { gameId };
    const a = nameA.trim();
    const b = nameB.trim();
    if (a) data.nameA = a;
    if (b) data.nameB = b;
    act('newGame', data);
    if (setupRef.current) setupRef.current.open = false;
  }

  return (
    <div className="host-page">
      <div className="wrap">
        <div className="scores">
          {(['A', 'B'] as const).map((team) => {
            const t = s.teams[team];
            return (
              <div className="sc" style={{ ['--slot' as string]: COLORS[team] }} key={team}>
                <div className="n">{t.name}</div>
                <div className="row">
                  <button onClick={() => act('adjust', { team, delta: -1 })}>−</button>
                  <span className="v">{t.score}</span>
                  <button onClick={() => act('adjust', { team, delta: 1 })}>+</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="card" id="qcard">
          <h2>{qHead}</h2>
          <div className="q">{q ? q.text : 'Начните игру ниже'}</div>
          {q && q.type === 'choice' && q.options && (
            <div className="ans">
              {LETTERS[q.correct ?? 0]}. {q.options[q.correct ?? 0]}
            </div>
          )}
          {q && q.type !== 'choice' && (q.word || q.answer) && <div className="ans">{q.word || q.answer}</div>}
          <div className="picks">
            {q &&
              joined.map((p) => {
                const a = s.answers[p.id];
                if (!a)
                  return (
                    <div style={{ ['--slot' as string]: COLORS[p.team] }} key={p.id}>
                      <span className="who">{p.name}</span>
                      <span className="small">не ответил</span>
                    </div>
                  );
                const pick =
                  a.choice !== null && q.options
                    ? `${LETTERS[a.choice]}. ${q.options[a.choice]}`
                    : 'нажал баззер';
                return (
                  <div style={{ ['--slot' as string]: COLORS[p.team] }} key={p.id}>
                    <span className="who">{p.name}</span>
                    <span>
                      {pick}
                      {a.choice !== null && q.options && a.choice === q.correct ? <span className="ok"> ✓</span> : null}
                    </span>
                    <span className="ms">{a.ms} мс</span>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="grid">
          <button className={`wide ${open ? 'ghost' : 'gold'}`} onClick={() => act('ask')}>
            {openLabel}
          </button>
          <button className="p1" onClick={() => act('correct', { team: 'A' })}>
            Балл {s.teams.A.name}
          </button>
          <button className="p2" onClick={() => act('correct', { team: 'B' })}>
            Балл {s.teams.B.name}
          </button>
          <button className="ghost" onClick={() => act('wrong', { team: 'A' })}>
            Мимо: {s.teams.A.name}
          </button>
          <button className="ghost" onClick={() => act('wrong', { team: 'B' })}>
            Мимо: {s.teams.B.name}
          </button>
          <button className="wide" onClick={() => act('reveal')}>
            Показать ответ на экране
          </button>
          {isDraw ? (
            <>
              <select
                className="wide"
                value={s.drawer || ''}
                onChange={(e) => act('setDrawer', { slot: e.target.value || null })}
              >
                <option value="">Кто рисует?</option>
                {joined.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name} ({s.teams[p.team].name})
                  </option>
                ))}
              </select>
              <button className="ghost" onClick={() => act('clearDraw')}>
                Стереть холст
              </button>
              <button className="ghost" onClick={() => act('timer', { seconds: 60 })}>
                Таймер 60 сек
              </button>
            </>
          ) : (
            <>
              <button className="ghost" onClick={() => act('timer', { seconds: 30 })}>
                Таймер 30 сек
              </button>
              <button className="ghost" onClick={() => act('timer', { seconds: 0 })}>
                Убрать таймер
              </button>
            </>
          )}
        </div>

        <div className="nav">
          <button className="ghost" onClick={() => act('prev')}>
            ← Назад
          </button>
          <button className={isLast ? 'gold' : 'hot'} onClick={() => act(isLast ? 'showResults' : 'next')}>
            {isLast ? 'Показать результат' : 'Дальше →'}
          </button>
        </div>

        <div className="card">
          <details>
            <summary>Участники</summary>
            <div style={{ marginTop: 12 }}>
              {(['A', 'B'] as const).map((team) => {
                const members = joined.filter((p) => p.team === team);
                return (
                  <div className="roster-team" key={team}>
                    <div className="small">
                      <b>{s.teams[team].name}</b> — {members.length}/9
                    </div>
                    {members.length ? (
                      members.map((p) => (
                        <div className="roster-row" key={p.id}>
                          <span>
                            {p.name}
                            {p.online ? '' : ' · офлайн'}
                          </span>
                          <button className="ghost" onClick={() => act('freeSlot', { slot: p.id })}>
                            Освободить
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="small">пока никого</div>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        </div>

        <div className="card">
          <details ref={setupRef}>
            <summary>Новая игра и настройки</summary>
            <div className="fields" style={{ marginTop: 12 }}>
              <select value={gameId} onChange={(e) => setGameId(e.target.value)}>
                <option value="random">🎲 Случайная игра</option>
                {games.map((g) => (
                  <option value={String(g.id)} key={g.id}>
                    {g.name} — {g.questionCount} вопросов
                  </option>
                ))}
              </select>
              <input
                placeholder="Название команды А (необязательно)"
                value={nameA}
                onChange={(e) => setNameA(e.target.value)}
              />
              <input
                placeholder="Название команды Б (необязательно)"
                value={nameB}
                onChange={(e) => setNameB(e.target.value)}
              />
              <button className="gold" onClick={startGame}>
                Начать игру
              </button>
              <button
                className="ghost"
                onClick={() => {
                  act('endGame');
                  toast('Лог сохранён в папку logs');
                }}
              >
                Завершить игру и сохранить лог
              </button>
              <Link className="ghost builder-link" to="/builder" target="_blank">
                Конструктор вопросов →
              </Link>
              <div className="small">{s.packName ? `Пакет: ${s.packName} · записано вопросов в лог: ${s.logCount}` : ''}</div>
            </div>
          </details>
        </div>
      </div>

      <Toast message={toastMessage} />
    </div>
  );
}
