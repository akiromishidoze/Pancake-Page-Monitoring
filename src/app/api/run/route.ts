// POST /api/run — triggers a manual run of the n8n monitoring workflow.
// Forwards to the n8n webhook with the X-Monitor-Secret header server-side.
// Client never sees the secret.

import { NextResponse } from 'next/server';
import { setSetting } from '@/lib/db';

export async function POST() {
  const url = process.env.RUN_TRIGGER_URL;
  const secret = process.env.MONITOR_SECRET;

  if (!url || !secret) {
    return NextResponse.json(
      { ok: false, error: 'RUN_TRIGGER_URL or MONITOR_SECRET env var not set' },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Monitor-Secret': secret,
      },
      body: JSON.stringify({ source: 'dashboard', triggered_at: new Date().toISOString() }),
      // Don't cache trigger calls
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { ok: false, error: `n8n responded ${res.status}: ${text.slice(0, 200)}` },
        { status: 502 },
      );
    }

    // Record that a run has been triggered to show the loading phase in the UI
    const nowStr = Date.now().toString();
    setSetting('last_trigger_time', nowStr);
    
    // Also reset the background scheduler countdown so it starts fresh from right now!
    setSetting('last_scheduled_run', nowStr);

    const text = await res.text();
    return NextResponse.json({
      ok: true,
      message: 'Run triggered. New data should appear within ~30-60 seconds.',
      n8n_response: text.slice(0, 500),
      triggered_at: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
