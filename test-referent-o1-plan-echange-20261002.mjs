// test-referent-o1-plan-echange-20261002 — KO Zero 1 sur e93e9e2 : le referrer o1 doit ARRIVER au hook,
// a travers le VRAI planEchange, lu comme le lit le Universal Router de Base.
// ⛔ Le struct de l UR de Base est (key, zeroForOne, amountIn, amountOutMin, bytes hookData). La forme AVEC_MINHOP
//    met un 0 la ou l UR lit l offset de hookData : il lit alors la LONGUEUR a l offset 0, soit currency0 = ETH = 0
//    -> hookData VIDE, en silence. Zero 1 l a mesure (0,0001 ETH : du 0 sans le correctif, +199 000 000 000 wei
//    dus a a6cf avec, tokens de l acheteur inchanges).
// ⛔ Le drapeau REFERENT_O1_ACTIF reste OFF dans le depot : on teste une COPIE temporaire des modules ou seul ce
//    drapeau est mis a true. Temoin negatif : la meme copie SANS la ligne `formeTete` rend un hookData vide.
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { planEchange, QUOTEUR, ROUTEUR, FRAIS_INTERFACE_BPS } from './echange.js';
import { REFERENT_O1_ACTIF, O1_LAUNCH_HOOK_STANDARD, COMMENTAIRE_O1 } from './referent-o1.js';
import { FEE_WALLET } from './frais-creation.js';
import { cleDePool } from './pool.js';
import { PERMIT2 } from './lancer-pool.js';

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const ETH = '0x0000000000000000000000000000000000000000';
const JETON = '0xb2000000000000000000000000000000000000aa';
const COMPTE = '0x1111111111111111111111111111111111111111';
const Q = QUOTEUR[8453].toLowerCase();
const R = ROUTEUR[8453].toLowerCase();
const word = (x) => (typeof x === 'bigint' ? x.toString(16) : String(x).replace(/^0x/, '')).padStart(64, '0');

/** RPC simule : quoter -> amountOut ; routeur -> succes (les DEUX formes passent, AVEC est sondee d abord,
 *  exactement le cas ou l ancien code choisissait AVEC) ; autorisations au max. */
function makeRpc() {
  return async (method, params) => {
    if (method !== 'eth_call') throw new Error('unexpected method ' + method);
    const tx = params[0] || {};
    const to = String(tx.to || '').toLowerCase();
    const data = String(tx.data || '').toLowerCase();
    if (to === Q) return '0x' + word(10n ** 18n);
    if (to === R) return '0x' + word(0n);
    if (data.startsWith('0xdd62ed3e')) return '0x' + word((1n << 256n) - 1n);
    if (to === PERMIT2.toLowerCase() && data.startsWith('0x927da105')) {
      return '0x' + word((1n << 160n) - 1n) + word(BigInt(Math.floor(Date.now() / 1000) + 86400 * 365)) + word(0n);
    }
    return '0x' + word(0n);
  };
}

/** Lecteur ABI minimal sur hex sans 0x. */
const W = (h, off) => BigInt('0x' + h.slice(off * 2, off * 2 + 64));
const bytesA = (h, off) => { const L = Number(W(h, off)); return h.slice((off + 32) * 2, (off + 32 + L) * 2); };
/** Le hookData du swap de tete, tel que l UR de Base le LIT (layout SANS : offset au mot 9 du struct). */
function hookDataLuParUr(calldata) {
  const c = String(calldata).replace(/^0x/, '').slice(8); // sans selecteur execute(bytes,bytes[],uint256)
  const offInputs = Number(W(c, 32));
  const inputs = c.slice(offInputs * 2);
  const input0 = bytesA(inputs, 32 + Number(W(inputs, 32)));
  const offParams = Number(W(input0, 32));
  const params = input0.slice(offParams * 2);
  const tete = bytesA(params, 32 + Number(W(params, 32)));
  const struct = tete.slice(Number(W(tete, 0)) * 2);
  const offHd = Number(W(struct, 8 * 32));
  return bytesA(struct, offHd);
}

/** Copie temporaire des modules racine, avec des remplacements EXACTS (chacun doit avoir lieu). */
function copie(remplacements) {
  const dir = mkdtempSync(join(tmpdir(), 'tb-o1-'));
  const ici = new URL('./', import.meta.url);
  for (const f of readdirSync(ici).filter((x) => /\.(js|mjs|json)$/.test(x) && !x.startsWith('test-'))) {
    let t = readFileSync(new URL(f, ici), 'utf8');
    for (const [fichier, re, par] of remplacements) {
      if (fichier !== f) continue;
      assert.ok(re.test(t), 'remplacement introuvable dans ' + f + ' : ' + re); n++;
      t = t.replace(re, par);
    }
    writeFileSync(join(dir, f), t);
  }
  return dir;
}
const FLAG_ON = ['referent-o1.js', /export const REFERENT_O1_ACTIF = false;\r?\n/, 'export const REFERENT_O1_ACTIF = true;\n'];
const SANS_CORRECTIF = ['echange.js', /\r?\n\s*const formeTete = hookData \? SANS_MINHOP : forme;\r?\n/, '\n'];
const SANS_CORRECTIF_2 = ['echange.js', /forme: formeTete, actions: actionsEncodees, hookData/, 'forme, actions: actionsEncodees, hookData'];

const cle = cleDePool(ETH, JETON, { fee: 0, tickSpacing: 200, hooks: '0x1f91c998e7c2F4b690D75BDBf6502BDcD6e02AcC' });
const marcheLu = { etat: 'LUE', cle, paire: null };
const args = { rpc: makeRpc(), chaine: 8453, jeton: JETON, compte: COMPTE, sens: 'ACHAT', montant: 10n ** 14n, marcheLu, maintenant: 1_790_000_000_000 };
const ATTENDU = FEE_WALLET.slice(2).toLowerCase().padStart(64, '0') + COMMENTAIRE_O1;

ok(REFERENT_O1_ACTIF === false, 'drapeau REFERENT_O1_ACTIF OFF dans le depot');
ok(cle.hooks.toLowerCase() === O1_LAUNCH_HOOK_STANDARD, 'pool sur le LaunchHook Standard o1');

const dirs = [];
try {
  // ── 1. correctif + drapeau ON : le hook o1 recoit referrer = a6cf ──
  const dOn = copie([FLAG_ON]); dirs.push(dOn);
  const { planEchange: planOn } = await import(pathToFileURL(join(dOn, 'echange.js')).href);
  const pOn = await planOn(args);
  eq(pOn.etat, 'PRET', 'planEchange (drapeau ON) -> PRET');
  const hdOn = hookDataLuParUr(pOn.tx.data);
  eq(hdOn.length, 128, 'hookData lu par l UR : 64 octets, NON vide');
  eq(hdOn, ATTENDU, 'hookData = abi.encode(a6cf, "tokenizedblock")');
  eq('0x' + hdOn.slice(24, 64), FEE_WALLET.toLowerCase(), 'referrer lu par le hook = FEE_WALLET (a6cf)');
  eq(String(pOn.resume.fraisBps), String(FRAIS_INTERFACE_BPS), 'frais routeur planEchange sur o1 = ' + FRAIS_INTERFACE_BPS + ' bps');
  eq(FRAIS_INTERFACE_BPS, 50n, 'ce frais vaut 50 bps (pas 20/10 : ce bareme est celui du rail multi-sauts)');

  // ── 2. TEMOIN NEGATIF : meme copie, ancienne forme (pas de formeTete) -> l UR lit un hookData VIDE ──
  const dOld = copie([FLAG_ON, SANS_CORRECTIF, SANS_CORRECTIF_2]); dirs.push(dOld);
  const { planEchange: planOld } = await import(pathToFileURL(join(dOld, 'echange.js')).href);
  const pOld = await planOld(args);
  eq(pOld.etat, 'PRET', 'ancienne forme : PRET aussi (le defaut etait silencieux)');
  ok(pOld.tx.data.includes(ATTENDU), 'ancienne forme : les octets du referrer sont BIEN dans la calldata…');
  eq(hookDataLuParUr(pOld.tx.data), '', '…mais l UR de Base les lit VIDES (AVEC_MINHOP) : le referrer est perdu');

  // ── 3. drapeau OFF (depot) : octets INCHANGES par rapport a l ancien code ──
  const dOffOld = copie([SANS_CORRECTIF, SANS_CORRECTIF_2]); dirs.push(dOffOld);
  const { planEchange: planOffOld } = await import(pathToFileURL(join(dOffOld, 'echange.js')).href);
  const pOff = await planEchange(args), pOffOld = await planOffOld(args);
  eq(pOff.etat, 'PRET', 'depot (drapeau OFF) -> PRET');
  eq(pOff.tx.data, pOffOld.tx.data, 'drapeau OFF : calldata identique octet pour octet a l ancien code');
  eq(hookDataLuParUr(pOff.tx.data), '', 'drapeau OFF : aucun hookData');
  // temoin : le lecteur n est pas aveugle — la meme comparaison detecte la difference ON/OFF
  ok(pOff.tx.data !== pOn.tx.data, 'temoin : le comparateur voit la difference drapeau ON / OFF');
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}
console.log('test-referent-o1-plan-echange-20261002 : ' + n + ' assertions, OK');
