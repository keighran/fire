import { api } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import SettingsForm from "@/components/SettingsForm";

export const metadata = { title: "Settings — WealthTrack AU" };

export default async function SettingsPage() {
  const token = await getAuthToken();
  const settings = await api.getSettings(token).catch(() => null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage your portfolio assumptions, pay details, and FIRE projections.
        </p>
      </div>

      {settings ? (
        <SettingsForm initial={settings} />
      ) : (
        <div className="card text-center py-10">
          <p className="text-slate-400 mb-2">Could not load settings.</p>
          <p className="text-sm text-slate-600">Ensure the backend is running and you are signed in.</p>
        </div>
      )}
    </div>
  );
}
