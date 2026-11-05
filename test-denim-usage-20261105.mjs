// test-denim-usage-20261105.mjs — /api/usage DATE CHAQUE LIGNE A L HORODATAGE REEL DE SON BLOC (Denim : 2 s -> 200 ms/bloc).
// AVANT : usage-onchain.js moteurUsage datait une tx a tsTete - (tete - bloc) * 2 et la fin de fenetre pareil — apres Denim, une tx
//   1 000 blocs sous la tete aurait ete datee 2 000 s trop tot au lieu de 200 s (DAU/WAU decales).
// AFFIRME (EXECUTION de moteurUsage sur un noeud simule) : a 2 s et a 0,2 s, ts de ligne = horodatage du bloc de la tx (blockTimestamp de
//   ses logs — servi par publicnode et mainnet.base.org, sonde du 2026-11-05 — sinon l en-tete), finTs = horodatage du bloc de fin ;
//   en-tete illisible -> rien n est engage (fin immobile, erreur dite) ; logs en desaccord -> l en-tete. MUTANTS (ancienne formule,
//   coherence des logs retiree, repli silencieux) TUES.
// NE PROUVE PAS : un balayage reel de mainnet ; ni que les noeuds serviront encore blockTimestamp apres Denim.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(ICI, 'usage-onchain.js');
const hex = (n) => '0x' + BigInt(n).toString(16);
const pad = (a) => '0x' + a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const A = '0x' + 'a1'.repeat(20);
const T0 = 1793000000, BLOC_TX = 1003, TETE = 50000;

async function suite(m) {
  const echecs = [];
  const check = (c, nom) => { if (!c) echecs.push(nom); };
  const SLOTS = m.CONTRATS.find((c) => c.nom === 'BlockSlots').adresse;
  const H = '0x' + '01'.repeat(32);
  /* un noeud : ts(b) = T0 + floor(b * pas) ; options : logs avec/sans blockTimestamp (ou en desaccord), en-tetes illisibles */
  function noeud({ pas, tsLogs = true, desaccord = false, illisibles = new Set() }) {
    const ts = (b) => T0 + Math.floor(b * pas + 1e-9);
    const lus = [];
    const rpc = async (meth, p) => {
      if (meth === 'eth_blockNumber') return hex(TETE + 5);
      if (meth === 'eth_getBlockByNumber') { const b = parseInt(p[0], 16); lus.push(b); return illisibles.has(b) ? null : { number: hex(b), timestamp: hex(ts(b)) }; }
      if (meth === 'eth_getLogs') {
        const f = p[0], de = parseInt(f.fromBlock, 16), a = parseInt(f.toBlock, 16);
        return Array.isArray(f.address) && f.address.includes(SLOTS) && de <= BLOC_TX && a >= BLOC_TX ? [{ address: SLOTS, transactionHash: H, blockNumber: hex(BLOC_TX), topics: [] }] : [];
      }
      if (meth === 'eth_getTransactionByHash') return { hash: H, from: A, to: SLOTS, value: '0x0' };
      if (meth === 'eth_getTransactionReceipt') {
        const lg = (t) => ({ address: SLOTS, topics: ['0x' + '11'.repeat(32), pad('1'), pad(A)], data: '0x', blockNumber: hex(BLOC_TX), ...(tsLogs ? { blockTimestamp: hex(t) } : {}) });
        return { transactionHash: H, status: '0x1', blockNumber: hex(BLOC_TX), logs: desaccord ? [lg(ts(BLOC_TX)), lg(ts(BLOC_TX) - 999)] : [lg(ts(BLOC_TX)), lg(ts(BLOC_TX))] };
      }
      return null;
    };
    return { rpc, ts, lus };
  }
  const tourner = async (o) => {
    const nd = noeud(o);
    const mo = m.moteurUsage({ rpc: nd.rpc, graine: { lignes: [], fin: { bloc: 999, ts: T0 }, nonLus: [] }, fenetre: 10000, maxFenetres: 1 });
    await mo.avancer();
    return { nd, mo, ligne: mo.etat.lignes.get(H) };
  };
  for (const pas of [2, 0.2]) {
    for (const tsLogs of [true, false]) {
      const { nd, mo, ligne } = await tourner({ pas, tsLogs });
      const lbl = pas + ' s, ' + (tsLogs ? 'blockTimestamp des logs' : 'en-tete');
      check(ligne && ligne.ts === nd.ts(BLOC_TX), lbl + ' : ts de la ligne = horodatage du bloc ' + BLOC_TX + ' (lu ' + (ligne && ligne.ts) + ', vrai ' + nd.ts(BLOC_TX) + ')');
      check(mo.etat.fin === 10999 && mo.etat.finTs === nd.ts(10999), lbl + ' : finTs = horodatage du bloc 10999 (lu ' + mo.etat.finTs + ', vrai ' + nd.ts(10999) + ')');
      if (tsLogs) check(!nd.lus.includes(BLOC_TX), lbl + ' : le bloc de la tx n est pas relu (ses logs portent l horodatage)');
    }
  }
  /* temoin : a 0,2 s, l ancienne formule se trompe — la difference est grande, donc l assertion ci-dessus mord */
  { const nd = noeud({ pas: 0.2 }); const ancien = nd.ts(TETE) - (TETE - BLOC_TX) * 2; check(Math.abs(ancien - nd.ts(BLOC_TX)) > 80000, 'temoin : ancienne formule fausse de ' + (nd.ts(BLOC_TX) - ancien) + ' s a 0,2 s'); }
  /* logs en desaccord -> l en-tete */
  { const { nd, ligne } = await tourner({ pas: 0.2, desaccord: true }); check(ligne && ligne.ts === nd.ts(BLOC_TX) && nd.lus.includes(BLOC_TX), 'logs en desaccord : en-tete lu, ts juste'); }
  check(m.horodatageDuRecu({ blockNumber: '0x5', logs: [{ blockNumber: '0x6', blockTimestamp: '0x10' }] }) === null, 'log d un autre bloc : null');
  check(m.horodatageDuRecu({ blockNumber: '0x5', logs: [] }) === null, 'aucun log : null');
  /* en-tete illisible (non mesure) : rien n est engage */
  { const { mo } = await tourner({ pas: 0.2, illisibles: new Set([10999]) }); check(mo.etat.fin === 999 && mo.etat.lignes.size === 0 && !!mo.etat.erreur, 'en-tete de fin illisible : fin immobile, aucune ligne, erreur dite'); }
  { const { mo } = await tourner({ pas: 0.2, tsLogs: false, illisibles: new Set([BLOC_TX]) }); check(mo.etat.fin === 999 && mo.etat.lignes.size === 0 && !!mo.etat.erreur, 'en-tete de la tx illisible (logs sans horodatage) : rien engage'); }
  return echecs;
}

const src = readFileSync(SOURCE, 'utf8');
const e0 = await suite(await import(pathToFileURL(SOURCE).href));
assert.deepEqual(e0, [], 'module reel : ' + e0.join(' | '));
let n = 1;
console.log('module reel : vert');
const mutants = [
  ['ancienne formule (tete - blocs x 2 s) pour la ligne', 'const ts = horodatageDuRecu(recu) ?? await tsDuBloc(bRecu);', 'const ts = (await tsDuBloc(tete)) - (tete - bRecu) * SECONDES_PAR_BLOC;'],
  ['ancienne formule pour finTs', 'const finTs = await tsDuBloc(a);', 'const finTs = (await tsDuBloc(tete)) - (tete - a) * SECONDES_PAR_BLOC;'],
  ['coherence des logs retiree', 'if (ts !== null && t !== ts) return null;', ''],
  ['en-tete illisible -> 0 au lieu de refuser', "if (ts === null || ts <= 0) throw new Error('block timestamp not read: ' + b);", 'if (ts === null || ts <= 0) return 0;'],
];
let tues = 0;
for (const [nom, de, vers] of mutants) {
  assert.ok(src.includes(de), 'ancre du mutant trouvee : ' + nom);
  const f = path.join(ICI, '.mutant-denim-usage-' + tues + '-' + Date.now() + '.mjs');
  writeFileSync(f, src.replace(de, vers));
  try {
    const e = await suite(await import(pathToFileURL(f).href));
    assert.ok(e.length > 0, 'mutant SURVIVANT : ' + nom);
    console.log('mutant tue : ' + nom + ' (' + e[0] + ')');
    tues += 1; n += 1;
  } finally { unlinkSync(f); }
}
console.log('ok denim-usage — ' + n + ' verifications, ' + tues + '/' + mutants.length + ' mutants tues ; NE PROUVE PAS un balayage reel de mainnet');
