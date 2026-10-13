import { AppShell } from "@/components/app/app-shell";
import { requireCurrentUser } from "@/lib/auth/dal";
import { getMemberships, requireActiveMembership } from "@/lib/org/active-org";

/**
 * Shell for authenticated routes.
 *
 * The session is read here for the sidebar and user menu, but this is not the
 * security boundary. Layouts do not re-render on client-side navigation and do
 * not stop nested segments from rendering, so every page calls the DAL itself.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [user, active, memberships] = await Promise.all([
    requireCurrentUser(),
    requireActiveMembership(),
    getMemberships(),
  ]);

  return (
    <AppShell
      active={active}
      memberships={memberships}
      fullName={user.fullName}
      email={user.email}
    >
      {children}
    </AppShell>
  );
}
