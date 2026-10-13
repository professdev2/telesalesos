"use client";

import Link from "next/link";
import { LogOut, User } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/lib/auth/actions";

export function UserMenu({
  fullName,
  email,
}: {
  fullName: string | null;
  email: string | null;
}) {
  const display = fullName ?? email ?? "Account";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none">
        <Avatar className="size-8">
          <AvatarFallback>{initials(display)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* Plain element, not DropdownMenuLabel: Base UI's GroupLabel throws
            unless it is inside a Menu.Group, and this is an identity header
            rather than a label for a group of items. */}
        <div className="px-1.5 py-1">
          <span className="block truncate text-sm font-medium">{display}</span>
          {email ? (
            <span className="text-muted-foreground block truncate text-xs">{email}</span>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings/profile" />}>
          <User className="size-4" aria-hidden />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem nativeButton render={<button type="submit" className="w-full" />}>
            <LogOut className="size-4" aria-hidden />
            Sign out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0]).join("");
  return (letters || value[0] || "?").toUpperCase();
}
