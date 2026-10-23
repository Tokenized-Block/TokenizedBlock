/* test-slots-regleur-20261023.mjs - LE REGLEUR DES SLOTS (slots-regleur.js) CONTRE UNE FAUSSE CHAINE (aucun reseau, aucune vraie cle).
 * AFFIRME :
 *   (1) SANS cle (SLOTS_KEEPER_KEY absente) : etat OFF, la raison dite, AUCUN appel RPC ; cle mal formee / pas de contrat / pas de table :
 *       OFF, et la valeur de la cle n apparait nulle part ;
 *   (2) AVEC la cle de TEST publique 0x...01 : un tour envoie UNE tx settleMany(ids) = les spins dans leur fenetre que le pot paie en
 *       ENTIER, dans l ordre du contrat (le pot baisse spin apres spin) ; les octets envoyes = signerEip1559 de la tx attendue (au contrat
 *       de la fiche, value 0, chaine 8453, nonce 'pending', gas = estimation x 1,2, maxFee = 2 x base + pourboire) ; trop tot / perdu /
 *       pot court / deja regle : jamais envoyes ;
 *   (3) BORNES : 10 spins au plus par tx ; plafond de prix du gas (rien n est envoye au-dessus) ; plafond de gas par tx ; N tx par heure
 *       glissante ; une seule tx en vol ; ARRET apres 3 echecs de suite (reverts, simulation refusee, envoi refuse, non incluse) ;
 *       chaine du noeud != fiche : ARRET sans rien signer ;
 *   (4) verifierEnvoi refuse tout ce qui n est pas settleMany / settle au contrat (autre adresse, approve, transfer, expire, payDev,
 *       acceptCapped, fund, valeur, chaine, > 10 ids, donnees non canoniques) ;
 *   (5) la fenetre des Spun lue est BORNEE (<= 300 blocs, jamais avant le deploiement, puis les seuls blocs nouveaux + 8) ;
 *   (6) l intervalle derive du temps de bloc MESURE (200 ms -> 10 s, 2 s -> 10 s, 50 ms -> 2,56 s) ;
 *   (7) la cle n est jamais dans etat(), les erreurs ni le journal.
 * NE PROUVE PAS : un reglement reel sur Base (contrat non deploye) ; le banc anvil (banc-slots-regleur-anvil) execute le vrai contrat. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as Slots from './slots-plan.js';
import { signerEip1559 } from './tx-eip1559.js';
/* REGLEUR_MODULE : une COPIE mutee du module (muter-slots-regleur.mjs) ; sinon le module du depot */
const MOD = process.env.REGLEUR_MODULE ? pathToFileURL(process.env.REGLEUR_MODULE).href : new URL('./slots-regleur.js', import.meta.url).href;
const { creerRegleur, verifierEnvoi, intervalleDepuisBloc, donneesSettleMany, SEL_SETTLE_MANY, SEL_SETTLE, BORNES_DEFAUT } = await import(MOD);
const SOURCE = readFileSync(new URL(MOD), 'utf8');
import { adresseDe } from './signeur-secp256k1.js';
import { keccak256Hex, selecteur, topic } from './keccak.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };

const CLE = '0x' + '0'.repeat(63) + '1'; /* la cle de TEST publique n 1 (adresse 0x7E5F…5Bdf) */
const ADR = adresseDe(CLE);
const C = '0x' + 'c0'.repeat(20);
const TABLE = ['0', '0', '0', '250000', '750000', '2000000', '3000000', '4000000', '5000000', '5000000', '5000000', '5000000', '5000000', '5000000', '5000000', '5000000'].map(BigInt);
const JOUEUR = '0x' + 'a1'.repeat(20);
const u = (x) => BigInt(x).toString(16).padStart(64, '0');
const hx = (x) => '0x' + BigInt(x).toString(16);
const trois = (g) => [0, 1, 2].map((r) => keccak256Hex(new Uint8Array([...Buffer.from(g, 'utf8'), r])));
/* une graine dont les trois hashes donnent `pts` points pour l id donne (cherchee, deterministe) */
const graineDe = (id, ok) => { for (let i = 0; i < 20000; i++) { const g = 'reg' + id + '-' + i, h = trois(g); if (ok(Slots.points(Slots.facesDuSpin(h, BigInt(id))))) return h; } throw new Error('no seed'); };

/* ---------------------------------------------------------------- la fausse chaine */
function chaine({ tete = 100000, deploiement = 99000 } = {}) {
  const ch = { chainId: 8453, tete, pot: 100_000_000n, base: 1_000_000n, prio: 1000n, estime: 200000n, nonce: 5n, statut: new Map(), spun: [], blocs: new Map(),
    appels: [], envoyes: [], recus: new Map(), estimeJette: null, envoiJette: null, recuStatut: '0x1', settledDans: (ids) => ids, deploiement, ts: (b) => 1_700_000_000 + Math.floor(b / 5) };
  ch.spin = (id, t, hashes) => {
    ch.spun.push({ address: C, blockNumber: hx(t - 2), topics: [Slots.TOPIC_SPUN, '0x' + u(id), '0x' + '0'.repeat(24) + JOUEUR.slice(2)], data: '0x' + u(t) + u(250000) + u(250000) });
    ch.statut.set(String(id), 1);
    hashes.forEach((h, r) => { assert.ok(!ch.blocs.has(t + r) || ch.blocs.get(t + r) === h, 'deux spins de test sur les memes blocs avec des hashes differents'); ch.blocs.set(t + r, h); });
  };
  ch.rpc = async (m, p) => {
    ch.appels.push([m, p]);
    switch (m) {
      case 'eth_chainId': return hx(ch.chainId);
      case 'eth_blockNumber': return hx(ch.tete);
      case 'eth_getBlockByNumber': {
        const b = p[0] === 'latest' ? ch.tete : parseInt(p[0], 16);
        if (b > ch.tete) return null;
        return { number: hx(b), hash: ch.blocs.get(b) || ('0x' + u(BigInt(b) * 7919n + 1n)), timestamp: hx(ch.ts(b)), baseFeePerGas: hx(ch.base) };
      }
      case 'eth_getLogs': {
        const f = p[0], de = parseInt(f.fromBlock, 16), a = parseInt(f.toBlock, 16);
        assert.ok(a - de + 1 <= 1000, 'getLogs > 1000 blocs');
        return ch.spun.filter((l) => { const b = parseInt(l.blockNumber, 16); return b >= de && b <= a && l.address === f.address && l.topics[0] === f.topics[0]; });
      }
      case 'eth_call': {
        const d = p[0].data;
        if (d === Slots.appelPot()) return '0x' + u(ch.pot);
        if (d.startsWith(Slots.appelSpin(0).slice(0, 10))) { const id = String(BigInt('0x' + d.slice(10))); const s = ch.statut.get(id) ?? 0; return '0x' + u(JOUEUR) + u(0) + u(s); }
        throw new Error('unexpected eth_call');
      }
      case 'eth_maxPriorityFeePerGas': return hx(ch.prio);
      case 'eth_estimateGas': if (ch.estimeJette) throw new Error(ch.estimeJette); return hx(ch.estime);
      case 'eth_getTransactionCount': assert.equal(p[1], 'pending'); return hx(ch.nonce);
      case 'eth_sendRawTransaction': { ch.envoyes.push(p[0]); if (ch.envoiJette) throw new Error(ch.envoiJette); return null; }
      case 'eth_getTransactionReceipt': return ch.recus.has(p[0]) ? ch.recus.get(p[0]) : null;
      default: throw new Error('unexpected method ' + m);
    }
  };
  /* inclut la derniere tx envoyee : statut, et des Settled pour les ids reglees (le contrat paierait) */
  ch.inclure = (hash, ids) => {
    const logs = ch.recuStatut === '0x1' ? ch.settledDans(ids).map((id) => ({ address: C, topics: [topic(Slots.EV_SETTLED), '0x' + u(id), '0x' + '0'.repeat(24) + JOUEUR.slice(2)],
      data: '0x' + [1, 2, 3].map(u).join('') + new Array(15).fill(0).map(u).join('') + u(5) + u(2000000) + u(0) + u(5) })) : [];
    if (ch.recuStatut === '0x1') for (const id of ch.settledDans(ids)) ch.statut.set(String(id), 2);
    ch.recus.set(hash, { status: ch.recuStatut, blockNumber: hx(ch.tete), logs });
  };
  return ch;
}
const regleur = (ch, extra = {}) => {
  const j = [];
  let t = 1_000_000;
  const r = creerRegleur({ cle: CLE, contrat: C, chainId: 8453, table: TABLE, blocDeploiement: ch.deploiement, rpc: ch.rpc, maintenant: () => t, journal: (x) => j.push(x), ...extra });
  return { r, j, avancer: (ms) => { t += ms; } };
};

/* (1) SANS cle : rien */
{
  const ch = chaine();
  for (const [cfg, mot] of [[{ cle: null }, 'SLOTS_KEEPER_KEY is not set'], [{ cle: '' }, 'SLOTS_KEEPER_KEY is not set'], [{ cle: undefined }, 'SLOTS_KEEPER_KEY is not set']]) {
    const r = creerRegleur({ contrat: C, table: TABLE, rpc: ch.rpc, ...cfg });
    const e = r.etat();
    vu(e.etat === 'OFF' && e.pourquoi.includes(mot) && e.adresse === null, 'sans cle : OFF (' + mot + ')');
    const t = await r.tour();
    vu(t.fait === false && r.demarrer() === false, 'sans cle : un tour ne fait rien, demarrer refuse');
  }
  vu(ch.appels.length === 0, 'sans cle : AUCUN appel RPC');
  const mal = '0xZZsecretZZ';
  const rm = creerRegleur({ cle: mal, contrat: C, table: TABLE, rpc: ch.rpc });
  vu(rm.etat().etat === 'OFF' && /malformed/.test(rm.etat().pourquoi) && !JSON.stringify(rm.etat()).includes('secret'), 'cle mal formee : OFF, la valeur jamais montree');
  vu(creerRegleur({ cle: CLE, contrat: null, table: TABLE, rpc: ch.rpc }).etat().etat === 'OFF', 'pas de contrat : OFF');
  vu(creerRegleur({ cle: CLE, contrat: C, table: null, rpc: ch.rpc }).etat().etat === 'OFF', 'pas de table : OFF');
  vu(creerRegleur({ cle: CLE, contrat: C, table: TABLE, rpc: null }).etat().etat === 'OFF', 'pas de lecteur : OFF');
  vu(ch.appels.length === 0, 'aucun regleur OFF n a lu la chaine');
}

/* (2) un tour : les bons spins, les bons octets */
const H5 = trois('v2slots24'); /* 5 points pour l id 1 : 2 USDC */
{
  const ch = chaine();
  const T = ch.tete - 10;
  ch.spin(1, T, H5);
  const h2 = graineDe(2, (p) => p <= 2); ch.spin(2, T - 3, h2); /* sans prix : se regle pour ses points */
  const h3 = graineDe(3, (p) => p >= 5); ch.spin(3, ch.tete - 1, h3); /* trop tot : cible = tete - 1 */
  ch.spin(4, ch.tete - 260, graineDe(4, (p) => p >= 5)); /* perdu : hors fenetre */
  const h5 = graineDe(5, (p) => p >= 3); ch.spin(5, T - 6, h5); ch.statut.set('5', 2); /* deja regle */
  const { r, j } = regleur(ch);
  const e0 = r.etat();
  vu(e0.etat === 'ON' && e0.adresse === ADR && e0.contrat === C, 'avec la cle : ON, l adresse du regleur publiee');
  const t = await r.tour();
  vu(t.fait === true && JSON.stringify(t.ids) === JSON.stringify(['1', '2']), 'tour : settleMany([1, 2]) (#3 trop tot, #4 perdu, #5 deja regle)');
  vu(ch.envoyes.length === 1, 'une seule tx envoyee');
  const lusSpins = ch.appels.filter(([m, p]) => m === 'eth_call' && p[0].data.startsWith(Slots.appelSpin(0).slice(0, 10))).map(([, p]) => String(BigInt('0x' + p[0].data.slice(10))));
  vu(JSON.stringify(lusSpins) === JSON.stringify(['1', '2', '5']), 'statuts relus : les seuls spins REGLABLES (#3 trop tot et #4 perdu ne coutent aucune lecture)');
  const attendu = signerEip1559({ chainId: 8453, nonce: 5n, maxPriorityFeePerGas: 1000n, maxFeePerGas: 2n * 1_000_000n + 1000n, gas: 240000n, to: C, value: 0n, data: donneesSettleMany(['1', '2']) }, CLE);
  vu(ch.envoyes[0] === attendu.brut, 'octets envoyes = la tx attendue (contrat de la fiche, value 0, chaine 8453, nonce pending, gas x 1,2, 2 x base + pourboire)');
  vu(t.hash === attendu.hash && r.etat().enVol.hash === attendu.hash, 'le hash suivi = keccak256(octets)');
  const est = ch.appels.find(([m]) => m === 'eth_estimateGas')[1][0];
  vu(est.from === ADR && est.to === C && est.data === donneesSettleMany(['1', '2']), 'la simulation porte la meme tx, depuis le regleur');
  /* une tx en vol : rien d autre ne part */
  const t2 = await r.tour();
  vu(t2.fait === false && /in flight/.test(t2.pourquoi) && ch.envoyes.length === 1, 'tx en vol : aucun second envoi');
  ch.inclure(attendu.hash, ['1', '2']);
  const t3 = await r.tour();
  const e = r.etat();
  vu(e.dernierRegle && e.dernierRegle.regles === 2 && e.dernierRegle.hash === attendu.hash && e.compteurs.spinsRegles === 2, 'recu relu : 2 spins regles, notes');
  vu(t3.fait === false && ch.envoyes.length === 1, 'apres le recu : plus rien a regler (#3 trop tot)');
  ch.tete += 2; /* #3 devient reglable (cible + 3) */
  const t4 = await r.tour();
  vu(t4.fait === true && JSON.stringify(t4.ids) === JSON.stringify(['3']), 'cible + 3 : #3 part');
  const s = JSON.stringify(e) + JSON.stringify(r.etat()) + j.join('\n');
  vu(!s.includes(CLE.slice(2)) && !s.toLowerCase().includes('0'.repeat(63) + '1'), 'la cle n est ni dans etat() ni dans le journal');
}

/* le pot court : un spin que le pot ne paie pas en ENTIER ne part pas ; l ordre du contrat (le pot baisse spin apres spin) */
{
  const ch = chaine();
  const T = ch.tete - 10;
  ch.spin(1, T, H5); /* 2,00 */
  const h2 = graineDe(2, (p) => p >= 5); ch.spin(2, T - 3, h2);
  const prix2 = TABLE[Slots.points(Slots.facesDuSpin(h2, 2n))];
  ch.pot = 2_000_000n + prix2 - 1n; /* #1 passe, #2 n est plus couvert apres lui */
  const { r } = regleur(ch);
  const t = await r.tour();
  vu(t.fait === true && JSON.stringify(t.ids) === JSON.stringify(['1']), 'pot court apres #1 : seul #1 part (#2 attend) ');
  const ch2 = chaine(); ch2.spin(1, ch2.tete - 10, H5); ch2.pot = 1_999_999n;
  const r2 = regleur(ch2).r;
  const t2 = await r2.tour();
  vu(t2.fait === false && /cannot pay/.test(t2.pourquoi) && ch2.envoyes.length === 0, 'le pot ne couvre aucun spin : rien n est envoye');
}

/* (3) bornes : 10 spins par tx */
{
  const ch = chaine();
  for (let id = 1; id <= 14; id++) ch.spin(id, ch.tete - 10 - 3 * id, graineDe(id, (p) => p <= 2));
  const { r } = regleur(ch);
  const t = await r.tour();
  vu(t.fait === true && t.ids.length === 10 && t.ids[0] === '1' && t.ids[9] === '10', '14 spins reglables : 10 dans la tx (les plus anciens)');
  vu(verifierEnvoi({ to: C, value: 0, chainId: 8453, data: donneesSettleMany(t.ids) }, { contrat: C, chainId: 8453 }) === 10, 'la garde compte 10 spins');
}
/* plafond du prix du gas */
{
  const ch = chaine(); ch.spin(1, ch.tete - 10, H5); ch.base = BORNES_DEFAUT.maxFeeWei; /* base + pourboire > 1 gwei */
  const { r } = regleur(ch);
  const t = await r.tour();
  vu(t.fait === false && /gas price above the cap/.test(t.pourquoi) && ch.envoyes.length === 0 && r.etat().compteurs.sautsGas === 1, 'gas au-dessus du plafond : rien n est envoye');
  vu(!ch.appels.some(([m]) => m === 'eth_estimateGas'), 'ni meme simule');
  ch.base = (BORNES_DEFAUT.maxFeeWei - 1000n) / 2n + 1n; /* 2 x base + prio > plafond, base + prio < plafond : maxFee = le plafond */
  const t2 = await r.tour();
  vu(t2.fait === true && r.etat().dernierEnvoi.maxFeeWei === String(BORNES_DEFAUT.maxFeeWei), 'sous le plafond : maxFee borne AU plafond');
  ch.prio = 10n ** 12n;
  const ch3 = chaine(); ch3.spin(1, ch3.tete - 10, H5); ch3.prio = 10n ** 12n;
  const r3 = regleur(ch3).r; await r3.tour();
  vu(r3.etat().dernierEnvoi && BigInt(r3.etat().dernierEnvoi.maxFeeWei) === 2n * ch3.base + BORNES_DEFAUT.prioWeiMax, 'un pourboire demande enorme est borne a 0,1 gwei');
}
/* plafond de gas par tx */
{
  const ch = chaine(); ch.spin(1, ch.tete - 10, H5); ch.estime = 3_000_000n;
  const { r } = regleur(ch);
  const t = await r.tour();
  vu(t.fait === false && /per-tx cap/.test(t.pourquoi) && ch.envoyes.length === 0, 'gas estime x 1,2 > 3 000 000 : rien n est envoye');
}
/* N tx par heure */
{
  const ch = chaine();
  for (let id = 1; id <= 3; id++) ch.spin(id, ch.tete - 10 - 3 * id, graineDe(id, (p) => p <= 2));
  ch.settledDans = (ids) => ids.slice(0, 1); /* le contrat n en regle qu un par tx (les autres restent en attente) */
  const { r, avancer } = regleur(ch, { bornes: { txParHeure: 2 } });
  for (let k = 0; k < 2; k++) { const t = await r.tour(); ch.inclure(t.hash, t.ids); avancer(1000); }
  await r.tour(); /* lit le 2e recu */
  const t3 = await r.tour();
  vu(ch.envoyes.length === 2 && t3.fait === false && /hourly cap/.test(t3.pourquoi) && r.etat().compteurs.sautsHeure >= 1, '2 tx par heure : la 3e attend');
  avancer(3600 * 1000);
  const t4 = await r.tour();
  vu(t4.fait === true && ch.envoyes.length === 3, 'une heure plus tard : elle part');
}
/* ARRET apres 3 echecs de suite : reverts */
{
  const ch = chaine(); ch.spin(1, ch.tete - 10, H5); ch.recuStatut = '0x0';
  const { r, avancer } = regleur(ch);
  for (let k = 0; k < 3; k++) { const t = await r.tour(); if (t.hash) ch.inclure(t.hash, t.ids); avancer(1000); await r.tour(); }
  const e = r.etat();
  vu(e.etat === 'ARRETE' && e.compteurs.reverts === 3 && /3 failures in a row/.test(e.arret.pourquoi), '3 reverts de suite : ARRETE');
  const avant = ch.envoyes.length, appels = ch.appels.length;
  const t = await r.tour();
  vu(t.fait === false && ch.envoyes.length === avant && ch.appels.length === appels, 'ARRETE : plus aucun envoi ni lecture');
}
/* simulation refusee, envoi refuse, non incluse : comptes comme echecs ; un succes remet le compteur a zero */
{
  const ch = chaine(); ch.spin(1, ch.tete - 10, H5); ch.estimeJette = 'execution reverted';
  const { r } = regleur(ch);
  await r.tour(); await r.tour();
  vu(r.etat().compteurs.simulationsRefusees === 2 && r.etat().echecsSuite === 2 && ch.envoyes.length === 0, 'simulation refusee : rien n est envoye, 2 echecs');
  ch.estimeJette = null; ch.envoiJette = 'already known';
  const t = await r.tour();
  vu(t.fait === true && r.etat().echecsSuite === 2, '« already known » = la meme tx deja chez le noeud : suivie, pas un echec');
  ch.inclure(t.hash, t.ids); await r.tour();
  vu(r.etat().echecsSuite === 0 && r.etat().etat === 'ON', 'un recu 0x1 remet les echecs a zero');
  const ch2 = chaine(); ch2.spin(1, ch2.tete - 10, H5); ch2.envoiJette = 'insufficient funds for gas';
  const r2 = regleur(ch2).r;
  for (let k = 0; k < 3; k++) await r2.tour();
  vu(r2.etat().etat === 'ARRETE' && r2.etat().compteurs.envoisRefuses === 3, 'envoi refuse 3 fois (wallet sans gas) : ARRETE');
  const ch3 = chaine(); ch3.spin(1, ch3.tete - 10, H5);
  const o3 = regleur(ch3); const r3 = o3.r;
  await r3.tour(); o3.avancer(BORNES_DEFAUT.inclusionMaxMs + 1); await r3.tour();
  vu(r3.etat().compteurs.nonInclus === 1 && r3.etat().enVol === null, 'non incluse apres 120 s : comptee, relachee');
}
/* chaine du noeud != fiche */
{
  const ch = chaine(); ch.spin(1, ch.tete - 10, H5); ch.chainId = 1;
  const { r } = regleur(ch);
  const t = await r.tour();
  vu(r.etat().etat === 'ARRETE' && /chain 1/.test(t.pourquoi) && ch.envoyes.length === 0 && ch.appels.length === 1, 'noeud sur une autre chaine : ARRETE au premier appel, rien de signe');
}

/* (4) la garde */
{
  const ok = { to: C, value: 0, chainId: 8453, data: donneesSettleMany(['1']) };
  const refus = (tx, m) => { let e = null; try { verifierEnvoi(tx, { contrat: C, chainId: 8453 }); } catch (x) { e = x; } vu(e instanceof Error, 'garde : ' + m + ' refuse'); };
  vu(verifierEnvoi(ok, { contrat: C, chainId: 8453 }) === 1 && verifierEnvoi({ ...ok, data: SEL_SETTLE + u(7) }, { contrat: C, chainId: 8453 }) === 1, 'garde : settleMany([1]) et settle(7) passent');
  refus({ ...ok, to: '0x' + 'c1'.repeat(20) }, 'autre adresse');
  refus({ ...ok, to: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', data: selecteur('approve(address,uint256)') + u(1) + u(1) }, 'approve sur l USDC');
  for (const sig of ['transfer(address,uint256)', 'approve(address,uint256)', 'expire(uint256)', 'payDev()', 'acceptCapped(uint256,uint256)', 'fund(uint256)', 'spin()']) {
    refus({ ...ok, data: selecteur(sig) + u(1) + u(1) }, sig + ' au contrat');
    /* le meme corps qu un settleMany canonique, sous un AUTRE selecteur : seul le selecteur le refuse */
    refus({ ...ok, data: selecteur(sig) + u(32) + u(1) + u(1) }, sig + ' au contrat, corps de settleMany');
  }
  refus({ ...ok, value: 1 }, 'value 1 wei');
  refus({ ...ok, chainId: 1 }, 'chaine 1');
  refus({ ...ok, data: donneesSettleMany(Array.from({ length: 11 }, (_, k) => k + 1)) }, '11 ids');
  refus({ ...ok, data: SEL_SETTLE_MANY + u(64) + u(1) + u(1) }, 'settleMany non canonique (offset)');
  refus({ ...ok, data: SEL_SETTLE_MANY + u(32) + u(2) + u(1) }, 'settleMany non canonique (longueur)');
  refus({ ...ok, data: SEL_SETTLE_MANY + u(32) + u(0) }, 'settleMany vide');
  refus({ ...ok, data: SEL_SETTLE + u(7) + u(8) }, 'settle avec un mot de trop');
  vu(SEL_SETTLE_MANY === '0x5ba3107b' && SEL_SETTLE === '0x8df82800', 'selecteurs settleMany 0x5ba3107b / settle 0x8df82800 (= cast calldata)');
  /* ⚠️ la garde n est jamais declenchee par un tour (le tour ne construit que des settleMany valides) : son APPEL avant la signature est
   *    donc verifie dans le SOURCE (une lecture, pas une execution — dit) ; ses refus, eux, sont executes ci-dessus */
  const corps = SOURCE.slice(SOURCE.indexOf('async function tour()'));
  const iG = corps.indexOf('verifierEnvoi(tx, { contrat: c, chainId, bornes });'), iS = corps.indexOf('signerEip1559(tx, cle)');
  vu(iG > 0 && iS > iG && (SOURCE.match(/signerEip1559\(/g) || []).length === 1, 'source : verifierEnvoi(tx) est appele AVANT la seule signature (un seul appel a signerEip1559)');
}

/* (5) la fenetre des logs */
{
  const ch = chaine({ tete: 100000, deploiement: 99900 });
  const { r } = regleur(ch);
  await r.tour();
  const g1 = ch.appels.filter(([m]) => m === 'eth_getLogs').map(([, p]) => p[0]);
  vu(g1.length === 1 && parseInt(g1[0].fromBlock, 16) === 99900 && parseInt(g1[0].toBlock, 16) === 100000, 'premiere lecture : jamais avant le deploiement');
  const ch2 = chaine({ tete: 100000, deploiement: 0 });
  const o2 = regleur(ch2); await o2.r.tour();
  ch2.tete = 100050; await o2.r.tour();
  const g2 = ch2.appels.filter(([m]) => m === 'eth_getLogs').map(([, p]) => [parseInt(p[0].fromBlock, 16), parseInt(p[0].toBlock, 16)]);
  vu(g2[0][0] === 100000 - 299 && g2[0][1] === 100000, 'premiere lecture : 300 blocs au plus');
  vu(g2[1][0] === 100000 + 1 - 8 && g2[1][1] === 100050, 'ensuite : les blocs nouveaux, + 8 de recouvrement');
  ch2.tete = 200000; await o2.r.tour();
  const g3 = ch2.appels.filter(([m]) => m === 'eth_getLogs').map(([, p]) => [parseInt(p[0].fromBlock, 16), parseInt(p[0].toBlock, 16)]);
  vu(g3[2][0] === 200000 - 299, 'un saut de tete : toujours 300 blocs au plus');
}

/* (6) l intervalle */
vu(intervalleDepuisBloc(200) === 10000 && intervalleDepuisBloc(2000) === 10000 && intervalleDepuisBloc(50) === 2560 && intervalleDepuisBloc(1) === 2000 && intervalleDepuisBloc(null) === 10000, 'intervalle : 200 ms et 2 s -> 10 s, 50 ms -> 2,56 s, borne basse 2 s, sans mesure 10 s');
{
  const ch = chaine(); ch.ts = (b) => 1_700_000_000 + Math.floor(b / 5); /* 5 blocs par seconde : 200 ms */
  const { r } = regleur(ch); await r.tour();
  const e = r.etat();
  vu(e.msParBlocMesure === 200 && e.intervalleMs === 10000 && Math.abs(e.fenetreSecondes - 51.2) < 1e-9, 'temps de bloc MESURE sur 1000 blocs : 200 ms, fenetre 51,2 s, tour toutes les 10 s');
  const ch2 = chaine(); ch2.ts = (b) => 1_700_000_000 + Math.floor(b / 20); /* 50 ms */
  const r2 = regleur(ch2).r; await r2.tour();
  vu(r2.etat().msParBlocMesure === 50 && r2.etat().intervalleMs === 2560, 'a 50 ms par bloc : un tour toutes les 2,56 s');
}
console.log('ok slots-regleur - ' + n + ' assertions ; NE PROUVE PAS un reglement reel sur Base');
