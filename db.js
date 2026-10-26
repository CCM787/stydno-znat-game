// Банк вопросов и собранные игры — хранилище на встроенном node:sqlite.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function open(dataDir) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const sql = new DatabaseSync(path.join(dataDir, 'questions.db'));
  sql.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      text TEXT NOT NULL,
      options TEXT,
      correct INTEGER,
      answer TEXT,
      word TEXT,
      image TEXT,
      note TEXT,
      points INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rounds TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return sql;
}

function rowToQuestion(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    text: row.text,
    options: row.options ? JSON.parse(row.options) : null,
    correct: row.correct,
    answer: row.answer,
    word: row.word,
    image: row.image,
    note: row.note,
    points: row.points,
  };
}

function validateQuestion(f) {
  const type = f.type === 'buzz' || f.type === 'draw' ? f.type : 'choice';
  if (!f.text || !String(f.text).trim()) throw new Error('Нужен текст вопроса');
  if (type === 'choice') {
    const options = Array.isArray(f.options) ? f.options.filter(o => o && String(o).trim()) : [];
    if (options.length < 2) throw new Error('Нужно минимум 2 варианта ответа');
    const correct = Number(f.correct);
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
      throw new Error('Не указан правильный вариант');
    }
    return { type, text: String(f.text), options, correct, answer: null, word: null };
  }
  if (type === 'buzz') {
    if (!f.answer || !String(f.answer).trim()) throw new Error('Нужен правильный ответ');
    return { type, text: String(f.text), options: null, correct: null, answer: String(f.answer), word: null };
  }
  if (!f.word || !String(f.word).trim()) throw new Error('Нужно загаданное слово');
  return { type, text: String(f.text), options: null, correct: null, answer: null, word: String(f.word) };
}

class QuestionBank {
  constructor(dataDir) {
    this.sql = open(dataDir);
  }

  insertQuestion(f) {
    const v = validateQuestion(f);
    const stmt = this.sql.prepare(`
      INSERT INTO questions (type, text, options, correct, answer, word, image, note, points)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      v.type, v.text, v.options ? JSON.stringify(v.options) : null, v.correct, v.answer, v.word,
      f.image || null, f.note || null, Number(f.points) || 1
    );
    return Number(info.lastInsertRowid);
  }

  updateQuestion(id, f) {
    const v = validateQuestion(f);
    this.sql.prepare(`
      UPDATE questions SET type=?, text=?, options=?, correct=?, answer=?, word=?, image=?, note=?, points=?
      WHERE id=?
    `).run(
      v.type, v.text, v.options ? JSON.stringify(v.options) : null, v.correct, v.answer, v.word,
      f.image || null, f.note || null, Number(f.points) || 1, Number(id)
    );
  }

  deleteQuestion(id) {
    this.sql.prepare('DELETE FROM questions WHERE id=?').run(Number(id));
  }

  getQuestion(id) {
    return rowToQuestion(this.sql.prepare('SELECT * FROM questions WHERE id=?').get(Number(id)));
  }

  listQuestions({ type, search } = {}) {
    let rows;
    if (type) {
      rows = this.sql.prepare('SELECT * FROM questions WHERE type=? ORDER BY id DESC').all(type);
    } else {
      rows = this.sql.prepare('SELECT * FROM questions ORDER BY id DESC').all();
    }
    let list = rows.map(rowToQuestion);
    if (search) {
      const needle = String(search).toLowerCase();
      list = list.filter(q => q.text.toLowerCase().includes(needle));
    }
    return list;
  }

  insertGame({ name, rounds }) {
    if (!name || !String(name).trim()) throw new Error('Нужно название игры');
    if (!Array.isArray(rounds) || !rounds.length) throw new Error('Нужен хотя бы один раунд');
    const info = this.sql.prepare('INSERT INTO games (name, rounds) VALUES (?, ?)')
      .run(String(name), JSON.stringify(rounds));
    return Number(info.lastInsertRowid);
  }

  updateGame(id, { name, rounds }) {
    if (!name || !String(name).trim()) throw new Error('Нужно название игры');
    if (!Array.isArray(rounds) || !rounds.length) throw new Error('Нужен хотя бы один раунд');
    this.sql.prepare('UPDATE games SET name=?, rounds=? WHERE id=?')
      .run(String(name), JSON.stringify(rounds), Number(id));
  }

  deleteGame(id) {
    this.sql.prepare('DELETE FROM games WHERE id=?').run(Number(id));
  }

  listGames() {
    return this.sql.prepare('SELECT * FROM games ORDER BY id DESC').all().map(row => {
      const rounds = JSON.parse(row.rounds);
      return {
        id: row.id,
        name: row.name,
        roundCount: rounds.length,
        questionCount: rounds.reduce((sum, r) => sum + (r.questionIds || []).length, 0),
      };
    });
  }

  // Собирает {name, rounds:[{title, questions:[...]}]} — форма, ожидаемая игровым движком (см. state.pack).
  hydrateRounds(rounds) {
    return rounds.map(r => ({
      title: r.title,
      questions: (r.questionIds || [])
        .map(id => this.getQuestion(id))
        .filter(Boolean),
    }));
  }

  getGame(id) {
    const row = this.sql.prepare('SELECT * FROM games WHERE id=?').get(Number(id));
    if (!row) return null;
    return { name: row.name, rounds: this.hydrateRounds(JSON.parse(row.rounds)) };
  }

  // Случайная игра по типам вопросов, не сохраняется в games.
  randomGame(config) {
    const rounds = config.map(r => {
      const rows = this.sql.prepare('SELECT * FROM questions WHERE type=? ORDER BY RANDOM() LIMIT ?')
        .all(r.type, r.count);
      return { title: r.title, questions: rows.map(rowToQuestion) };
    });
    return { name: '🎲 Случайная игра', rounds };
  }

  migrateLegacyPacksIfEmpty(packsDir) {
    const count = this.sql.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
    if (count > 0) return;
    if (!fs.existsSync(packsDir)) return;
    for (const file of fs.readdirSync(packsDir).filter(f => f.endsWith('.json'))) {
      let data;
      try {
        data = JSON.parse(fs.readFileSync(path.join(packsDir, file), 'utf8'));
      } catch (e) {
        continue; // битый пак — пропускаем, как и раньше делал loadPack при показе списка
      }
      if (!Array.isArray(data.rounds) || !data.rounds.length) continue;
      const rounds = data.rounds.map(round => {
        const questionIds = (round.questions || []).map(q => {
          try {
            return this.insertQuestion(q);
          } catch (e) {
            return null; // вопрос без обязательных полей — пропускаем при переносе
          }
        }).filter(id => id !== null);
        return { title: round.title || '', type: (round.questions && round.questions[0] && round.questions[0].type) || 'choice', questionIds };
      }).filter(r => r.questionIds.length);
      if (rounds.length) this.insertGame({ name: data.name || file, rounds });
    }
  }
}

module.exports = { QuestionBank };
