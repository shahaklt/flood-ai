"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const PAGES = [
  { href: "/", label: "Home" },
  { href: "/map", label: "Map" },
  { href: "/simulate", label: "Simulate" },
  { href: "/compare", label: "Compare" },
  { href: "/impact", label: "Impact" },
  { href: "/methodology", label: "Methodology" },
];

/** Small floating page-jump widget, independent of the top NavBar, meant to
 * stay reachable even on full-bleed pages (map/simulate) where the eye is
 * on the canvas, not the header. */
export default function PageNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = PAGES.find((p) => p.href === pathname || (p.href !== "/" && pathname?.startsWith(p.href + "/")));

  return (
    <div className="fixed bottom-4 left-4 z-50">
      {open && (
        <ul className="mb-1.5 w-40 border border-border bg-surface text-xs shadow-lg">
          {PAGES.map((p) => {
            const active = p === current;
            return (
              <li key={p.href}>
                <Link
                  href={p.href}
                  onClick={() => setOpen(false)}
                  className={
                    "block px-3 py-1.5 " +
                    (active ? "bg-surface-2 text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink")
                  }
                >
                  {p.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Navigate FloodAI pages"
        className="flex items-center gap-1.5 border border-border bg-surface px-2.5 py-1.5 font-mono text-[11px] text-ink-muted shadow-lg transition-colors hover:text-ink"
      >
        <span className="text-accent">⊕</span>
        {current?.label ?? "Menu"}
      </button>
    </div>
  );
}
