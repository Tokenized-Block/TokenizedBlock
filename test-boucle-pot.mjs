// test-boucle-pot.mjs — le cycle complet, joue contre une chaine simulee.
//
// ⛔ CE QUE CE FICHIER GARDE AVANT TOUT : que la boucle REFUSE. Un cycle de recompense qui propose
//    une transaction quand il ne devrait pas grave une racine pour toujours ; un cycle qui refuse
//    a tort ne coute qu un tour. Les refus sont donc testes un par un, avec leur raison.
// RPC simule : rien ne part sur un reseau.
import assert from 'node:assert/strict';
import { tour, preparerAncrage, decoderPeriode, lirePeriodes, prepararAlimentation, SEL } from './boucle-pot.js';
import { feuille, verifierPreuve } from './merkle-pot.js';
import { TOPIC_TRANSFER, ADRESSE_ZERO } from './soldes-jeton.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const POT = '0xc743f6aaff2c4cad67c30b9e5d1af0e913fce272';
const JETON = '0xb2000000000000000000006d6f9102e9e4b221e0';
const POOL = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const A = '0x' + 'a1'.repeat(20);
const B = '0x' + 'b2'.repeat(20);
const GRAINE = '0xabf6a4d51183d44f4fbd1444053932b1145de01d34fb9f8a1db7563f03813043';
const PLANCHER = 1000;

const m32 = (v) => BigInt(v).toString(16).padStart(64, '0');
const motAdr = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const logT = (bloc, de, vers, v) => ({ blockNumber: '0x' + bloc.toString(16),
  topics: [TOPIC_TRANSFER, '0x' + motAdr(de), '0x' + motAdr(vers)], data: '0x' + m32(v) });

/**
 * Une chaine simulee : des periodes, des logs Transfer, un totalSupply, un depot.
 * ⛔ Elle repond AUX MEMES selecteurs que le vrai contrat — sinon le test validerait une fiction.
 */
function chaine({ tete, periodes, logs, supply, depose, mixHash = GRAINE }) {
  return async (methode, params) => {
    if (methode === 'eth_blockNumber') return '0x' + tete.toString(16);
    if (methode === 'eth_getBlockByNumber') return { mixHash };
    if (methode === 'eth_getLogs') {
      const p = params[0];
      const de = parseInt(p.fromBlock, 16), a = parseInt(p.toBlock, 16);
      const mintSeul = (p.topics || []).length > 1;
      return logs.filter((l) => {
        const b = parseInt(l.blockNumber, 16);
        if (b < de || b > a) return false;
        return mintSeul ? l.topics[1] === '0x' + motAdr(ADRESSE_ZERO) : true;
      });
    }
    if (methode === 'eth_call') {
      const d = params[0].data;
      if (d.startsWith(SEL.nombreDePeriodes)) return '0x' + m32(periodes.length);
      if (d.startsWith(SEL.periodes)) {
        const i = Number(BigInt('0x' + d.slice(10, 74)));
        const p = periodes[i];
        return '0x' + m32(p.debut) + m32(p.fin) + m32(p.ancreeLe) + m32(p.cible || 0) + (p.graine || m32(0));
      }
      if (d.startsWith(SEL.depose)) return '0x' + m32(depose);
      if (d.startsWith('0x18160ddd')) return '0x' + m32(supply);
    }
    throw new Error('appel non simule : ' + methode + ' ' + JSON.stringify(params).slice(0, 80));
  };
}

// ══ 1. LE DECODEUR DE PERIODE ═══════════════════════════════════════════════════════════════════
{
  const d = '0x' + m32(100) + m32(200) + m32(0) + m32(0) + m32(0);
  const p = decoderPeriode(d, 3);
  eq(p.id, 3, 'l id vient de l appelant, pas des donnees');
  eq(p.debut, 100, 'debut'); eq(p.fin, 200, 'fin'); eq(p.ancreeLe, 0, 'pas encore ancree');
  // ⛔ TEMOIN : des donnees tronquees rendent null, jamais une periode a moitie remplie.
  eq(decoderPeriode('0x' + m32(1) + m32(2), 0), null, 'donnees tronquees -> null');
  eq(decoderPeriode('0x', 0), null, 'donnees vides -> null');
}

// ══ 2. AUCUNE PERIODE : la boucle propose d en OUVRIR une ═══════════════════════════════════════
{
  const rpc = chaine({ tete: 5000, periodes: [], logs: [], supply: 1000n, depose: 0n });
  const r = await tour({ rpc, pot: POT, jeton: JETON, plancher: PLANCHER });
  eq(r.action, 'OUVRIR', 'rien n existe : on ouvre');
  eq(r.aSigner.to, POT, 'la transaction vise le pot');
  eq(r.aSigner.value, '0x0', 'et n envoie aucune valeur');
  ok(r.valideJusqua > 5000, 'avec une date limite dans le futur');
  ok(!r.arbre, 'et aucun arbre : il n y a rien a ancrer');
}

// ══ 3. UNE PERIODE EN COURS : on ATTEND, et on dit combien ══════════════════════════════════════
{
  const rpc = chaine({ tete: 5000, periodes: [{ debut: 4000, fin: 6000, ancreeLe: 0 }], logs: [], supply: 1000n, depose: 0n });
  const r = await tour({ rpc, pot: POT, jeton: JETON, plancher: PLANCHER });
  eq(r.action, 'ATTENDRE', 'la periode court encore');
  eq(r.blocsRestants, 1000, 'et il reste 1000 blocs');
  ok(!r.aSigner, 'rien a signer');
}

// ══ 4. LE CYCLE COMPLET : periode finie -> graine -> cible -> soldes -> arbre -> ANCRER ═════════
{
  // ⛔ FIXTURE CORRIGEE : la premiere version faisait envoyer 1000 a une pool qui n avait recu que
  //    999 -> solde -1, impossible sur un ERC-20. Le code a refuse, a raison ; c etait le TEST qui
  //    decrivait une chaine qui ne peut pas exister.
  const logs = [logT(1500, ADRESSE_ZERO, POOL, 2000n), logT(1600, POOL, A, 600n), logT(1700, POOL, B, 400n)];
  const rpc = chaine({ tete: 5000, periodes: [{ debut: 2000, fin: 4000, ancreeLe: 0 }],
    logs, supply: 2000n, depose: 1000n });
  const r = await tour({ rpc, pot: POT, jeton: JETON, plancher: PLANCHER });
  eq(r.action, 'ANCRER', 'une periode finie et non ancree : on ancre');
  ok(r.arbre, 'et la boucle rend l arbre');
  ok(r.arbre.cible >= 2000 && r.arbre.cible <= 4000, 'la cible tombe DANS la periode : ' + r.arbre.cible);
  eq(r.arbre.graine, GRAINE, 'la graine est celle du bloc de fin');
  eq(r.arbre.preuves.length, 2, 'deux detenteurs payables — la pool est exclue');
  eq(r.arbre.total, '1000', 'le total distribue est le depot du pot');

  // ⛔ CHAQUE PREUVE EST REJOUEE, comme la boucle le fait elle-meme avant de proposer.
  let bonnes = 0;
  for (const p of r.arbre.preuves) {
    const f = feuille({ id: 0, jeton: JETON, compte: p.compte, montant: BigInt(p.montant) });
    if (verifierPreuve({ feuille: f, preuve: p.preuve, racine: r.arbre.racine })) bonnes++;
  }
  eq(bonnes, 2, 'les deux preuves se rejouent jusqu a la racine');

  // ⛔ LE TEMOIN QUI COMPTE : la POOL n est PAS payee, alors qu elle detient la majorite.
  ok(!r.arbre.preuves.some((p) => p.compte === POOL), 'la pool du marche ne recoit rien');
  const somme = r.arbre.preuves.reduce((s, p) => s + BigInt(p.montant), 0n);
  eq(somme, 1000n, 'et la somme des parts vaut exactement le pot');
}

// ══ 5. LES REFUS DE LA BOUCLE — chacun nomme ════════════════════════════════════════════════════
{
  const finie = [{ debut: 2000, fin: 4000, ancreeLe: 0 }];

  /* pas de detenteur hors pool : on ne grave rien */
  const seule = chaine({ tete: 5000, periodes: finie, logs: [logT(1500, ADRESSE_ZERO, POOL, 1000n)],
    supply: 1000n, depose: 1000n });
  const r1 = await tour({ rpc: seule, pot: POT, jeton: JETON, plancher: PLANCHER });
  eq(r1.action, 'REFUS', 'tout est dans la pool : personne a payer');
  ok(/personne ne detient|incomplete/.test(r1.pourquoi), 'et la raison le dit : ' + r1.pourquoi);

  /* pot vide : rien a partager */
  const vide = chaine({ tete: 5000, periodes: finie,
    logs: [logT(1500, ADRESSE_ZERO, POOL, 600n), logT(1600, POOL, A, 400n)], supply: 600n, depose: 0n });
  const r2 = await tour({ rpc: vide, pot: POT, jeton: JETON, plancher: PLANCHER });
  eq(r2.action, 'REFUS', 'pot vide : on n ancre pas');

  /* somme differente du totalSupply : la reconstruction est fausse, on refuse */
  const faux = chaine({ tete: 5000, periodes: finie,
    logs: [logT(1500, ADRESSE_ZERO, POOL, 600n), logT(1600, POOL, A, 400n)], supply: 999n, depose: 1000n });
  const r3 = await tour({ rpc: faux, pot: POT, jeton: JETON, plancher: PLANCHER });
  eq(r3.action, 'REFUS', 'somme != totalSupply au bloc tire : refus');
  ok(/differs from totalSupply/.test(r3.pourquoi), 'avec la raison exacte');

  /* graine nulle : la periode est annulee, jamais devinee */
  const sansGraine = chaine({ tete: 5000, periodes: finie,
    logs: [logT(1500, ADRESSE_ZERO, POOL, 600n), logT(1600, POOL, A, 400n)],
    supply: 1000n, depose: 1000n, mixHash: '0x' + '0'.repeat(64) });
  const r4 = await tour({ rpc: sansGraine, pot: POT, jeton: JETON, plancher: PLANCHER });
  eq(r4.action, 'REFUS', 'graine nulle : refus');
  ok(/tirage impossible/.test(r4.pourquoi), 'et on dit que le tirage est impossible');

  /* jeton jamais mint avant la cible : naissance introuvable */
  const sansMint = chaine({ tete: 5000, periodes: finie, logs: [], supply: 0n, depose: 1000n });
  const r5 = await tour({ rpc: sansMint, pot: POT, jeton: JETON, plancher: PLANCHER });
  eq(r5.action, 'REFUS', 'aucune naissance : refus');
}

// ══ 6. UNE LECTURE RATEE N EST JAMAIS UNE LISTE VIDE ════════════════════════════════════════════
// ⛔ Si lirePeriodes rendait [] sur une lecture ratee, la boucle proposerait d OUVRIR une periode
//    alors qu une autre attend peut-etre son ancrage. Le refus doit remonter.
{
  const casse = async (m, p) => {
    if (m === 'eth_blockNumber') return '0x1388';
    if (m === 'eth_call' && p[0].data.startsWith(SEL.nombreDePeriodes)) return '0x' + m32(2);
    if (m === 'eth_call' && p[0].data.startsWith(SEL.periodes)) return '0x'; /* illisible */
    throw new Error('non simule');
  };
  eq(await lirePeriodes({ rpc: casse, pot: POT }), null, 'une periode illisible rend null');
  const r = await tour({ rpc: casse, pot: POT, jeton: JETON, plancher: PLANCHER });
  eq(r.action, 'REFUS', 'et la boucle refuse plutot que d ouvrir a l aveugle');
  ok(/liste trouee/.test(r.pourquoi), 'en disant pourquoi');
}

// ══ 7. L ALIMENTATION RAPPELLE L APPROBATION ════════════════════════════════════════════════════
{
  const a = prepararAlimentation({ pot: POT, id: 0, jeton: JETON, montant: 500n });
  eq(a.aSigner.to, POT, 'la transaction vise le pot');
  eq(a.aSigner.value, '0x0', 'un versement ERC-20 n envoie pas de valeur');
  ok(/approve\(/.test(a.prealable), 'et le prealable rappelle l approbation');
  const e = prepararAlimentation({ pot: POT, id: 0, jeton: JETON, montant: 7n, estEth: true });
  eq(e.aSigner.value, '0x7', 'en ETH, le montant voyage dans la value');
  ok(!e.prealable, 'et aucune approbation n est necessaire');
}

console.log('test-boucle-pot : ' + n + ' assertions, OK');
