import type { Metadata } from "next";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  isInvitePath,
  nextFromSearchParams,
  withNextParam,
} from "@/lib/auth/safe-path";

export const metadata: Metadata = {
  title: "Confirm your email | TelesalesOS",
};

export default async function VerifyEmailPage({
  searchParams,
}: PageProps<"/verify-email">) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email : null;
  const next = nextFromSearchParams(params);
  const invited = isInvitePath(next);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirm your email</CardTitle>
        <CardDescription>
          {email
            ? `We sent a confirmation link to ${email}.`
            : "We sent you a confirmation link."}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-2 text-sm">
        <p>
          {invited
            ? "Open the link to confirm this address. Confirming does not join the team — after you sign in, open the invitation and click Join organization."
            : "Open the link to activate your workspace. You will not be able to sign in until the address is confirmed."}
        </p>
        <p>
          Nothing in your inbox after a few minutes? Check spam, then try signing up
          again.
        </p>
      </CardContent>
      <CardFooter className="text-muted-foreground justify-center text-sm">
        <Link
          href={withNextParam("/login", next)}
          className="text-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
