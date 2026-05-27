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

export const SlimPageSchema = z.object({
  shop_label: z.string().nullable().optional(),
  shop: z.string().nullable().optional(),
  name: z.string(),
  page_id: z.string(),
  id: z.string(),
  activity_kind: z.string().nullable().optional(),
  kind: z.string().nullable().optional(),
  activation_reason: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  last_order_at: z.string().nullable().optional(),
  last_customer_activity_at: z.string().nullable().optional(),
  state_change: z.string().nullable().optional(),
  activity_kind_change: z.string().nullable().optional(),
  is_canary: z.boolean(),
  response_ms: z.number().nullable().optional(),
  fetch_errors: z.number(),
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
