/* reference-frais.mjs — PROUVER UN CHANGEMENT, pas seulement un montant.
 *
 *   node reference-frais.mjs           compare l etat actuel a la reference gelee
 *   node reference-frais.mjs --geler   (re)ecrit la reference — a n utiliser qu a bon escient
 *
 * ⛔⛔ POURQUOI CE FICHIER EXISTE. On savait ce que a6cf ENCAISSE ; on ne savait pas si ca CHANGE.
 *     Un montant sans reference ne prouve aucune evolution, et une reference prise apres coup se
 *     choisit toujours un peu pour arranger le resultat. Celle-ci est gelee le 2026-09-21, AVANT que
 *     le hook V6 ait le moindre marche — donc avant de savoir ce qu elle allait montrer.
 *
 * ⛔ ET L OUTIL REFUSE D ATTRIBUER : tant que le hook compare n a produit aucun encaissement, le
 *    verdict est PAS_DE_CAUSE et AUCUN ecart n est publie. Sans ce refus, la variation naturelle du
 *    V1 serait presentee comme l effet du V6 — un chiffre vrai au service d une conclusion fausse.
 *
 * ⛔ LECTURE SEULE : aucune transaction, aucune signature.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { scanFrais, payeurDe } from './veille-frais.js';
import { agreger, comparer, BLOCS_PAR_JOUR } from './comparer-frais.js';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
const FICHIER = new URL('./reference-frais-avant-v6.json', import.meta.url);
/* ⛔ Mesure : le bloc de deploiement du V6, relu sur la chaine le 2026-09-21. */
const BLOC_V6 = 51586920;
const LARGEUR = 14 * BLOCS_PAR_JOUR;
/* ⛔ Nos adresses, NOMMEES. Un payeur qui n est pas dans cette liste est « pas a nous », et un
 *    payeur ILLISIBLE n est ni l un ni l autre — il n est jamais compte comme externe. */
const A_NOUS = new Set([
  '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4',
  '0xaf8e0a44496a6b90da03fbadd9daec875fc3e2a6',
]);

let id = 1;
const rpc = async (m, p) => {
  let dernier = 'inconnu';
  for (let e = 0; e < 8; e++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: id++, method: m, params: p }) });
    const j = await r.json();
    if (!j.error) return j.result;
    dernier = j.error.message || '';
    if (!/rate limit|limit exceeded|too many/i.test(dernier)) throw new Error(dernier);
    await new Promise((f) => setTimeout(f, 700 * (e + 1)));
  }
  throw new Error(dernier);
};

/** Un agregat complet sur une fenetre, payeurs lus une fois par transaction. */
async function mesurer(deBloc, aBloc) {
  const scan = await scanFrais({ rpc, deBloc, aBloc });
  const payeurs = new Map();
  for (const tx of new Set(scan.evenements.map((e) => e.tx))) payeurs.set(tx, await payeurDe({ rpc, tx }));
  return { scan, agregat: agreger({ scan, blocs: aBloc - deBloc + 1, aNous: A_NOUS, payeurParTx: payeurs }) };
}

const dire = (a, etiquette) => {
  console.log('   ' + etiquette);
  console.log('      encaissements/jour : ' + (a.evenementsParJour === null ? '—' : a.evenementsParJour.toFixed(3)));
  console.log('      ETH au wallet/jour : ' + (a.ethParJour === null ? '—' : a.ethParJour.toFixed(9)));
  console.log('      part externe       : ' + (a.partExternePourCent === null
    ? 'null (aucun ETH — ce n est PAS zero)' : a.partExternePourCent.toFixed(1) + ' %')
    + ' · ' + a.payeursExternesDistincts + ' adresse(s)');
  console.log('      par hook           : ' + (a.parHook.map((h) => h.hook + '=' + h.n).join(' · ') || 'aucun'));
};

const tete = Number(BigInt(await rpc('eth_blockNumber', [])));

if (process.argv.includes('--geler')) {
  /* ⛔ ON REFUSE D ECRASER UNE REFERENCE EXISTANTE SANS LE DIRE : une reference qui bouge ne
   *    reference plus rien, et c est le genre de glissement qu on ne remarque jamais. */
  if (existsSync(FICHIER)) {
    console.log('⛔ une reference existe deja. L ecraser changerait le point de comparaison et');
    console.log('   rendrait toute mesure passee incomparable. Supprime-la a la main si c est voulu.');
    process.exit(1);
  }
  const { scan, agregat } = await mesurer(BLOC_V6 - LARGEUR, BLOC_V6 - 1);
  writeFileSync(FICHIER, JSON.stringify({
    ecritLe: new Date().toISOString(), blocV6: BLOC_V6,
    fenetre: { deBloc: BLOC_V6 - LARGEUR, aBloc: BLOC_V6 - 1, blocs: LARGEUR, jours: LARGEUR / BLOCS_PAR_JOUR },
    scan: { complet: scan.complet, fenetres: scan.fenetres, fenetresRatees: scan.fenetresRatees,
      evenements: scan.evenements.length },
    agregat: { ...agregat, ethWallet: agregat.ethWallet.toString(), ethExternes: agregat.ethExternes.toString() },
  }, null, 2) + '\n');
  console.log('reference gelee.');
  process.exit(0);
}

const ref = JSON.parse(readFileSync(FICHIER, 'utf8'));
console.log('=== LA REFERENCE, GELEE LE ' + ref.ecritLe + ' ===');
console.log('   fenetre ' + ref.fenetre.deBloc + ' -> ' + ref.fenetre.aBloc
  + ' (' + ref.fenetre.jours + ' j) · ' + ref.scan.evenements + ' encaissement(s) · '
  + (ref.scan.complet ? 'COMPLET' : '⛔ INCOMPLET'));
/* ⛔ LA COMPLETUDE VIENT DE `scan`, ou elle a toujours ete ecrite — l agregat gele ne la portait
 *    pas, et son absence se lisait comme « des lectures ont rate ». On la reprend explicitement,
 *    et si elle manque des DEUX endroits on laisse `undefined` : « inconnu » n est pas « complet ». */
const avant = { ...ref.agregat,
  complet: ref.agregat.complet ?? ref.scan?.complet,
  ethWallet: BigInt(ref.agregat.ethWalletWei ?? ref.agregat.ethWallet),
  ethExternes: BigInt(ref.agregat.ethExternesWei ?? ref.agregat.ethExternes) };
dire(avant, 'AVANT le V6');

console.log('\n=== DEPUIS LE DEPLOIEMENT DU V6 (bloc ' + ref.blocV6 + ') ===');
const { scan, agregat: apres } = await mesurer(ref.blocV6, tete);
console.log('   fenetre ' + ref.blocV6 + ' -> ' + tete + ' (' + ((tete - ref.blocV6) / BLOCS_PAR_JOUR).toFixed(2)
  + ' j) · ' + scan.evenements.length + ' encaissement(s) · '
  + (scan.complet ? 'COMPLET' : '⛔ INCOMPLET — ' + scan.fenetresRatees + ' fenetre(s) ratee(s)'));
dire(apres, 'APRES');

const activiteV6 = scan.evenements.filter((e) => e.hook === 'V6').length;
console.log('\n   encaissements produits PAR LE V6 : ' + activiteV6);
const v = comparer({ avant, apres, cause: 'V6', activiteCause: activiteV6 });
console.log('\n=== VERDICT ===');
console.log('   ' + v.verdict);
console.log('   ' + v.pourquoi || '');
if (v.verdict === 'COMPARABLE') {
  console.log('   encaissements/jour : ' + v.evenementsParJour.avant.toFixed(3) + ' -> '
    + v.evenementsParJour.apres.toFixed(3) + '   (ecart ' + v.evenementsParJour.ecart.toFixed(3) + ')');
  console.log('   ETH au wallet/jour : ' + v.ethParJour.avant.toFixed(9) + ' -> '
    + v.ethParJour.apres.toFixed(9) + '   (ecart ' + v.ethParJour.ecart.toFixed(9) + ')');
  console.log('   part externe       : ' + (v.partExternePourCent.avant ?? 0).toFixed(1) + ' % -> '
    + (v.partExternePourCent.apres ?? 0).toFixed(1) + ' %   (ecart '
    + v.partExternePourCent.ecart.toFixed(1) + ' points)');
  console.log('\n   ' + v.borne);
}
