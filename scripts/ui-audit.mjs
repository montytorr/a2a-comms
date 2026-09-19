#!/usr/bin/env node
/**
 * Drive a real browser over every dashboard route and report what breaks.
 *
 * This exists because the geometry bugs are invisible to everything else we
 * have. A percentage-width column does not OVERFLOW on a phone — it shrinks
 * until its contents overlap, so the page still reports a clean scrollWidth
 * while the header reads "PROPOSEPARTICIPANTSTURNSCREATED". No unit test sees
 * that, and neither does a human who only ever opens the app on a laptop.
 *
 * It reports three things:
 *   OVERFLOW   the document scrolls sideways — the page is wider than the phone
 *   CLIPPED    a box is narrower than the text inside it, with no ellipsis
 *   OVERLAP    two text boxes in NORMAL FLOW occupy the same pixels
 *
 * "In normal flow" is load-bearing. An absolutely positioned badge sitting over
 * its container is a design, and avatar stacks overlap on purpose via negative
 * margins; counting those produced six false findings on three pages before
 * the check was added.
 *
 * USAGE — needs a running stack and a user to log in as:
 *
 *   docker compose -f docker-compose.dev.yml up -d --build
 *   # create a super-admin (bcrypt hash of your chosen password):
 *   #   INSERT INTO app_users (email, encrypted_password, raw_user_meta_data) ...
 *   #   INSERT INTO user_profiles (id, display_name, is_super_admin) ...
 *   UI_AUDIT_EMAIL=you@example.com UI_AUDIT_PASSWORD=... node scripts/ui-audit.mjs
 *
 *   VP=phone     only the 390px pass (faster while iterating)
 *   node scripts/ui-audit.mjs light       the other theme
 *
 * Screenshots land in ui-audit-shots/. Load it with production-shaped data
 * first — an empty table cannot overlap, so an empty database will tell you
 * everything is fine.
 *
 * Deliberately NOT part of npm test: it needs a stack, a browser and about
 * fifteen minutes. The geometry ratchet in src/lib/geometry-ratchet.test.ts is
 * the part that runs on every commit; this is the part you run when you change
 * a layout.
 */

// playwright is not a dependency of this app — it is a tool you bring.
// npx playwright install chromium, then: PLAYWRIGHT=$(npm root -g)/playwright node scripts/ui-audit.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_IMPORT || 'playwright');
import fs from 'node:fs';

const BASE = process.env.UI_AUDIT_BASE || 'http://localhost:3100';
// Any real row will do; these are only used to reach the detail routes.
const CONTRACT = process.env.UI_AUDIT_CONTRACT || '';
const PROJECT  = process.env.UI_AUDIT_PROJECT || '';
const TASK     = process.env.UI_AUDIT_TASK || '';
const AGENT    = process.env.UI_AUDIT_AGENT || '';

const ROUTES = [
  ['dashboard', '/'], ['contracts', '/contracts'], ['contract-detail', `/contracts/${CONTRACT}`],
  ['messages', '/messages'], ['agents', '/agents'], ['agent-detail', `/agents/${AGENT}`],
  ['agents-register', '/agents/register'], ['projects', '/projects'],
  ['project-detail', `/projects/${PROJECT}`], ['task-detail', `/projects/${PROJECT}/tasks/${TASK}`],
  ['projects-new', '/projects/new'], ['tasks', '/tasks'], ['protocol-inspector', '/protocol-inspector'],
  ['feed', '/feed'], ['analytics', '/analytics'], ['notifications', '/notifications'],
  ['approvals', '/approvals'], ['audit', '/audit'], ['webhooks', '/webhooks'],
  ['webhooks-health', '/webhooks/health'], ['webhooks-register', '/webhooks/register'],
  ['security', '/security'], ['api-docs', '/api-docs'], ['changelog', '/changelog'],
  ['settings', '/settings'], ['users', '/users'], ['kill-switch', '/kill-switch'],
  ['onboarding-agent', '/onboarding/agent'], ['onboarding-human', '/onboarding/human'],
  ['admin-emails', '/admin/emails'],
];

const ALL_VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 900 } };
const VIEWPORTS = process.env.VP ? { [process.env.VP]: ALL_VIEWPORTS[process.env.VP] } : ALL_VIEWPORTS;
const theme = process.argv[2] || 'dark';
const only = process.argv[3];

fs.mkdirSync('ui-audit-shots', { recursive: true });
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const ctx = await browser.newContext({ viewport: ALL_VIEWPORTS.desktop });
const page = await ctx.newPage();

// Real login, real session cookie.
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[type="email"]', process.env.UI_AUDIT_EMAIL || 'ui-audit@example.com');
await page.fill('input[type="password"]', process.env.UI_AUDIT_PASSWORD || '');
await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30000 }), page.click('button[type="submit"]')]);
console.log('logged in as', await page.evaluate(() => document.title));

// Theme is stored by next-themes in localStorage.
await page.evaluate((t) => localStorage.setItem('theme', t), theme);

const findings = [];
for (const [name, path] of ROUTES) {
  if (path.includes('//') || path.endsWith('/')) { console.log(`skipping ${name} — no fixture id supplied`); continue; }
  if (only && name !== only) continue;
  for (const [vp, size] of Object.entries(VIEWPORTS)) {
    await page.setViewportSize(size);
    // A route that will not load must not end the audit — record it and move on.
    let reachable = true;
    try {
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 });
    } catch {
      try { await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
      catch (e) { reachable = false; findings.push({ route: name, vp, theme, unreachable: String(e).slice(0, 80) }); }
    }
    if (!reachable) { process.stdout.write('x'); continue; }
    // boot-screen.tsx covers the viewport for 800ms plus a 300ms fade. A 700ms
    // wait measured the splash instead of the page, which is how /audit came
    // back "overlapping" when it had simply not rendered yet.
    await page.waitForFunction(
      () => !document.body.innerText.includes('BOOTING CONTROL PLANE'),
      { timeout: 8000 },
    ).catch(() => {});
    await page.waitForTimeout(500);

    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const overflow = de.scrollWidth - de.clientWidth;
      // which elements actually stick out past the viewport
      const culprits = [];
      if (overflow > 1) {
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > de.clientWidth + 1) {
            const cs = getComputedStyle(el);
            if (cs.position === 'fixed') continue;
            culprits.push({
              tag: el.tagName.toLowerCase(),
              cls: (el.className && String(el.className).slice(0, 60)) || '',
              right: Math.round(r.right), w: Math.round(r.width),
              txt: (el.textContent || '').trim().slice(0, 40),
            });
          }
        }
      }
      // A percentage-width cell does not OVERFLOW the page — it shrinks until
      // its content no longer fits, and the columns visually collide. That is
      // invisible to a scrollWidth check on the document, so look for boxes
      // whose own content does not fit inside them.
      const clipped = [];
      for (const el of document.querySelectorAll('body *')) {
        if (el.children.length > 0) continue;              // leaf text nodes only
        const text = (el.textContent || '').trim();
        if (!text) continue;
        const cs = getComputedStyle(el);
        if (cs.overflow === 'auto' || cs.overflow === 'scroll' || cs.overflowX === 'auto') continue;
        if (cs.textOverflow === 'ellipsis') continue;      // deliberate truncation
        if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
          clipped.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 40),
                         box: el.clientWidth, needs: el.scrollWidth, txt: text.slice(0, 30) });
        }
      }

      // Two text boxes sharing space is the other failure the screenshot shows.
      // Only elements in normal flow can "collide". An absolutely positioned
      // badge sitting over its container is a design, not a bug — the live
      // indicator produced six findings on three pages that way — and avatar
      // stacks overlap each other on purpose via negative margins.
      // Text clipped away by an ancestor still has a layout rect. A
      // -webkit-line-clamp:3 preview whose fourth line is invisible reports a
      // box 61px BELOW its clipping parent, which then "overlaps" the next
      // card — eight findings on /messages that a screenshot showed were not
      // there. Only measure what is actually on screen.
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        for (let n = el.parentElement, d = 0; n && n !== document.body && d < 8; n = n.parentElement, d++) {
          const cs = getComputedStyle(n);
          if (cs.overflow === 'visible' && cs.overflowY === 'visible' && cs.overflowX === 'visible') continue;
          const p = n.getBoundingClientRect();
          if (r.bottom > p.bottom + 1 || r.top < p.top - 1 || r.right > p.right + 1) return false;
        }
        return true;
      };
      const inNormalFlow = (el) => {
        for (let n = el, depth = 0; n && n !== document.body && depth < 6; n = n.parentElement, depth++) {
          const cs = getComputedStyle(n);
          if (cs.position !== 'static' && cs.position !== 'relative') return false;
          if (parseFloat(cs.marginLeft) < 0 || parseFloat(cs.marginRight) < 0) return false;
        }
        return true;
      };
      const overlaps = [];
      const leaves = [...document.querySelectorAll('body *')]
        .filter((el) => el.children.length === 0 && (el.textContent || '').trim()
                 && inNormalFlow(el) && isVisible(el))
        .slice(0, 400);
      // An inline element that WRAPS reports a bounding box spanning every line
      // it touches, so `<code>turns-exhausted</code>` broken over two lines
      // returns one tall rectangle covering the text either side of it on both.
      // getClientRects() gives the per-line fragments, which is what a reader
      // actually sees. The prose pages produced a dozen findings this way.
      const fragments = (el) => [...el.getClientRects()].filter((r) => r.width >= 4 && r.height >= 4);

      for (let i = 0; i < leaves.length; i++) {
        const as = fragments(leaves[i]);
        if (!as.length) continue;
        for (let j = i + 1; j < Math.min(i + 12, leaves.length); j++) {
          let worst = 0;
          for (const a of as) for (const b of fragments(leaves[j])) {
            const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (ox > 3 && oy > 3) worst = Math.max(worst, ox);
          }
          if (worst) {
            overlaps.push({ a: (leaves[i].textContent || '').trim().slice(0, 22),
                            b: (leaves[j].textContent || '').trim().slice(0, 22), by: Math.round(worst) });
          }
        }
      }

      return {
        overflow, clientWidth: de.clientWidth,
        culprits: culprits.slice(-6),
        clipped: clipped.slice(0, 8),
        overlaps: overlaps.slice(0, 8),
        title: (document.querySelector('h1, .h1')?.textContent || '').trim().slice(0, 50),
        empty: document.body.innerText.trim().length < 80,
      };
    });

    if (m.overflow > 1 || m.clipped.length || m.overlaps.length) findings.push({ route: name, vp, theme, ...m });
    if (m.empty) findings.push({ route: name, vp, theme, empty: true });
    await page.screenshot({ path: `ui-audit-shots/${theme}-${vp}-${name}.png`, fullPage: vp === 'phone' });
  }
  process.stdout.write('.');
}
console.log();
fs.writeFileSync(`ui-audit-shots/findings-${theme}.json`, JSON.stringify(findings, null, 1));
console.log(`${findings.length} findings`);
for (const f of findings) {
  if (f.unreachable) { console.log(`  UNREACHABLE ${f.route} @${f.vp} — ${f.unreachable}`); continue; }
  if (f.empty) { console.log(`  EMPTY    ${f.route} @${f.vp}`); continue; }
  if (f.overflow > 1) {
    console.log(`  OVERFLOW ${f.route} @${f.vp} by ${f.overflow}px (viewport ${f.clientWidth})`);
    for (const c of f.culprits) console.log(`             <${c.tag} class="${c.cls}"> w=${c.w} right=${c.right} "${c.txt}"`);
  }
  for (const c of (f.clipped || [])) console.log(`  CLIPPED  ${f.route} @${f.vp} <${c.tag} class="${c.cls}"> box=${c.box} needs=${c.needs} "${c.txt}"`);
  for (const o of (f.overlaps || [])) console.log(`  OVERLAP  ${f.route} @${f.vp} "${o.a}" over "${o.b}" by ${o.by}px`);
}
await browser.close();
