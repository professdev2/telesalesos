import type { Metadata } from "next";
import Link from "next/link";

import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { LoginForm } from "@/components/auth/login-form";
import { isGoogleAuthEnabled } from "@/lib/auth/providers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sign in | TelesalesOS",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const googleEnabled = await isGoogleAuthEnabled();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Access your TelesalesOS workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        {params.recovered === "1" ? (
          <Alert className="mb-4">
            <AlertDescription>
              Authenticator recovery finished. Sign in with your new password. Owners
              and admins must enroll a new authenticator next.
            </AlertDescription>
          </Alert>
        ) : null}
        <LoginForm next={next} />
        {googleEnabled ? <GoogleSignIn next={next} placement="bottom" /> : null}
      </CardContent>
      <CardFooter className="text-muted-foreground justify-center text-sm">
        <span>
          No account?{" "}
          <Link
            href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
            className="text-foreground underline-offset-4 hover:underline"
          >
            Create one
          </Link>
        </span>
      </CardFooter>
    </Card>
  );
}
