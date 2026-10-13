"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/auth/actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <LogoutSubmit />
    </form>
  );
}

function LogoutSubmit() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending}>
      {pending ? "Signing out..." : "Sign out"}
    </Button>
  );
}
