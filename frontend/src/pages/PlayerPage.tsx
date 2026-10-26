import { useEffect, useState } from 'react';
import { useGameStream } from '../hooks/useGameStream';
import type { QuestionView, TeamId } from '../types/game';
import DrawPad from '../components/DrawPad';
import './PlayerPage.css';

const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е'];

function buzzVibrate() {
  navigator.vibrate?.(60);
}

export default function PlayerPage() {
  const [pickedTeam, setPickedTeam] = useState<TeamId | null>(null);
  const [name, setName] = useState('');
  const [clearSignal, setClearSignal] = useState(0);

  const { state: s, connected, send, sendStroke } = useGameStream('player', {
    onClear: () => setClearSignal((n) => n + 1),
  });

  useEffect(() => {
    document.title = 'Стыдно знать — игрок';
  }, []);

  if (!s) return null;

  const myId = s.myId;
  const me = myId ? s.players[myId] : null;
  const team: TeamId | null = myId && me ? me.team : pickedTeam;
  const meColorVar = team === 'B' ? 'var(--p2)' : 'var(--p1)';

  return (
    <div className={`player-page${connected ? '' : ' offline'}`} style={{ ['--me' as string]: meColorVar }}>
      <div className="bar">
        <span className="dot" />
        <span className="name">{me ? me.name : 'выберите команду'}</span>
        <span className="score">{me ? s.teams[me.team].score : ''}</span>
      </div>

      <main>
        {!myId && !pickedTeam && (
          <TeamPick
            countA={Object.values(s.players).filter((p) => p.team === 'A' && p.taken).length}
            countB={Object.values(s.players).filter((p) => p.team === 'B' && p.taken).length}
            nameA={s.teams.A.name}
            nameB={s.teams.B.name}
            onPick={setPickedTeam}
          />
        )}

        {!myId && pickedTeam && (
          <NameEntry
            name={name}
            onChangeName={setName}
            onBack={() => setPickedTeam(null)}
            onJoin={() => {
              const trimmed = name.trim();
              if (!trimmed) return;
              send('join', { team: pickedTeam, name: trimmed });
            }}
          />
        )}

        {myId && s.phase === 'results' && <ResultsView teamA={s.teams.A} teamB={s.teams.B} myTeam={team} />}

        {myId &&
          s.phase !== 'results' &&
          (s.phase === 'lobby' || s.phase === 'preview' || !s.question) && (
            <div className="waiting">
              <div className="big">Ждём ведущего</div>
              <div className="hint" style={{ marginTop: 8 }}>
                не выключайте экран
              </div>
            </div>
          )}

        {myId && s.phase !== 'results' && s.question && (
          <QuestionView_
            q={s.question}
            live={s.phase === 'question'}
            myId={myId}
            myChoice={s.answers[myId]?.choice ?? null}
            drawerId={s.drawer}
            buzzId={s.buzz?.id ?? null}
            blocked={s.blocked.includes(myId)}
            clearSignal={clearSignal}
            onAnswer={(choice) => {
              navigator.vibrate?.(30);
              send('answer', { choice });
            }}
            onBuzz={() => {
              buzzVibrate();
              send('buzz');
            }}
            onClearDraw={() => send('clearDraw')}
            onStroke={sendStroke}
          />
        )}
      </main>
    </div>
  );
}

function TeamPick({
  countA,
  countB,
  nameA,
  nameB,
  onPick,
}: {
  countA: number;
  countB: number;
  nameA: string;
  nameB: string;
  onPick: (team: TeamId) => void;
}) {
  return (
    <div className="slots">
      <h1>Выберите команду</h1>
      <button className="slot-btn hot" disabled={countA >= 9} onClick={() => onPick('A')}>
        {nameA}
      </button>
      <button className="slot-btn hot" disabled={countB >= 9} onClick={() => onPick('B')}>
        {nameB}
      </button>
    </div>
  );
}

function NameEntry({
  name,
  onChangeName,
  onBack,
  onJoin,
}: {
  name: string;
  onChangeName: (v: string) => void;
  onBack: () => void;
  onJoin: () => void;
}) {
  return (
    <div className="slots">
      <h1>Ваше имя</h1>
      <input
        className="name-field"
        placeholder="Как вас объявить?"
        maxLength={24}
        autoFocus
        value={name}
        onChange={(e) => onChangeName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onJoin();
        }}
      />
      <button className="slot-btn gold" onClick={onJoin}>
        Войти
      </button>
      <button className="ghost" onClick={onBack}>
        ← другая команда
      </button>
    </div>
  );
}

function ResultsView({
  teamA,
  teamB,
  myTeam,
}: {
  teamA: { name: string; score: number };
  teamB: { name: string; score: number };
  myTeam: TeamId | null;
}) {
  const a = teamA.score;
  const b = teamB.score;
  const winner: TeamId | null = a === b ? null : a > b ? 'A' : 'B';
  const title = !winner ? 'Ничья!' : winner === myTeam ? '🎉 Ваша команда победила!' : `Победила ${winner === 'A' ? teamA.name : teamB.name}`;
  return (
    <div className="waiting">
      <div className="big">{title}</div>
      <div className="hint" style={{ marginTop: 8 }}>
        {teamA.name} {a} : {b} {teamB.name}
      </div>
    </div>
  );
}

function QuestionView_({
  q,
  live,
  myId,
  myChoice,
  drawerId,
  buzzId,
  blocked,
  clearSignal,
  onAnswer,
  onBuzz,
  onClearDraw,
  onStroke,
}: {
  q: QuestionView;
  live: boolean;
  myId: string;
  myChoice: number | null;
  drawerId: string | null;
  buzzId: string | null;
  blocked: boolean;
  clearSignal: number;
  onAnswer: (choice: number) => void;
  onBuzz: () => void;
  onClearDraw: () => void;
  onStroke: (stroke: { c?: string; w?: number; p: number[] }) => void;
}) {
  if (q.type === 'choice' && q.options) {
    return (
      <>
        <div className="hint">выберите ответ</div>
        <div className="opts">
          {q.options.map((t, i) => (
            <button
              key={i}
              className={`opt-btn ${myChoice === i ? 'picked' : ''}`}
              disabled={!live}
              onClick={() => onAnswer(i)}
            >
              <span className="letter">{LETTERS[i]}</span>
              <span>{t}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  if (q.type === 'draw') {
    if (drawerId === myId) {
      const word = q.word || q.answer || q.text || '';
      return <DrawPad word={word} clearSignal={clearSignal} onClearDraw={onClearDraw} onStroke={onStroke} />;
    }
    return (
      <>
        <div className="hint">угадывайте вслух</div>
        <button className="buzzer" disabled={!live || !!buzzId} onClick={onBuzz}>
          {buzzId ? (buzzId === myId ? 'ВЫ ПЕРВЫЙ' : 'занято') : 'Я ЗНАЮ'}
        </button>
      </>
    );
  }

  // раунд на скорость
  const first = buzzId === myId;
  return (
    <>
      <div className="hint">{live ? 'кто быстрее' : 'ждём'}</div>
      <button className="buzzer" disabled={!live || !!buzzId || blocked} onClick={onBuzz}>
        {first ? 'ВЫ ПЕРВЫЙ' : blocked ? 'мимо' : buzzId ? 'занято' : 'ЖМИ'}
      </button>
    </>
  );
}
