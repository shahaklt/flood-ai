"use client";

import { useEffect, useState } from "react";

/** Thin fixed bar at the very top of the page that fills with real scroll
 * progress (0-100%). Purely a UI affordance, no fabricated data involved. */
export default function ScrollProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(100, (window.scrollY / scrollable) * 100) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="fixed left-0 top-0 z-40 h-0.5 w-full bg-transparent">
      <div className="h-full bg-accent transition-[width] duration-100 ease-out" style={{ width: `${progress}%` }} />
    </div>
  );
}
