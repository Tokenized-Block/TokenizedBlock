/* brain-jeu.js — « LET THE BRAIN PLAY » (Phil 2026-10-18 : « le brain peut jouer aux jeux s il a des fonds et l autorisation, en UN bouton :
 *   rolls, ticket, missions, creer des missions » ; « revente des skins + encheres que les brains voient et sur lesquelles ils encherissent
 *   si le skin leur plait »).
 * PUR : aucun reseau, aucune cle, aucune horloge (l instant est DONNE). Un etat lu par l app -> AU PLUS UNE proposition :
 *   { kind: ROLL | SETTLE | TAKE_MISSION | POST_MISSION | BID_SKIN | BUY_SKIN | NONE, calls (NON SIGNES), why, costUsdc, cle }.
 * Les appels viennent des modules qui les encodent deja (blockrolls-plan, missions-plan, blockskins) : rien n est re-encode ici.
 * ⛔ LA DOCTRINE DU PANNEAU RESTE : « le brain propose, le wallet signe ». Ce module ne signe rien, n envoie rien ; l app montre la
 *   proposition avec UN bouton « Sign » qui passe par bcSigner — le wallet confirme CHAQUE appel.
 * Ordre fixe (deterministe) :
 *   1. SETTLE d un roll reglable (toujours en premier : un roll non regle dans ses 256 blocs est PERDU), puis d une enchere de skin finie ;
 *   2. TAKE_MISSION : reclamer une mission dont l attestation est en main (gain, 0 USDC) ;
 *   3. ROLL : sur le pass s il est actif (0 USDC), sinon paye — au plus maxRollsPerHour par heure glissante ;
 *   4. BUY_SKIN / BID_SKIN : propositionSkin sur le block du brain, en USDC, au plus maxSkinBidUsdc ;
 *   5. POST_MISSION : poster une mission (recompense en USDC : le budget est en USDC) si aucune des siennes n est ouverte.
 * Bornes : rien sans `authorized === true` ni wallet ; aucune depense au-dela de (budget - deja depense) ni du solde USDC LU (solde non lu
 *   = aucune proposition payante : jamais « probablement assez ») ; une offre de skin jamais au-dessus du plafond de la regle. */
import { planRoll, planRollAvecPass, planSettle, planSettleMany, etatReglement, refusGuess } from './blockrolls-plan.js';
import { planPoster, planReclamer, budgetMission } from './missions-plan.js';
import { propositionSkin, appelApprouver, appelAcheter, appelEncherir, appelRegler } from './blockskins.js';

export const KINDS = Object.freeze(['ROLL', 'SETTLE', 'TAKE_MISSION', 'POST_MISSION', 'BID_SKIN', 'BUY_SKIN', 'NONE']);
export const MAX_ROLLS_HEURE = 60;
export const REGLES_DEFAUT = Object.freeze({ rolls: true, maxRollsPerHour: 6, settle: true, missions: false, postMissions: false, skins: false, maxSkinBidUsdc: '0' });

const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const brut = (x) => { try { const v = BigInt(x); return v >= 0n ? v : null; } catch (_) { return null; } };
const min = (...xs) => xs.reduce((a, x) => (x < a ? x : a));

/** les regles telles que l ecran les donne -> des regles STRICTES : un drapeau n est vrai que s il vaut `true` ; les nombres sont bornes. */
export function normaliserRegles(r = {}) {
  const x = r && typeof r === 'object' ? r : {};
  const h = Number(x.maxRollsPerHour);
  const plafond = brut(x.maxSkinBidUsdc);
  return {
    rolls: x.rolls === true, settle: x.settle === true, missions: x.missions === true, postMissions: x.postMissions === true, skins: x.skins === true,
    maxRollsPerHour: Number.isInteger(h) && h >= 0 ? Math.min(h, MAX_ROLLS_HEURE) : 0,
    maxSkinBidUsdc: plafond === null ? 0n : plafond,
  };
}

/** les appels sous UNE forme pour bcSigner : { to, data, value, nom } */
const forme = (appels) => appels.map((c) => ({ to: bas(c.to), data: c.data, value: c.value || '0x0', nom: c.nom || c.quoi || 'transaction' }));
const proposition = (kind, calls, why, cout, cle) => ({ kind, calls: forme(calls), why, costUsdc: cout.toString(), cle });
const rien = (why) => ({ kind: 'NONE', calls: [], why, costUsdc: '0', cle: null });

/** combien de ROLL ont ete proposes (et signes) dans l heure glissante avant `maintenant` (secondes) */
export function rollsDansLHeure(historique, maintenant) {
  return (Array.isArray(historique) ? historique : []).filter((h) => h && h.kind === 'ROLL' && Number(h.t) > maintenant - 3600 && Number(h.t) <= maintenant).length;
}
const usdcTxt = (v) => { const e = v / 1000000n, f = (v % 1000000n).toString().padStart(6, '0').replace(/0+$/, ''); return e + (f ? '.' + f : '') + ' USDC'; };

/**
 * LA proposition suivante. etat = {
 *   authorized, wallet, now (s), budgetUsdc, spentUsdc, balanceUsdc (null = non lu), rules, history: [{ t, kind }], seen: [cle…],
 *   rolls:    { contract, usdc, rollPrice, guess, pass: { rollsLeft, expiresAt } | null, pot, block (bloc actuel), pending: [{ rollId, targetBlock }] } | null,
 *   missions: { contract, usdc, claimable: [{ id, txHash, held, signature }], post: { cle, params, hold, poolManager } | null, mineOpen } | null,
 *   skins:    { list (decoderPage), block (le block du brain), usdc } | null }
 */
export function prochaineProposition(etat = {}) {
  const e = etat && typeof etat === 'object' ? etat : {};
  if (e.authorized !== true) return rien('The brain is not allowed to play — switch “Let the brain play” on.');
  const moi = bas(e.wallet);
  if (!ADR.test(moi)) return rien('Connect a wallet: the brain only proposes, your wallet signs.');
  const t = Number(e.now);
  if (!Number.isFinite(t) || t <= 0) return rien('No time given — nothing proposed.');
  const regles = normaliserRegles(e.rules);
  const budget = brut(e.budgetUsdc), depense = brut(e.spentUsdc || 0);
  if (budget === null || depense === null) return rien('The budget is not a USDC amount — nothing proposed.');
  const reste = budget > depense ? budget - depense : 0n;
  const solde = e.balanceUsdc === null || e.balanceUsdc === undefined ? null : brut(e.balanceUsdc);
  /* ce que le brain peut payer MAINTENANT : le reste du budget ET le solde LU ; solde non lu = 0 (fail-closed) */
  const payable = solde === null ? 0n : min(reste, solde);
  const vus = new Set((Array.isArray(e.seen) ? e.seen : []).map(String));
  const pourquoiPas = [];

  /* 1. SETTLE — un roll reglable passe AVANT tout : sa fenetre de 256 blocs se ferme, et le gain va toujours au joueur */
  const R = e.rolls && ADR.test(bas(e.rolls.contract)) ? e.rolls : null;
  if (regles.settle && R && R.block !== null && R.block !== undefined && Array.isArray(R.pending)) {
    let reglables = [];
    try {
      reglables = R.pending.filter((p) => p && p.rollId !== undefined && p.targetBlock !== undefined)
        .map((p) => ({ p, e: etatReglement(p.targetBlock, R.block) })).filter((x) => x.e.etat === 'REGLABLE')
        .sort((a, b) => a.e.blocsRestants - b.e.blocsRestants || (BigInt(a.p.rollId) < BigInt(b.p.rollId) ? -1 : 1));
    } catch (_) { reglables = []; }
    if (reglables.length) {
      const ids = reglables.map((x) => String(x.p.rollId));
      const plan = ids.length === 1 ? planSettle({ contrat: R.contract, rollId: ids[0], targetBlock: reglables[0].p.targetBlock, blocActuel: R.block })
        : planSettleMany({ contrat: R.contract, rollIds: ids });
      if (plan.etat === 'PRET') return proposition('SETTLE', plan.appels, 'Reveal ' + (ids.length === 1 ? 'roll #' + ids[0] : ids.length + ' rolls (#' + ids.join(', #') + ')') + ' — '
        + reglables[0].e.blocsRestants + ' block(s) left before it is lost. Settling costs no USDC; any prize goes to your wallet.', 0n, 'SETTLE:' + ids.join(','));
    }
  }
  /* la skin : UNE lecture de propositionSkin, au plafond le plus bas (regle, budget, solde) */
  const S = regles.skins && e.skins && Array.isArray(e.skins.list) && ADR.test(bas(e.skins.usdc)) ? e.skins : null;
  const plafondSkin = min(regles.maxSkinBidUsdc, payable);
  let ps = null;
  if (S) {
    try { ps = propositionSkin({ skins: S.list, moi, block: S.block, maintenant: t, achat: true, devise: bas(S.usdc), parTrade: plafondSkin.toString(), reste: plafondSkin.toString(),
      dejaProposes: new Set([...vus].filter((k) => k.startsWith('SKIN:')).map((k) => k.slice(5))),
      /* le reglement a SA cle (revue adverse 2026-10-18) : une mise du brain ne masque plus le reglement de la meme enchere */
      dejaRegles: new Set([...vus].filter((k) => k.startsWith('SKINREG:')).map((k) => k.slice(8))) }); }
    catch (_) { ps = null; }
  }
  if (ps && ps.genre === 'REGLER') {
    return proposition('SETTLE', [appelRegler(ps.skin.tokenId)], 'The auction of skin #' + ps.skin.tokenId + ' has ended and you are in it — settling hands the skin (or the money) over. No USDC.', 0n, 'SKINREG:' + ps.skin.tokenId);
  }

  /* 2. TAKE_MISSION — une reclamation dont l attestation du verifier est en main */
  const M = e.missions && ADR.test(bas(e.missions.contract)) ? e.missions : null;
  if (regles.missions && M && Array.isArray(M.claimable)) {
    for (const c of M.claimable) {
      if (!c || vus.has('MISSION:' + c.id)) continue;
      try {
        const plan = planReclamer({ contrat: M.contract, taskId: c.id, txHash: c.txHash, held: c.held, signature: c.signature });
        return proposition('TAKE_MISSION', plan.appels, 'Mission #' + c.id + ' is approved for you — claim its reward. No USDC.', 0n, 'MISSION:' + c.id);
      } catch (err) { pourquoiPas.push('mission #' + c.id + ': ' + String((err && err.message) || err).slice(0, 80)); }
    }
  }

  /* 3. ROLL — le pass d abord (0 USDC), sinon paye ; jamais plus de maxRollsPerHour dans l heure */
  if (regles.rolls && R) {
    const faits = rollsDansLHeure(e.history, t);
    if (faits >= regles.maxRollsPerHour) pourquoiPas.push('rolls: ' + faits + ' this hour, the limit is ' + regles.maxRollsPerHour);
    else if (refusGuess(R.guess).length) pourquoiPas.push('rolls: no valid ticket face to guess with');
    else {
      const p = R.pass;
      const passOk = !!p && Number(p.rollsLeft) > 0 && t < Number(p.expiresAt);
      if (passOk) {
        const plan = planRollAvecPass({ contrat: R.contract, guess: R.guess, pass: p, maintenant: t });
        if (plan.etat === 'PRET') return proposition('ROLL', plan.appels, 'Roll on your day pass (' + p.rollsLeft + ' left) with your ticket face — no payment. Block +2 decides.', 0n, 'ROLL:' + t);
      } else {
        const prix = brut(R.rollPrice);
        if (prix === null || prix === 0n) pourquoiPas.push('rolls: the roll price was not read');
        else if (solde === null) pourquoiPas.push('rolls: your USDC balance was not read');
        else if (prix > reste) pourquoiPas.push('rolls: ' + usdcTxt(prix) + ' is above what is left of the budget (' + usdcTxt(reste) + ')');
        else if (prix > solde) pourquoiPas.push('rolls: this wallet holds ' + usdcTxt(solde) + ', a roll is ' + usdcTxt(prix));
        else {
          const plan = planRoll({ contrat: R.contract, usdc: R.usdc, guess: R.guess, rollPrice: prix });
          const pot = brut(R.pot);
          if (plan.etat === 'PRET') return proposition('ROLL', plan.appels, 'Roll for ' + usdcTxt(prix) + ' with your ticket face (half to the pot, half to TokenizedBlock)' + (pot !== null ? ' — pot ' + usdcTxt(pot) : '') + '. Block +2 decides; it counts toward today\'s ticket.', prix, 'ROLL:' + t);
          pourquoiPas.push('rolls: ' + plan.pourquoi);
        }
      }
    }
  }

  /* 4. SKINS — acheter / encherir sur une skin du block du brain, jamais au-dessus du plafond de la regle */
  if (S && ps && (ps.genre === 'ACHETER' || ps.genre === 'ENCHERIR')) {
    const m = BigInt(ps.montant);
    /* deuxieme garde, ici : propositionSkin borne deja, mais la promesse « jamais au-dessus du plafond » est celle de CE module */
    if (m > 0n && m <= regles.maxSkinBidUsdc && m <= reste && solde !== null && m <= solde && bas(ps.skin.devise) === bas(S.usdc)) {
      const id = ps.skin.tokenId;
      const appels = [appelApprouver(S.usdc, m, 'Allow the skins market to take exactly ' + usdcTxt(m)), ps.genre === 'ACHETER' ? appelAcheter(id, S.usdc, m) : appelEncherir(id, S.usdc, m)];
      return proposition(ps.genre === 'ACHETER' ? 'BUY_SKIN' : 'BID_SKIN', appels, (ps.genre === 'ACHETER' ? 'Buy skin #' + id + ' for ' : 'Bid the minimum on skin #' + id + ': ')
        + usdcTxt(m) + ' (your limit ' + usdcTxt(regles.maxSkinBidUsdc) + '). 10 % of a sale goes to TokenizedBlock; an outbid offer is credited back to you.', m, 'SKIN:' + id);
    }
  } else if (regles.skins && !S) pourquoiPas.push('skins: the market was not read');

  /* 5. POST_MISSION — une mission a la fois, recompense en USDC (le budget est en USDC : un autre jeton ne se compare pas) */
  if (regles.postMissions && M && M.post) {
    const P = M.post;
    const cle = 'POST:' + bas(P.params && P.params.rewardToken) + ':' + bas(P.cle && P.cle.currency0) + ':' + bas(P.cle && P.cle.currency1);
    if (Number(M.mineOpen) > 0) pourquoiPas.push('post: one of your missions is still open');
    else if (vus.has(cle)) pourquoiPas.push('post: already proposed');
    else if (!ADR.test(bas(M.usdc)) || bas(P.params && P.params.rewardToken) !== bas(M.usdc)) pourquoiPas.push('post: the brain posts only with a USDC reward (the budget is in USDC)');
    else {
      let cout = null;
      try { cout = budgetMission(P.params, P.hold); } catch (_) { cout = null; }
      if (cout === null) pourquoiPas.push('post: the mission budget could not be computed');
      else if (cout > payable) pourquoiPas.push('post: its escrow ' + usdcTxt(cout) + ' is above what the brain may spend (' + usdcTxt(payable) + ')');
      else {
        const plan = planPoster({ contrat: M.contract, cle: P.cle, params: P.params, hold: P.hold, maintenant: t, poolManager: P.poolManager || null });
        if (plan.etat === 'PRET') return proposition('POST_MISSION', plan.appels, 'Post a mission for your block: escrow ' + usdcTxt(cout) + ' (' + P.params.maxDone + ' × ' + usdcTxt(BigInt(P.params.reward)) + '). Anyone who does it on Base is paid by the contract.', cout, cle);
        pourquoiPas.push('post: ' + plan.pourquoi);
      }
    }
  }
  return rien(pourquoiPas.length ? 'Nothing to play right now — ' + pourquoiPas.join('; ') + '.' : 'Nothing to play right now.');
}
