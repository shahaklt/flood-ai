"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Fades + lifts children into place the first time they enter the
 * viewport. State always starts `false` identically on server and client
 * (an env-dependent initializer here caused a real hydration mismatch,
 * since `typeof IntersectionObserver` differs between the two) -- the
 * effect below runs client-only, so branching there is safe. Layout.tsx
 * carries a single `<noscript>` fallback keeping this visible if JS never
 * runs at all. */
export default function RevealOnScroll({
  children,
  delayMs = 0,
  className = "",
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // One-time client-only feature-detection fallback, not a cascading update.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal-on-scroll ${visible ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}
