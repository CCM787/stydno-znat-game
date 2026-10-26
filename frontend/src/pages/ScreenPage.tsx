import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useGameStream } from '../hooks/useGameStream';
import { paintStroke } from '../lib/canvas';
import { BASE } from '../lib/base';
import type { Stroke } from '../types/game';
import './ScreenPage.css';

const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е'];
const COLORS: Record<'A' | 'B', string> = { A: 'var(--p1)', B: 'var(--p2)' };

function formatRoundTitle(title: string | null) {
  if (!title) return 'Стыдно знать';
  return title.replace(/^(\S+\s?\d*\.?)/, '<b>$1</b>');
}

export default function ScreenPage() {
  const boardRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const [qrUrl, setQrUrl] = useState('');
  const qrDrawnRef = useRef('');
  const [, tick] = useState(0);

  function redraw() {
    const board = boardRef.current;
    if (!board) return;
    const ctx = board.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, board.width, board.height);
    for (const s of strokesRef.current) paintStroke(ctx, s, board.width, board.height);
  }

  function fitCanvas() {
    const board = boardRef.current;
    if (!board) return;
    const r = board.getBoundingClientRect();
    board.width = Math.max(300, r.width) * devicePixelRatio;
    board.height = Math.max(200, r.height) * devicePixelRatio;
    redraw();
  }

  const { state: s, connected } = useGameStream('screen', {
    onDraw: (stroke) => {
      strokesRef.current.push(stroke);
      const board = boardRef.current;
      const ctx = board?.getContext('2d');
      if (board && ctx) paintStroke(ctx, stroke, board.width, board.height);
    },
    onClear: () => {
      strokesRef.current = [];
      redraw();
    },
  });

  useEffect(() => {
    document.title = 'Стыдно знать — экран';
  }, []);

  useEffect(() => {
    addEventListener('resize', fitCanvas);
    return () => removeEventListener('resize', fitCanvas);
  }, []);

  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (s?.joinUrl && qrDrawnRef.current !== s.joinUrl) {
      qrDrawnRef.current = s.joinUrl;
      QRCode.toDataURL(s.joinUrl, { margin: 0, scale: 6 }).then(setQrUrl);
    }
  }, [s?.joinUrl]);

  const showResults = s?.phase === 'results';
  const playing = !!s && !showResults && s.phase !== 'lobby' && !!s.question;
  const revealed = playing && (s!.phase === 'question' || s!.phase === 'reveal');
  const isDraw = playing && s!.question!.type === 'draw';

  useEffect(() => {
    if (revealed && isDraw) {
      if (!strokesRef.current.length && s!.strokes.length) strokesRef.current = s!.strokes.slice();
      requestAnimationFrame(() => {
        const board = boardRef.current;
        if (board && (!board.width || board.width < 10)) fitCanvas();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, isDraw]);

  if (!s) return null;

  const q = s.question;
  const joined = Object.values(s.players).filter((p) => p.taken);

  const timerLeft = s.timerEnds ? Math.max(0, s.timerEnds - Date.now()) : null;
  const timerSec = timerLeft !== null ? Math.ceil(timerLeft / 1000) : null;
  const timerText = timerSec !== null ? `${Math.floor(timerSec / 60)}:${String(timerSec % 60).padStart(2, '0')}` : '';

  let winnerText = '';
  let scoreText = '';
  if (showResults) {
    const a = s.teams.A.score;
    const b = s.teams.B.score;
    const winner = a === b ? null : a > b ? s.teams.A : s.teams.B;
    winnerText = winner ? `Победила ${winner.name}!` : 'Ничья!';
    scoreText = `${s.teams.A.name} ${a} : ${b} ${s.teams.B.name}`;
  }

  const drawer = revealed && isDraw && s.drawer ? s.players[s.drawer] : null;
  const buzzPlayer = s.buzz ? s.players[s.buzz.id] : null;
  const showSlam = !!(s.buzz && s.phase === 'question' && q && q.type !== 'choice' && buzzPlayer);
  const showFirstline = playing && q!.type === 'choice' && !!s.buzz && !!s.players[s.buzz.id];

  return (
    <div className={`screen-page${connected ? '' : ' offline'}`}>
      <header>
        <div className="round" dangerouslySetInnerHTML={{ __html: formatRoundTitle(s.roundTitle) }} />
        <div className="meta">
          <div className="eyebrow">{playing ? `вопрос ${s.qIndex + 1} / ${s.qCount}` : s.packName || ''}</div>
          <div id="timer" className={timerSec !== null && timerSec <= 10 ? 'low' : ''}>
            {timerText}
          </div>
        </div>
      </header>

      <main>
        {!showResults && !playing && (
          <div id="lobby" style={{ display: 'flex' }}>
            <div className="eyebrow">домашняя версия</div>
            <h1>
              СТЫДНО <span>ЗНАТЬ</span>
            </h1>
            <div className="eyebrow">игроки заходят по ссылке с телефона</div>
            <div id="qr">{qrUrl && <img src={qrUrl} alt="QR-код для входа" />}</div>
            <div id="url">{s.joinUrl.replace('http://', '')}</div>
          </div>
        )}

        {playing && (
          <div id="play" style={{ display: 'flex', flexDirection: 'column', gap: 30, minHeight: 0 }}>
            <p id="question">{q!.text || ''}</p>
            {revealed && q!.image && <img id="image" src={BASE + q!.image} alt="" />}

            {revealed && q!.type === 'choice' && q!.options && (
              <div id="options" style={{ display: 'grid' }}>
                {q!.options.map((text, i) => {
                  const picks = joined.filter(
                    (p) => s.answers[p.id] && s.answers[p.id].choice === i && s.phase === 'reveal',
                  );
                  const ok = s.phase === 'reveal' && q!.correct === i;
                  return (
                    <div className={`opt${ok ? ' correct' : ''}`} key={i}>
                      <span className="letter">{LETTERS[i]}</span>
                      <span>{text}</span>
                      <span className="picks">
                        {picks.map((p) => (
                          <span key={p.id} className="pick" style={{ background: COLORS[p.team] }} title={p.name} />
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {showFirstline && (
              <div className="eyebrow" id="firstline">
                {(() => {
                  const answered = joined.filter((p) => s.answers[p.id]).length;
                  const first = s.players[s.buzz!.id];
                  return `${first.name} (${s.teams[first.team].name}) — первым, ${s.buzz!.ms} мс · отвечено ${answered} из ${joined.length}`;
                })()}
              </div>
            )}

            {revealed && isDraw && (
              <div id="drawerLine">
                {drawer ? `Рисует: ${drawer.name} — ${s.teams[drawer.team].name}` : ''}
              </div>
            )}
            {revealed && isDraw && (
              <div id="canvasWrap" style={{ display: 'flex' }}>
                <canvas id="board" ref={boardRef} />
              </div>
            )}
          </div>
        )}

        {showResults && (
          <div id="results" style={{ display: 'flex' }}>
            <div className="eyebrow">игра окончена</div>
            <h1 id="resultsWinner">{winnerText}</h1>
            <div id="resultsScore">{scoreText}</div>
          </div>
        )}
      </main>

      <footer id="teams">
        {(['A', 'B'] as const).map((team) => {
          const t = s.teams[team];
          const members = joined.filter((p) => p.team === team);
          const online = members.filter((p) => p.online).length;
          return (
            <div className="team" style={{ ['--slot' as string]: COLORS[team] }} key={team}>
              <div>
                <div className="name">{t.name}</div>
                <div className="chip">
                  {online} на связи из {members.length}
                </div>
              </div>
              <div className="score">{t.score}</div>
            </div>
          );
        })}
      </footer>

      <div id="slam" style={{ display: showSlam ? 'flex' : 'none', ['--slot' as string]: buzzPlayer ? COLORS[buzzPlayer.team] : undefined }}>
        <div className="team">{buzzPlayer ? s.teams[buzzPlayer.team].name : ''}</div>
        <div className="who">{buzzPlayer ? buzzPlayer.name : ''}</div>
        <div className="ms">{s.buzz ? `${s.buzz.ms} мс` : ''}</div>
      </div>
    </div>
  );
}
