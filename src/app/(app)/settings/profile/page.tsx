import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { ProfileForm } from "@/components/org/profile-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireCurrentUser } from "@/lib/auth/dal";
import { requireActiveMembership } from "@/lib/org/active-org";

export const metadata: Metadata = {
  title: "Profile | TelesalesOS",
};

export default async function ProfilePage() {
  const [user] = await Promise.all([requireCurrentUser(), requireActiveMembership()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        description="Your name is visible to you. Email is your sign-in identity."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your details</CardTitle>
          <CardDescription>Updates apply to your own profile row only.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm fullName={user.fullName} email={user.email} />
        </CardContent>
      </Card>
    </div>
  );
}
