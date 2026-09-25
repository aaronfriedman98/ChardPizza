import { SettingsTabs } from "./tabs";

export default function SettingsLayout({ children }: LayoutProps<"/admin/settings">) {
  return (
    <div className="space-y-5">
      <h1 className="page-title">Settings</h1>
      <SettingsTabs />
      {children}
    </div>
  );
}
