'use client';
import { useEffect, useRef, useState } from 'react';

const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/** Número que sube desde 0 hasta su valor al aparecer (700 ms, desaceleración suave). Con «reducir movimiento» muestra el valor final al instante. */
export function CountUp({ value, money = false, duration = 700 }: { value: number; money?: boolean; duration?: number }) {
  const format = (n: number) => (money ? pesos.format(n) : integer.format(n));
  const [shown, setShown] = useState(value);
  const first = useRef(true);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Solo anima la primera vez que se muestra (o cuando el valor cambia después); nunca bloquea la lectura del número real.
    if (reduce || !Number.isFinite(value) || value === 0) { const t = window.setTimeout(() => setShown(value), 0); return () => window.clearTimeout(t); }
    const from = first.current ? 0 : shown, start = performance.now();
    first.current = false;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration), eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);
  return <span className="count-up" aria-label={format(value)}>{format(shown)}</span>;
}
