import type { Metadata } from "next";
import Link from "next/link";

import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { SignupForm } from "@/components/auth/signup-form";
import { isGoogleAuthEnabled } from "@/lib/auth/providers";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isInvitePath, safeRedirectPath } from "@/lib/auth/safe-path";

export const metadata: Metadata = {
  title: "Create account | TelesalesOS",
};

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const params = await searchParams;
  const next =
    typeof params.next === "string" ? safeRedirectPath(params.next) : undefined;
  const invited = next ? isInvitePath(next) : false;
  const googleEnabled = await isGoogleAuthEnabled();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          {invited
            ? "Use the invited email address. Creating an account does not join the team — after you confirm, open the invitation and click Join organization."
            : "Start with a workspace of your own. You can add teammates later."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm next={next} invited={invited} />
        {googleEnabled ? (
          <>
            <GoogleSignIn next={next} label="Sign up with Google" placement="bottom" />
            <p className="text-muted-foreground mt-2 text-xs">
              {invited
                ? "Use the Google account for the invited email address."
                : "Google creates an individual workspace. You can convert it to an agency later."}
            </p>
          </>
        ) : null}
      </CardContent>
      <CardFooter className="text-muted-foreground justify-center text-sm">
        <span>
          Already have an account?{" "}
          <Link
            href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
            className="text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </span>
      </CardFooter>
    </Card>
  );
}
