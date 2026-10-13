"use client";

import { Check, ChevronsUpDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Membership } from "@/lib/org/active-org";
import { switchOrganizationAction } from "@/lib/org/actions";
import { cn } from "@/lib/utils";

export function OrgSwitcher({
  active,
  memberships,
}: {
  active: Membership;
  memberships: Membership[];
}) {
  // Until invitations land, everyone belongs to exactly one organization.
  // A switcher with a single entry is just a button that does nothing.
  if (memberships.length < 2) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2">
        <OrgAvatar name={active.organizationName} />
        <OrgLabel membership={active} />
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "hover:bg-muted/60 flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        )}
      >
        <OrgAvatar name={active.organizationName} />
        <OrgLabel membership={active} />
        <ChevronsUpDown className="text-muted-foreground ml-auto size-4 shrink-0" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {/* GroupLabel only works inside a Group in Base UI. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Switch organization</DropdownMenuLabel>
        </DropdownMenuGroup>
        <form action={switchOrganizationAction}>
          {memberships.map((membership) => (
            <DropdownMenuItem
              key={membership.organizationId}
              nativeButton
              render={
                <button
                  type="submit"
                  name="organizationId"
                  value={membership.organizationId}
                  className="w-full"
                />
              }
            >
              <span className="truncate">{membership.organizationName}</span>
              {membership.organizationId === active.organizationId ? (
                <Check className="ml-auto size-4" aria-hidden />
              ) : null}
            </DropdownMenuItem>
          ))}
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OrgAvatar({ name }: { name: string }) {
  return (
    <span
      className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold"
      aria-hidden
    >
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

function OrgLabel({ membership }: { membership: Membership }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm leading-tight font-medium">
        {membership.organizationName}
      </span>
      <span className="text-muted-foreground block truncate text-xs leading-tight capitalize">
        {membership.accountType} · {membership.role}
      </span>
    </span>
  );
}
