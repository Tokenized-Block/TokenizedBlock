/* test-keeper-denim-v2-rolls-20261105.mjs — le REGLEUR etendu pour Denim (2026-11-05, 200 ms/bloc : la fenetre de 256 blocs = ~51 s) :
 *   BlockDuelsV2 (settle d un duel que le REJOIGNANT gagne, sinon settleDefault le donne au createur) et les rolls JOUES de BlockRolls
 *   (settleMany des rolls GAGNANTS dans leur fenetre, sinon ils sont perdus). Une chaine SIMULEE en memoire (aucun reseau) : la tete, les
 *   hashes, les logs Joined / Rolled, les etats duels(id) / rolls(id) / rules(v) / pot(), et l execution de settle / settleMany comme les
 *   contrats (BlockDuelsV2._settle, BlockRolls._settle : scores, prix, plafond du pot). Le banc anvil (banc-keeper-denim-anvil-20261105.mjs)
 *   execute les VRAIS contrats compiles ; ici on prouve la POLITIQUE et la GARDE, et on donne de quoi tuer les mutants (muter-slots-regleur).
 * Usage : node test-keeper-denim-v2-rolls-20261105.mjs   (REGLEUR_MODULE=<copie> : une copie mutee)
 * NE PROUVE PAS : un vrai contrat (voir le banc anvil), Base mainnet, un vrai noeud. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { adresseDe } from './signeur-secp256k1.js';
import { selecteur } from './keccak.js';
import { hashBrut } from './tx-eip1559.js';
const MOD = process.env.REGLEUR_MODULE ? pathToFileURL(process.env.REGLEUR_MODULE).href : new URL('./slots-regleur.js', import.meta.url).href;
const M = await import(MOD);

let n = 0, ko = 0;
const vu = (c, m) => { n++; if (!c) ko++; console.log((c ? 'ok  ' : 'KO  ') + m); };
const CLE = '0x' + '11'.repeat(32);
const REG = adresseDe(CLE).toLowerCase();
const V2 = '0x' + 'd2'.repeat(20), RO = '0x' + 'a0'.repeat(20), AUTRE = '0x' + 'ee'.repeat(20);
const CREA = '0x' + 'c1'.repeat(20), JOIN = '0x' + 'b1'.repeat(20), JOUEUR = '0x' + 'f1'.repeat(20);
const u = (x) => BigInt(x).toString(16).padStart(64, '0');
const ad = (a) => String(a).toLowerCase().slice(2).padStart(64, '0');
const mots = (d) => (String(d).replace(/^0x/, '').slice(8).match(/.{64}/g) || []).map((w) => BigInt('0x' + w));
const S = (sig) => selecteur(sig).toLowerCase();
const hashDuBloc = (b) => '0x' + createHash('sha256').update('bloc ' + b).digest('hex');
const RANGS = [6, 10, 19, 9, 8];
const gagne = (h) => M.faceDuHash(h);
const perd = (h) => M.faceDuHash(h).map((x, i) => (x + 1) % RANGS[i]);
const emb = (g) => M.emballerGuess(g);
const score = (h, gPack) => { const f = M.faceDuHash(h), g = M.deballerGuess(gPack); return g.reduce((s, x, i) => s + (x === f[i] ? 1 : 0), 0); };

/* ---------------------------------------------------------------- la chaine simulee */
function chaine({ tete0 }) {
  const c = { tete: tete0, duels: new Map(), rolls: new Map(), pot: 0n, regles: [5_000000n, 3_000000n, 1_000000n, 500000n, 2n], logs: [], envoyes: [],
    recus: new Map(), txs: new Map(), estime: null, revertRecu: null, trahir: new Set(), pasMine: false, appelsSettle: 0 };
  const bloc = (b) => ({ number: '0x' + b.toString(16), hash: hashDuBloc(b), timestamp: '0x' + (1_800_000_000 + Math.floor(b / 5)).toString(16), baseFeePerGas: '0x5f5e100' });
  /* settle(id) de BlockDuelsV2, a la tete + 1 (le bloc ou la tx serait minee) : rend { gagnant, gain } ou jette (revert) */
  const settleV2 = (id, b, ecrire) => {
    const d = c.duels.get(String(id));
    if (!d || d.statut !== 2) throw Object.assign(new Error('execution reverted: NotJoined'), { data: '0x12345678' });
    if (b <= d.t) throw Object.assign(new Error('execution reverted: TooEarly'), { data: '0x12345678' });
    if (b > d.t + 256) throw Object.assign(new Error('execution reverted: TooLate'), { data: '0x12345678' });
    const h = hashDuBloc(d.t), sA = score(h, d.gA), sB = score(h, d.gB);
    const gagnant = sA === sB ? '0x' + '0'.repeat(40) : sA > sB ? d.createur : d.rejoignant;
    if (ecrire) d.statut = 3;
    return { gagnant: c.trahir.has(String(id)) ? d.createur : gagnant, gain: (d.mise * 2n * 9000n) / 10000n };
  };
  /* settleMany de BlockRolls : un roll non reglable est SAUTE ; chacun paie min(prix, pot) a SON joueur */
  const settleMany = (ids, b, ecrire) => {
    const paye = [];
    let pot = c.pot;
    for (const id of ids) {
      const r = c.rolls.get(String(id));
      if (!r || r.statut !== 1 || b <= r.t || b > r.t + 256) continue;
      const s = score(hashDuBloc(r.t), r.g), [p5, p4, p3, p2, mn] = c.regles;
      let prix = BigInt(s) < mn ? 0n : s === 5 ? p5 : s === 4 ? p4 : s === 3 ? p3 : s === 2 ? p2 : 0n;
      if (prix > pot) prix = pot;
      pot -= prix;
      paye.push({ id: String(id), joueur: r.joueur, prix });
      if (ecrire) r.statut = 2;
    }
    if (ecrire) c.pot = pot;
    return paye;
  };
  const executer = (to, data, b, ecrire) => {
    const d = String(data).toLowerCase();
    if (to === V2 && d.startsWith(S('settle(uint256)'))) return settleV2(mots(d)[0], b, ecrire);
    if (to === RO && d.startsWith(S('settleMany(uint256[])'))) return settleMany(mots(d).slice(2), b, ecrire);
    throw Object.assign(new Error('execution reverted: unknown'), { data: '0x12345678' });
  };
  c.rpc = async (m, p) => {
    if (m === 'eth_chainId') return '0x2105';
    if (m === 'eth_blockNumber') return '0x' + c.tete.toString(16);
    if (m === 'eth_getBlockByNumber') { const b = p[0] === 'latest' ? c.tete : parseInt(p[0], 16); return b <= c.tete ? bloc(b) : null; }
    if (m === 'eth_maxPriorityFeePerGas') return '0x0';
    if (m === 'eth_getTransactionCount') return '0x' + c.envoyes.length.toString(16);
    if (m === 'eth_getLogs') {
      const f = p[0], de = parseInt(f.fromBlock, 16), a = parseInt(f.toBlock, 16);
      return c.logs.filter((l) => l.address === f.address && l.topics[0] === f.topics[0] && l.bloc >= de && l.bloc <= a);
    }
    if (m === 'eth_call') {
      const { to, data } = p[0], d = String(data).toLowerCase(), id = mots(d)[0];
      if (to === V2 && d.startsWith(S('duels(uint256)'))) {
        const x = c.duels.get(String(id));
        if (!x) return '0x' + u(0).repeat(9);
        return '0x' + [ad(x.createur), u(9e9), u(x.statut), u(x.gA), ad(x.rejoignant), u(x.t), u(x.gB), ad(AUTRE), u(x.mise)].join('');
      }
      if (to === RO && d.startsWith(S('rolls(uint256)'))) {
        const r = c.rolls.get(String(id));
        if (!r) return '0x' + u(0).repeat(5);
        return '0x' + [ad(r.joueur), u(r.t), u(r.statut), u(r.g), u(1)].join('');
      }
      if (to === RO && d.startsWith(S('rules(uint16)'))) return '0x' + c.regles.map(u).join('');
      if (to === RO && d.startsWith(S('pot()'))) return '0x' + u(c.pot);
      if (to === V2 && d.startsWith(S('settle(uint256)'))) { c.appelsSettle += 1; const r = executer(to, d, c.tete, false); return '0x' + ad(r.gagnant) + u(r.gain); }
      throw new Error('eth_call not simulated: ' + d.slice(0, 10));
    }
    if (m === 'eth_estimateGas') { executer(p[0].to, p[0].data, c.tete + 1, false); c.estime = { to: p[0].to, data: String(p[0].data).toLowerCase() }; return '0x30000'; }
    if (m === 'eth_sendRawTransaction') {
      /* le hash = keccak de la tx brute (celui que le regleur calcule et suit) ; minee au bloc tete + 1, executee a la lecture du recu */
      const h = hashBrut(p[0]);
      c.envoyes.push({ ...c.estime, tete: c.tete });
      c.txs.set(h, { e: c.estime, b: c.tete + 1, revert: c.revertRecu });
      c.revertRecu = null;
      return h;
    }
    if (m === 'eth_getTransactionReceipt') {
      if (c.recus.has(p[0])) return c.recus.get(p[0]);
      const x = c.txs.get(p[0]);
      if (!x || c.pasMine) return null;
      let rc;
      if (x.revert) { x.revert(x); rc = { status: '0x0', blockNumber: '0x' + x.b.toString(16), logs: [] }; }
      else {
        const r = executer(x.e.to, x.e.data, x.b, true);
        const logs = Array.isArray(r) ? r.filter((y) => y.prix >= 0n).map((y) => ({ address: RO, topics: [M.TOPIC_ROLL_SETTLED, '0x' + u(y.id), '0x' + ad(y.joueur)], data: '0x' }))
          : [{ address: V2, topics: [M.TOPIC_DUEL_SETTLED, '0x' + u(mots(x.e.data)[0])], data: '0x' }];
        rc = { status: '0x1', blockNumber: '0x' + x.b.toString(16), logs };
        if (Array.isArray(r)) c.paye = (c.paye || []).concat(r);
      }
      c.recus.set(p[0], rc);
      return rc;
    }
    throw new Error('rpc not simulated: ' + m);
  };
  return c;
}
const TJ = M.TOPIC_JOINED, TR = M.TOPIC_ROLLED;
function joindre(c, id, t, gA, gB, { createur = CREA, rejoignant = JOIN, mise = 1_000000n } = {}) {
  c.duels.set(String(id), { createur, rejoignant, t, gA: emb(gA), gB: emb(gB), statut: 2, mise });
  c.logs.push({ address: V2, bloc: t - 2, topics: [TJ, '0x' + u(id), '0x' + ad(rejoignant)], data: '0x' + gB.map(u).join('') + u(t) });
}
function roller(c, id, t, g, { joueur = JOUEUR } = {}) {
  c.rolls.set(String(id), { joueur, t, g: emb(g), statut: 1 });
  c.logs.push({ address: RO, bloc: t - 2, topics: [TR, '0x' + u(id), '0x' + ad(joueur)], data: '0x' + g.map(u).join('') + [u(t), u(0), u(250000), u(250000)].join('') });
}
const regleur = (c, x) => M.creerRegleur({ cle: CLE, contrat: null, chainId: 8453, rpc: c.rpc, journal: () => {}, msParBloc: 200, ...x });
/* les tours a CETTE tete, comme la boucle du serveur : tant qu un tour envoie, le suivant lit son recu (inclus a tete + 1) et peut en
 *   envoyer une autre ; rend les envois */
async function tours(r, c) {
  const faits = [];
  for (let k = 0; k < 15; k++) { const t = await r.tour(); if (!t.fait) break; faits.push({ ...t, tete: c.tete }); }
  return faits;
}

/* ================================================================ 1. la garde (verifierEnvoi), executee */
{
  const ok = { chainId: 8453n, value: 0n };
  const garde = (tx) => { try { return M.verifierEnvoi({ ...ok, ...tx }, { contrat: null, chainId: 8453, duels: null, rolls: RO, duelsV2: V2 }); } catch (e) { return e; } };
  const lot = (k) => S('settleMany(uint256[])') + u(32) + u(k) + Array.from({ length: k }, (_, i) => u(i + 1)).join('');
  vu(garde({ to: V2, data: S('settle(uint256)') + u(7) }) === 1, 'garde : settle(uint256) vers BlockDuelsV2 admis');
  vu(garde({ to: V2, data: S('settleDefault(uint256)') + u(7) }) instanceof Error, 'garde : settleDefault vers BlockDuelsV2 REFUSE (le regleur ne donne jamais un duel au createur)');
  vu(garde({ to: V2, data: S('refundExpired(uint256)') + u(7) }) instanceof Error, 'garde : refundExpired vers BlockDuelsV2 REFUSE');
  vu(garde({ to: V2, data: S('settle(uint256)') + u(7) + u(8) }) instanceof Error, 'garde : settle avec un mot de trop REFUSE (v2)');
  vu(garde({ to: RO, data: lot(10) }) === 10, 'garde : settleMany de 10 rolls vers BlockRolls admis (rend 10)');
  vu(garde({ to: RO, data: lot(11) }) instanceof Error, 'garde : 11 rolls dans une tx REFUSE');
  vu(garde({ to: RO, data: S('settleMany(uint256[])') + u(64) + u(1) + u(1) }) instanceof Error, 'garde : settleMany non canonique (offset 64) REFUSE');
  vu(garde({ to: RO, data: S('settleMany(uint256[])') + u(32) + u(2) + u(1) }) instanceof Error, 'garde : settleMany longueur fausse REFUSE');
  vu(garde({ to: RO, data: S('settleMany(uint256[])') + u(32) + u(0) }) instanceof Error, 'garde : settleMany vide REFUSE');
  vu(garde({ to: RO, data: S('expire(uint256)') + u(1) }) instanceof Error, 'garde : expire vers BlockRolls REFUSE');
  vu(garde({ to: RO, data: S('settle(uint256)') + u(1) }) instanceof Error, 'garde : settle(uint256) seul vers BlockRolls REFUSE (seul settleMany)');
  vu(garde({ to: RO, data: S('fund(uint256)') + u(1) }) instanceof Error, 'garde : fund vers BlockRolls REFUSE');
  vu(garde({ to: RO, data: S('closeDay(uint32)') + u(5) }) === 1, 'garde : closeDay toujours admis (inchange)');
  vu(garde({ to: AUTRE, data: S('settle(uint256)') + u(7) }) instanceof Error, 'garde : settle vers une autre adresse REFUSE');
  vu(garde({ to: V2, data: S('settle(uint256)') + u(7), value: 1n }) instanceof Error, 'garde : valeur non nulle REFUSEE (v2)');
  vu(garde({ to: V2, data: S('settle(uint256)') + u(7), chainId: 1n }) instanceof Error, 'garde : autre chaine REFUSEE (v2)');
  let sansV2 = null; try { M.verifierEnvoi({ ...ok, to: V2, data: S('settle(uint256)') + u(7) }, { contrat: null, chainId: 8453, rolls: RO }); } catch (e) { sansV2 = e; }
  vu(sansV2 instanceof Error, 'garde : sans duelsV2 donne, un settle vers son adresse est REFUSE (destination inconnue)');
}

/* ================================================================ 2. BlockDuelsV2 : seul le rejoignant gagnant est regle, pres de la fin */
{
  const T = 10_000;
  const c = chaine({ tete0: T + 1 });
  const h = hashDuBloc(T);
  joindre(c, 1, T, perd(h), gagne(h)); /* le rejoignant gagne (5 contre 0) */
  joindre(c, 2, T, gagne(h), perd(h)); /* le createur gagne : settleDefault paie la meme chose -> jamais envoye */
  joindre(c, 3, T, perd(h), perd(h)); /* egalite : la regle de Phil (au createur par defaut) -> jamais envoye */
  joindre(c, 4, T, perd(h), gagne(h)); c.trahir.add('4'); /* le CONTRAT (eth_call settle) nomme le createur : jamais envoye */
  const hV = hashDuBloc(T - 400);
  joindre(c, 5, T - 400, perd(hV), gagne(hV)); /* rejoignant gagnant, hors fenetre : jamais envoye */
  joindre(c, 6, T, perd(h), gagne(h), { rejoignant: REG }); /* le rejoignant EST le regleur : jamais envoye */
  const r = regleur(c, { duelsV2: { contrat: V2, bloc: 1 } });
  const marge = r.etat().bornes.margeFinDuelBlocs;
  vu(marge === 77, 'marge de fin a 200 ms/bloc : ' + marge + ' blocs (3 tours de 5,12 s ; >= 64)');
  const envois = [];
  for (c.tete = T + 1; c.tete <= T + 255; c.tete += 3) envois.push(...await tours(r, c));
  const e = r.etat();
  vu(envois.length === 1 && envois[0].cible === 'duelsV2' && envois[0].ids[0] === '1' && envois[0].quoi === 'settle', 'un seul envoi : settle(#1), le duel que le rejoignant gagne (' + JSON.stringify(envois.map((x) => x.cible + ':' + x.ids.join(','))) + ')');
  vu(envois.length === 1 && envois[0].tete + 1 >= T + 256 - marge && envois[0].tete + 1 <= T + 256, 'envoye PRES DE LA FIN (tete ' + (envois[0] && envois[0].tete - T) + ' apres la cible ; marge ' + marge + ') et dans la fenetre');
  vu(c.envoyes.every((x) => x.to === V2 && x.data === S('settle(uint256)') + u(1)), 'la tx : to = BlockDuelsV2, data = settle(1) — jamais settleDefault');
  vu(c.duels.get('1').statut === 3 && c.duels.get('2').statut === 2 && c.duels.get('3').statut === 2 && c.duels.get('4').statut === 2 && c.duels.get('6').statut === 2, '#1 Settled ; #2 (createur), #3 (egalite), #4 (contrat en desaccord), #6 (rejoignant = regleur) jamais touches');
  vu(e.contrats.duelsV2.inclus === 1 && e.contrats.duelsV2.regles === 1 && e.contrats.duelsV2.createursGagnants === 1 && e.contrats.duelsV2.egalites === 1, 'etat().contrats.duelsV2 : 1 inclus, 1 regle, 1 createur gagnant, 1 egalite classes (' + JSON.stringify({ i: e.contrats.duelsV2.inclus, c: e.contrats.duelsV2.createursGagnants, eg: e.contrats.duelsV2.egalites }) + ')');
  vu(e.contrats.duelsV2.contrat === V2 && e.contrats.duelsV2.configure === true && typeof e.contrats.duelsV2.lu === 'string' && e.contrats.duelsV2.erreurLecture === null && e.contrats.duelsV2.plafondHeure === 30, 'etat() : contrat, configure, lu, erreurLecture null, plafond 30/h');
  vu(e.echecsSuite === 0 && e.etat === 'ON' && !JSON.stringify(e).includes('11'.repeat(32)), 'ON, 0 echec ; la cle n est pas dans etat()');
}

/* ================================================================ 3. BlockDuelsV2 : un revert mine — explique (deja regle par un autre) ou compte */
{
  const T = 20_000;
  const c = chaine({ tete0: T + 200 });
  const h = hashDuBloc(T);
  joindre(c, 1, T, perd(h), gagne(h));
  joindre(c, 2, T + 30, perd(hashDuBloc(T + 30)), gagne(hashDuBloc(T + 30))); /* presse a partir de T + 209 seulement */
  const r = regleur(c, { duelsV2: { contrat: V2, bloc: 1 } });
  /* 1 : le gagnant regle lui-meme au meme bloc (le statut passe a Settled) -> le revert du regleur est EXPLIQUE */
  c.revertRecu = () => { c.duels.get('1').statut = 3; };
  const t1 = await r.tour(); await r.tour();
  const e1 = r.etat();
  vu(t1.fait && t1.ids[0] === '1' && e1.compteurs.revertsExpliques === 1 && e1.compteurs.reverts === 0 && e1.echecsSuite === 0, 'revert de settle(#1) avec le duel Settled au bloc du recu : EXPLIQUE, pas un echec');
  /* 2 : revert sans raison (le duel reste Joined) -> un ECHEC compte */
  c.tete = T + 212; c.revertRecu = () => {};
  const t2 = await r.tour(); await r.tour();
  const e2 = r.etat();
  vu(t2.fait && t2.ids[0] === '2' && e2.compteurs.reverts === 1 && e2.echecsSuite === 1, 'revert de settle(#2) avec le duel encore Joined : compte comme un echec (' + e2.compteurs.reverts + ')');
}

/* ================================================================ 4. les rolls joues : gagnants dans la fenetre, le pot, le partiel en fin */
{
  const R = 30_000;
  const c = chaine({ tete0: R + 1 });
  c.pot = 6_000000n;
  const h = hashDuBloc(R);
  roller(c, 1, R, gagne(h)); /* 5 sur 5 : 5 USDC, le pot le paie en entier */
  roller(c, 2, R, perd(h)); /* 0 : perdant, jamais envoye */
  roller(c, 3, R, gagne(h)); /* 5 sur 5 : le pot n a plus que 1 USDC -> partiel, seulement en fin de fenetre */
  roller(c, 4, R, gagne(h), { joueur: REG }); /* le joueur EST le regleur : jamais */
  roller(c, 5, R - 400, gagne(hashDuBloc(R - 400))); /* hors fenetre : jamais */
  /* #6 : son LOG dit cible R (dans la fenetre), la CHAINE (rolls(6)) dit R - 400 (hors fenetre) : la chaine fait foi, jamais envoye */
  c.rolls.set('6', { joueur: JOUEUR, t: R - 400, g: emb(gagne(hashDuBloc(R - 400))), statut: 1 });
  c.logs.push({ address: RO, bloc: R - 2, topics: [TR, '0x' + u(6), '0x' + ad(JOUEUR)], data: '0x' + gagne(h).map(u).join('') + [u(R), u(0), u(250000), u(250000)].join('') });
  const r = regleur(c, { rollsJoues: { contrat: RO, bloc: 1 } });
  const marge = r.etat().bornes.margeFinDuelBlocs;
  const envois = [];
  for (; c.tete <= R + 255; c.tete += 3) envois.push(...await tours(r, c));
  const e = r.etat();
  vu(envois.length === 2 && envois[0].cible === 'rollsJoues' && envois[0].quoi === 'settleMany' && JSON.stringify(envois[0].ids) === '["1"]' && envois[0].tete === R + 1, 'premier envoi a cible + 1 : settleMany([1]) — le gagnant que le pot paie en entier (' + JSON.stringify(envois.map((x) => x.ids)) + ')');
  vu(envois.length === 2 && JSON.stringify(envois[1].ids) === '["3"]' && envois[1].tete + 1 >= R + 256 - marge && envois[1].tete + 1 <= R + 256, 'le gagnant que le pot ne paie qu en partie : envoye PRES DE LA FIN seulement (tete +' + (envois[1] && envois[1].tete - R) + ')');
  const paye = c.paye || [];
  vu(paye.length === 2 && paye[0].id === '1' && paye[0].prix === 5_000000n && paye[1].id === '3' && paye[1].prix === 1_000000n && paye.every((x) => x.joueur === JOUEUR), 'paye : #1 5 USDC, #3 1 USDC (le reste du pot), chacun a SON joueur');
  vu(c.rolls.get('2').statut === 1 && c.rolls.get('4').statut === 1 && c.rolls.get('5').statut === 1 && c.rolls.get('6').statut === 1, 'perdant (#2), roll du regleur (#4), hors fenetre (#5), cible de la CHAINE hors fenetre (#6) : jamais regles');
  vu(!c.envoyes.some((x) => mots(x.data).slice(2).some((id) => [2n, 4n, 5n, 6n].includes(id))), 'ni #2, ni #4, ni #5, ni #6 dans aucune tx envoyee');
  vu(c.envoyes.every((x) => x.to === RO && x.data.startsWith(S('settleMany(uint256[])'))), 'chaque tx : to = BlockRolls, settleMany — jamais expire ni settle seul');
  vu(e.contrats.rollsJoues.inclus === 2 && e.contrats.rollsJoues.regles === 2 && e.contrats.rollsJoues.perdants === 1 && e.contrats.rollsJoues.plafondHeure === 60 && e.contrats.rollsJoues.erreurLecture === null, 'etat().contrats.rollsJoues : 2 inclus, 2 regles, 1 perdant, plafond 60/h');
}

/* ================================================================ 5. les rolls joues : 12 gagnants -> 10 puis 2 (la borne par tx) */
{
  const R = 40_000;
  const c = chaine({ tete0: R + 1 });
  c.pot = 1000_000000n;
  const h = hashDuBloc(R);
  for (let i = 1; i <= 12; i++) roller(c, i, R, gagne(h));
  roller(c, 13, R, gagne(h), { joueur: REG }); /* gagnant, mais son joueur EST le regleur : jamais */
  roller(c, 14, R, gagne(h)); c.rolls.get('14').statut = 2; /* gagnant deja regle par son joueur : relu Settled, jamais envoye */
  const r = regleur(c, { rollsJoues: { contrat: RO, bloc: 1 } });
  const envois = [];
  for (let k = 0; k < 4; k++, c.tete += 1) envois.push(...await tours(r, c));
  vu(envois.length === 2 && envois[0].ids.length === 10 && envois[1].ids.length === 2 && [...c.rolls.entries()].every(([id, x]) => x.statut === 2 || id === '13'), '12 gagnants : un lot de 10 puis un de 2 ; tous Settled (' + envois.map((x) => x.ids.join(',')).join(' + ') + ')');
  vu(!envois.some((x) => x.ids.includes('13') || x.ids.includes('14')), 'le roll du regleur (#13) et le roll deja regle (#14) : jamais dans un lot');
}

/* ================================================================ 6. sans la cle : rien (OFF) ; la cle n est jamais dans etat() */
{
  const r = M.creerRegleur({ cle: null, rpc: async () => { throw new Error('no read'); }, duelsV2: { contrat: V2 }, rollsJoues: { contrat: RO } });
  vu(r.etat().etat === 'OFF' && (await r.tour()).fait === false, 'sans SLOTS_KEEPER_KEY : OFF, aucun tour');
}

/* ================================================================ 7. le serveur cable les deux (une LECTURE du source, pas une execution — dit) */
{
  const SRV = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
  const i = SRV.indexOf('const regleurSlots = ESSAI_SRV.actif'), appel = SRV.slice(i, SRV.indexOf('if (regleurSlots.demarrer())', i));
  vu(i > 0 && /duelsV2: \{ contrat: contratDuelsV2Keeper, bloc: /.test(appel) && /joints: \(\) => duelsV2JointsKeeper\(contratDuelsV2Keeper\(\)\)/.test(appel), 'serveur : le regleur recoit BlockDuelsV2 (fiche relue a chaque tour) et la liste par l etat du lecteur v2');
  vu(/rollsJoues: \{ contrat: contratRollsKeeper, bloc: /.test(appel), 'serveur : le regleur recoit les rolls joues (meme adresse que les rolls)');
  vu(/const contratDuelsV2Keeper = \(\) => \(DUELS_V2_DEPLOIEMENT && DUELS_V2_DEPLOIEMENT\.chaine === SLOTS_DEPLOIEMENT\.chaine \? contratDeFicheV2\(DUELS_V2_DEPLOIEMENT\) : null\);/.test(SRV), 'serveur : v2 seulement si la fiche porte adresse ET bloc, sur la chaine des slots');
  vu((SRV.match(/process\.env\.SLOTS_KEEPER_KEY/g) || []).length === 1, 'serveur : SLOTS_KEEPER_KEY lue UNE fois (aucune autre cle)');
}

console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) ; NE PROUVE PAS un vrai contrat (banc anvil), ni Base');
process.exit(ko ? 1 : 0);
