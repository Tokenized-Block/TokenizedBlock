// test-referent-o1-plan-echange-20261002 — KO Zero 1 sur e93e9e2 : le referrer o1 doit ARRIVER au hook,
// a travers le VRAI planEchange, lu comme le lit le Universal Router de Base.
// ⛔ Le struct de l UR de Base est (key, zeroForOne, amountIn, amountOutMin, bytes hookData). La forme AVEC_MINHOP
//    met un 0 la ou l UR lit l offset de hookData : il lit alors la LONGUEUR a l offset 0, soit currency0 = ETH = 0
//    -> hookData VIDE, en silence. Zero 1 l a mesure (0,0001 ETH : du 0 sans le correctif, +199 000 000 000 wei
//    dus a a6cf avec, tokens de l acheteur inchanges).
// ⛔ 2026-10-02 (staging o1) : REFERENT_O1_ACTIF est ON dans le depot. Le cas ON est le depot lui-meme ; le cas OFF
//    est une COPIE temporaire ou seul ce drapeau repasse a false. Temoin negatif : une copie SANS la ligne `formeTete`
//    rend un hookData vide.
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
const FLAG_OFF = ['referent-o1.js', /export const REFERENT_O1_ACTIF = true;\r?\n/, 'export const REFERENT_O1_ACTIF = false;\n'];
const SANS_CORRECTIF = ['echange.js', /\r?\n\s*const formeTete = hookData \? SANS_MINHOP : forme;\r?\n/, '\n'];
const SANS_CORRECTIF_2 = ['echange.js', /forme: formeTete, actions: actionsEncodees, hookData/, 'forme, actions: actionsEncodees, hookData'];

const cle = cleDePool(ETH, JETON, { fee: 0, tickSpacing: 200, hooks: '0x1f91c998e7c2F4b690D75BDBf6502BDcD6e02AcC' });
const marcheLu = { etat: 'LUE', cle, paire: null };
const args = { rpc: makeRpc(), chaine: 8453, jeton: JETON, compte: COMPTE, sens: 'ACHAT', montant: 10n ** 14n, marcheLu, maintenant: 1_790_000_000_000 };
const ATTENDU = FEE_WALLET.slice(2).toLowerCase().padStart(64, '0') + COMMENTAIRE_O1;

ok(REFERENT_O1_ACTIF === true, 'drapeau REFERENT_O1_ACTIF ON dans le depot (staging o1)');
ok(cle.hooks.toLowerCase() === O1_LAUNCH_HOOK_STANDARD, 'pool sur le LaunchHook Standard o1');

const dirs = [];
try {
  // ── 1. correctif + drapeau ON (le depot) : le hook o1 recoit referrer = a6cf ──
  const pOn = await planEchange(args);
  eq(pOn.etat, 'PRET', 'planEchange (drapeau ON) -> PRET');
  const hdOn = hookDataLuParUr(pOn.tx.data);
  eq(hdOn.length, 128, 'hookData lu par l UR : 64 octets, NON vide');
  eq(hdOn, ATTENDU, 'hookData = abi.encode(a6cf, "tokenizedblock")');
  eq('0x' + hdOn.slice(24, 64), FEE_WALLET.toLowerCase(), 'referrer lu par le hook = FEE_WALLET (a6cf)');
  eq(String(pOn.resume.fraisBps), String(FRAIS_INTERFACE_BPS), 'frais routeur planEchange sur o1 = ' + FRAIS_INTERFACE_BPS + ' bps');
  eq(FRAIS_INTERFACE_BPS, 50n, 'ce frais vaut 50 bps (pas 20/10 : ce bareme est celui du rail multi-sauts)');

  // ── 2. TEMOIN NEGATIF : meme copie, ancienne forme (pas de formeTete) -> l UR lit un hookData VIDE ──
  const dOld = copie([SANS_CORRECTIF, SANS_CORRECTIF_2]); dirs.push(dOld);
  const { planEchange: planOld } = await import(pathToFileURL(join(dOld, 'echange.js')).href);
  const pOld = await planOld(args);
  eq(pOld.etat, 'PRET', 'ancienne forme : PRET aussi (le defaut etait silencieux)');
  ok(pOld.tx.data.includes(ATTENDU), 'ancienne forme : les octets du referrer sont BIEN dans la calldata…');
  eq(hookDataLuParUr(pOld.tx.data), '', '…mais l UR de Base les lit VIDES (AVEC_MINHOP) : le referrer est perdu');

  // ── 3. drapeau OFF (copie) : octets INCHANGES par rapport a l ancien code ──
  const dOff = copie([FLAG_OFF]); dirs.push(dOff);
  const { planEchange: planOff } = await import(pathToFileURL(join(dOff, 'echange.js')).href);
  const dOffOld = copie([FLAG_OFF, SANS_CORRECTIF, SANS_CORRECTIF_2]); dirs.push(dOffOld);
  const { planEchange: planOffOld } = await import(pathToFileURL(join(dOffOld, 'echange.js')).href);
  const pOff = await planOff(args), pOffOld = await planOffOld(args);
  /* ⛔ 2026-10-02 (C2, F1, regle (3)) : le LaunchHook Standard d o1 n est admis sur une pool de block QUE drapeau referent ON.
   *   Drapeau OFF, c est un hook tiers : REFUS avant cotation, sans tx — et a l identique avec ou sans le correctif formeTete. */
  eq(pOff.etat, 'REFUSE', 'copie drapeau OFF -> REFUSE (hook tiers, regle F1 (3))');
  ok(pOff.refusHookTiers === true && !pOff.tx, 'drapeau OFF : refus hook tiers, aucune transaction construite');
  eq([pOffOld.etat, pOffOld.refusHookTiers === true], ['REFUSE', true], 'drapeau OFF, ancien code formeTete : meme refus');
  // temoin : le lecteur n est pas aveugle — la meme comparaison detecte la difference ON/OFF
  ok(pOff.etat !== pOn.etat, 'temoin : le comparateur voit la difference drapeau ON / OFF');

  // ── 3b. R8 (C2, R5-1 restaure) : un jeton o1 ORDINAIRE (BRIAN, B20 lance par o1 sur son LaunchHook Standard), drapeau OFF ──
  /* ⛔ Logique inversee : BRIAN n est libere (jeton tiers) que si TOUTES les sources TB sont lues ; sinon il reste traite en
   *   block (R5) : REFUS hook tiers, drapeau OFF. Sources lues : PRET, et les octets drapeau OFF sont IDENTIQUES a l ancien
   *   code (sans formeTete), comme sur 1bb12d6. Chaque copie a son propre module d index : on le charge dans chacune. */
  const BRIAN = '0xb2000000000000000000002eefebd3dd6ef2d601';
  const argsB = { ...args, jeton: BRIAN, marcheLu: { etat: 'LUE', cle: cleDePool(ETH, BRIAN, { fee: 0, tickSpacing: 200, hooks: O1_LAUNCH_HOOK_STANDARD }), paire: null } };
  const bNon = await planOff(argsB), bNonOld = await planOffOld(argsB);
  eq([bNon.etat, bNonOld.etat], ['REFUSE', 'REFUSE'], 'BRIAN drapeau OFF, sources TB non lues : traite en block (R5) -> REFUSE');
  const charge = async (d) => {
    const IRc = await import(pathToFileURL(join(d, 'index-routeur.js')).href);
    const Tc = await import(pathToFileURL(join(d, 'tokenomics.js')).href);
    IRc.chargerIndexRouteur({ ok: true, couvertureComplete: true, fenetresRatees: 0, tete: 52100000, jusqua: 52100000, teteLueA: Date.now(),
      blocks: IRc.GRAINE_ROUTEUR.map((g) => ({ jeton: g.jeton, sel: g.sel })) });
    IRc.chargerNosBlocksTb({ ok: true, couvertureComplete: true, fenetresRatees: 0, blocks: [Tc.TBLOCK] });
    return IRc.sourcesTbLues();
  };
  ok((await charge(dOff)) && (await charge(dOffOld)), 'copies : sources TB chargees (index + nos-blocks)');
  const bOff = await planOff(argsB), bOffOld = await planOffOld(argsB);
  eq(bOff.etat, 'PRET', 'BRIAN drapeau OFF, sources lues : PRET (jeton o1 tiers, pas un block TB)');
  eq(bOff.tx.data, bOffOld.tx.data, 'BRIAN drapeau OFF : calldata identique octet pour octet a l ancien code (R5-1)');
  eq(hookDataLuParUr(bOff.tx.data), '', 'BRIAN drapeau OFF : aucun hookData');
  const pOffApres = await planOff(args);
  eq(pOffApres.etat, 'PRET', 'JETON sur o1, sources lues : jeton tiers libere, PRET (meme regle que BRIAN)');
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}
console.log('test-referent-o1-plan-echange-20261002 : ' + n + ' assertions, OK');
