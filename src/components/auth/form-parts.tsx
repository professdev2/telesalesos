"use client";

import { useFormStatus } from "react-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { AuthFormState } from "@/lib/auth/validation";

export function FieldError({
  errors,
  id,
}: {
  errors: string[] | undefined;
  id: string;
}) {
  if (!errors?.length) return null;

  return (
    <p id={id} className="text-destructive text-sm" role="alert">
      {errors.join(" ")}
    </p>
  );
}

export function FormAlert({ state }: { state: AuthFormState }) {
  if (state.status === "idle" || !state.message) return null;

  return (
    <Alert variant={state.status === "error" ? "destructive" : "default"}>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  className,
  variant,
  size,
  disabled = false,
  formAction,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  disabled?: boolean;
  formAction?: React.ComponentProps<"button">["formAction"];
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      className={className ?? "w-full"}
      variant={variant}
      size={size}
      disabled={pending || disabled}
      formAction={formAction}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
