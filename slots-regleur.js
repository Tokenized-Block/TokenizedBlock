/* slots-regleur.js — LE REGLEUR DES SLOTS (v4, option 3 de Phil, 2026-10-23) : le serveur regle lui-meme les spins de BlockSlots.
 * Pourquoi : un spin non regle dans sa fenetre (256 blocs, ~51 s a 200 ms/bloc) est PERDU, rien n est rendu. settle / settleMany sont
 * PERMISSIONLESS et paient TOUJOURS le joueur du spin : un regleur ne paie que son gas, il ne touche rien.
 *
 * ⛔ CE QUE CE MODULE FAIT, ET RIEN D AUTRE :
 *   - SANS la variable SLOTS_KEEPER_KEY (le proprietaire cree et approvisionne ce wallet lui-meme ; personne d autre ne voit la cle) : il
 *     ne fait RIEN et le dit (etat OFF, et pourquoi) ; aucune lecture de chaine.
 *   - AVEC : toutes les `intervalleMs` (derive du temps de bloc MESURE : un cinquieme de la fenetre, borne a [2 s, 10 s] — ~10 s a 200 ms
 *     comme a 2 s par bloc), il lit les Spun d une fenetre BORNEE (<= 300 blocs, puis les seuls blocs nouveaux), le statut des spins
 *     reglables, leurs trois hashes et le pot, refait le calcul du contrat (slots-plan.js planReglement : le pot baisse spin apres spin)
 *     et envoie settleMany(ids) pour les spins DANS leur fenetre que le pot paie en ENTIER — du wallet du regleur (gas seulement).
 *   - BORNES (BORNES_DEFAUT, chacune verifiee par test-slots-regleur) : au plus `spinsParTx` spins par tx ; jamais au-dessus de
 *     `maxFeeWei` par unite de gas ; au plus `txParHeure` tx par heure glissante ; au plus `gasMaxParTx` de gas ; une seule tx en vol ;
 *     ARRET apres `echecsMax` echecs de suite (revert, simulation refusee, envoi refuse, tx non incluse) — jusqu au redemarrage.
 *   - ⛔ JAMAIS autre chose que settleMany(uint256[]) / settle(uint256) vers L ADRESSE DU CONTRAT de slots-deploiement.js, value 0, sur la
 *     chaine de la fiche : verifierEnvoi() le controle juste avant CHAQUE signature et jette sinon (rien n est signe).
 *   - ⛔ La cle n est lue que du parametre `cle` (le serveur le prend dans process.env, et nulle part ailleurs) ; elle reste dans la
 *     fermeture ; etat() ne la rend jamais, aucune erreur ne la cite, rien ne la journalise. L ADRESSE du regleur est publique (/sante).
 * NE PROUVE PAS (dit) : un reglement reel sur Base — le contrat n est pas deploye a l ecriture de ce module. */
import * as Slots from './slots-plan.js';
import { selecteur } from './keccak.js';
import { adresseDe } from './signeur-secp256k1.js';
import { signerEip1559 } from './tx-eip1559.js';

export const SEL_SETTLE_MANY = selecteur(Slots.SIG_SETTLE_MANY).toLowerCase();
export const SEL_SETTLE = selecteur(Slots.SIG_SETTLE).toLowerCase();
export const BORNES_DEFAUT = Object.freeze({
  spinsParTx: 10,
  maxFeeWei: 1_000_000_000n, /* 1 gwei : Base tourne d ordinaire bien en dessous ; au-dessus, le regleur attend */
  prioWeiMax: 100_000_000n, /* 0,1 gwei de pourboire au plus */
  txParHeure: 60,
  gasMaxParTx: 3_000_000n,
  echecsMax: 3,
  intervalleMinMs: 2000,
  intervalleMaxMs: 10000,
  reculLogs: 300, /* > 256 + 2 : un spin plus vieux ne se regle plus */
  suivisMax: 200,
  statutsParTour: 30,
  inclusionMaxMs: 120000,
  mesureToutesMs: 600000,
  blocsMesure: Slots.BLOCS_MESURE,
});

/** l intervalle entre deux tours : un cinquieme de la fenetre au temps de bloc MESURE, borne ; sans mesure, la borne haute (10 s) */
export function intervalleDepuisBloc(msParBloc, bornes = BORNES_DEFAUT) {
  if (!(Number(msParBloc) > 0)) return bornes.intervalleMaxMs;
  const v = Math.floor((Slots.secondesFenetre(msParBloc) * 1000) / 5);
  return Math.max(bornes.intervalleMinMs, Math.min(bornes.intervalleMaxMs, v));
}

const bas = (x) => String(x || '').toLowerCase();
const u = (n) => BigInt(n).toString(16).padStart(64, '0');
const motsDe = (data) => (String(data || '').replace(/^0x/, '').match(/.{64}/g) || []).map((w) => BigInt('0x' + w));

/** les donnees de settleMany(ids) (ABI : offset 32, longueur, ids) */
export const donneesSettleMany = (ids) => SEL_SETTLE_MANY + u(32) + u(ids.length) + ids.map((x) => u(x)).join('');

/**
 * ⛔ LA GARDE AVANT CHAQUE SIGNATURE : jette sauf si la tx va au contrat des slots, sans valeur, sur la bonne chaine, et ne porte QUE
 * settleMany(ids) (1..spinsParTx ids, encodage canonique) ou settle(id). Rend le nombre de spins.
 */
export function verifierEnvoi(tx, { contrat, chainId, bornes = BORNES_DEFAUT }) {
  if (!/^0x[0-9a-f]{40}$/.test(bas(contrat))) throw new Error('keeper: no slots contract');
  if (bas(tx.to) !== bas(contrat)) throw new Error('keeper: refused, the destination is not the slots contract');
  if (BigInt(tx.value ?? 0) !== 0n) throw new Error('keeper: refused, a keeper call carries no value');
  if (BigInt(tx.chainId) !== BigInt(chainId)) throw new Error('keeper: refused, wrong chain');
  const d = bas(tx.data);
  if (d.startsWith(SEL_SETTLE) && d.length === 10 + 64) return 1;
  if (!d.startsWith(SEL_SETTLE_MANY)) throw new Error('keeper: refused, only settleMany / settle are ever sent');
  const m = motsDe('0x' + d.slice(10));
  if ((d.length - 10) % 64 !== 0 || m.length < 3 || m[0] !== 32n || m[1] !== BigInt(m.length - 2)) throw new Error('keeper: refused, settleMany data is not canonical');
  const k = m.length - 2;
  if (k < 1 || k > bornes.spinsParTx) throw new Error('keeper: refused, ' + k + ' spins in one transaction (max ' + bornes.spinsParTx + ')');
  return k;
}

/**
 * le regleur. `rpc(methode, params)` -> resultat JSON-RPC (jette sur une erreur) ; `rpcEnvoi` (defaut rpc) sert au SEUL
 * eth_sendRawTransaction. `maintenant` (ms) et `bornes` sont injectables pour les tests.
 */
export function creerRegleur({ cle = null, contrat = null, chainId = 8453, table = null, blocDeploiement = 0, rpc = null, rpcEnvoi = null,
  maintenant = () => Date.now(), bornes: bornesIn = {}, journal = () => {}, desactive = null } = {}) {
  const bornes = { ...BORNES_DEFAUT, ...bornesIn };
  const c = bas(contrat);
  const off = (pourquoi) => ({
    etat: () => ({ etat: 'OFF', pourquoi, adresse: null }),
    tour: async () => ({ fait: false, pourquoi }),
    demarrer: () => false,
    arreter: () => {},
  });
  if (desactive) return off(String(desactive));
  if (!cle) return off('SLOTS_KEEPER_KEY is not set: the server settles nothing (anyone can still settle; prizes always go to the player)');
  if (!/^0x[0-9a-f]{40}$/.test(c)) return off('no slots contract address in slots-deploiement.js');
  if (typeof rpc !== 'function') return off('no RPC reader');
  if (!Array.isArray(table) || table.length !== Slots.MAX_POINTS + 1) return off('no prize table in slots-deploiement.js');
  let adresse;
  try { adresse = adresseDe(cle); } catch (_) { return off('SLOTS_KEEPER_KEY is malformed (its value is never shown)'); }
  const envoi = typeof rpcEnvoi === 'function' ? rpcEnvoi : rpc;
  const tb = table.map((x) => BigInt(x));

  const st = {
    etat: 'ON', adresse, depuis: new Date(maintenant()).toISOString(), msParBloc: null, mesureA: 0, intervalleMs: intervalleDepuisBloc(null, bornes),
    scanne: null, enVol: null, envoisHeure: [], echecsSuite: 0, dernierTour: null, dernierEnvoi: null, dernierRegle: null, erreurs: [],
    compteurs: { tours: 0, envois: 0, spinsEnvoyes: 0, spinsRegles: 0, reverts: 0, simulationsRefusees: 0, envoisRefuses: 0, nonInclus: 0, sautsGas: 0, sautsHeure: 0 },
    arret: null, chaineVue: false,
  };
  const suivis = new Map(); /* id -> { t, player } */
  const hashes = new Map(); /* bloc -> hash */
  let enCours = false, minuteur = null;

  const erreur = (quoi) => {
    const e = { a: new Date(maintenant()).toISOString(), quoi: String(quoi).slice(0, 160) };
    st.erreurs.push(e); while (st.erreurs.length > 10) st.erreurs.shift();
    journal('[slots-keeper] ' + e.quoi);
  };
  const echec = (quoi, compteur) => {
    st.compteurs[compteur] += 1; st.echecsSuite += 1; erreur(quoi);
    if (st.echecsSuite >= bornes.echecsMax) { st.etat = 'ARRETE'; st.arret = { a: new Date(maintenant()).toISOString(), pourquoi: st.echecsSuite + ' failures in a row (last: ' + String(quoi).slice(0, 80) + ') — stopped until restart' }; journal('[slots-keeper] STOPPED: ' + st.arret.pourquoi); }
  };
  const msg = (e) => String((e && e.message) || e).slice(0, 120);
  const entier = (h) => { const v = parseInt(String(h), 16); return Number.isSafeInteger(v) ? v : null; };

  async function suivreInclusion() {
    const v = st.enVol;
    let r = null;
    try { r = await rpc('eth_getTransactionReceipt', [v.hash]); } catch (e) { erreur('receipt not read: ' + msg(e)); return false; }
    if (!r) {
      if (maintenant() - v.a > bornes.inclusionMaxMs) { st.enVol = null; echec('tx ' + v.hash + ' not included after ' + Math.round(bornes.inclusionMaxMs / 1000) + ' s', 'nonInclus'); }
      return false;
    }
    st.enVol = null;
    if (String(r.status) !== '0x1') { echec('tx ' + v.hash + ' reverted', 'reverts'); return true; }
    const regles = Slots.lireSettledTous(r.logs || [], c);
    st.echecsSuite = 0;
    st.compteurs.spinsRegles += regles.length;
    st.dernierRegle = { a: new Date(maintenant()).toISOString(), hash: v.hash, envoyes: v.ids.length, regles: regles.length, paye: regles.reduce((s, d) => s + d.payout, 0n).toString(), bloc: entier(r.blockNumber) };
    for (const d of regles) suivis.delete(String(d.spinId));
    return true;
  }

  async function mesurerBloc(tete) {
    if (maintenant() - st.mesureA < bornes.mesureToutesMs && st.msParBloc !== null) return;
    st.mesureA = maintenant();
    try {
      const n = Math.min(bornes.blocsMesure, tete);
      const [a, b] = await Promise.all([rpc('eth_getBlockByNumber', ['0x' + tete.toString(16), false]), rpc('eth_getBlockByNumber', ['0x' + (tete - n).toString(16), false])]);
      const ms = Slots.msParBlocMesure({ tsTete: entier(a && a.timestamp), tsAvant: entier(b && b.timestamp), n });
      if (ms !== null) { st.msParBloc = ms; st.intervalleMs = intervalleDepuisBloc(ms, bornes); }
    } catch (e) { erreur('block time not measured: ' + msg(e)); }
  }

  async function hashesDe(t) {
    const ns = Slots.blocsDesFaces(t);
    for (const b of ns) {
      if (hashes.has(b)) continue;
      const blk = await rpc('eth_getBlockByNumber', ['0x' + b.toString(16), false]);
      if (blk && /^0x[0-9a-f]{64}$/i.test(String(blk.hash))) hashes.set(b, bas(blk.hash));
    }
    while (hashes.size > 900) hashes.delete(hashes.keys().next().value);
    const h = ns.map((b) => hashes.get(b));
    return h.every(Boolean) ? h : null;
  }

  /** UN tour : suivre la tx en vol, sinon lire, calculer, et envoyer au plus UNE tx. Rend ce qui a ete fait (pour les tests et /sante). */
  async function tour() {
    if (st.etat !== 'ON') return { fait: false, pourquoi: st.arret ? st.arret.pourquoi : st.etat };
    if (enCours) return { fait: false, pourquoi: 'a round is running' };
    enCours = true;
    st.compteurs.tours += 1; st.dernierTour = new Date(maintenant()).toISOString();
    try {
      /* la chaine du noeud = celle de la fiche, verifiee une fois : sinon ARRET (une signature pour une autre chaine ne part jamais) */
      if (!st.chaineVue) {
        const id = await rpc('eth_chainId', []);
        if (BigInt(id) !== BigInt(chainId)) { st.etat = 'ARRETE'; st.arret = { a: new Date(maintenant()).toISOString(), pourquoi: 'the node serves chain ' + BigInt(id) + ', the slots record says ' + chainId + ' — stopped' }; erreur(st.arret.pourquoi); return { fait: false, pourquoi: st.arret.pourquoi }; }
        st.chaineVue = true;
      }
      if (st.enVol) { const fini = await suivreInclusion(); if (!fini || st.etat !== 'ON') return { fait: false, pourquoi: st.enVol ? 'waiting for the transaction in flight' : st.etat }; }
      const tete = entier(await rpc('eth_blockNumber', []));
      if (tete === null) { erreur('head not read'); return { fait: false, pourquoi: 'head not read' }; }
      await mesurerBloc(tete);
      /* les Spun d une fenetre BORNEE : jamais plus de reculLogs blocs, jamais avant le deploiement ; puis les seuls blocs nouveaux (+ 8) */
      const plancher = Math.max(Number(blocDeploiement) || 0, tete - bornes.reculLogs + 1);
      const de = st.scanne === null ? plancher : Math.max(plancher, st.scanne + 1 - 8);
      if (de <= tete) {
        const logs = await rpc('eth_getLogs', [{ address: c, topics: [Slots.TOPIC_SPUN], fromBlock: '0x' + de.toString(16), toBlock: '0x' + tete.toString(16) }]);
        if (!Array.isArray(logs)) throw new Error('getLogs did not return a list');
        for (const s of Slots.lireSpunTous(logs, c)) { const id = String(s.spinId); if (!suivis.has(id)) suivis.set(id, { t: s.targetBlock, player: s.player }); }
        st.scanne = tete;
      }
      /* hors fenetre : perdu, plus rien a faire ; la liste suivie est bornee */
      for (const [id, s] of suivis) if (Slots.etatReglement(s.t, tete).etat === 'PERDU') suivis.delete(id);
      while (suivis.size > bornes.suivisMax) suivis.delete(suivis.keys().next().value);
      const reglables = [...suivis.entries()].filter(([, s]) => Slots.etatReglement(s.t, tete).etat === 'REGLABLE')
        .sort((a, b) => (BigInt(a[0]) < BigInt(b[0]) ? -1 : 1)).slice(0, bornes.statutsParTour);
      if (!reglables.length) return { fait: false, pourquoi: 'no spin to settle' };
      const spins = [];
      for (const [id, s] of reglables) {
        const v = Slots.lireSpin(await rpc('eth_call', [{ to: c, data: Slots.appelSpin(id) }, 'latest']));
        if (!v) continue;
        if (v.status !== 1) { suivis.delete(id); continue; }
        const h = await hashesDe(s.t);
        spins.push({ id, t: s.t, faces: h ? Slots.facesDuSpin(h, BigInt(id)) : null });
      }
      const pot = Slots.lireUint(await rpc('eth_call', [{ to: c, data: Slots.appelPot() }, 'latest']));
      if (pot === null) { erreur('pot not read'); return { fait: false, pourquoi: 'pot not read' }; }
      const plan = Slots.planReglement({ spins, pot, table: tb, tete });
      const ids = plan.lot.slice(0, bornes.spinsParTx);
      if (!ids.length) return { fait: false, pourquoi: plan.courts.length ? 'the pot cannot pay any pending spin in full' : 'no spin to settle', courts: plan.courts.length };
      /* la borne horaire */
      const t0 = maintenant();
      st.envoisHeure = st.envoisHeure.filter((x) => t0 - x < 3600000);
      if (st.envoisHeure.length >= bornes.txParHeure) { st.compteurs.sautsHeure += 1; return { fait: false, pourquoi: 'hourly cap reached (' + bornes.txParHeure + ' tx)' }; }
      /* le prix du gas : base du dernier bloc + pourboire borne ; au-dessus du plafond, on attend */
      const dernier = await rpc('eth_getBlockByNumber', ['latest', false]);
      const base = dernier && dernier.baseFeePerGas ? BigInt(dernier.baseFeePerGas) : null;
      if (base === null) { erreur('base fee not read'); return { fait: false, pourquoi: 'base fee not read' }; }
      let prio = 0n;
      try { prio = BigInt(await rpc('eth_maxPriorityFeePerGas', [])); } catch (_) { prio = 0n; }
      if (prio > bornes.prioWeiMax) prio = bornes.prioWeiMax;
      if (base + prio > bornes.maxFeeWei) { st.compteurs.sautsGas += 1; return { fait: false, pourquoi: 'gas price above the cap (' + (base + prio) + ' > ' + bornes.maxFeeWei + ' wei)' }; }
      const maxFee = 2n * base + prio > bornes.maxFeeWei ? bornes.maxFeeWei : 2n * base + prio;
      const data = donneesSettleMany(ids);
      let estime;
      try { estime = BigInt(await rpc('eth_estimateGas', [{ from: adresse, to: c, data, value: '0x0' }])); }
      catch (e) { echec('simulation refused: ' + msg(e), 'simulationsRefusees'); return { fait: false, pourquoi: 'simulation refused' }; }
      const gas = (estime * 12n) / 10n;
      if (gas > bornes.gasMaxParTx) { erreur('gas ' + gas + ' above the per-tx cap'); return { fait: false, pourquoi: 'gas above the per-tx cap' }; }
      const nonce = BigInt(await rpc('eth_getTransactionCount', [adresse, 'pending']));
      const tx = { chainId, nonce, maxPriorityFeePerGas: prio, maxFeePerGas: maxFee, gas, to: c, value: 0n, data };
      verifierEnvoi(tx, { contrat: c, chainId, bornes }); /* ⛔ jette AVANT la signature si quoi que ce soit n est pas un settle */
      const signe = signerEip1559(tx, cle);
      if (bas(signe.de) !== bas(adresse)) throw new Error('keeper: the signature does not recover the keeper address');
      try {
        const h = await envoi('eth_sendRawTransaction', [signe.brut]);
        if (h && bas(h) !== bas(signe.hash)) erreur('node returned another hash than the signed one');
      } catch (e) {
        if (!/already known|known transaction/i.test(msg(e))) { echec('send refused: ' + msg(e), 'envoisRefuses'); return { fait: false, pourquoi: 'send refused' }; }
      }
      st.enVol = { hash: signe.hash, ids, a: maintenant(), nonce: nonce.toString() };
      st.envoisHeure.push(t0);
      st.compteurs.envois += 1; st.compteurs.spinsEnvoyes += ids.length;
      st.dernierEnvoi = { a: new Date(t0).toISOString(), hash: signe.hash, ids, maxFeeWei: maxFee.toString(), gas: gas.toString() };
      return { fait: true, hash: signe.hash, ids };
    } catch (e) {
      erreur('round failed: ' + msg(e));
      return { fait: false, pourquoi: 'round failed' };
    } finally { enCours = false; }
  }

  return {
    /** l etat PUBLIABLE (/sante) : jamais la cle */
    etat: () => ({
      etat: st.etat, adresse: st.adresse, contrat: c, chaine: chainId, chaineVerifiee: st.chaineVue, depuis: st.depuis, msParBlocMesure: st.msParBloc, intervalleMs: st.intervalleMs,
      fenetreSecondes: st.msParBloc ? Slots.secondesFenetre(st.msParBloc) : null, suivis: suivis.size, enVol: st.enVol ? { hash: st.enVol.hash, ids: st.enVol.ids } : null,
      dernierTour: st.dernierTour, dernierEnvoi: st.dernierEnvoi, dernierRegle: st.dernierRegle, erreurs: st.erreurs.slice(), echecsSuite: st.echecsSuite, arret: st.arret,
      envoisDerniereHeure: st.envoisHeure.filter((x) => maintenant() - x < 3600000).length, compteurs: { ...st.compteurs },
      bornes: { spinsParTx: bornes.spinsParTx, maxFeeWei: String(bornes.maxFeeWei), txParHeure: bornes.txParHeure, gasMaxParTx: String(bornes.gasMaxParTx), echecsMax: bornes.echecsMax },
    }),
    tour,
    /** la boucle : un tour, puis le suivant apres intervalleMs (re-derive a chaque tour) ; unref : ne retient pas le processus */
    demarrer() {
      const boucle = async () => { await tour(); if (st.etat === 'ON') { minuteur = setTimeout(boucle, st.intervalleMs); minuteur.unref?.(); } };
      minuteur = setTimeout(boucle, 5000); minuteur.unref?.();
      return true;
    },
    arreter() { clearTimeout(minuteur); minuteur = null; },
  };
}
