"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/organization", label: "Organization" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/security", label: "Security" },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 border-b pb-px" aria-label="Settings">
      {LINKS.map((link) => {
        const active =
          pathname === link.href ||
          (link.href === "/settings/security" &&
            pathname.startsWith("/settings/security/"));
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-foreground text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
