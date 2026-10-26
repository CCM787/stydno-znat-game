import type { Stroke } from '../types/game';

// Рисование поверх холста по нормализованным координатам (0..1).
export function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, w: number, h: number) {
  const p = stroke.p;
  if (!p || p.length < 2) return;
  ctx.strokeStyle = stroke.c || '#fff';
  ctx.lineWidth = (stroke.w || 0.006) * Math.min(w, h);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(p[0] * w, p[1] * h);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] * w, p[i + 1] * h);
  if (p.length === 2) ctx.lineTo(p[0] * w + 0.01, p[1] * h);
  ctx.stroke();
}
