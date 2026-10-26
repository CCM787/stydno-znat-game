import { useEffect, useRef, useState } from 'react';
import type { Stroke } from '../types/game';

const PENS = ['#1c1622', '#e0245e', '#1d7fe0', '#12a150', '#f0a500'];

export default function DrawPad({
  word,
  clearSignal,
  onClearDraw,
  onStroke,
}: {
  word: string;
  clearSignal: number;
  onClearDraw: () => void;
  onStroke: (stroke: Stroke) => void;
}) {
  const [pen, setPen] = useState(PENS[0]);
  const padRef = useRef<HTMLCanvasElement>(null);
  const buffer = useRef<number[]>([]);
  const drawing = useRef(false);
  const sending = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const penRef = useRef(pen);
  penRef.current = pen;

  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;
    const ctx = pad.getContext('2d')!;

    const fit = () => {
      const r = pad.getBoundingClientRect();
      pad.width = r.width * devicePixelRatio;
      pad.height = r.height * devicePixelRatio;
    };
    setTimeout(fit, 0);
    addEventListener('resize', fit);

    const norm = (e: PointerEvent): [number, number] => {
      const r = pad.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    };
    const flush = () => {
      if (buffer.current.length >= 4) {
        onStroke({ c: penRef.current, w: 0.008, p: buffer.current.slice() });
        buffer.current = buffer.current.slice(-2);
      }
    };

    const down = (e: PointerEvent) => {
      pad.setPointerCapture(e.pointerId);
      drawing.current = true;
      buffer.current = norm(e);
      sending.current = setInterval(flush, 90);
    };
    const move = (e: PointerEvent) => {
      if (!drawing.current) return;
      const [x, y] = norm(e);
      const n = buffer.current.length;
      ctx.strokeStyle = penRef.current;
      ctx.lineWidth = 0.008 * Math.min(pad.width, pad.height);
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(buffer.current[n - 2] * pad.width, buffer.current[n - 1] * pad.height);
      ctx.lineTo(x * pad.width, y * pad.height);
      ctx.stroke();
      buffer.current.push(x, y);
    };
    const up = () => {
      if (!drawing.current) return;
      drawing.current = false;
      clearInterval(sending.current);
      if (buffer.current.length >= 4) onStroke({ c: penRef.current, w: 0.008, p: buffer.current.slice() });
      buffer.current = [];
    };

    pad.addEventListener('pointerdown', down);
    pad.addEventListener('pointermove', move);
    pad.addEventListener('pointerup', up);
    pad.addEventListener('pointercancel', up);
    return () => {
      removeEventListener('resize', fit);
      pad.removeEventListener('pointerdown', down);
      pad.removeEventListener('pointermove', move);
      pad.removeEventListener('pointerup', up);
      pad.removeEventListener('pointercancel', up);
      clearInterval(sending.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (clearSignal === 0) return;
    const pad = padRef.current;
    pad?.getContext('2d')?.clearRect(0, 0, pad.width, pad.height);
  }, [clearSignal]);

  return (
    <>
      <div className="word">{word}</div>
      <canvas id="pad" ref={padRef} />
      <div className="tools">
        {PENS.map((c) => (
          <button
            key={c}
            className={`swatch ${c === pen ? 'on' : ''}`}
            style={{ background: c }}
            onClick={() => setPen(c)}
          />
        ))}
        <button className="clear ghost" onClick={onClearDraw}>
          Стереть
        </button>
      </div>
    </>
  );
}
