export const dynamic = 'force-dynamic';

import { listEndpoints } from '@/lib/db';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { SettingsForm } from './SettingsForm';
import { ChangeCredentials } from '@/components/ChangeCredentials';
import { NotificationSettings } from '@/components/NotificationSettings';
import { ConnectorsSettings } from '@/components/ConnectorsSettings';
import { DataRetentionSettings } from '@/components/DataRetentionSettings';
import { TwoFactorSetup } from '@/components/TwoFactorSetup';
import { UserManagement } from '@/components/UserManagement';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ change_password?: string }>;
}) {
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const allEndpoints = await listEndpoints();
  const endpoints = allEndpoints.map((e) => ({
    id: e.id,
    name: e.name,
    url: e.url,
    api_key: e.api_key,
    access_token: e.access_token,
    token_expires_at: e.token_expires_at,
    is_active: e.is_active,
    created_at: e.created_at,
    last_used_at: e.last_used_at,
    fb_page_id: e.fb_page_id,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm text-slate-400 mt-1">
          Manage data sources that can send monitoring data to this dashboard.
        </p>
      </div>

      <SectionErrorBoundary title="Endpoints">
        <SettingsForm initialEndpoints={endpoints} />
      </SectionErrorBoundary>

      <SectionErrorBoundary title="Connectors">
        <ConnectorsSettings />
      </SectionErrorBoundary>

      <SectionErrorBoundary title="Notifications">
        <NotificationSettings />
      </SectionErrorBoundary>

      <SectionErrorBoundary title="Data Retention">
        <DataRetentionSettings />
      </SectionErrorBoundary>

      <SectionErrorBoundary title="Two-Factor Authentication">
        <TwoFactorSetup />
      </SectionErrorBoundary>

      <SectionErrorBoundary title="User Management">
        <UserManagement />
      </SectionErrorBoundary>

      <SectionErrorBoundary title="Credentials">
        <ChangeCredentials force={resolvedSearch?.change_password === '1'} />
      </SectionErrorBoundary>
    </div>
  );
}
