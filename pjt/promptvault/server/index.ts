import express from 'express';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createApp } from './app';
import { openDb } from './db';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3001);
const password = process.env.PV_PASSWORD || undefined;
const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host);

// Fail closed: never serve prompts to a network without a password.
if (!password && !loopback) {
  console.error(`Refusing to listen on ${host} without PV_PASSWORD. Set a password (12+ characters) or use HOST=127.0.0.1.`);
  process.exit(1);
}
if (password && password.length < 12) {
  console.error('PV_PASSWORD must be at least 12 characters.');
  process.exit(1);
}

const file = resolve(process.env.PV_DB ?? 'data/promptvault.db');
mkdirSync(dirname(file), { recursive: true });
const db = openDb(file, true);
const app = createApp(db, { password, trustProxy: process.env.TRUST_PROXY === '1' });

// `npm run build && npm start` serves the built UI from the same port.
const dist = resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_q, r) => r.sendFile(resolve(dist, 'index.html')));
}

const server = app.listen(port, host, () =>
  console.log(`PromptVault on http://${host}:${port}  (db: ${file}, auth: ${password ? 'on' : 'off'})`),
);

// Hosts stop idle machines with SIGTERM; close cleanly so SQLite flushes its WAL.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    setTimeout(() => process.exit(0), 5000).unref();
    server.close(() => {
      db.close();
      process.exit(0);
    });
    server.closeIdleConnections();
  });
}
