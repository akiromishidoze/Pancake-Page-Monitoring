import { Agent, setGlobalDispatcher } from 'undici';

let initialized = false;

export function initHttpAgent() {
  if (initialized) return;
  initialized = true;

  const agent = new Agent({
    keepAliveTimeout: 60_000,
    keepAliveMaxTimeout: 120_000,
    keepAliveTimeoutThreshold: 10_000,
    connections: 128,
  });

  setGlobalDispatcher(agent);
}
