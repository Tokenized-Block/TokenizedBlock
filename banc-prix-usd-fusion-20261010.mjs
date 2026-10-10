/* banc-prix-usd-fusion-20261010.mjs — MESURE : 10 requetes /api/prix-usd identiques en meme temps, serveur local (TB_REPLIS=0). Lit DexScreener (reseau). Usage : node banc-prix-usd-fusion-20261010.mjs . */
import { spawn } from 'node:child_process';
const dir = process.argv[2] || '.', port = 18000 + Math.floor(Math.random() * 1000);
const p = spawn(process.execPath, ['serveur-web.js'], { cwd: dir, env: { ...process.env, PORT: String(port), TB_REPLIS: '0' }, stdio: 'ignore' });
const base = 'http://127.0.0.1:' + port;
for (let i = 0; i < 60; i++) { try { await fetch(base + '/sante'); break; } catch { await new Promise((o) => setTimeout(o, 500)); } }
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const t0 = Date.now();
const rs = await Promise.all(Array.from({ length: 10 }, () => fetch(base + '/api/prix-usd?adr=' + USDC).then((r) => r.json()).catch((e) => ({ err: String(e) }))));
const s = await fetch(base + '/sante').then((r) => r.json());
console.log(JSON.stringify({ reponses: rs.length, ok: rs.filter((r) => r.ok).length, identiques: new Set(rs.map((r) => JSON.stringify(r))).size, ms: Date.now() - t0, fusions: s.prixUsdFusions === undefined ? 'absent' : s.prixUsdFusions }));
p.kill();
