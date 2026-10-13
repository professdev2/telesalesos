import type { Metadata } from "next";
import Link from "next/link";

import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { AcceptInviteForm } from "@/components/org/accept-invite-form";
import { isGoogleAuthEnabled } from "@/lib/auth/providers";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Invitation | TelesalesOS",
};

export default async function InvitePage({
  params,
}: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = await getSessionUser();
  const googleEnabled = user ? false : await isGoogleAuthEnabled();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization invitation</CardTitle>
        <CardDescription>
          {user
            ? `Signed in as ${user.email}. Accept only if this is the invited address.`
            : "Sign in with the invited email address to join."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {user ? (
          <AcceptInviteForm token={token} />
        ) : googleEnabled ? (
          <GoogleSignIn next={`/invite/${token}`} showDivider={false} />
        ) : (
          <p className="text-muted-foreground text-sm">
            You will be asked to sign in before this page can accept the invitation.
          </p>
        )}
      </CardContent>
      {!user ? (
        <CardFooter className="text-muted-foreground flex-col justify-center gap-2 text-sm">
          <Link
            href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
            className="text-foreground underline-offset-4 hover:underline"
          >
            Sign in to continue
          </Link>
          <Link
            href={`/signup?next=${encodeURIComponent(`/invite/${token}`)}`}
            className="underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </CardFooter>
      ) : null}
    </Card>
  );
}
