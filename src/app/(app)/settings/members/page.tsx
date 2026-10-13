import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { InviteForm } from "@/components/org/invite-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasAtLeastRole } from "@/lib/auth/dal";
import { requireActiveMembership } from "@/lib/org/active-org";
import { deleteInvitationAction, revokeInvitationAction } from "@/lib/org/actions";
import { getInvitations, getVisibleMembers } from "@/lib/org/queries";

export const metadata: Metadata = {
  title: "Members | TelesalesOS",
};

export default async function MembersPage() {
  const membership = await requireActiveMembership();
  const canManage = hasAtLeastRole(membership.role, "admin");
  const [members, invitations] = await Promise.all([
    getVisibleMembers(),
    canManage ? getInvitations() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        description={
          canManage
            ? "People with access to this organization."
            : "You can see your own membership. The full roster is limited to owners and admins."
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roster</CardTitle>
          <CardDescription>
            Other members&apos; names are not readable. Profiles are own-row-only under
            row-level security, so teammates appear without a display name.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-xs">
                <th className="py-2 pr-4 font-medium">Person</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-4">
                    <div className="font-medium">
                      {row.isYou
                        ? (row.displayName ?? "You")
                        : `Member ${row.userId.slice(0, 8)}`}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {row.isYou ? row.email : "Name hidden by RLS"}
                    </div>
                  </td>
                  <td className="py-2.5 pr-4">
                    <Badge variant="secondary" className="capitalize">
                      {row.role}
                    </Badge>
                    {row.isYou ? (
                      <span className="text-muted-foreground ml-2 text-xs">you</span>
                    ) : null}
                  </td>
                  <td className="py-2.5 capitalize">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {membership.accountType === "individual" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invitations</CardTitle>
            <CardDescription>
              Individual organizations cannot invite anyone. Convert to a team first.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : canManage ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invite someone</CardTitle>
              <CardDescription>
                Creates a join link and emails it from noreply@telesalesos.com.
                They must open that link and click Join organization — signing up
                alone does not add them to this team.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InviteForm />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invitations</CardTitle>
              <CardDescription>Pending links expire after seven days.</CardDescription>
            </CardHeader>
            <CardContent>
              {invitations.length === 0 ? (
                <p className="text-muted-foreground text-sm">No invitations yet.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-xs">
                      <th className="py-2 pr-4 font-medium">Email</th>
                      <th className="py-2 pr-4 font-medium">Role</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 font-medium"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((invite) => (
                      <tr key={invite.id} className="border-b last:border-0">
                        <td className="py-2.5 pr-4">{invite.email}</td>
                        <td className="py-2.5 pr-4 capitalize">{invite.role}</td>
                        <td className="py-2.5 pr-4 capitalize">{invite.status}</td>
                        <td className="py-2.5 text-right">
                          {invite.status === "pending" ? (
                            <form action={revokeInvitationAction}>
                              <input type="hidden" name="invitationId" value={invite.id} />
                              <Button type="submit" variant="ghost" size="sm">
                                Revoke
                              </Button>
                            </form>
                          ) : (
                            <form action={deleteInvitationAction}>
                              <input type="hidden" name="invitationId" value={invite.id} />
                              <Button type="submit" variant="ghost" size="sm">
                                Delete
                              </Button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
