// «Стыдно знать» — домашняя версия.
// Запуск: node server.js   (нужен Node.js 22.5+ — банк вопросов на встроенном node:sqlite)
// Никаких зависимостей: только стандартная библиотека.

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { QuestionBank } = require('./db.js');

const PORT = Number(process.env.PORT) || 3000;
// Для хостинга на своём домене: PUBLIC_URL=https://igra.example.com
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
// Если задан, /host и /builder требуют ввода этого пароля (форма логина, см. hostOk).
const HOST_KEY = process.env.HOST_KEY || '';
// Если приложение живёт не в корне домена, а под путём, например /game
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const PACKS = path.join(ROOT, 'packs');
const IMAGES = path.join(ROOT, 'images');
const LOGS = path.join(ROOT, 'logs');
const DATA = path.join(ROOT, 'data');

for (const dir of [PACKS, IMAGES, LOGS, DATA]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Банк вопросов (node:sqlite) — переносим старые packs/*.json один раз, если банк ещё пуст.
const bank = new QuestionBank(DATA);
bank.migrateLegacyPacksIfEmpty(PACKS);

// Раунды случайной игры собираются по типам вопросов, как в обычных паках.
const RANDOM_ROUND_CONFIG = [
  { title: 'Разминочка', type: 'choice', count: 6 },
  { title: 'Картиночка', type: 'buzz', count: 3 },
  { title: 'Каламбурочка', type: 'buzz', count: 2 },
];

// ---------------------------------------------------------------- состояние

const MAX_PER_TEAM = 9;
const TEAM_IDS = ['A', 'B'];

function teamSlots(team) {
  const arr = [];
  for (let i = 1; i <= MAX_PER_TEAM; i++) arr.push(team + i);
  return arr;
}
function allSlots() {
  return TEAM_IDS.flatMap(teamSlots);
}

function emptyPlayer(id) {
  return { id, team: id[0], name: '', token: null, online: false };
}
function emptyPlayers() {
  const players = {};
  for (const id of allSlots()) players[id] = emptyPlayer(id);
  return players;
}
function emptyTeams() {
  return { A: { name: 'Команда А', score: 0 }, B: { name: 'Команда Б', score: 0 } };
}

const state = {
  phase: 'lobby',        // lobby | question | reveal
  pack: null,            // разобранный JSON пакета
  packFile: null,
  roundIndex: 0,
  qIndex: 0,
  askedAt: null,         // когда вопрос открыли (для замера скорости)
  answers: {},           // id -> { choice, ms, order }
  buzz: null,            // { id, ms }
  blocked: [],           // id, которые уже не могут ответить на этом вопросе
  awarded: {},           // team -> очки, начисленные за текущий вопрос
  drawer: null,          // id того, кто рисует в раунде рисования
  strokes: [],           // линии рисунка: [{ color, w, pts:[x,y,...] }]
  timerEnds: null,       // конец обратного отсчёта (мс)
  teams: emptyTeams(),
  players: emptyPlayers(),
  gameStartedAt: null,
  logFile: null,
  log: [],
};

function currentRound() {
  if (!state.pack) return null;
  return state.pack.rounds[state.roundIndex] || null;
}

function currentQuestion() {
  const round = currentRound();
  if (!round) return null;
  return round.questions[state.qIndex] || null;
}

function resetQuestionState() {
  state.answers = {};
  state.buzz = null;
  state.blocked = [];
  state.awarded = {};
  state.askedAt = null;
  state.drawer = null;
  state.strokes = [];
  state.timerEnds = null;
}

function playerIdByToken(token) {
  if (!token) return null;
  for (const id of allSlots()) if (state.players[id].token === token) return id;
  return null;
}
function joinedSlots() {
  return allSlots().filter(id => state.players[id].token);
}

// Игрокам и экрану нельзя отдавать правильный ответ до вскрытия.
function serialize(role, token) {
  const round = currentRound();
  const q = currentQuestion();
  const reveal = state.phase === 'reveal';
  const myId = playerIdByToken(token);
  const isDrawer = !!token && !!state.drawer && state.players[state.drawer].token === token;
  const open = role === 'host' || reveal || isDrawer;

  return {
    phase: state.phase,
    packName: state.pack ? state.pack.name : null,
    roundTitle: round ? round.title : null,
    roundIndex: state.roundIndex,
    roundCount: state.pack ? state.pack.rounds.length : 0,
    qIndex: state.qIndex,
    qCount: round ? round.questions.length : 0,
    question: q && {
      type: q.type || 'choice',
      text: q.text,
      image: q.image || null,
      options: q.options || null,
      points: q.points || 1,
      correct: open ? (typeof q.correct === 'number' ? q.correct : null) : null,
      answer: open ? (q.answer || null) : null,
      word: open ? (q.word || null) : null,
      note: open ? (q.note || null) : null,
    },
    answers: state.answers,
    drawer: state.drawer,
    strokes: state.strokes,
    timerEnds: state.timerEnds,
    myId,
    buzz: state.buzz,
    blocked: state.blocked,
    awarded: state.awarded,
    teams: {
      A: { name: state.teams.A.name, score: state.teams.A.score },
      B: { name: state.teams.B.name, score: state.teams.B.score },
    },
    players: Object.fromEntries(allSlots().map(id => [id, publicPlayer(state.players[id])])),
    joinUrl: joinUrl(),
    logCount: state.log.length,
  };
}

function publicPlayer(p) {
  return { id: p.id, team: p.team, name: p.name, online: p.online, taken: !!p.token };
}

// ------------------------------------------------------------------ клиенты

const clients = new Set(); // { res, role, token }

function broadcast() {
  for (const c of clients) {
    try {
      c.res.write('data: ' + JSON.stringify(Object.assign({ kind: 'state' }, serialize(c.role, c.token))) + '\n\n');
    } catch (e) { /* соединение уже закрыто */ }
  }
}

function broadcastRaw(payload) {
  const line = 'data: ' + JSON.stringify(payload) + '\n\n';
  for (const c of clients) {
    try { c.res.write(line); } catch (e) {}
  }
}

function refreshOnline() {
  for (const id of allSlots()) {
    const token = state.players[id].token;
    state.players[id].online = !!token && [...clients].some(c => c.token === token);
  }
}

// --------------------------------------------------------------------- лог

function slugify(s) {
  return String(s).replace(/[^\wА-Яа-яЁё-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function startLog() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  state.logFile = path.join(LOGS, `${stamp}_${slugify(state.pack ? state.pack.name : 'игра')}`);
  state.log = [];
  state.gameStartedAt = Date.now();
}

// Записать итог текущего вопроса в лог (перед переходом к следующему).
function recordQuestion() {
  const q = currentQuestion();
  if (!q || !state.askedAt) return;
  const round = currentRound();
  const entry = {
    time: new Date().toISOString(),
    round: round ? round.title : null,
    number: state.qIndex + 1,
    type: q.type || 'choice',
    question: q.text,
    options: q.options || null,
    correct: typeof q.correct === 'number' && q.options ? q.options[q.correct] : (q.answer || null),
    players: {},
    awarded: { [state.teams.A.name]: state.awarded.A || 0, [state.teams.B.name]: state.awarded.B || 0 },
  };
  if ((q.type || 'choice') === 'draw') {
    entry.correct = q.word || q.answer || null;
    entry.drawer = state.drawer && state.players[state.drawer] ? state.players[state.drawer].name : null;
  }
  for (const id of joinedSlots()) {
    const a = state.answers[id];
    entry.players[state.players[id].name] = {
      team: state.teams[state.players[id].team].name,
      answer: a && q.options ? q.options[a.choice] : null,
      buzzed: state.buzz && state.buzz.id === id ? state.buzz.ms + ' мс' : null,
      reaction: a ? a.ms + ' мс' : null,
    };
  }
  // не дублируем один и тот же вопрос при повторных нажатиях
  const last = state.log[state.log.length - 1];
  if (last && last.question === entry.question && last.round === entry.round) {
    state.log[state.log.length - 1] = entry;
  } else {
    state.log.push(entry);
  }
  saveLog();
}

function saveLog() {
  if (!state.logFile) return;
  const data = {
    pack: state.pack ? state.pack.name : null,
    started: state.gameStartedAt ? new Date(state.gameStartedAt).toISOString() : null,
    teams: { [state.teams.A.name]: state.teams.A.score, [state.teams.B.name]: state.teams.B.score },
    players: joinedSlots().map(id => ({ name: state.players[id].name, team: state.teams[state.players[id].team].name })),
    questions: state.log,
  };
  fs.writeFileSync(state.logFile + '.json', JSON.stringify(data, null, 2), 'utf8');

  const lines = [];
  lines.push(`${data.pack || 'Игра'} — ${new Date(state.gameStartedAt).toLocaleString('ru-RU')}`);
  lines.push(`${state.teams.A.name} ${state.teams.A.score} : ${state.teams.B.score} ${state.teams.B.name}`);
  lines.push('');
  for (const q of state.log) {
    lines.push(`[${q.round || ''}] ${q.number}. ${q.question}`);
    if (q.correct) lines.push(`    ответ: ${q.correct}`);
    for (const [name, r] of Object.entries(q.players)) {
      const bits = [];
      if (r.answer) bits.push(`выбрал «${r.answer}»`);
      if (r.buzzed) bits.push(`нажал первым (${r.buzzed})`);
      else if (r.reaction) bits.push(r.reaction);
      lines.push(`    ${name} (${r.team}): ${bits.join(', ') || 'не ответил'}`);
    }
    if (q.awarded) {
      const parts = Object.entries(q.awarded).filter(([, v]) => v).map(([team, v]) => `${team} ${v > 0 ? '+' : ''}${v}`);
      if (parts.length) lines.push(`    очки: ${parts.join(', ')}`);
    }
    lines.push('');
  }
  fs.writeFileSync(state.logFile + '.txt', lines.join('\n'), 'utf8');
}

// ----------------------------------------------------------------- действия

function handleAction(body, role) {
  const a = body.action;

  // --- игроки
  if (a === 'join') {
    let id = playerIdByToken(body.token);
    if (!id) {
      const team = body.team === 'B' ? 'B' : 'A';
      id = teamSlots(team).find(sid => !state.players[sid].token);
      if (!id) return { error: 'Команда заполнена' };
      state.players[id].token = body.token;
    }
    if (body.name) state.players[id].name = String(body.name).slice(0, 24);
    if (!state.players[id].name) state.players[id].name = 'Игрок ' + id;
    refreshOnline();
    broadcast();
    return { ok: true, id };
  }

  if (a === 'answer' || a === 'buzz') {
    const id = playerIdByToken(body.token);
    if (!id) return { error: 'Сначала займите место' };
    if (state.phase !== 'question' || !state.askedAt) return { error: 'Вопрос не открыт' };
    if (state.blocked.includes(id)) return { error: 'Вы уже ответили' };
    const ms = Date.now() - state.askedAt;

    if (a === 'buzz') {
      if (state.buzz) return { error: 'Кто-то уже нажал' };
      state.buzz = { id, ms };
      state.answers[id] = { choice: null, ms, order: 1 };
    } else {
      const prev = state.answers[id];
      const order = prev ? prev.order : Object.keys(state.answers).length + 1;
      state.answers[id] = { choice: Number(body.choice), ms, order };
      if (!state.buzz) state.buzz = { id, ms }; // кто нажал первым
    }
    broadcast();
    return { ok: true };
  }

  // --- ведущий
  if (role !== 'host') return { error: 'Только ведущий' };

  switch (a) {
    case 'newGame': {
      state.pack = body.gameId === 'random'
        ? bank.randomGame(RANDOM_ROUND_CONFIG)
        : bank.getGame(Number(body.gameId));
      if (!state.pack) return { error: 'Игра не найдена' };
      state.packFile = body.gameId;
      state.roundIndex = 0;
      state.qIndex = 0;
      state.teams = emptyTeams();
      if (body.nameA) state.teams.A.name = String(body.nameA).slice(0, 24);
      if (body.nameB) state.teams.B.name = String(body.nameB).slice(0, 24);
      state.players = emptyPlayers();
      resetQuestionState();
      state.phase = 'lobby';
      startLog();
      refreshOnline();
      break;
    }
    case 'rename':
      if (state.players[body.slot]) {
        state.players[body.slot].name = String(body.name || '').slice(0, 24) || 'Игрок ' + body.slot;
        saveLog();
      }
      break;
    case 'freeSlot': {
      const id = body.slot;
      if (state.players[id]) {
        state.players[id].token = null;
        state.players[id].online = false;
      }
      break;
    }
    case 'ask':                        // открыть вопрос, время пошло
      state.answers = {};
      state.buzz = null;
      state.blocked = [];
      state.awarded = {};
      state.phase = 'question';
      state.askedAt = Date.now();
      break;
    case 'reveal':
      state.phase = 'reveal';
      recordQuestion();
      break;
    case 'correct': {                  // засчитать очко команде
      const team = body.team === 'B' ? 'B' : 'A';
      const q = currentQuestion();
      const pts = q ? (q.points || 1) : 1;
      state.teams[team].score += pts;
      state.awarded[team] = (state.awarded[team] || 0) + pts;
      state.phase = 'reveal';
      recordQuestion();
      break;
    }
    case 'wrong': {                    // команда ошиблась: баззер открыт другой команде
      const team = body.team === 'B' ? 'B' : 'A';
      for (const id of teamSlots(team)) if (!state.blocked.includes(id)) state.blocked.push(id);
      if (body.penalty) {
        const q = currentQuestion();
        const pts = q ? (q.points || 1) : 1;
        state.teams[team].score -= pts;
        state.awarded[team] = (state.awarded[team] || 0) - pts;
      }
      state.buzz = null;
      break;
    }
    case 'setDrawer':
      state.drawer = body.slot || null;
      state.strokes = [];
      broadcastRaw({ kind: 'clear' });
      break;
    case 'clearDraw':
      state.strokes = [];
      broadcastRaw({ kind: 'clear' });
      break;
    case 'timer':
      state.timerEnds = body.seconds ? Date.now() + Number(body.seconds) * 1000 : null;
      break;

    // --- конструктор вопросов (банк вопросов и собранные игры)
    case 'addQuestion':
      bank.insertQuestion(body);
      break;
    case 'updateQuestion':
      bank.updateQuestion(body.id, body);
      break;
    case 'deleteQuestion':
      bank.deleteQuestion(body.id);
      break;
    case 'saveGame':
      if (body.id) bank.updateGame(body.id, body); else bank.insertGame(body);
      break;
    case 'deleteGame':
      bank.deleteGame(body.id);
      break;
    case 'uploadImage': {
      const ext = path.extname(body.filename || '').toLowerCase();
      if (!/^\.(jpe?g|png|gif|webp)$/.test(ext)) return { error: 'Неподдерживаемый формат картинки' };
      const safeName = Date.now() + '_' + path.basename(body.filename, ext).replace(/[^\w-]+/g, '_') + ext;
      fs.writeFileSync(path.join(IMAGES, safeName), Buffer.from(body.dataBase64 || '', 'base64'));
      return { ok: true, image: '/images/' + safeName };
    }
    case 'adjust': {
      const team = body.team === 'B' ? 'B' : 'A';
      state.teams[team].score += Number(body.delta) || 0;
      saveLog();
      break;
    }
    case 'retry':                      // переиграть вопрос с нуля
      state.answers = {};
      state.buzz = null;
      state.blocked = [];
      state.awarded = {};
      state.phase = 'question';
      state.askedAt = Date.now();
      break;
    case 'next':
    case 'prev': {
      if (!state.pack) break;
      if (state.phase !== 'lobby') recordQuestion();
      const dir = a === 'next' ? 1 : -1;
      let r = state.roundIndex, q = state.qIndex + dir;
      while (true) {
        const round = state.pack.rounds[r];
        if (!round) break;
        if (q >= 0 && q < round.questions.length) break;
        if (q < 0) {
          r--;
          if (r < 0) { r = 0; q = 0; break; }
          q = state.pack.rounds[r].questions.length - 1;
        } else {
          r++;
          if (r >= state.pack.rounds.length) { r = state.roundIndex; q = state.qIndex; break; }
          q = 0;
        }
      }
      state.roundIndex = r;
      state.qIndex = q;
      resetQuestionState();
      state.phase = 'preview'; // вопрос виден на экране сразу, варианты/картинка — по отдельной кнопке
      break;
    }
    case 'goto':
      state.roundIndex = Math.max(0, Math.min(Number(body.round) || 0, state.pack.rounds.length - 1));
      state.qIndex = Math.max(0, Math.min(Number(body.q) || 0, currentRound().questions.length - 1));
      resetQuestionState();
      state.phase = 'preview';
      break;
    case 'showResults':
      if (state.phase === 'question' || state.phase === 'reveal') recordQuestion();
      saveLog();
      state.phase = 'results';
      break;
    case 'endGame':
      if (state.phase !== 'lobby') recordQuestion();
      saveLog();
      state.phase = 'lobby';
      state.pack = state.pack; // пакет оставляем, чтобы видеть финальный счёт
      break;
    default:
      return { error: 'Неизвестное действие: ' + a };
  }
  broadcast();
  return { ok: true };
}

// ------------------------------------------------------------------- сервер

function localIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) candidates.push(net.address);
    }
  }
  // домашние сети обычно 192.168.x.x
  return candidates.find(ip => ip.startsWith('192.168.')) || candidates[0] || 'localhost';
}

const IP = localIp();
function joinUrl() {
  return PUBLIC_URL ? PUBLIC_URL + '/player' : `http://${IP}:${PORT}${BASE_PATH}/player`;
}
function hostUrl() {
  const base = PUBLIC_URL || `http://${IP}:${PORT}${BASE_PATH}`;
  return base + '/host' + (HOST_KEY ? ' (нужен пароль)' : '');
}
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return cookies;
}
// Сессии ведущего: после верного пароля выдаём случайный токен, а не сам пароль —
// утёкшая кука не раскрывает HOST_KEY, а перезапуск сервера сбрасывает все сессии.
const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const hostSessions = new Map(); // token -> expiresAt

function newHostSession() {
  const token = crypto.randomBytes(32).toString('hex');
  hostSessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

// Сравнение за постоянное время, чтобы пароль нельзя было подобрать по задержке ответа.
function passwordMatches(password) {
  if (!HOST_KEY || typeof password !== 'string') return false;
  const a = crypto.createHash('sha256').update(password).digest();
  const b = crypto.createHash('sha256').update(HOST_KEY).digest();
  return crypto.timingSafeEqual(a, b);
}

// Роль ведущего выдаём только по живой сессии. Без HOST_KEY пульт открыт всем —
// это режим домашней игры в локальной сети; при запуске сервер об этом предупреждает.
function hostOk(req) {
  if (!HOST_KEY) return true;
  const token = parseCookies(req).host_session;
  const expiresAt = token && hostSessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) { hostSessions.delete(token); return false; }
  return true;
}

// Склеивает путь из URL с корневой папкой и не даёт выйти за её пределы
// (иначе /images/..%2Fserver.js отдал бы любой файл на диске).
function safeJoin(root, urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch (e) { return null; }
  const file = path.resolve(root, '.' + path.sep + rel);
  return file === root || file.startsWith(root + path.sep) ? file : null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Не найдено'); return; }
    const ext = path.extname(file).toLowerCase();
    // HTML-страницы ссылаются на себя абсолютными путями — подставляем реальный префикс монтирования.
    if (ext === '.html') data = Buffer.from(data.toString('utf8').split('__BASE__').join(BASE_PATH));
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// Приложение может жить не в корне домена (BASE_PATH=/game) — остальной домен свободен для других сайтов.
function stripBase(pathname) {
  if (!BASE_PATH) return pathname;
  if (pathname === BASE_PATH) return '/';
  if (pathname.startsWith(BASE_PATH + '/')) return pathname.slice(BASE_PATH.length);
  return null; // запрос вне нашего префикса — не наш
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const p = stripBase(url.pathname);
  if (p === null) { res.writeHead(404); res.end('Не найдено'); return; }

  if (p === '/api/stream') {
    let role = url.searchParams.get('role') || 'screen';
    if (role === 'host' && !hostOk(req)) role = 'screen';
    const token = url.searchParams.get('token') || null;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const client = { res, role, token };
    clients.add(client);
    refreshOnline();
    res.write('data: ' + JSON.stringify(Object.assign({ kind: 'state' }, serialize(role, token))) + '\n\n');
    broadcast();
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 20000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(client);
      refreshOnline();
      broadcast();
    });
    return;
  }

  if (p === '/api/draw' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 2e6) req.destroy(); });
    req.on('end', () => {
      try {
        const body = JSON.parse(raw || '{}');
        const id = playerIdByToken(body.token);
        if (id && id === state.drawer) {
          state.strokes.push(body.stroke);
          if (state.strokes.length > 4000) state.strokes.shift();
          broadcastRaw({ kind: 'draw', stroke: body.stroke });
        }
      } catch (e) {}
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      res.end('{"ok":true}');
    });
    return;
  }

  if (p === '/api/games') {
    res.writeHead(200, { 'Content-Type': MIME['.json'] });
    res.end(JSON.stringify(bank.listGames()));
    return;
  }

  if (p === '/api/questions') {
    if (!hostOk(req)) { res.writeHead(403, { 'Content-Type': MIME['.json'] }); res.end('{"error":"Только ведущий"}'); return; }
    res.writeHead(200, { 'Content-Type': MIME['.json'] });
    res.end(JSON.stringify(bank.listQuestions({ type: url.searchParams.get('type') })));
    return;
  }

  if (p === '/api/game') {
    if (!hostOk(req)) { res.writeHead(403, { 'Content-Type': MIME['.json'] }); res.end('{"error":"Только ведущий"}'); return; }
    const game = bank.getGame(Number(url.searchParams.get('id')));
    res.writeHead(game ? 200 : 404, { 'Content-Type': MIME['.json'] });
    res.end(JSON.stringify(game || { error: 'Игра не найдена' }));
    return;
  }

  if (p === '/api/action' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 12e6) req.destroy(); });
    req.on('end', () => {
      let result;
      try {
        const body = JSON.parse(raw || '{}');
        let role = url.searchParams.get('role') || body.role || 'player';
        if (role === 'host' && !hostOk(req)) role = 'player';
        result = handleAction(body, role);
      } catch (e) {
        result = { error: e.message };
      }
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      res.end(JSON.stringify(result));
    });
    return;
  }

  if (p === '/api/login' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 1e4) req.destroy(); });
    req.on('end', () => {
      let result;
      try {
        const { password } = JSON.parse(raw || '{}');
        if (passwordMatches(password)) {
          const secure = PUBLIC_URL.startsWith('https://') ? '; Secure' : '';
          const maxAge = Math.floor(SESSION_TTL_MS / 1000);
          res.setHeader('Set-Cookie', `host_session=${newHostSession()}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`);
          result = { ok: true };
        } else {
          result = { error: 'Неверный пароль' };
        }
      } catch (e) {
        result = { error: e.message };
      }
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      res.end(JSON.stringify(result));
    });
    return;
  }

  if (p.startsWith('/images/')) {
    const file = safeJoin(IMAGES, p.slice(8));
    if (!file) { res.writeHead(404); res.end('Не найдено'); return; }
    return serveFile(res, file);
  }

  if (p === '/api/session') {
    res.writeHead(200, { 'Content-Type': MIME['.json'] });
    res.end(JSON.stringify({ host: hostOk(req) }));
    return;
  }

  // Реальные файлы React-сборки (JS/CSS-чанки и т.п.) отдаём как есть.
  const file = safeJoin(PUBLIC, p.replace(/^\/+/, ''));
  if (file && fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res, file);

  // Всё остальное — маршрут SPA (react-router разберётся на клиенте); /host и /builder
  // защищены на уровне API (hostOk), а клиент сам покажет /login, если сессии нет.
  return serveFile(res, path.join(PUBLIC, 'index.html'));
});

server.listen(PORT, () => {
  const line = '─'.repeat(46);
  console.log('\n' + line);
  console.log('  СТЫДНО ЗНАТЬ — сервер запущен');
  console.log(line);
  console.log(`  Экран (этот компьютер):  http://localhost:${PORT}${BASE_PATH}/screen`);
  console.log(`  Пульт ведущего (телефон): ${hostUrl()}`);
  console.log(`  Игроки (телефоны):        ${joinUrl()}`);
  console.log(line);
  if (!HOST_KEY) console.log('  ⚠ HOST_KEY не задан: пульт ведущего открыт всем в сети.');
  console.log('  Все устройства — в одной сети Wi-Fi.');
  console.log('  Остановить: Ctrl+C\n');
});
