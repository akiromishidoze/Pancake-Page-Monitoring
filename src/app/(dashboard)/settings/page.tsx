export const dynamic = 'force-dynamic';

import { listEndpoints } from '@/lib/db';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { SettingsForm } from './SettingsForm';
import { NotificationSettings } from '@/components/NotificationSettings';
import { ConnectorsSettings } from '@/components/ConnectorsSettings';
import { DataRetentionSettings } from '@/components/DataRetentionSettings';
import dyn from 'next/dynamic';

const TwoFactorSetup = dyn(() => import('@/components/TwoFactorSetup').then(m => m.TwoFactorSetup));
const UserManagement = dyn(() => import('@/components/UserManagement').then(m => m.UserManagement));
const ChangeCredentials = dyn(() => import('@/components/ChangeCredentials').then(m => m.ChangeCredentials));

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ change_password?: string }>;
}) {
  const resolvedSearch = searchParams ? await searchParams : undefined;
  let endpoints = [] as Array<{
    id: string; name: string; url: string | null; api_key: string;
    access_token: string | null; token_expires_at: string | null; is_active: boolean;
    created_at: string; last_used_at: string | null; fb_page_id: string | null;
  }>;
  try {
    const allEndpoints = await listEndpoints();
    endpoints = allEndpoints.map((e) => ({
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
  } catch (err) {
    console.error('SettingsPage error:', err);
  }

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
