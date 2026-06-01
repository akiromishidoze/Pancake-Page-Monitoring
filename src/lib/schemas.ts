import { z } from 'zod';

export const BotCakePageTokenSchema = z.object({
  page_id: z.string(),
  public_token: z.string(),
});

export const BotCakeCustomerDataSchema = z.array(z.object({
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
}).passthrough());

export const BotCakeToolsResponseSchema = z.object({
  success: z.boolean().optional(),
  data: z.array(z.object({
    is_published: z.boolean().optional(),
    updated_at: z.string().optional(),
  }).passthrough()).optional(),
});

export const BotCakeFlowsResponseSchema = z.object({
  success: z.boolean().optional(),
  data: z.object({
    flows: z.array(z.object({
      is_removed: z.boolean().optional(),
      updated_at: z.string().optional(),
    }).passthrough()).optional(),
  }).optional(),
});

export const FbPageInfoSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  error: z.record(z.string(), z.unknown()).optional(),
});

export const PageStateRowSchema = z.object({
  page_id: z.string(),
  page_name: z.string(),
});

export const EndpointCreateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'name is required'),
  api_key: z.string().min(1, 'api_key is required'),
  url: z.string().nullable().optional(),
  access_token: z.string().nullable().optional(),
  token_expires_at: z.string().nullable().optional(),
  shop_label: z.string().nullable().optional(),
  is_active: z.boolean().optional().default(true),
});

export const EndpointUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  api_key: z.string().min(1).optional(),
  url: z.string().nullable().optional(),
  access_token: z.string().nullable().optional(),
  token_expires_at: z.string().nullable().optional(),
  shop_label: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

export const PlatformPageCreateSchema = z.object({
  endpoint_id: z.string().min(1, 'endpoint_id is required'),
  page_name: z.string().min(1, 'page_name is required'),
  page_url: z.string().nullable().optional(),
  is_active: z.boolean().optional().default(true),
});

export const PlatformPageUpdateSchema = z.object({
  endpoint_id: z.string().min(1).optional(),
  page_name: z.string().min(1).optional(),
  page_url: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

export const ConnectorCreateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'name is required'),
  platform_type: z.string().min(1, 'platform_type is required'),
  api_url: z.string().min(1, 'api_url is required'),
  auth_header: z.string().nullable().optional(),
  auth_token: z.string().nullable().optional(),
  json_path: z.string().nullable().optional(),
  interval_ms: z.number().int().positive().optional().default(60000),
  is_active: z.boolean().optional().default(true),
});

export const LoginSchema = z.object({
  email: z.string().min(1, 'email is required'),
  password: z.string().min(1, 'password is required'),
});

export const ChangePasswordSchema = z.object({
  current_email: z.string().optional().default('admin'),
  current_password: z.string().min(1, 'current_password is required'),
  new_email: z.string().optional(),
  new_password: z.string().min(8, 'new_password must be at least 8 characters').optional(),
});

export const NotifySettingsSchema = z.object({
  slack_webhook: z.string().optional(),
  smtp_host: z.string().optional(),
  smtp_port: z.string().optional(),
  smtp_user: z.string().optional(),
  smtp_pass: z.string().optional(),
  email_from: z.string().optional(),
  email_to: z.string().optional(),
});

export const ScheduleSchema = z.object({
  interval: z.string().min(1, 'interval is required'),
});

export const BotCakeOverrideSchema = z.object({
  page_id: z.string().min(1, 'page_id is required'),
  is_active: z.boolean().optional().default(true),
  reason: z.string().optional(),
  remove: z.boolean().optional(),
});

export const RetentionSettingsSchema = z.object({
  retention_days: z.union([z.string(), z.number()]).optional(),
});

export const IngestRowSchema = z.object({
  page_id: z.string().optional(),
  id: z.string().optional(),
  shop_label: z.string().optional().nullable(),
  page_name: z.string().optional(),
  name: z.string().optional(),
  activity_kind: z.string().optional().nullable(),
  kind: z.string().optional().nullable(),
  activation_reason: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  is_activated: z.boolean().optional(),
  is_canary: z.boolean().optional(),
  last_order_at: z.string().optional().nullable(),
  last_customer_activity_at: z.string().optional().nullable(),
  state_change: z.string().optional().nullable(),
  activity_kind_change: z.string().optional().nullable(),
  response_ms: z.number().optional().nullable(),
  fetch_errors: z.number().optional(),
});

export const IngestSummarySchema = z.object({
  run_quality: z.string().optional().nullable(),
  severity: z.string().optional().nullable(),
  canary_status: z.string().optional().nullable(),
  canary_alert: z.boolean().optional(),
  outage_suspected: z.boolean().optional(),
  alert_count: z.number().optional(),
  rule_version: z.number().optional().nullable(),
  in_maintenance_window: z.boolean().optional(),
});

export const IngestBodySchema = z.object({
  run_id: z.string().optional(),
  generated_at: z.string().optional(),
  status: z.string().optional(),
  rows: z.array(IngestRowSchema).optional().default([]),
  summary: IngestSummarySchema.optional().default({}),
});
