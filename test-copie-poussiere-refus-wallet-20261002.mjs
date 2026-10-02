// 2026-10-02 (Zero 1 on 5a1d585) — two Buy/Sell copy fixes, each with a negative control. CRLF-safe (\r\n normalized).
// (1) dust refusal: shown text is exactly 'Amount too small to trade here.', never 'Buy/Sell fee path broken: fee amount is zero…'
// (2) Buy/Sell wallet decline: 'Not done: you declined in your wallet.', never 'Not done (refuse par utilisateur)' nor a state= line.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n?/g, '\n');
let ko = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? 'ok  ' : 'KO  ') + m); if (!c) ko++; };
const essai = async (m, f) => { try { await f(); } catch (e) { ok(false, m + ' (threw: ' + String(e && e.message || e).slice(0, 120) + ')'); } };
const INTERNE = /fee path broken|fee amount is zero|refuse par utilisateur|REFUSE_PAR_UTILISATEUR|state=/i;
const ETH = '0x0000000000000000000000000000000000000000';
const BLK = '0xb2000000000000000000ffff00000000000000aa';
const COMPTE = '0x1234567890123456789012345678901234567890';
const word = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
const rpc = async (m) => { if (m === 'eth_call') return word(10n ** 18n); if (m === 'eth_blockNumber') return '0x1'; return '0x0'; };

// (1a) planEchange: 199 wei on a V8 hook-paid buy
let r199 = {}, r200 = {};
await essai('(1a)', async () => {
  const E = await import(path.join(ICI, 'echange.js'));
  const T = await import(path.join(ICI, 'tokenomics.js'));
  const cle = { currency0: ETH, currency1: BLK, fee: 0, tickSpacing: 200, hooks: T.HOOK_V8 };
  const achat = (w) => E.planEchange({ rpc, chaine: 8453, jeton: BLK, compte: COMPTE, sens: 'ACHAT', montant: w, marcheLu: { etat: 'LUE', cle, paire: null } });
  r199 = await achat(199n); r200 = await achat(200n);
  ok(r199.etat === 'REFUSE', '(1a) 199 wei is still refused');
  ok(r199.pourquoi === 'Amount too small to trade here.', '(1a) shown text is exactly "Amount too small to trade here." (' + r199.pourquoi + ')');
  ok(!INTERNE.test(r199.pourquoi || ''), '(1a) no internal jargon in the shown text');
  ok(r199.refusPoussiere === true && /fee amount is zero/.test(r199.causeInterne || ''), '(1a) exact reason kept off screen (causeInterne)');
  ok(r200.etat !== 'REFUSE' && !r200.refusPoussiere, '(1a) NEG: 200 wei is not refused as dust (' + r200.etat + ')');
});

// (1b) the Buy/Sell screen shows that text alone; a generic refusal keeps "Not possible:"
await essai('(1b)', async () => {
  const m = html.match(/ {4}e\.textContent = p\.refusFraisEnBlock \? String\(p\.pourquoi\)[\s\S]*?;\n/);
  ok(!!m, '(1b) Buy/Sell refusal expression found');
  const f = new Function('p', 'const e = {}; ' + m[0] + ' return e.textContent;');
  ok(f(r199) === 'Amount too small to trade here.', '(1b) dust on the Buy/Sell screen: exactly the plain sentence (' + f(r199) + ')');
  const g = f({ etat: 'REFUSE', pourquoi: 'this pool returns nothing for this amount' });
  ok(/^Not possible: this pool returns nothing/.test(g), '(1b) NEG: another refusal keeps its "Not possible:" reason (' + g.slice(0, 60) + ')');
  const mu = html.match(/ {4}return refuser\(\(p\.refusPoussiere \|\| p\.refusCheminFrais\) \? String\(p\.pourquoi\) : 'Not possible: '[^\n]*\n/);
  ok(!!mu, '(1b) multi-hop refusal shows the plain text alone');
  const eu = html.match(/e\.textContent = p\.refusPoussiere \? String\(p\.pourquoi\) : 'Not possible: ' \+ \(p\.pourquoi \|\| p\.etat\); return;/);
  ok(!!eu, '(1b) ETH->USDC refusal shows the plain text alone');
});

// (2) Buy/Sell wallet decline (signerEchange)
await essai('(2)', async () => {
  const i = html.indexOf('async function signerEchange(tx, sens, estApprobation) {');
  ok(i > 0, '(2) signerEchange found');
  const corps = html.slice(i, i + 6000);
  const m = corps.match(/ {4}e\.innerHTML = estRefusWallet\(r\)[\s\S]*?\+ lien;\n/);
  ok(!!m, '(2) Buy/Sell decline branch found');
  const cst = html.match(/const TEXTE_REFUS_WALLET = '([^']+)';/);
  const est = html.match(/function estRefusWallet\(r\) \{[^\n]*\}/);
  const f = new Function('TEXTE_REFUS_WALLET', 'enTexte', 'r', 'lien', est[0] + '; const e = {}; ' + m[0] + ' return e.innerHTML;');
  const refus = f(cst[1], String, { etat: 'REFUSE_PAR_UTILISATEUR', pourquoi: 'you declined in your wallet — nothing was sent' }, '');
  ok(refus === 'Not done: you declined in your wallet.', '(2) decline: exactly "Not done: you declined in your wallet." (' + refus + ')');
  ok(!INTERNE.test(refus), '(2) decline: no internal state, no state= line');
  const autre = f(cst[1], String, { etat: 'ECHEC_ENVOI', pourquoi: 'the node timed out' }, '');
  ok(/^Not done \(echec envoi\)\. the node timed out$/.test(autre), '(2) NEG: a real failure keeps its state and reason (' + autre + ')');
});
console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
