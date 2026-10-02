// 2026-10-02 (Zero 1 on f783019) — two copy fixes, each with a negative control. CRLF-safe (\r\n normalized).
// (1) Add-liquidity wallet decline: 'Not done: you declined in your wallet.', no internal state, no state= line.
// (2) Bridge tab dust: 'You receive: not read. Amount too small to trade here. Nothing was sent.' — no doubled period.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n?/g, '\n');
let ko = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? 'ok  ' : 'KO  ') + m); if (!c) ko++; };
const essai = async (m, f) => { try { await f(); } catch (e) { ok(false, m + ' (threw: ' + String(e && e.message || e).slice(0, 120) + ')'); } };
const INTERNE = /refuse par utilisateur|REFUSE_PAR_UTILISATEUR|state=|fee path broken|fee amount is zero/i;
const corpsDe = (sig) => { const i = html.indexOf(sig); if (i < 0) return ''; const f = /\r?\n\}\r?\n/.exec(html.slice(i)); return f ? html.slice(i, i + f.index + 2) : ''; };

// (1) signerLiquidite
await essai('(1)', async () => {
  const corps = corpsDe('async function signerLiquidite(tx, adr, genre) {');
  ok(corps.length > 200, '(1) signerLiquidite isolated (' + corps.length + ' chars)');
  const m = corps.match(/ {4}e\.innerHTML = estRefusWallet\(r\) \? enTexte\(TEXTE_REFUS_WALLET\) \+ lien\n\s+: 'Not done \([^\n]*\n/);
  ok(!!m, '(1) Add-liquidity decline branch found');
  const cst = html.match(/const TEXTE_REFUS_WALLET = '([^']+)';/);
  const est = html.match(/function estRefusWallet\(r\) \{[^\n]*\}/);
  const f = new Function('TEXTE_REFUS_WALLET', 'enTexte', 'r', 'lien', est[0] + '; const e = {}; ' + m[0] + ' return e.innerHTML;');
  const refus = f(cst[1], String, { etat: 'REFUSE_PAR_UTILISATEUR', pourquoi: 'you declined in your wallet — nothing was sent' }, '');
  ok(refus === 'Not done: you declined in your wallet.', '(1) decline: exactly the plain sentence (' + refus + ')');
  ok(!INTERNE.test(refus), '(1) decline: no internal state, no state= line');
  const autre = f(cst[1], String, { etat: 'ECHEC_ENVOI', pourquoi: 'the node timed out' }, '');
  ok(/^Not done \(echec envoi\)\. the node timed out$/.test(autre), '(1) NEG: a real failure keeps its state and reason (' + autre + ')');
  ok(!/ {4}e\.innerHTML = 'Not done \(/.test(corps), '(1) no unconditional "Not done (" line left in signerLiquidite');
});

// (2) Bridge tab: the quote line and the swap status
await essai('(2)', async () => {
/* ⛔⛔⛔ IMPORT PORTABLE — CORRIGE LE 2026-10-02. `await import(path.join(...))` fonctionne sur
 *      POSIX et LEVE sur Windows : « On Windows, absolute paths must be valid file:// URLs ». Les
 *      cinq bancs du 2026-10-02 etaient donc VERTS dans le conteneur et MORTS sur la machine de
 *      Raksha — ils ne gardaient rien la ou l app est reellement relue avant deploiement.
 *    ⛔ Meme famille que le cliquet CRLF : un banc ne doit dependre NI de la fin de ligne NI du
 *      systeme de fichiers de l hote. `pathToFileURL(...).href` est la seule forme qui vaut partout. */
  const E = await import(pathToFileURL(path.join(ICI, 'echange.js')).href);
  const dust = { etat: 'REFUSE', pourquoi: E.MESSAGE_TROP_PETIT, refusPoussiere: true };
  const autre = { etat: 'NON_MESURE', pourquoi: 'its market could not be read' };
  const aide = html.match(/function texteBridgePoussiere\(plan\) \{[^\n]*\}/);
  const m = html.match(/ {4}netEl\.textContent = plan\.refusPoussiere \? texteBridgePoussiere\(plan\)\n[^\n]*\n[^\n]*'\. Nothing was sent\.';\n/);
  ok(!!aide && !!m, '(2) Bridge quote line found (dust -> texteBridgePoussiere)');
  const f = new Function('plan', aide[0] + '; const netEl = {}; ' + m[0] + ' return netEl.textContent;');
  const t = f(dust);
  ok(t === 'You receive: not read. Amount too small to trade here. Nothing was sent.', '(2) dust: exact sentence (' + t + ')');
  ok(!/\.\./.test(t) && !INTERNE.test(t), '(2) dust: no doubled period, no internal text');
  const g = f(autre);
  ok(g === 'You receive: not read — its market could not be read. Nothing was sent.', '(2) NEG: other reasons keep the old wording (' + g + ')');
  const s = html.match(/ {6}setEtat\(sortie\.refusPoussiere \?[^\n]*' — nothing was sent\.'\);\n/);
  ok(!!s, '(2) Bridge swap status found');
  const h = new Function('sortie', 'let out; const setEtat = (x) => { out = x; }; ' + s[0] + ' return out;');
  ok(h(dust) === 'Amount too small to trade here. Nothing was sent.', '(2) swap status on dust: no doubled period (' + h(dust) + ')');
  ok(h(autre) === 'its market could not be read — nothing was sent.', '(2) NEG: swap status for other reasons unchanged');
});
console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
