// server.js подставляет реальный BASE_PATH вместо __BASE__ при отдаче index.html.
// В dev-режиме (vite dev) подстановки нет — плейсхолдер остаётся как есть, тогда просто пустая строка.
const raw = (window as unknown as { APP_BASE?: string }).APP_BASE;
export const BASE = raw && raw !== '__BASE__' ? raw : '';
