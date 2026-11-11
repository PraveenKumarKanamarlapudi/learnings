import express from 'express';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createApp } from './app';
import { openDb } from './db';

const file = resolve(process.env.PV_DB ?? 'data/promptvault.db');
mkdirSync(dirname(file), { recursive: true });
const app = createApp(openDb(file, true));

// `npm run build && npm start` serves the built UI from the same port.
const dist = resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_q, r) => r.sendFile(resolve(dist, 'index.html')));
}

const port = Number(process.env.PORT ?? 3001);
app.listen(port, '127.0.0.1', () => console.log(`PromptVault API on http://127.0.0.1:${port}  (db: ${file})`));
