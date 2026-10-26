export function getToken(): string {
  let t = localStorage.getItem('show-token');
  if (!t) {
    t = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('show-token', t);
  }
  return t;
}
