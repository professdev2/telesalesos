import {
  Building2,
  Calculator,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  Package,
  Phone,
  ShieldAlert,
  UserPlus,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Rendered with a "Soon" marker and a placeholder page behind it. */
  comingSoon?: boolean;
  /** Hide unless the active org has PowerBridge enabled. */
  powerbridgeOnly?: boolean;
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

/**
 * Sidebar contents.
 *
 * Everything marked `comingSoon` resolves to a placeholder page. Showing the
 * shape of the product without inventing records is deliberate — a nav item
 * that opens fake contacts is worse than one that says it is not built.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Pipeline",
    items: [
      { label: "Contacts", href: "/contacts", icon: Users },
      {
        label: "Companies",
        href: "/companies",
        icon: Building2,
        powerbridgeOnly: true,
      },
      {
        label: "Orders",
        href: "/orders",
        icon: Package,
        powerbridgeOnly: true,
      },
      { label: "Leads", href: "/leads", icon: UserPlus },
      { label: "Retention", href: "/retention", icon: ShieldAlert },
      { label: "Calls", href: "/calls", icon: Phone },
      { label: "Campaigns", href: "/campaigns", icon: Megaphone },
    ],
  },
  {
    label: "Enablement",
    items: [
      { label: "Training", href: "/training", icon: GraduationCap },
      { label: "QuoteCoach", href: "/quotecoach", icon: Calculator, comingSoon: true },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Profile", href: "/settings/profile", icon: User },
      { label: "Organization", href: "/settings/organization", icon: Building2 },
      { label: "Members", href: "/settings/members", icon: Users },
      { label: "Billing", href: "/billing", icon: CreditCard },
    ],
  },
];
