export type Phase = 'lobby' | 'preview' | 'question' | 'reveal' | 'results';
export type QuestionType = 'choice' | 'buzz' | 'draw';
export type TeamId = 'A' | 'B';

export interface Stroke {
  c?: string;
  w?: number;
  p: number[];
}

export interface Answer {
  choice: number | null;
  ms: number;
  order: number;
}

export interface Buzz {
  id: string;
  ms: number;
}

export interface Team {
  name: string;
  score: number;
}

export interface Player {
  id: string;
  team: TeamId;
  name: string;
  online: boolean;
  taken: boolean;
}

export interface QuestionView {
  type: QuestionType;
  text: string;
  image: string | null;
  options: string[] | null;
  points: number;
  correct: number | null;
  answer: string | null;
  word: string | null;
  note: string | null;
}

// Снапшот состояния игры, который приходит по SSE (см. serialize() в server.js).
export interface GameState {
  phase: Phase;
  packName: string | null;
  roundTitle: string | null;
  roundIndex: number;
  roundCount: number;
  qIndex: number;
  qCount: number;
  question: QuestionView | null;
  answers: Record<string, Answer>;
  drawer: string | null;
  strokes: Stroke[];
  timerEnds: number | null;
  myId: string | null;
  buzz: Buzz | null;
  blocked: string[];
  awarded: Partial<Record<TeamId, number>>;
  teams: Record<TeamId, Team>;
  players: Record<string, Player>;
  joinUrl: string;
  logCount: number;
}

export type StreamMessage =
  | ({ kind: 'state' } & GameState)
  | { kind: 'draw'; stroke: Stroke }
  | { kind: 'clear' };

// -------------------------------------------------------- банк вопросов

export interface BankQuestion {
  id: number;
  type: QuestionType;
  text: string;
  options?: string[];
  correct?: number;
  answer?: string;
  word?: string;
  image?: string;
  note?: string;
  points?: number;
}

export interface GameListItem {
  id: number;
  name: string;
  questionCount: number;
  roundCount: number;
}

export interface GameRound {
  title: string;
  questions: BankQuestion[];
}

export interface GameDetail {
  id: number;
  name: string;
  rounds: GameRound[];
}
