import type { Metadata } from "next";

import { LogoutButton } from "@/components/auth/logout-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSession } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "No organization | TelesalesOS",
};

/**
 * Reached when a signed-in user has no active membership — either the signup
 * trigger failed partway through, or an owner suspended the membership.
 *
 * This deliberately sits outside the `(app)` group. The application layout
 * redirects here when there is no membership, so rendering it inside that
 * layout would loop.
 */
export default async function NoOrganizationPage() {
  const user = await requireSession();

  return (
    <Card>
      <CardHeader>
        <CardTitle>No organization</CardTitle>
        <CardDescription>
          {user.email} is signed in but is not an active member of any organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        This usually means an administrator suspended the membership. Contact your
        administrator, or sign out and use a different account.
      </CardContent>
      <CardFooter>
        <LogoutButton />
      </CardFooter>
    </Card>
  );
}
