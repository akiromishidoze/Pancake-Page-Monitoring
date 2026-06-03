import { NextResponse } from 'next/server';
import { apiCatch } from '@/lib/errors';
import { getSetting } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const GET = withAuth(async () => {
    const lastTriggerTimeStr = await getSetting('last_trigger_time');
    const lastTriggerTime = lastTriggerTimeStr ? parseInt(lastTriggerTimeStr, 10) : 0;

    const now = Date.now();
    const isRunning = (now - lastTriggerTime) < 15000;

    return NextResponse.json({ ok: true, isRunning });
});
