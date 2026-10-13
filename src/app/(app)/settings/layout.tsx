import { SettingsNav } from "@/components/app/settings-nav";

export default function SettingsLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="space-y-6">
      <SettingsNav />
      {children}
    </div>
  );
}
