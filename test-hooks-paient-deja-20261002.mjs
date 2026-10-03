// test-hooks-paient-deja-20261002 — UNE liste des hooks qui versent DEJA a6cf, appliquee a CHAQUE jambe.
// Crosscheck Zero 1 (2026-10-02, KO sur e93e9e2) : trois cas de DOUBLE frais (hook + routeur) a fermer :
//   1. HOOK_MARCHE_OUVERT null alors qu une pool V8-open existe ;
//   2. V8-open REDEPLOYE : l ancienne adresse sortait de la regle ;
//   3. route multi-sauts ou le V8-open n est PAS la premiere jambe (seul le saut 1 etait lu).
//      Rebase 87a49cb : regle live « chaque jambe paie » (50a3d14) — voir le cas 3.
// Chaque assertion a son temoin negatif. Drapeaux OFF, rien n est deploye.
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HOOKS_PAIENT_DEJA_A6CF, hookPaieDejaA6cf, routePaieDejaA6cf, HOOK_V8, HOOK_PREVU, HOOK_V2 } from './tokenomics.js';
import { HOOKS_MARCHE_OUVERT, HOOK_MARCHE_OUVERT, MARCHE_OUVERT_ACTIF, incoherenceMarcheOuvert, estHookMarcheOuvert } from './marche-ouvert.js';
import { planEchange, planEchangeMultiSauts, QUOTEUR, ROUTEUR, FRAIS_INTERFACE_BPS } from './echange.js';
import { USDC_BASE } from './frais-creation.js';
import { cleDePool } from './pool.js';
import { PERMIT2 } from './lancer-pool.js';

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const ETH = '0x0000000000000000000000000000000000000000';
const JETON = '0xb2000000000000000000000000000000000000aa';
const COMPTE = '0x1111111111111111111111111111111111111111';
const OPEN_ANCIEN = '0x' + '0a'.repeat(19) + 'c4';
const OPEN_NOUVEAU = '0x' + '0b'.repeat(19) + 'c4';
const SANS_HOOK = ETH;
const word = (x) => (typeof x === 'bigint' ? x.toString(16) : String(x).replace(/^0x/, '')).padStart(64, '0');
const Q = QUOTEUR[8453].toLowerCase(), R = ROUTEUR[8453].toLowerCase();
function makeRpc() {
  return async (method, params) => {
    if (method !== 'eth_call') throw new Error('unexpected method ' + method);
    const tx = params[0] || {};
    const to = String(tx.to || '').toLowerCase(), data = String(tx.data || '').toLowerCase();
    if (to === Q) return '0x' + word(10n ** 18n);
    if (to === R) return '0x' + word(0n);
    if (data.startsWith('0xdd62ed3e')) return '0x' + word((1n << 256n) - 1n);
    if (to === PERMIT2.toLowerCase() && data.startsWith('0x927da105')) {
      return '0x' + word((1n << 160n) - 1n) + word(BigInt(Math.floor(Date.now() / 1000) + 86400 * 365)) + word(0n);
    }
    return '0x' + word(0n);
  };
}

// ── 0. LA LISTE N EST PAS VIDE (un test qui ECHOUE si elle l est) ──
const listeValide = (liste) => Array.isArray(liste) && liste.length > 0
  && hookPaieDejaA6cf(HOOK_V8, 'ACHAT', liste) && hookPaieDejaA6cf(HOOK_V8, 'VENTE', liste);
ok(listeValide(HOOKS_PAIENT_DEJA_A6CF), 'HOOKS_PAIENT_DEJA_A6CF non vide, V8 dans les deux sens');
ok(!listeValide([]), 'temoin negatif : une liste VIDE fait echouer ce test');
ok(Object.isFrozen(HOOKS_PAIENT_DEJA_A6CF), 'liste figee (pas de mutation a l execution)');
eq([HOOK_PREVU, HOOK_V2].map((h) => [hookPaieDejaA6cf(h, 'ACHAT'), hookPaieDejaA6cf(h, 'VENTE')]),
  [[false, true], [false, true]], 'V1/V2 : vente seulement (mesure fork 52072599)');
ok(!hookPaieDejaA6cf(SANS_HOOK, 'ACHAT') && !hookPaieDejaA6cf(null, 'ACHAT') && !hookPaieDejaA6cf(HOOK_V8, 'X'),
  'temoin negatif : sans hook / sens inconnu -> frais routeur garde');

// ── 1. HOOK NULL ALORS QU UNE POOL V8-OPEN EXISTE ──
ok(HOOK_MARCHE_OUVERT === null && HOOKS_MARCHE_OUVERT.length === 0 && MARCHE_OUVERT_ACTIF === false, 'depot : V8-open non deploye, drapeau OFF');
eq(incoherenceMarcheOuvert(), null, 'depot coherent');
ok(incoherenceMarcheOuvert({ actif: true, hooks: [] }) !== null, 'temoin negatif : drapeau ON + liste vide = REFUSE (le double frais du cas 1)');
eq(incoherenceMarcheOuvert({ actif: true, hooks: [OPEN_NOUVEAU] }), null, 'drapeau ON + hook liste = coherent');
ok(incoherenceMarcheOuvert({ actif: false, hooks: ['0x12'] }) !== null, 'adresse mal formee refusee');

// Copie temporaire ou le V8-open est « deploye » DEUX fois (ancien + nouveau) : le VRAI planEchange ne prend
// alors aucun frais routeur sur l une ou l autre — et le depot (liste vide) en prend 50 bps : c est le cas 1.
const ici = new URL('./', import.meta.url);
const dir = mkdtempSync(join(tmpdir(), 'tb-hooks-'));
try {
  const RE = /export const HOOKS_MARCHE_OUVERT = Object\.freeze\(\[\]\);\r?\n/;
  for (const f of readdirSync(ici).filter((x) => /\.(js|json)$/.test(x))) {
    let t = readFileSync(new URL(f, ici), 'utf8');
    if (f === 'marche-ouvert.js') {
      ok(RE.test(t), 'copie : liste V8-open trouvee');
      t = t.replace(RE, "export const HOOKS_MARCHE_OUVERT = Object.freeze(['" + OPEN_ANCIEN + "', '" + OPEN_NOUVEAU + "']);\n");
    }
    writeFileSync(join(dir, f), t);
  }
  const copie = await import(pathToFileURL(join(dir, 'echange.js')).href);
  const copieTk = await import(pathToFileURL(join(dir, 'tokenomics.js')).href);
  const copieMo = await import(pathToFileURL(join(dir, 'marche-ouvert.js')).href);
  eq(copieMo.HOOK_MARCHE_OUVERT, OPEN_NOUVEAU, 'copie : hook courant = le plus recent');
  ok(copieMo.estHookMarcheOuvert(OPEN_ANCIEN) && copieMo.estHookMarcheOuvert(OPEN_NOUVEAU.toUpperCase().replace('0X', '0x')), 'copie : les DEUX adresses sont reconnues (casse ignoree)');
  ok(!estHookMarcheOuvert(OPEN_ANCIEN), 'temoin negatif : depot (liste vide) ne reconnait rien');
  const plan = async (mod, hooks, sens) => mod.planEchange({ rpc: makeRpc(), chaine: 8453, jeton: JETON, compte: COMPTE, sens,
    montant: sens === 'VENTE' ? 10n ** 18n : 10n ** 16n, marcheLu: { etat: 'LUE', cle: cleDePool(ETH, JETON, { fee: 0, tickSpacing: 200, hooks }), paire: null },
    maintenant: Date.now() });
  for (const [h, nom] of [[OPEN_ANCIEN, 'ancien'], [OPEN_NOUVEAU, 'nouveau']]) {
    for (const sens of ['ACHAT', 'VENTE']) {
      const p = await plan(copie, h, sens);
      ok(p.etat === 'PRET' || p.etat === 'APPROBATIONS', 'copie V8-open ' + nom + ' ' + sens + ' -> ' + p.etat);
      eq(String(p.resume.fraisBps), '0', 'cas 1+2 : V8-open ' + nom + ' ' + sens + ' -> 0 bps routeur (un seul frais)');
    }
  }
  const pDepot = await plan({ planEchange }, OPEN_ANCIEN, 'ACHAT');
  /* ⛔ 2026-10-02 (C2, F1) : hors liste, ce hook est un hook TIERS sur une pool de block -> REFUS avant cotation (avant :
   *   PRET a 50 bps routeur, le double frais que la liste evite). Plus strict : ni double frais, ni frais du tout. */
  ok(pDepot.etat === 'REFUSE' && pDepot.refusHookTiers === true, 'temoin negatif : hook HORS liste -> REFUSE (hook tiers), pas ' + FRAIS_INTERFACE_BPS + ' bps empiles (' + pDepot.etat + ')');
  // ── 2. REDEPLOIEMENT : retirer l ancienne adresse referait le double frais ──
  const sansAncien = copieTk.HOOKS_PAIENT_DEJA_A6CF.filter((e) => e.hook !== OPEN_ANCIEN);
  ok(copieTk.hookPaieDejaA6cf(OPEN_ANCIEN, 'ACHAT') && copieTk.hookPaieDejaA6cf(OPEN_NOUVEAU, 'VENTE'), 'cas 2 : ancien ET nouveau V8-open dans la liste unique');
  ok(!copieTk.hookPaieDejaA6cf(OPEN_ANCIEN, 'ACHAT', sansAncien), 'temoin negatif : une liste qui oublie l ancien V8-open le refait payer');

  // ── 3. MULTI-SAUTS : V8-open en DEUXIEME jambe (USDC -> ETH -> jeton) ──
  const sauts = [
    { cle: cleDePool(ETH, USDC_BASE, { fee: 500, tickSpacing: 10, hooks: SANS_HOOK }), zeroForOne: false },
    { cle: cleDePool(ETH, JETON, { fee: 0, tickSpacing: 200, hooks: OPEN_NOUVEAU }), zeroForOne: true },
  ];
  const liste = copieTk.HOOKS_PAIENT_DEJA_A6CF;
  ok(routePaieDejaA6cf(sauts, liste), 'cas 3 : la 2e jambe V8-open est vue');
  ok(!routePaieDejaA6cf([sauts[0]], liste), 'temoin negatif : l ancienne garde (saut 1 seul) ne la voyait pas -> double frais');
  ok(!routePaieDejaA6cf([sauts[0], { ...sauts[1], cle: { ...sauts[1].cle, currency0: USDC_BASE } }], liste), 'temoin negatif : jambe hors ETH -> frais routeur garde');
  /* ⛔ 2026-10-02 Phil : « UNE FOIS PAR SWAP ». Le routeur s efface des qu UNE jambe paie deja a6cf
   *   (remplace la regle « chaque jambe » de 50a3d14). Le temoin negatif est donc une route ou AUCUNE jambe ne paie. */
  const planMS = (ss, hooksPaieurs, mod = { planEchangeMultiSauts }) => mod.planEchangeMultiSauts({ rpc: makeRpc(), chaine: 8453, compte: COMPTE, sauts: ss,
    entree: USDC_BASE, sortie: JETON, montant: 50n * 10n ** 6n, decimalesEntree: 6, prixUsdEntree: 1,
    maintenant: Date.now(), ...(hooksPaieurs ? { hooksPaieurs } : {}) });
  const routeur0 = (p) => ['PRET', 'APPROBATIONS'].includes(p.etat) && p.resume && p.resume.frais === 0n && p.resume.fraisBps === 0n;
  const routeurPris = (p) => ['PRET', 'APPROBATIONS'].includes(p.etat) && p.resume && p.resume.frais > 0n && p.resume.fraisBps > 0n;
  const usdcEthV8 = cleDePool(ETH, USDC_BASE, { fee: 0, tickSpacing: 200, hooks: HOOK_V8 });
  const tousPaient = [{ cle: usdcEthV8, zeroForOne: false }, sauts[1]];
  const mOn = await planMS(tousPaient, liste);
  /* 2026-10-02 (fix R4, Zero 1) : deux jambes hookees = deux frais de hook sur la chaine -> refus, aucun frais routeur */
  ok(mOn.etat === 'REFUSE' && mOn.refusPlusieursHooks === true, 'cas 3 : jambe 1 V8 + V8-open en 2e jambe (liste injectee) -> refus deux hooks (' + mOn.etat + ')');
  /* ⛔ R8 (C2, R5-2) : une liste passee par l APPELANT ne garde que nos hooks et HOOKS_PAIENT_DEJA_A6CF du depot. Le V8-open
   *   « deploye » se teste donc dans la COPIE (ou il est dans HOOKS_MARCHE_OUVERT, donc dans sa liste) ; dans le depot, la
   *   meme liste injectee est ignoree -> hook tiers sur la pool du block -> REFUSE. */
  const mTrou = await planMS(sauts, liste, copie);
  ok(routeur0(mTrou), 'une fois par swap : jambe 1 sans hook + V8-open LISTE en 2e jambe -> 0 frais routeur (' + mTrou.etat + ')');
  const mInj = await planMS(sauts, liste);
  ok(mInj.etat === 'REFUSE' && mInj.refusHookTiers === true, 'R5-2 : depot, V8-open injecte par l appelant (hors nos hooks / liste) -> ignore, REFUSE hook tiers (' + mInj.etat + ')');
  const mOff = await planMS(sauts, null);
  ok(!copieTk.hookPaieDejaA6cf(OPEN_NOUVEAU, 'VENTE', HOOKS_PAIENT_DEJA_A6CF), 'temoin du temoin : le V8-open n est PAS dans la liste du depot');
  /* ⛔ 2026-10-02 (C2, F1) : hors liste, le V8-open est un hook TIERS sur la pool du block -> REFUS (avant : frais routeur pris). */
  ok(mOff.etat === 'REFUSE' && mOff.refusHookTiers === true, 'temoin negatif : AUCUNE jambe payeuse (sans hook + V8-open hors liste) -> REFUSE hook tiers (' + mOff.etat + ')');
  // V8 (deja liste dans le depot) : une seule jambe V8 suffit
  const v8Jeton = { ...sauts[1], cle: cleDePool(ETH, JETON, { fee: 0, tickSpacing: 200, hooks: HOOK_V8 }) };
  const mV8 = await planMS([{ cle: usdcEthV8, zeroForOne: false }, v8Jeton]);
  ok(mV8.etat === 'REFUSE' && mV8.refusPlusieursHooks === true, 'depot : V8 + V8 -> refus deux hooks (' + mV8.etat + ')');
  const mV8seul = await planMS([sauts[0], v8Jeton]);
  ok(routeur0(mV8seul), 'une fois par swap : jambe 1 sans hook + V8 -> 0 frais routeur (le V8 a deja paye a6cf) (' + mV8seul.etat + ')');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log('test-hooks-paient-deja-20261002 : ' + n + ' assertions, OK');
