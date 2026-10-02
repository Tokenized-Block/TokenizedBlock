// 2026-10-02 (Zero 1 on 50a3d14) — plain English on the Create stop screen and on the route-out refusal:
// never 'Not done (refuse par utilisateur)', never the 'state=REFUSE_PAR_UTILISATEUR' line;
// route-out block→USDC(V8)→ETH refused with exactly 'Not tradable here yet' (internal reason kept off screen).
// CRLF-safe: app.html is read with \r\n normalized. Negative controls prove each check can fail.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n?/g, '\n');
let ko = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? 'ok  ' : 'KO  ') + m); if (!c) ko++; };
const essai = async (m, f) => { try { await f(); } catch (e) { ok(false, m + ' (threw: ' + String(e && e.message || e).slice(0, 120) + ')'); } };
const INTERNE = /refuse par utilisateur|REFUSE_PAR_UTILISATEUR|state=/i;
const diagLigne = (etat) => 'If this keeps happening, copy this line and send it: step=bring-to-life · state=' + etat
  + ' · why=you declined in your wallet — nothing was sent · tx=none · build=x Copy';
/* the exact #plEtat text that 50a3d14 copied into the Create stop screen */
const ancienPlEtat = 'Not done (refuse par utilisateur). you declined in your wallet — nothing was sent' + diagLigne('REFUSE_PAR_UTILISATEUR');

// 1) texteArretVie (the Create stop screen), as the page runs it
await essai('(1)', async () => {
  const m = html.match(/function texteArretVie\(etapeN, prepaye, detail\) \{[\s\S]*?\n\}/);
  ok(!!m, '(1) texteArretVie found');
  const f = new Function('ethLisible', m[0] + '; return texteArretVie;')((w) => (Number(w) / 1e18).toString());
  const paye = f(4, { wei: '700000000000000', hash: '0x1' }, ancienPlEtat);
  ok(!INTERNE.test(paye), '(1) fee paid + wallet decline: no internal state, no state= line (' + paye + ')');
  ok(/Not done: you declined in your wallet\./.test(paye), '(1) fee paid: says "Not done: you declined in your wallet."');
  ok(/Create fee was paid; you will not pay it again/.test(paye) && !/nothing was sent|nothing is lost/i.test(paye), '(1) fee paid: still says the fee was paid, never "nothing was sent"');
  const libre = f(2, null, ancienPlEtat);
  ok(!INTERNE.test(libre) && /Nothing is lost — Not done: you declined in your wallet\.$/.test(libre), '(1) nothing paid: "Nothing is lost — Not done: you declined in your wallet." (' + libre + ')');
  const autre = f(2, null, 'Not done (echec envoi). the node timed out' + diagLigne('ECHEC_ENVOI'));
  ok(!/state=|If this keeps happening/.test(autre) && /the node timed out/.test(autre), '(1) other failure: the reason stays, the diagnostic line does not (' + autre + ')');
  /* negative control: the raw old text, without texteArretVie's cleanup, does show the internal words */
  ok(INTERNE.test(ancienPlEtat), '(1) NEG: the old #plEtat text contains the internal words the screen must not show');
});

// 2) the two places that write the wallet-decline text (profile bring-to-life, Create)
await essai('(2)', async () => {
  const cst = html.match(/const TEXTE_REFUS_WALLET = '([^']+)';/);
  ok(!!cst && cst[1] === 'Not done: you declined in your wallet.', '(2) TEXTE_REFUS_WALLET is the plain English sentence');
  const est = html.match(/function estRefusWallet\(r\) \{[^\n]*\}/);
  ok(!!est, '(2) estRefusWallet found');
  const ctx = (expr) => new Function('TEXTE_REFUS_WALLET', 'enTexte', 'ligneDiagnostic', 'r', 'rc', 'feeKept', 'lien',
    est[0] + '; const e = {}; ' + expr + ' return e.innerHTML;');
  const diag = (nom, x) => ' <code>step=' + nom + ' · state=' + x.etat + '</code>';
  const vie = html.match(/ {4}e\.innerHTML = estRefusWallet\(r\) \? enTexte\(TEXTE_REFUS_WALLET\)\n\s+: enTexte\('Not done \([^\n]*\n\s+\+ ligneDiagnostic\('bring-to-life', r\);/);
  ok(!!vie, '(2) bring-to-life refusal branch found');
  const cree = html.match(/ {6}e\.innerHTML = estRefusWallet\(rc\)[\s\S]*?ligneDiagnostic\('create', rc\);/);
  ok(!!cree, '(2) Create refusal branch found');
  const refus = { etat: 'REFUSE_PAR_UTILISATEUR', pourquoi: 'you declined in your wallet — nothing was sent' };
  const echec = { etat: 'ECHEC_ENVOI', pourquoi: 'the node timed out' };
  const v1 = ctx(vie[0])(cst[1], String, diag, refus, null, '', '');
  ok(v1 === 'Not done: you declined in your wallet.', '(2) bring-to-life decline: exactly the plain sentence (' + v1 + ')');
  const v2 = ctx(vie[0])(cst[1], String, diag, echec, null, '', '');
  ok(/Not done \(echec envoi\)\. the node timed out/.test(v2) && /state=ECHEC_ENVOI/.test(v2), '(2) NEG: a real failure keeps its reason and its copyable diagnostic line');
  const c1 = ctx(cree[0])(cst[1], String, diag, null, refus, ' Nothing was charged: the payment only goes through if creation succeeds.', '');
  ok(!INTERNE.test(c1) && /^Not done: you declined in your wallet\. Nothing was charged/.test(c1), '(2) Create decline: plain sentence, no state= line (' + c1 + ')');
  const c2 = ctx(cree[0])(cst[1], String, diag, null, echec, '', '');
  ok(/state=ECHEC_ENVOI/.test(c2), '(2) NEG: Create real failure keeps the diagnostic line');
});

// 3) route-out block→USDC(V8)→ETH: refused, exactly 'Not tradable here yet', reason kept internal
await essai('(3)', async () => {
/* ⛔⛔⛔ IMPORT PORTABLE — CORRIGE LE 2026-10-02. `await import(path.join(...))` fonctionne sur
 *      POSIX et LEVE sur Windows : « On Windows, absolute paths must be valid file:// URLs ». Les
 *      cinq bancs du 2026-10-02 etaient donc VERTS dans le conteneur et MORTS sur la machine de
 *      Raksha — ils ne gardaient rien la ou l app est reellement relue avant deploiement.
 *    ⛔ Meme famille que le cliquet CRLF : un banc ne doit dependre NI de la fin de ligne NI du
 *      systeme de fichiers de l hote. `pathToFileURL(...).href` est la seule forme qui vaut partout. */
  const E = await import(pathToFileURL(path.join(ICI, 'echange.js')).href);
  const T = await import(pathToFileURL(path.join(ICI, 'tokenomics.js')).href);
  const BLOC = '0xb200000000000000000000e7e9db76e8234f8f56', USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', ETH = '0x' + '0'.repeat(40);
  const q = '0x' + (10n ** 18n).toString(16).padStart(64, '0') + '0'.repeat(64);
  const rpc = async (m) => (m === 'eth_call' ? q : m === 'eth_chainId' ? '0x2105' : '0x' + '0'.repeat(64));
  const blocUsdc = { currency0: USDC, currency1: BLOC, fee: 0, tickSpacing: 200, hooks: T.HOOK_V8 };
  const usdcEth = { currency0: ETH, currency1: USDC, fee: 500, tickSpacing: 10, hooks: ETH };
  const base = { rpc, chaine: 8453, compte: '0x' + '4'.repeat(40), entree: BLOC, sortie: ETH, montant: 10n ** 21n, prixUsdEntree: null };
  const r = await E.planEchangeMultiSauts({ ...base, sauts: [{ cle: blocUsdc, zeroForOne: false }, { cle: usdcEth, zeroForOne: false }] });
  ok(r.etat === 'REFUSE', '(3) route-out block→USDC(V8)→ETH is still refused');
  ok(r.pourquoi === 'Not tradable here yet', '(3) its text is exactly "Not tradable here yet" (' + r.pourquoi + ')');
  ok(!/fee path broken|fee asset must be/i.test(r.pourquoi || ''), '(3) no internal jargon in the shown text');
  ok(r.refusCheminFrais === true && /fee asset must be/.test(r.causeInterne || ''), '(3) the exact internal reason is kept off screen (causeInterne)');
  /* negative control: an all-V8 route is not refused by this rule */
  const v8 = { currency0: ETH, currency1: USDC, fee: 0, tickSpacing: 200, hooks: T.HOOK_V8 };
  const r2 = await E.planEchangeMultiSauts({ ...base, sauts: [{ cle: blocUsdc, zeroForOne: false }, { cle: v8, zeroForOne: false }] });
  ok(r2.etat !== 'REFUSE' && !r2.refusCheminFrais, '(3) NEG: every hop V8-paying -> not refused (' + r2.etat + ')');
  ok(/e\.textContent = p\.refusFraisEnBlock \? String\(p\.pourquoi\) : p\.refusCheminFrais \? String\(p\.pourquoi\)/.test(html), '(3) Buy/Sell screen shows that text alone, no "Not possible:" prefix');
});
console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
