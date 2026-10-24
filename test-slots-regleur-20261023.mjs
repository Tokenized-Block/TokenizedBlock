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
 *   2026-10-24 (audits slots + rolls-duels, chacun ROUGE sur 0f9d8ec) :
 *   (8) une erreur RPC d eth_estimateGas n est PAS un echec (jamais d arret) ; un tour sain remet le compte a zero ;
 *   (9) un envoi qui repond « nonce too low » alors que la tx signee est minee : suivie, pas un echec ; « replacement underpriced » sans tx
 *       ni nonce consomme : un echec ;
 *  (10) un recu qui jette sans fin : la tx est relachee apres inclusionMaxMs, le regleur repart ;
 *  (11) settleMany avec un spin dont le paiement echoue (simulation qui revert) : coupe en deux, le spin fautif ecarte, les autres partent ;
 *  (12) statut 0 (noeud en retard) : le spin reste suivi ; la tete cible + 256 n est jamais envoyee (la tx tomberait a cible + 257) ;
 *  (13) DUELS : settle(id) de chaque duel rejoint dans sa fenetre, vers le contrat des duels ; ROLLS : closeDay / drawDay / re-armement ;
 *       la garde n admet que ces appels-la, vers ces adresses-la ; la plus pressee part d abord ; etat() par contrat.
 * NE PROUVE PAS : un reglement reel sur Base ; le banc anvil (banc-slots-regleur-anvil) execute les vrais contrats, en local. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as Slots from './slots-plan.js';
import { signerEip1559 } from './tx-eip1559.js';
/* REGLEUR_MODULE : une COPIE mutee du module (muter-slots-regleur.mjs) ; sinon le module du depot */
const MOD = process.env.REGLEUR_MODULE ? pathToFileURL(process.env.REGLEUR_MODULE).href : new URL('./slots-regleur.js', import.meta.url).href;
const M = await import(MOD);
const { creerRegleur, verifierEnvoi, intervalleDepuisBloc, donneesSettleMany, SEL_SETTLE_MANY, SEL_SETTLE, BORNES_DEFAUT } = M;
const SOURCE = readFileSync(new URL(MOD), 'utf8');
import { adresseDe } from './signeur-secp256k1.js';
import { keccak256Hex, selecteur, topic } from './keccak.js';
import { hashBrut } from './tx-eip1559.js';
/* les selecteurs et topics des duels / rolls, recalcules ici depuis les SIGNATURES (pas lus du module : une derive rougit) */
const S_DUELS = selecteur('duels(uint256)'), S_TODAY = selecteur('today()'), S_BUYERS = selecteur('buyerCount(uint32)'), S_DAYPOTS = selecteur('dayPots(uint32)');
const S_CLOSE = selecteur('closeDay(uint32)'), S_DRAW = selecteur('drawDay(uint32)');
const T_JOINED = topic('Joined(uint256,address,uint8[5],uint256)'), T_DSETTLED = topic('Settled(uint256,bytes32,uint8,uint8,address,uint256)');
const T_CLOSED = topic('DayClosed(uint32,uint256,uint256,uint256,address)'), T_DRAWN = topic('DayDrawn(uint32,address,bytes32,uint256,uint256)');
const D = '0x' + 'd0'.repeat(20), R = '0x' + 'e0'.repeat(20);
let n = 0;
/* TOUT_COMPTER=1 : chaque assertion est COMPTEE au lieu de jeter, et chaque cas (cas()) dit ses KO — pour mesurer un module ANCIEN
 *   (0f9d8ec) cas par cas ; sans la variable, la premiere assertion fausse jette (la serie). */
const TOUT = !!process.env.TOUT_COMPTER;
let ko = 0;
const vu = (c, m) => { n += 1; if (TOUT) { if (!c) { ko += 1; console.log('  KO ' + m); } return; } assert.ok(c, m); };
const cas = async (nom, f) => {
  const n0 = n, k0 = ko;
  try { await f(); } catch (e) { if (!TOUT) throw e; ko += 1; console.log('  KO ' + nom + ' : exception ' + String(e && e.message).slice(0, 120)); }
  if (TOUT) console.log((ko === k0 ? 'ok  ' : 'KO  ') + nom + ' — ' + (n - n0) + ' assertions, ' + (ko - k0) + ' KO');
};

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
  const ch = { chainId: 8453, tete, pot: 100_000_000n, base: 1_000_000n, prio: 1000n, estime: 200000n, nonce: 5n, nonceLatest: null, statut: new Map(), spun: [], blocs: new Map(),
    appels: [], envoyes: [], recus: new Map(), estimeJette: null, estimeFn: null, envoiJette: null, envoiFn: null, txConnues: new Map(), recuStatut: '0x1', settledDans: (ids) => ids, deploiement, ts: (b) => 1_700_000_000 + Math.floor(b / 5),
    duelStatut: new Map(), aujourdhui: 20000, jours: new Map(), spinLent: new Set() };
  /* un duel REJOINT : le Joined (cible t) et son statut (2 Joined, 3 Settled...) */
  ch.duel = (id, t, statut = 2) => {
    ch.spun.push({ address: D, blockNumber: hx(t - 2), topics: [T_JOINED, '0x' + u(id), '0x' + '0'.repeat(24) + 'b2'.repeat(20)], data: '0x' + [0, 0, 0, 0, 0].map(u).join('') + u(t) });
    ch.duelStatut.set(String(id), statut);
  };
  /* un jour du pot du pass : n acheteurs, pot, etat (0 Open, 1 Armed, 2 Drawn), cible */
  ch.jour = (d, { n = 3, pot = 15_000_000n, etat = 0, t = 0 } = {}) => ch.jours.set(String(d), { n: BigInt(n), pot: BigInt(pot), etat, t });
  ch.inclureDuel = (hash, id) => { ch.duelStatut.set(String(id), 3); ch.recus.set(hash, { status: '0x1', blockNumber: hx(ch.tete), logs: [{ address: D, topics: [T_DSETTLED, '0x' + u(id)], data: '0x' }] }); };
  ch.inclureJour = (hash, quoi, d) => {
    const j = ch.jours.get(String(d));
    if (quoi === 'closeDay') { j.etat = 1; j.t = ch.tete + 2; } else { j.etat = 2; j.pot = 0n; }
    ch.recus.set(hash, { status: '0x1', blockNumber: hx(ch.tete), logs: [{ address: R, topics: [quoi === 'closeDay' ? T_CLOSED : T_DRAWN, '0x' + u(d)], data: '0x' }] });
  };
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
        const d = p[0].data, to = p[0].to;
        if (to === D) {
          if (d.startsWith(S_DUELS)) { const s = ch.duelStatut.get(String(BigInt('0x' + d.slice(10)))) ?? 0; return '0x' + [0, 0, s, 0, 0, 0, 0, 0, 0].map(u).join(''); }
          throw new Error('unexpected duels eth_call');
        }
        if (to === R) {
          if (d === S_TODAY) return '0x' + u(ch.aujourdhui);
          const j = ch.jours.get(String(BigInt('0x' + (d.slice(10) || '0')))) || { n: 0n, pot: 0n, etat: 0, t: 0 };
          if (d.startsWith(S_BUYERS)) return '0x' + u(j.n);
          if (d.startsWith(S_DAYPOTS)) return '0x' + u(j.pot) + u(j.t) + u(j.etat);
          throw new Error('unexpected rolls eth_call');
        }
        if (d === Slots.appelPot()) return '0x' + u(ch.pot);
        if (d.startsWith(Slots.appelSpin(0).slice(0, 10))) { const id = String(BigInt('0x' + d.slice(10))); const s = ch.spinLent.has(id) ? 0 : ch.statut.get(id) ?? 0; return '0x' + u(JOUEUR) + u(0) + u(s); }
        throw new Error('unexpected eth_call');
      }
      case 'eth_maxPriorityFeePerGas': return hx(ch.prio);
      case 'eth_estimateGas': if (ch.estimeJette) throw new Error(ch.estimeJette); if (ch.estimeFn) ch.estimeFn(p[0]); return hx(ch.estime);
      /* 'pending' signe ; 'latest' (la verification d un « nonce too low ») : un de moins par defaut, pour qu un nonce 'latest' signe se voie */
      case 'eth_getTransactionCount': if (p[1] === 'latest') return hx(ch.nonceLatest ?? ch.nonce - 1n); assert.equal(p[1], 'pending'); return hx(ch.nonce);
      case 'eth_sendRawTransaction': { ch.envoyes.push(p[0]); if (ch.envoiFn) return ch.envoiFn(p[0]); if (ch.envoiJette) throw new Error(ch.envoiJette); return null; }
      case 'eth_getTransactionReceipt': return ch.recus.has(p[0]) ? ch.recus.get(p[0]) : null;
      case 'eth_getTransactionByHash': return ch.txConnues.get(p[0]) ?? null;
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
/* 2026-10-24 : une simulation en PANNE RPC n est pas un echec ; envoi refuse, non incluse : comptes comme echecs ; un succes remet a zero */
await cas('8a panne RPC d eth_estimateGas : pas un echec', async () => {
  const ch = chaine(); ch.spin(1, ch.tete - 10, H5); ch.estimeJette = 'over rate limit';
  const { r } = regleur(ch);
  for (let k = 0; k < 4; k++) await r.tour();
  const e4 = r.etat();
  vu(e4.compteurs.simulationsNonLues === 4 && e4.compteurs.simulationsRefusees === 0 && e4.echecsSuite === 0 && e4.etat === 'ON' && ch.envoyes.length === 0, 'eth_estimateGas en panne RPC 4 fois : rien envoye, AUCUN echec compte, toujours ON');
  ch.estimeJette = null; ch.envoiJette = 'insufficient funds for gas';
  await r.tour(); await r.tour();
  vu(r.etat().compteurs.envoisRefuses === 2 && r.etat().echecsSuite === 2 && r.etat().etat === 'ON', 'envoi refuse 2 fois : 2 echecs');
  ch.envoiJette = 'already known';
  const t = await r.tour();
  vu(t.fait === true && r.etat().echecsSuite === 2, '« already known » = la meme tx deja chez le noeud : suivie, pas un echec');
  ch.inclure(t.hash, t.ids); await r.tour();
  vu(r.etat().echecsSuite === 0 && r.etat().etat === 'ON', 'un recu 0x1 remet les echecs a zero');
  /* le recu 0x1 remet a zero MEME si le tour envoie ensuite (pas un tour « sain sans rien a faire ») */
  const chS = chaine(); chS.spin(1, chS.tete - 10, H5); chS.spin(2, chS.tete - 13, graineDe(2, (p) => p <= 2)); chS.envoiJette = 'insufficient funds for gas';
  chS.settledDans = (ids) => ids.slice(0, 1);
  const rS = regleur(chS).r; await rS.tour(); await rS.tour();
  chS.envoiJette = null; const tS = await rS.tour(); chS.inclure(tS.hash, tS.ids);
  const tS2 = await rS.tour();
  vu(tS2.fait === true && rS.etat().echecsSuite === 0, 'apres 2 refus, un recu 0x1 puis un nouvel envoi dans le meme tour : 0 echec');
  const ch2 = chaine(); ch2.spin(1, ch2.tete - 10, H5); ch2.envoiJette = 'insufficient funds for gas';
  const r2 = regleur(ch2).r;
  for (let k = 0; k < 3; k++) await r2.tour();
  vu(r2.etat().etat === 'ARRETE' && r2.etat().compteurs.envoisRefuses === 3, 'envoi refuse 3 fois (wallet sans gas) : ARRETE');
  const ch3 = chaine(); ch3.spin(1, ch3.tete - 10, H5);
  const o3 = regleur(ch3); const r3 = o3.r;
  await r3.tour(); o3.avancer(BORNES_DEFAUT.inclusionMaxMs + 1); await r3.tour();
  vu(r3.etat().compteurs.nonInclus === 1 && r3.etat().enVol === null, 'non incluse apres 120 s : comptee, relachee');
});
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
  const iG = corps.indexOf('verifierEnvoi(tx, { contrat: c, chainId, bornes, duels: cD, rolls: cR });'), iS = corps.indexOf('signerEip1559(tx, cle)');
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
/* ================================================================ 2026-10-24 : les correctifs des audits (chacun ROUGE sur 0f9d8ec) */
const ids1 = (data) => { const m = (String(data).slice(10).match(/.{64}/g) || []).map((w) => BigInt('0x' + w)); return m.slice(2).map(String); };

/* (8) l audit keeper V1 : des pannes RPC d eth_estimateGas ENTRE des tours calmes n arretent jamais le regleur ; un tour sain remet a zero */
await cas('8b audit V1 + tour sain', async () => {
  const ch = chaine(); const { r, avancer } = regleur(ch);
  let id = 100;
  for (let k = 0; k < 4; k++) {
    ch.spin(++id, ch.tete - 5, graineDe(id, (p) => p >= 3)); ch.estimeJette = 'over rate limit'; await r.tour();
    ch.estimeJette = null; ch.tete += 300; avancer(10000); await r.tour(); ch.tete += 300; avancer(10000);
  }
  ch.spin(++id, ch.tete - 5, graineDe(id, (p) => p >= 3));
  const t = await r.tour();
  vu(r.etat().etat === 'ON' && t.fait === true && JSON.stringify(t.ids) === JSON.stringify([String(id)]), 'audit V1 : 4 pannes d eth_estimateGas entre des tours calmes : toujours ON, le spin payable suivant part');
  /* un tour sain (tout lu, rien a faire) remet le compte a zero, meme apres des envois refuses */
  const ch2 = chaine(); ch2.spin(1, ch2.tete - 10, H5); ch2.envoiJette = 'insufficient funds for gas';
  const o2 = regleur(ch2);
  await o2.r.tour(); await o2.r.tour();
  vu(o2.r.etat().echecsSuite === 2, 'deux envois refuses : 2 echecs de suite');
  ch2.tete += 300; await o2.r.tour();
  vu(o2.r.etat().echecsSuite === 0 && o2.r.etat().compteurs.toursSains >= 1, 'un tour sain (rien a regler, tout lu) : le compte revient a 0');
  /* un tour qui lit mal (statut illisible) n est pas sain : le compte reste */
  const ch3 = chaine(); ch3.spin(1, ch3.tete - 10, H5); ch3.envoiJette = 'insufficient funds for gas';
  const o3 = regleur(ch3); await o3.r.tour(); await o3.r.tour();
  ch3.spinLent.add('1'); await o3.r.tour();
  vu(o3.r.etat().echecsSuite === 2 && o3.r.etat().etat === 'ON', 'un tour ou un statut n est pas lu (0) ne remet pas le compte a zero');
});

/* (9) l audit keeper V2 : l envoi est accepte et mine, mais la reponse (relance) dit « nonce too low » : suivie, comptee, pas un echec */
await cas('9 audit V2 nonce too low', async () => {
  const ch = chaine(); ch.spin(1, ch.tete - 10, H5);
  ch.envoiFn = (brut) => { const h = hashBrut(brut); ch.inclure(h, ['1']); ch.nonce += 1n; ch.nonceLatest = ch.nonce; throw new Error('nonce too low: next nonce 6, tx nonce 5'); };
  const { r } = regleur(ch);
  const t = await r.tour();
  const e = r.etat();
  vu(t.fait === true && e.enVol && e.enVol.hash === t.hash && e.compteurs.envoisRefuses === 0 && e.compteurs.envoisRetrouves === 1 && e.envoisDerniereHeure === 1 && e.echecsSuite === 0, 'audit V2 : « nonce too low » apres une tx minee : suivie (hash local), comptee dans l heure, pas un echec');
  await r.tour();
  vu(r.etat().compteurs.spinsRegles === 1 && r.etat().dernierRegle && r.etat().dernierRegle.hash === t.hash, 'son recu est lu : 1 spin regle, note');
  /* la tx est connue du noeud (en attente) : suivie aussi */
  const chb = chaine(); chb.spin(1, chb.tete - 10, H5);
  chb.envoiFn = (brut) => { chb.txConnues.set(hashBrut(brut), { hash: hashBrut(brut) }); throw new Error('replacement transaction underpriced'); };
  const rb = regleur(chb).r; const tb = await rb.tour();
  vu(tb.fait === true && rb.etat().compteurs.envoisRefuses === 0, '« replacement underpriced » et la tx signee est connue du noeud : suivie');
  /* ni recu, ni tx, ni nonce consomme : c est un vrai refus */
  const ch2 = chaine(); ch2.spin(1, ch2.tete - 10, H5); ch2.envoiJette = 'replacement transaction underpriced';
  const r2 = regleur(ch2).r; const t2 = await r2.tour();
  vu(t2.fait === false && r2.etat().compteurs.envoisRefuses === 1 && r2.etat().echecsSuite === 1 && r2.etat().enVol === null, '« replacement underpriced » sans tx ni nonce consomme : un echec');
  const lu = ch2.appels.filter(([m]) => m === 'eth_getTransactionReceipt' || m === 'eth_getTransactionByHash' || (m === 'eth_getTransactionCount' && false)).map(([m]) => m);
  vu(lu.includes('eth_getTransactionReceipt') && lu.includes('eth_getTransactionByHash') && ch2.appels.some(([m, p]) => m === 'eth_getTransactionCount' && p[1] === 'latest'), 'avant de conclure : recu, tx et nonce latest lus');
});

/* (10) l audit keeper V3 : un recu qui jette sans fin — la tx est relachee apres inclusionMaxMs, le regleur repart */
await cas('10 audit V3 recu illisible', async () => {
  const ch = chaine(); const vrai = ch.rpc;
  let panne = true; ch.rpc = async (m, p) => { if (panne && m === 'eth_getTransactionReceipt') throw new Error('over rate limit'); return vrai(m, p); };
  const { r, avancer } = regleur(ch);
  ch.spin(401, ch.tete - 5, graineDe(401, (p) => p >= 3));
  const a = await r.tour();
  let id = 401, envois = 0;
  for (let k = 0; k < 30; k++) { ch.tete += 50; avancer(10000); if (k % 3 === 0) ch.spin(++id, ch.tete - 5, graineDe(id, (p) => p >= 3)); const t = await r.tour(); if (t.fait) envois += 1; }
  const e = r.etat();
  vu(a.fait === true && e.etat === 'ON' && e.compteurs.recusIlisibles >= 1 && envois >= 1 && e.echecsSuite === 0, 'audit V3 : 5 min de recus illisibles : la tx est relachee apres 120 s (' + e.compteurs.recusIlisibles + ' fois), ' + envois + ' envoi(s) de plus, aucun echec compte');
});

/* (11) l audit slots-contract : settleMany ne se simule pas (un paiement refuse) — coupe en deux, le fautif ecarte, les autres partent */
await cas('11 lot isole le spin fautif', async () => {
  const ch = chaine();
  for (let id = 1; id <= 4; id++) ch.spin(id, ch.tete - 10 - 3 * id, graineDe(id, (p) => p >= 3));
  ch.estimeFn = (tx) => { if (tx.data.startsWith(SEL_SETTLE_MANY) && ids1(tx.data).includes('3')) throw new Error('execution reverted: TransferFailed()'); };
  const { r } = regleur(ch);
  const envoyes = [];
  for (let k = 0; k < 6; k++) { const t = await r.tour(); if (t.fait) { envoyes.push(t.ids); ch.inclure(t.hash, t.ids); } }
  const e = r.etat();
  vu(JSON.stringify(envoyes) === JSON.stringify([['1', '2'], ['4']]), 'lot [1,2,3,4] dont #3 revert : [1,2] puis [4] partent (' + JSON.stringify(envoyes) + ')');
  vu(e.etat === 'ON' && e.echecsSuite === 0 && e.compteurs.spinsEcartes === 1 && JSON.stringify(e.contrats.slots.ecartes) === '["3"]' && e.compteurs.spinsRegles === 3, '#3 ecarte (dit dans etat()), jamais d arret, 3 spins regles');
  const sims = ch.appels.filter(([m]) => m === 'eth_estimateGas').length;
  vu(sims <= 1 + 2 * 4 + 2, 'simulations bornees (' + sims + ')');
});

/* (12) statut 0 (noeud en retard) : le spin reste suivi et part quand le noeud le voit ; la tete cible + 256 n est jamais envoyee */
await cas('12 statut 0 et tete cible + 256', async () => {
  const ch = chaine(); ch.spin(1, ch.tete - 10, H5); ch.spinLent.add('1');
  const { r } = regleur(ch);
  const t1 = await r.tour();
  ch.spinLent.clear(); ch.tete += 1;
  const t2 = await r.tour();
  vu(t1.fait === false && t2.fait === true && JSON.stringify(t2.ids) === '["1"]', 'statut 0 lu une fois : le spin reste suivi, il part au tour suivant');
  const chA = chaine(); chA.spin(1, chA.tete - 256, H5);
  const rA = regleur(chA).r; const tA = await rA.tour();
  const chB = chaine(); chB.spin(1, chB.tete - 255, H5);
  const rB = regleur(chB).r; const tB = await rB.tour();
  vu(tA.fait === false && chA.envoyes.length === 0 && tB.fait === true, 'tete = cible + 256 : rien envoye (tomberait a + 257) ; tete = cible + 255 : envoye');
});

/* (13) DUELS et ROLLS */
const keeper = (ch, extra = {}) => regleur(ch, { duels: { contrat: D, bloc: 0 }, rolls: { contrat: R }, ...extra });
await cas('13a configuration duels / rolls', async () => {
  /* un duel seul (sans slots) : ON ; sans aucun contrat : OFF */
  vu(creerRegleur({ cle: CLE, contrat: null, duels: { contrat: D }, rpc: chaine().rpc }).etat().etat === 'ON', 'duels seuls : ON');
  vu(creerRegleur({ cle: CLE, contrat: null, duels: { contrat: () => null }, rpc: chaine().rpc }).etat().etat === 'ON', 'fiche des duels pas encore chargee (fonction) : ON, relue a chaque tour');
  vu(creerRegleur({ cle: CLE, contrat: null, rpc: chaine().rpc }).etat().etat === 'OFF', 'aucun contrat : OFF');
});
await cas('13b duels : settle de chaque duel rejoint', async () => {
  /* un duel rejoint dans sa fenetre : settle(id) vers le contrat des duels ; trop tot, hors fenetre, deja regle : jamais */
  const ch = chaine();
  ch.duel(7, ch.tete - 20); ch.duel(8, ch.tete); ch.duel(9, ch.tete - 256); ch.duel(10, ch.tete - 30, 3);
  const { r } = keeper(ch);
  const t = await r.tour();
  vu(t.fait === true && t.cible === 'duels' && JSON.stringify(t.ids) === '["7"]', 'duel #7 (rejoint, dans sa fenetre) : settle ; #8 (tete = cible) trop tot ; #9 (tete = cible + 256) trop tard ; #10 deja regle');
  const attendu = signerEip1559({ chainId: 8453, nonce: 5n, maxPriorityFeePerGas: 1000n, maxFeePerGas: 2n * 1_000_000n + 1000n, gas: 240000n, to: D, value: 0n, data: SEL_SETTLE + u(7) }, CLE);
  vu(ch.envoyes[0] === attendu.brut, 'octets : settle(7) vers le contrat des duels, value 0, chaine 8453');
  ch.inclureDuel(t.hash, 7); ch.tete += 1;
  const t2 = await r.tour();
  const e = r.etat();
  vu(e.contrats.duels.inclus === 1 && e.contrats.duels.regles === 1 && e.contrats.duels.envois >= 1 && t2.cible === 'duels' && JSON.stringify(t2.ids) === '["8"]', 'recu lu (1 duel regle, par contrat) ; tete = cible + 1 : #8 part');
  /* un duel deja regle par son gagnant entre la lecture et la simulation : revert de simulation, pas un echec, rien envoye */
  const ch2 = chaine(); ch2.duel(7, ch2.tete - 20);
  ch2.estimeFn = (tx) => { if (tx.to === D) throw new Error('execution reverted: NotJoined()'); };
  const r2 = keeper(ch2).r; const t3 = await r2.tour();
  vu(t3.fait === false && ch2.envoyes.length === 0 && r2.etat().echecsSuite === 0 && r2.etat().compteurs.simulationsRefusees === 1, 'simulation du settle qui revert : rien envoye, pas un echec');
  /* statut 0 : garde, relu */
  const ch3 = chaine(); ch3.duel(7, ch3.tete - 20, 0);
  const r3 = keeper(ch3).r; const t4 = await r3.tour(); ch3.duelStatut.set('7', 2); const t5 = await r3.tour();
  vu(t4.fait === false && t5.fait === true && t5.cible === 'duels', 'duel au statut 0 (noeud en retard) : garde, regle au tour suivant');
  const ch4 = chaine(); ch4.duel(8, ch4.tete);
  const r4 = keeper(ch4).r; const t6 = await r4.tour();
  vu(t6.fait === false && ch4.envoyes.length === 0 && !ch4.appels.some(([m]) => m === 'eth_estimateGas'), 'duel seul a la tete = cible : ni simule ni envoye (le hash de la cible n est pas encore dans un bloc suivant)');
});
await cas('13c la plus pressee d abord', async () => {
  /* la plus pressee d abord : un duel qui ferme avant le lot des slots part en premier */
  const ch = chaine(); ch.spin(1, ch.tete - 10, H5); ch.duel(7, ch.tete - 200);
  const { r } = keeper(ch);
  const t = await r.tour();
  ch.inclureDuel(t.hash, 7);
  const t2 = await r.tour();
  vu(t.cible === 'duels' && t2.fait === true && t2.cible === 'slots', 'le duel (fin a cible + 256 = tete + 56) part avant le spin (fin tete + 246), puis le spin');
});
await cas('13d rolls : closeDay / drawDay / re-armement', async () => {
  /* ROLLS : jour fini Open -> closeDay ; Armed dans la fenetre -> drawDay ; Armed hors fenetre -> closeDay (re-arme) ; Drawn / 0 acheteur / aujourd hui : rien */
  const ch = chaine();
  ch.aujourdhui = 20000;
  ch.jour(19999, { etat: 0 }); ch.jour(19998, { n: 0, pot: 0n }); ch.jour(19997, { etat: 2, pot: 0n }); ch.jour(20000, { etat: 0 });
  const { r } = keeper(ch, { contrat: null });
  const t = await r.tour();
  vu(t.fait === true && t.cible === 'rolls' && t.quoi === 'closeDay' && JSON.stringify(t.ids) === '["19999"]', 'hier (19999, 3 acheteurs, Open) : closeDay(19999) ; ni aujourd hui, ni un jour sans acheteur, ni un jour tire');
  vu(ch.envoyes[0] === signerEip1559({ chainId: 8453, nonce: 5n, maxPriorityFeePerGas: 1000n, maxFeePerGas: 2n * 1_000_000n + 1000n, gas: 240000n, to: R, value: 0n, data: S_CLOSE + u(19999) }, CLE).brut, 'octets : closeDay(19999) vers le contrat des rolls');
  ch.inclureJour(t.hash, 'closeDay', 19999);
  const tTot = await r.tour();
  vu(tTot.fait === false, 'arme, tete <= cible : rien');
  ch.tete += 3;
  const t2 = await r.tour();
  vu(t2.fait === true && t2.quoi === 'drawDay' && JSON.stringify(t2.ids) === '["19999"]', 'arme, cible < tete <= cible + 255 : drawDay(19999) — le re-armement par un acheteur est neutralise');
  ch.inclureJour(t2.hash, 'drawDay', 19999);
  await r.tour();
  const e = r.etat();
  vu(e.contrats.rolls.inclus === 2 && e.contrats.rolls.joursClos.includes('19999') && e.contrats.rolls.aujourdhui === 20000, 'etat par contrat : 2 tx incluses, 19999 tire');
  /* un tirage arme par un AUTRE (l attaquant), fenetre passee sans tirage : le regleur re-arme puis tire */
  const ch2 = chaine(); ch2.jour(19999, { etat: 1, t: ch2.tete - 256 });
  const r2 = keeper(ch2, { contrat: null }).r; const t3 = await r2.tour();
  vu(t3.fait === true && t3.quoi === 'closeDay', 'arme, tete = cible + 256 (fenetre passee) : closeDay (re-arme)');
  const ch3 = chaine(); ch3.jour(19999, { etat: 1, t: ch3.tete - 255 });
  const r3 = keeper(ch3, { contrat: null }).r; const t4 = await r3.tour();
  vu(t4.fait === true && t4.quoi === 'drawDay', 'arme par un autre, tete = cible + 255 : drawDay (tombe a cible + 256)');
  const n0 = ch.appels.filter(([m, p]) => m === 'eth_call' && p[0].to === R && p[0].data.startsWith(S_BUYERS)).length;
  vu(n0 === BORNES_DEFAUT.joursRecul, 'buyerCount d un jour passe lu UNE fois en 4 tours : ' + n0 + ' lectures = les ' + BORNES_DEFAUT.joursRecul + ' jours de recul');
});
await cas('13e la garde duels / rolls', async () => {
  /* la garde : chaque appel admis vers SON contrat, rien d autre */
  const o = { contrat: C, chainId: 8453, duels: D, rolls: R };
  const passe = (tx) => { try { return verifierEnvoi({ value: 0, chainId: 8453, ...tx }, o); } catch (_) { return null; } };
  vu(passe({ to: D, data: SEL_SETTLE + u(7) }) === 1 && passe({ to: R, data: S_CLOSE + u(19999) }) === 1 && passe({ to: R, data: S_DRAW + u(19999) }) === 1, 'garde : settle(7) aux duels, closeDay / drawDay aux rolls passent');
  for (const [tx, m] of [[{ to: D, data: donneesSettleMany(['1']) }, 'settleMany aux duels'], [{ to: D, data: S_CLOSE + u(1) }, 'closeDay aux duels'], [{ to: R, data: SEL_SETTLE + u(1) }, 'settle aux rolls'],
    [{ to: R, data: S_DRAW + u(2n ** 32n) }, 'drawDay(2^32)'], [{ to: R, data: S_DRAW + u(1) + u(1) }, 'drawDay avec un mot de trop'], [{ to: R, data: selecteur('buyPass()') }, 'buyPass aux rolls'],
    [{ to: R, data: selecteur('setRules(uint64,uint64,uint64,uint64,uint8)') + u(1) }, 'setRules aux rolls'], [{ to: D, data: selecteur('join(uint256,uint8[5])') + u(1) }, 'join aux duels'],
    [{ to: D, data: selecteur('cancel(uint256)') + u(1) }, 'cancel aux duels'], [{ to: D, data: selecteur('refundExpired(uint256)') + u(1) }, 'refundExpired aux duels'],
    [{ to: D, data: SEL_SETTLE + u(7), value: 1 }, 'settle duel avec valeur'], [{ to: R, data: S_CLOSE + u(1), chainId: 1 }, 'closeDay chaine 1'],
    [{ to: '0x' + 'f1'.repeat(20), data: SEL_SETTLE + u(7) }, 'settle a une autre adresse']]) vu(passe(tx) === null, 'garde : ' + m + ' refuse');
  let refuse = false; try { verifierEnvoi({ to: D, value: 0, chainId: 8453, data: SEL_SETTLE + u(7) }, { contrat: C, chainId: 8453 }); } catch (_) { refuse = true; }
  vu(refuse, 'garde : settle vers une adresse de duels NON configuree refuse');
});
await cas('13f cablage du serveur (lecture du source, pas une execution)', async () => {
  const S = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const i = S.indexOf('const regleurSlots = ESSAI_SRV.actif'), appel = S.slice(i, S.indexOf('if (regleurSlots.demarrer())', i));
  vu(i > 0 && /duels: \{ contrat: contratDuelsKeeper, bloc: /.test(appel) && /rolls: \{ contrat: contratRollsFiche \}/.test(appel), 'serveur : le regleur recoit les duels (fiche relue a chaque tour) et les rolls');
  vu(/const contratDuelsKeeper = \(\) => \(DUELS_DEPLOIEMENT && DUELS_DEPLOIEMENT\.chaine === SLOTS_DEPLOIEMENT\.chaine \? contratDuels\(\) : null\);/.test(S)
    && /BLOCKROLLS_DEPLOIEMENT\.chaine === SLOTS_DEPLOIEMENT\.chaine \? String\(BLOCKROLLS_DEPLOIEMENT\.adresse\)\.toLowerCase\(\) : null;/.test(S), 'serveur : duels et rolls seulement sur la chaine des slots');
  vu((S.match(/process\.env\.SLOTS_KEEPER_KEY/g) || []).length === 1 && /slotsRegleur: regleurSlots\.etat\(\),/.test(S), 'serveur : la cle lue UNE fois ; /sante publie etat() (activite par contrat, jamais la cle)');
});
if (TOUT) { console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)'); process.exit(ko ? 1 : 0); }
console.log('ok slots-regleur - ' + n + ' assertions ; NE PROUVE PAS un reglement reel sur Base');
