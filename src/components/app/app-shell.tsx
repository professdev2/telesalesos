"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";

import { OrgSwitcher } from "@/components/app/org-switcher";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { UserMenu } from "@/components/app/user-menu";
import { Button } from "@/components/ui/button";
import type { Membership } from "@/lib/org/active-org";

export function AppShell({
  active,
  memberships,
  fullName,
  email,
  children,
}: {
  active: Membership;
  memberships: Membership[];
  fullName: string | null;
  email: string | null;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <>
      <div className="border-b px-2 py-2">
        <OrgSwitcher active={active} memberships={memberships} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        <SidebarNav
          powerbridgeEnabled={active.powerbridgeEnabled}
          onNavigate={() => setMobileOpen(false)}
        />
      </div>
    </>
  );

  return (
    <div className="flex h-svh overflow-hidden">
      <aside className="hidden h-full w-60 shrink-0 flex-col border-r md:flex">
        {sidebar}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="bg-foreground/20 absolute inset-0"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="bg-background relative flex h-full w-60 flex-col border-r">
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          >
            {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
          <span className="font-semibold tracking-tight">TelesalesOS</span>
          <div className="ml-auto">
            <UserMenu fullName={fullName} email={email} />
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
