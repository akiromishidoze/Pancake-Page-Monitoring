import { listEndpoints } from '@/lib/db';
import { SettingsForm } from './SettingsForm';
import { ChangeCredentials } from '@/components/ChangeCredentials';
import { NotificationSettings } from '@/components/NotificationSettings';
import { ConnectorsSettings } from '@/components/ConnectorsSettings';
import { DataRetentionSettings } from '@/components/DataRetentionSettings';

export default async function SettingsPage() {
  const endpoints = listEndpoints().map((e) => ({
    id: e.id,
    name: e.name,
    url: e.url,
    api_key: e.api_key,
    access_token: e.access_token,
    token_expires_at: e.token_expires_at,
    is_active: e.is_active,
    created_at: e.created_at,
    last_used_at: e.last_used_at,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm text-slate-400 mt-1">
          Manage data sources that can send monitoring data to this dashboard.
        </p>
      </div>

      <SettingsForm initialEndpoints={endpoints} />

      <ConnectorsSettings />

      <NotificationSettings />

      <DataRetentionSettings />

      <ChangeCredentials />
    </div>
  );
}
