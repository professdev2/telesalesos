import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Link problem | TelesalesOS",
};

const KNOWN_REASONS: Record<string, string> = {
  missing_code: "The link was incomplete. Your email client may have truncated it.",
  missing_token: "The link was incomplete. Your email client may have truncated it.",
  link_rejected: "The link was already used, or it expired.",
  otp_expired: "The link expired. Links are only valid for a short time.",
  exchange_failed: "The link could not be verified. It may have already been used.",
  oauth_failed: "Google sign-in could not start. Try again, or sign in with your email and password.",
  wrong_browser:
    "This link was opened in a different browser than the one that requested it. Open it in the original browser, or request a new link here.",
};

export default async function AuthErrorPage({ searchParams }: PageProps<"/auth-error">) {
  const params = await searchParams;
  const reason = typeof params.reason === "string" ? params.reason : null;
  const explanation = reason ? KNOWN_REASONS[reason] : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>That link did not work</CardTitle>
        <CardDescription>
          {explanation ?? "We could not verify the link you followed."}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-2 text-sm">
        <p>
          Confirmation, password reset, and authenticator recovery links expire,
          can only be used once, and often must be opened in the browser that
          requested them.
        </p>
        {reason && !explanation ? (
          <p className="font-mono text-xs break-all">{reason}</p>
        ) : null}
      </CardContent>
      <CardFooter className="flex-col gap-2">
        <Link href="/login" className={cn(buttonVariants(), "w-full")}>
          Back to sign in
        </Link>
        <Link
          href="/forgot-password"
          className={cn(buttonVariants({ variant: "ghost" }), "w-full")}
        >
          Request a new link
        </Link>
      </CardFooter>
    </Card>
  );
}
