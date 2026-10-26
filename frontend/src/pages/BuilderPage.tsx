import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGameStream } from '../hooks/useGameStream';
import { fetchGame, fetchGames, fetchQuestions } from '../lib/api';
import { useToast } from '../hooks/useToast';
import Toast from '../components/Toast';
import { BASE } from '../lib/base';
import type { BankQuestion, GameListItem, QuestionType } from '../types/game';
import './BuilderPage.css';

const TYPE_LABEL: Record<QuestionType, string> = { choice: 'варианты', buzz: 'баззер', draw: 'рисование' };
const ROUND_NAME_HINTS = ['Разминочка', 'Картиночка', 'Каламбурочка'];
function roundName(i: number) {
  return ROUND_NAME_HINTS[i] || 'Раунд ' + (i + 1);
}

interface QuestionDraft {
  type: QuestionType;
  text: string;
  options: string[];
  correct: number;
  answer: string;
  word: string;
  image: string;
  note: string;
  points: number | string;
}
function blankQuestionForm(): QuestionDraft {
  return { type: 'choice', text: '', options: ['', '', '', ''], correct: 0, answer: '', word: '', image: '', note: '', points: 1 };
}

interface RoundDraft {
  title: string;
  type: QuestionType;
  questionIds: number[];
}
function blankRounds(): RoundDraft[] {
  return [{ title: roundName(0), type: 'choice', questionIds: [] }];
}

function questionSummary(q: BankQuestion) {
  if (q.type === 'choice') return (q.options || []).map((o, i) => (i === q.correct ? '✓ ' : '') + o).join(' · ');
  if (q.type === 'buzz') return 'ответ: ' + q.answer;
  return 'слово: ' + q.word;
}

export default function BuilderPage() {
  const { send } = useGameStream('host');
  const { toastMessage, toast } = useToast();

  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [games, setGames] = useState<GameListItem[]>([]);
  const [bankFilter, setBankFilter] = useState<QuestionType | ''>('');

  const [editQ, setEditQ] = useState<number | null>(null);
  const [qDraft, setQDraft] = useState<QuestionDraft>(blankQuestionForm());

  const [editG, setEditG] = useState<number | null>(null);
  const [gName, setGName] = useState('');
  const [gRounds, setGRounds] = useState<RoundDraft[]>(blankRounds());

  useEffect(() => {
    document.title = 'Стыдно знать — конструктор';
  }, []);

  async function act(action: string, data?: Record<string, unknown>) {
    const r = await send(action, data);
    if (r && r.error) {
      toast(r.error);
      return null;
    }
    return r;
  }

  async function loadQuestions() {
    const list = await fetchQuestions(bankFilter || undefined);
    setQuestions(list);
  }
  async function loadGames() {
    setGames(await fetchGames());
  }

  useEffect(() => {
    loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankFilter]);

  useEffect(() => {
    loadGames();
  }, []);

  // ---------------------------------------------------------------- вопросы

  async function saveQuestion() {
    const body: Record<string, unknown> = { ...qDraft };
    if (editQ) body.id = editQ;
    const r = await act(editQ ? 'updateQuestion' : 'addQuestion', body);
    if (!r) return;
    setEditQ(null);
    setQDraft(blankQuestionForm());
    toast('Сохранено');
    loadQuestions();
  }

  function editQuestion(id: number) {
    const q = questions.find((x) => x.id === id);
    if (!q) return;
    setEditQ(id);
    setQDraft({
      type: q.type,
      text: q.text,
      options: q.options && q.options.length ? q.options.slice(0, 4).concat(['', '', '', '']).slice(0, 4) : ['', '', '', ''],
      correct: q.correct || 0,
      answer: q.answer || '',
      word: q.word || '',
      image: q.image || '',
      note: q.note || '',
      points: q.points || 1,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteQuestion(id: number) {
    const r = await act('deleteQuestion', { id });
    if (!r) return;
    toast('Вопрос удалён');
    loadQuestions();
  }

  async function uploadImage(file: File) {
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const r = await act('uploadImage', { filename: file.name, dataBase64: dataUrl.split(',')[1] });
    if (!r) return;
    setQDraft((d) => ({ ...d, image: r.image }));
  }

  // ------------------------------------------------------------------ игры

  async function saveGame() {
    const rounds = gRounds.filter((r) => r.questionIds.length);
    if (!gName.trim()) return toast('Нужно название игры');
    if (!rounds.length) return toast('Добавьте хотя бы один вопрос в раунд');
    const body: Record<string, unknown> = { name: gName, rounds };
    if (editG) body.id = editG;
    const r = await act('saveGame', body);
    if (!r) return;
    setEditG(null);
    setGName('');
    setGRounds(blankRounds());
    toast('Игра сохранена');
    loadGames();
  }

  async function editGame(id: number) {
    const g = await fetchGame(id);
    if (g.error) return toast(g.error);
    setEditG(id);
    setGName(g.name);
    setGRounds(
      g.rounds.map((round) => ({
        title: round.title,
        type: (round.questions[0] && round.questions[0].type) || 'choice',
        questionIds: round.questions.map((q) => q.id),
      })),
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteGame(id: number) {
    const r = await act('deleteGame', { id });
    if (!r) return;
    toast('Игра удалена');
    loadGames();
  }

  const d = qDraft;

  return (
    <div className="builder-page">
      <div className="wrap">
        <div>
          <Link className="back" to="/">
            ← на главную
          </Link>
          <h1>Конструктор вопросов</h1>
        </div>

        <div className="card">
          <h2>Добавить / изменить вопрос</h2>
          <div className="fields">
            <div className="row">
              <select value={d.type} onChange={(e) => setQDraft({ ...d, type: e.target.value as QuestionType })}>
                <option value="choice">Варианты ответа</option>
                <option value="buzz">Баззер</option>
                <option value="draw">Рисование</option>
              </select>
              <input
                type="number"
                min={1}
                value={d.points}
                placeholder="очки"
                onChange={(e) => setQDraft({ ...d, points: e.target.value })}
              />
            </div>
            <textarea
              rows={2}
              placeholder="Текст вопроса"
              value={d.text}
              onChange={(e) => setQDraft({ ...d, text: e.target.value })}
            />
            {d.type === 'choice' && (
              <div className="opts-edit">
                {d.options.map((o, i) => (
                  <div className="row" key={i}>
                    <input
                      type="radio"
                      name="qCorrect"
                      checked={d.correct === i}
                      onChange={() => setQDraft({ ...d, correct: i })}
                    />
                    <input
                      value={o}
                      placeholder={`Вариант ${i + 1}`}
                      onChange={(e) => {
                        const options = d.options.slice();
                        options[i] = e.target.value;
                        setQDraft({ ...d, options });
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
            {d.type === 'buzz' && (
              <input value={d.answer} placeholder="Правильный ответ" onChange={(e) => setQDraft({ ...d, answer: e.target.value })} />
            )}
            {d.type === 'draw' && (
              <input value={d.word} placeholder="Загаданное слово" onChange={(e) => setQDraft({ ...d, word: e.target.value })} />
            )}
            <div className="imgfield">
              {d.image && <img className="imgpreview" src={d.image.startsWith('/') ? BASE + d.image : d.image} alt="" />}
              <div className="row">
                <input value={d.image} placeholder="/images/имя.jpg (необязательно)" onChange={(e) => setQDraft({ ...d, image: e.target.value })} />
                <label className="ghost filebtn">
                  Файл…
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadImage(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              {d.image && (
                <button className="ghost" type="button" onClick={() => setQDraft({ ...d, image: '' })}>
                  ✕ убрать картинку
                </button>
              )}
            </div>
            <input value={d.note} placeholder="Заметка для ведущего (необязательно)" onChange={(e) => setQDraft({ ...d, note: e.target.value })} />
            <div className="row">
              <button className="gold" onClick={saveQuestion}>
                {editQ ? 'Сохранить изменения' : 'Добавить вопрос'}
              </button>
              {editQ && (
                <button
                  className="ghost"
                  onClick={() => {
                    setEditQ(null);
                    setQDraft(blankQuestionForm());
                  }}
                >
                  Отмена
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Банк вопросов</h2>
          <div className="filters">
            {([['', 'Все'], ['choice', 'Варианты'], ['buzz', 'Баззер'], ['draw', 'Рисование']] as const).map(([v, l]) => (
              <button key={v} className={`ghost ${bankFilter === v ? 'on' : ''}`} onClick={() => setBankFilter(v)}>
                {l}
              </button>
            ))}
          </div>
          <div className="list">
            {questions.length ? (
              questions.map((q) => (
                <div className="item" key={q.id}>
                  <div className="txt">
                    <div className="t">
                      <span className="tag">{TYPE_LABEL[q.type]}</span> {q.text}
                    </div>
                    <div className="m">{questionSummary(q)}</div>
                  </div>
                  <button className="ghost" onClick={() => editQuestion(q.id)}>
                    ✎
                  </button>
                  <button className="ghost" onClick={() => deleteQuestion(q.id)}>
                    ✕
                  </button>
                </div>
              ))
            ) : (
              <div className="small">пока пусто</div>
            )}
          </div>
        </div>

        <div className="card">
          <h2>Собранная игра</h2>
          <div className="fields">
            <input value={gName} placeholder="Название игры" onChange={(e) => setGName(e.target.value)} />
            <div>
              {gRounds.map((r, ri) => (
                <div className="round" key={ri}>
                  <div className="row">
                    <input
                      className="rTitle"
                      value={r.title}
                      placeholder="Название раунда"
                      onChange={(e) => {
                        const rounds = gRounds.slice();
                        rounds[ri] = { ...rounds[ri], title: e.target.value };
                        setGRounds(rounds);
                      }}
                    />
                    <select
                      className="rType"
                      value={r.type}
                      onChange={(e) => {
                        const rounds = gRounds.slice();
                        rounds[ri] = { ...rounds[ri], type: e.target.value as QuestionType, questionIds: [] };
                        setGRounds(rounds);
                      }}
                    >
                      <option value="choice">варианты</option>
                      <option value="buzz">баззер</option>
                      <option value="draw">рисование</option>
                    </select>
                    <button
                      className="ghost rDel"
                      onClick={() => setGRounds(gRounds.filter((_, i) => i !== ri))}
                    >
                      ✕ раунд
                    </button>
                  </div>
                  <div className="qpick">
                    {questions.filter((q) => q.type === r.type).length ? (
                      questions
                        .filter((q) => q.type === r.type)
                        .map((q) => (
                          <label key={q.id}>
                            <input
                              type="checkbox"
                              checked={r.questionIds.includes(q.id)}
                              onChange={(e) => {
                                const rounds = gRounds.slice();
                                const ids = rounds[ri].questionIds;
                                rounds[ri] = {
                                  ...rounds[ri],
                                  questionIds: e.target.checked ? [...ids, q.id] : ids.filter((id) => id !== q.id),
                                };
                                setGRounds(rounds);
                              }}
                            />{' '}
                            {q.text}
                          </label>
                        ))
                    ) : (
                      <div className="small">нет вопросов этого типа в банке</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="row">
              <button className="ghost" onClick={() => setGRounds([...gRounds, { title: roundName(gRounds.length), type: 'choice', questionIds: [] }])}>
                + раунд
              </button>
              <button className="gold" onClick={saveGame}>
                {editG ? 'Сохранить изменения' : 'Создать игру'}
              </button>
              {editG && (
                <button
                  className="ghost"
                  onClick={() => {
                    setEditG(null);
                    setGName('');
                    setGRounds(blankRounds());
                  }}
                >
                  Отмена
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Игры</h2>
          <div className="list">
            {games.length ? (
              games.map((g) => (
                <div className="item" key={g.id}>
                  <div className="txt">
                    <div className="t">{g.name}</div>
                    <div className="m">
                      {g.roundCount} раунд(ов) · {g.questionCount} вопрос(ов)
                    </div>
                  </div>
                  <button className="ghost" onClick={() => editGame(g.id)}>
                    ✎
                  </button>
                  <button className="ghost" onClick={() => deleteGame(g.id)}>
                    ✕
                  </button>
                </div>
              ))
            ) : (
              <div className="small">пока нет собранных игр</div>
            )}
          </div>
        </div>
      </div>

      <Toast message={toastMessage} />
    </div>
  );
}
