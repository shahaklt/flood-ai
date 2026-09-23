"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/map", label: "Map" },
  { href: "/simulate", label: "Simulate" },
  { href: "/compare", label: "Compare" },
  { href: "/municipal", label: "Municipal" },
  { href: "/model", label: "Model" },
  { href: "/impact", label: "Impact" },
  { href: "/methodology", label: "Methodology" },
];

export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="flex h-9 shrink-0 items-center gap-4 border-b border-border bg-surface px-4 text-xs">
      <Link href="/" className="font-mono text-accent">
        FloodAI
      </Link>
      <div className="flex gap-3">
        {LINKS.map((link) => {
          const active = pathname === link.href || pathname?.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? "text-ink" : "text-ink-muted hover:text-ink"}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
