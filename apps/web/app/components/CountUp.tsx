"use client";

import { useEffect, useRef, useState } from "react";

/** Animates a real number counting up from 0 the first time it scrolls into
 * view. Renders the final value immediately (no observer/JS) so the number
 * is never wrong or missing — only the animation is progressive enhancement. */
export default function CountUp({
  value,
  decimals = 0,
  suffix = "",
  prefix = "",
  durationMs = 1200,
  className = "",
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  durationMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(value);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        observer.disconnect();
        const start = performance.now();
        const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / durationMs);
          setDisplay(value * easeOutQuart(progress));
          if (progress < 1) requestAnimationFrame(tick);
          else setDisplay(value);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
