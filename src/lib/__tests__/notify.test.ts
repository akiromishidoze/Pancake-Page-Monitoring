/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import nodemailer from 'nodemailer';

// -- Mocks --

const mockSettings = new Map<string, string>();
const mockRuns = new Map<string, any>();

vi.mock('../db', () => {
  const mockPool = {
    query: vi.fn(async (sql: string, params: any[]) => {
      if (sql.includes('SELECT * FROM runs')) {
        const runId = params[0];
        const run = mockRuns.get(runId);
        return { rows: run ? [run] : [] };
      }
      return { rows: [] };
    }),
  };

  return {
    getSetting: vi.fn(async (key: string) => mockSettings.get(key) ?? null),
    setSetting: vi.fn(async (key: string, value: string) => {
      mockSettings.set(key, value);
    }),
    pool: mockPool,
    queryRow: vi.fn(async (text: string, params?: unknown[]) => {
      const r = await mockPool.query(text, params ?? []);
      return r.rows[0];
    }),
    queryRows: vi.fn(async (text: string, params?: unknown[]) => {
      const r = await mockPool.query(text, params ?? []);
      return r.rows;
    }),
  };
});

vi.mock('../crypto', () => ({
  decrypt: vi.fn((val: string) => val.replace('enc:', '')),
  encrypt: vi.fn((val: string) => `enc:${val}`),
}));

const mockSendMail = vi.fn(async () => true);
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  }
}));

const mockFetch = vi.fn(async () => ({ ok: true }));
global.fetch = mockFetch as any;

describe('notify module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings.clear();
    mockRuns.clear();
    
    // Clear the internal dedup cache in notify.ts by forcing a reload with empty settings
    // Since dedupCache is a module-level variable, we can reset it by clearing the DB setting
    // and wait for it to naturally age out or just mock it.
    // Actually we can't easily reset the module-level dedupCache without resetModules.
    vi.resetModules();
  });

  describe('sendAlert', () => {
    it('does not send if missing slack/smtp configs', async () => {
      const { sendAlert } = await import('../notify');
      await sendAlert({
        title: 'Test',
        message: 'Hello',
        level: 'info',
      });
      
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('sends Slack if configured', async () => {
      mockSettings.set('notify_slack_webhook', 'https://slack.com/webhook');
      const { sendAlert } = await import('../notify');
      
      await sendAlert({
        title: 'Slack Test',
        message: 'Slack Message',
        level: 'critical',
      });
      
      expect(mockFetch).toHaveBeenCalledWith('https://slack.com/webhook', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Slack Message'),
      }));
    });

    it('sends Email if configured', async () => {
      mockSettings.set('notify_smtp_host', 'smtp.example.com');
      mockSettings.set('notify_smtp_port', '587');
      mockSettings.set('notify_smtp_user', 'user1');
      mockSettings.set('notify_smtp_pass', 'enc:pass1');
      mockSettings.set('notify_email_from', 'alert@example.com');
      mockSettings.set('notify_email_to', 'admin@example.com');
      
      const { sendAlert } = await import('../notify');
      
      await sendAlert({
        title: 'Email Test',
        message: 'Email Message',
        level: 'warning',
      });
      
      expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
        host: 'smtp.example.com',
        auth: { user: 'user1', pass: 'pass1' } // decrypted
      }));
      expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
        to: 'admin@example.com',
        subject: '[WARNING] Email Test',
      }));
    });

    it('deduplicates exact alerts within TTL', async () => {
      mockSettings.set('notify_slack_webhook', 'https://slack.com/webhook');
      const { sendAlert } = await import('../notify');
      
      const event = { title: 'Dedup', message: 'Msg', level: 'info' as const };
      
      await sendAlert(event);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      // Second identical alert should be deduplicated
      await sendAlert(event);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      // Different alert should bypass dedup
      await sendAlert({ ...event, message: 'Different Msg' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendEmail edge cases', () => {
    it('uses secure:true for port 465', async () => {
      mockSettings.set('notify_smtp_host', 'smtp.example.com');
      mockSettings.set('notify_smtp_port', '465');
      mockSettings.set('notify_smtp_user', 'user1');
      mockSettings.set('notify_smtp_pass', 'enc:pass1');
      mockSettings.set('notify_email_to', 'admin@example.com');
      const { sendAlert } = await import('../notify');
      await sendAlert({ title: 'T', message: 'M', level: 'info' });
      expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
        secure: true,
      }));
    });

    it('falls back to user as from when notify_email_from is missing', async () => {
      mockSettings.set('notify_smtp_host', 'smtp.example.com');
      mockSettings.set('notify_smtp_port', '587');
      mockSettings.set('notify_smtp_user', 'user1');
      mockSettings.set('notify_smtp_pass', 'enc:pass1');
      mockSettings.set('notify_email_to', 'admin@example.com');
      // Intentional: no notify_email_from set
      const { sendAlert } = await import('../notify');
      await sendAlert({ title: 'T', message: 'M', level: 'info' });
      expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
        from: 'user1',
      }));
    });

    it('handles unencrypted pass (no colon)', async () => {
      mockSettings.set('notify_smtp_host', 'smtp.example.com');
      mockSettings.set('notify_smtp_port', '587');
      mockSettings.set('notify_smtp_user', 'user1');
      mockSettings.set('notify_smtp_pass', 'plain-password');
      mockSettings.set('notify_email_to', 'admin@example.com');
      const { sendAlert } = await import('../notify');
      await sendAlert({ title: 'T', message: 'M', level: 'info' });
      expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
        auth: { user: 'user1', pass: 'plain-password' },
      }));
    });

    it('returns false when sendMail throws', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP error'));
      mockSettings.set('notify_smtp_host', 'smtp.example.com');
      mockSettings.set('notify_smtp_port', '587');
      mockSettings.set('notify_smtp_user', 'user1');
      mockSettings.set('notify_smtp_pass', 'enc:pass1');
      mockSettings.set('notify_email_to', 'admin@example.com');
      const { sendAlert } = await import('../notify');
      // Should not throw
      await expect(sendAlert({ title: 'T', message: 'M', level: 'info' })).resolves.toBeUndefined();
    });
  });

  describe('sendSlack edge cases', () => {
    it('handles fetch rejection', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockSettings.set('notify_slack_webhook', 'https://slack.com/webhook');
      const { sendAlert } = await import('../notify');
      await expect(sendAlert({ title: 'T', message: 'M', level: 'info' })).resolves.toBeUndefined();
    });

    it('handles non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false } as Response);
      mockSettings.set('notify_slack_webhook', 'https://slack.com/webhook');
      const { sendAlert } = await import('../notify');
      await expect(sendAlert({ title: 'T', message: 'M', level: 'info' })).resolves.toBeUndefined();
    });
  });

  describe('sendAlert dispatch edge cases', () => {
    it('sends only email when no slack webhook is configured', async () => {
      mockSettings.set('notify_smtp_host', 'smtp.example.com');
      mockSettings.set('notify_smtp_port', '587');
      mockSettings.set('notify_smtp_user', 'user1');
      mockSettings.set('notify_smtp_pass', 'enc:pass1');
      mockSettings.set('notify_email_to', 'admin@example.com');
      const { sendAlert } = await import('../notify');
      await sendAlert({ title: 'Email Only', message: 'M', level: 'info' });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSendMail).toHaveBeenCalled();
    });

    it('sends only slack when no email config', async () => {
      mockSettings.set('notify_slack_webhook', 'https://slack.com/webhook');
      const { sendAlert } = await import('../notify');
      await sendAlert({ title: 'Slack Only', message: 'M', level: 'info' });
      expect(mockFetch).toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  describe('dedup cache behavior', () => {
    it('deduplicates identical alerts across sequential calls', async () => {
      mockSettings.set('notify_slack_webhook', 'https://slack.com/webhook');
      const { sendAlert } = await import('../notify');
      await sendAlert({ title: 'seq', message: 'dup', level: 'warning' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await sendAlert({ title: 'seq', message: 'dup', level: 'warning' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkAlertsForRun', () => {
    it('sends Canary DOWN alert', async () => {
      mockSettings.set('notify_slack_webhook', 'https://slack.com/webhook');
      mockRuns.set('run-1', { run_id: 'run-1', canary_status: 'down', heartbeat_ok: true });
      
      const { checkAlertsForRun } = await import('../notify');
      await checkAlertsForRun('run-1');
      
      expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        body: expect.stringContaining('Canary is DOWN')
      }));
    });

    it('sends Outage Suspected alert', async () => {
      mockSettings.set('notify_slack_webhook', 'https://slack.com/webhook');
      mockRuns.set('run-2', { run_id: 'run-2', outage_suspected: true, alert_count: 5, heartbeat_ok: true });
      
      const { checkAlertsForRun } = await import('../notify');
      await checkAlertsForRun('run-2');
      
      expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        body: expect.stringContaining('Outage Suspected')
      }));
    });

    it('sends Multiple Alerts warning', async () => {
      mockSettings.set('notify_slack_webhook', 'https://slack.com/webhook');
      mockRuns.set('run-3', { run_id: 'run-3', alert_count: 4, heartbeat_ok: true });
      
      const { checkAlertsForRun } = await import('../notify');
      await checkAlertsForRun('run-3');
      
      expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        body: expect.stringContaining('Multiple Alerts')
      }));
    });

    it('sends Degraded Quality warning', async () => {
      mockSettings.set('notify_slack_webhook', 'https://slack.com/webhook');
      mockRuns.set('run-4', { run_id: 'run-4', run_quality: 'degraded', heartbeat_ok: true });
      
      const { checkAlertsForRun } = await import('../notify');
      await checkAlertsForRun('run-4');
      
      expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        body: expect.stringContaining('Run Quality Degraded')
      }));
    });

    it('sends Heartbeat Stale warning', async () => {
      mockSettings.set('notify_slack_webhook', 'https://slack.com/webhook');
      mockRuns.set('run-5', { run_id: 'run-5', heartbeat_ok: false });
      
      const { checkAlertsForRun } = await import('../notify');
      await checkAlertsForRun('run-5');
      
      expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        body: expect.stringContaining('Heartbeat Stale')
      }));
    });

    it('does nothing for missing run', async () => {
      mockSettings.set('notify_slack_webhook', 'https://slack.com/webhook');
      const { checkAlertsForRun } = await import('../notify');
      await checkAlertsForRun('non-existent-run');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sends NO alerts if run is perfectly healthy', async () => {
      mockSettings.set('notify_slack_webhook', 'https://slack.com/webhook');
      mockRuns.set('run-ok', { 
        run_id: 'run-ok', 
        canary_status: 'ok', 
        outage_suspected: false, 
        alert_count: 0, 
        run_quality: 'ok', 
        heartbeat_ok: true 
      });
      
      const { checkAlertsForRun } = await import('../notify');
      await checkAlertsForRun('run-ok');
      
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
