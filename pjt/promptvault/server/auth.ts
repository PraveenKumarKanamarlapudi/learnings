import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Express, Request } from 'express';

// Single shared password -> signed, expiring, HttpOnly cookie. No session store, no extra dependencies.
const COOKIE = 'pv_session';
const TTL_MS = 7 * 24 * 3600 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

const sha = (s: string) => createHash('sha256').update(s).digest();
// Compare digests so length differences don't leak and comparison is constant-time.
const safeEq = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));

const readCookie = (req: Request) =>
  (req.headers.cookie ?? '').split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);

export function setupAuth(app: Express, password: string) {
  // ponytail: key derives from the password, so changing the password signs everyone out.
  // Add a separate PV_SECRET if you ever need to rotate one without the other.
  const key = sha('promptvault-session-key:' + password);
  const sign = (exp: number) => createHmac('sha256', key).update(String(exp)).digest('base64url');
  const issue = () => {
    const exp = Date.now() + TTL_MS;
    return `${exp}.${sign(exp)}`;
  };
  const valid = (token?: string) => {
    if (!token) return false;
    const [e, sig] = token.split('.');
    const exp = Number(e);
    return Number.isFinite(exp) && exp > Date.now() && !!sig && safeEq(sig, sign(exp));
  };

  // ponytail: in-memory per-IP lockout. Resets on restart; fine for one instance, use a shared store if you ever scale out.
  const fails = new Map<string, { n: number; until: number }>();

  app.post('/api/login', (req, res) => {
    const ip = req.ip ?? 'unknown';
    const now = Date.now();
    if (fails.size > 1000) for (const [k, v] of fails) if (v.until <= now) fails.delete(k);
    const f = fails.get(ip);
    const active = f && f.until > now ? f : undefined;
    if (active && active.n >= MAX_FAILS) {
      res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
      return;
    }
    const given = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!safeEq(given, password)) {
      fails.set(ip, { n: (active?.n ?? 0) + 1, until: now + LOCK_MS });
      res.status(401).json({ error: 'Incorrect password' });
      return;
    }
    fails.delete(ip);
    res.cookie(COOKIE, issue(), { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: TTL_MS, path: '/' });
    res.json({ ok: true });
  });

  app.post('/api/logout', (_req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/session', (req, res) => res.json({ authRequired: true, authenticated: valid(readCookie(req)) }));

  // Everything registered after this point under /api needs a valid session.
  app.use('/api', (req, res, next) => {
    if (valid(readCookie(req))) next();
    else res.status(401).json({ error: 'Not signed in' });
  });
}
