"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_SECTIONS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function SidebarNav({
  powerbridgeEnabled = false,
  onNavigate,
}: {
  powerbridgeEnabled?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-5 py-4" aria-label="Main">
      {NAV_SECTIONS.map((section) => {
        const items = section.items.filter(
          (item) => !item.powerbridgeOnly || powerbridgeEnabled,
        );
        if (items.length === 0) return null;

        return (
          <div key={section.label} className="space-y-1">
            <p className="text-muted-foreground px-3 text-xs font-medium tracking-wide uppercase">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-muted text-foreground font-medium"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate">{item.label}</span>
                      {item.comingSoon ? (
                        <span className="text-muted-foreground/70 ml-auto text-[10px] tracking-wide uppercase">
                          Soon
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
