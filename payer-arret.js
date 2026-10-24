/* payer-arret.js — UN PAIEMENT EN JETON ARRETE EN ROUTE (wallet sans lot atomique : chaque appel signe a la suite).
 * Revue adverse 2026-10-24 (FAIL, D1 HAUT + D2 MOYEN) : une suite « approve jeton -> swap -> approve(routeur, 0) -> approve USDC du jeu ->
 *   l appel du jeu » arretee APRES le swap montrait la phrase des rolls USDC « Stopped after 4 steps went through (you declined — nothing
 *   was sent)… Settle pending rolls » : FAUSSE. L USDC etait dans le wallet, l approbation USDC du jeu restait ouverte, aucun roll n etait
 *   parti. Ici, la phrase est batie par ETAPE ATTEINTE (approve seul / swap fait / remise a 0 faite / approbation du jeu faite / une partie
 *   du jeu), et les approbations encore ouvertes ne sont JAMAIS deduites : elles sont LUES (allowance(joueur, spender)) par l app et dites
 *   avec leur bouton de remise a 0 (un appel approve(spender, 0) chacun).
 * Pur : aucun reseau, rien n est signe ni envoye ici. Les selecteurs sont ecrits en clair (approve, allowance) et prouves par le banc
 *   (test-payer-arret-20261024 : keccak.js selecteur). */

export const SEL_APPROVE = '0x095ea7b3'; /* approve(address,uint256) */
export const SEL_ALLOWANCE = '0xdd62ed3e'; /* allowance(address,address) */
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const motA = (a) => bas(a).slice(2).padStart(64, '0');

/** les approves d un plan (dans l ordre) : [{ i, jeton, spender, montant }] ; montant 0 = une remise a zero */
export function approbationsDuPlan(appels) {
  const out = [];
  (appels || []).forEach((a, i) => {
    const d = bas(a && a.data);
    if (!d.startsWith(SEL_APPROVE) || d.length !== 2 + 8 + 128) return;
    const spender = '0x' + d.slice(10 + 24, 10 + 64);
    if (!ADR.test(bas(a.to)) || !ADR.test(spender)) return;
    out.push({ i, jeton: bas(a.to), spender, montant: BigInt('0x' + d.slice(74, 138)) });
  });
  return out;
}
/** les paires (jeton, spender) qu un arret peut laisser OUVERTES : chaque approve non nul du plan, une fois */
export function paresAVerifier(appels) {
  const vu = new Set(), out = [];
  for (const a of approbationsDuPlan(appels)) {
    if (a.montant === 0n) continue;
    const k = a.jeton + ':' + a.spender;
    if (!vu.has(k)) { vu.add(k); out.push({ jeton: a.jeton, spender: a.spender, montant: a.montant }); }
  }
  return out;
}
/** le role de chaque appel d un plan planPayerEnJeton : jeton -> [approveJeton, swap, reset, approveJeu, jeu…] ; ETH -> [swap, approveJeu, jeu…] */
export function etapesDuPaiement(plan) {
  const appels = (plan && plan.appels) || [], natif = !!(plan && plan.resume && plan.resume.natif === true);
  const avant = natif ? ['swap'] : ['approveJeton', 'swap', 'reset'];
  return appels.map((_, i) => (i < avant.length ? avant[i] : i === avant.length ? 'approveJeu' : 'jeu'));
}
/** l eth_call allowance(proprio, spender) sur `jeton` */
export const appelAllowance = (jeton, proprio, spender) => ({ to: bas(jeton), data: SEL_ALLOWANCE + motA(proprio) + motA(spender) });
/** l appel approve(spender, 0) sur `jeton` — la remise a zero d UNE approbation */
export const appelRemiseAZero = (jeton, spender) => ({ to: bas(jeton), data: SEL_APPROVE + motA(spender) + '0'.repeat(64), value: '0x0' });
/** l USDC que le swap met dans le wallet : la sortie exacte moins ce que sweepTokenWithFee retient (floor(sortie x bps / 10000)) */
export function usdcRecu(resume) {
  const s = BigInt(resume.usdcSortie), f = BigInt(resume.fraisBps || 0);
  return s - (s * f) / 10000n;
}

/* les jeux : le nom de leur(s) appel(s) et de leur unite (pour « 2 of 5 rolls ») */
export const JEUX = Object.freeze({
  roll: { etape: 'the roll', unite: 'roll', pas: 'Not rolled' },
  auto: { etape: 'the rolls', unite: 'roll', pas: 'Not rolled' },
  spin: { etape: 'the spin', unite: 'spin', pas: 'Not spun' },
  pass: { etape: 'the Week pass purchase', unite: 'pass', pas: 'No pass bought' },
});
function raisonArret(r) {
  const e = String((r && r.etat) || '');
  if (e === 'REFUSE_PAR_UTILISATEUR') return 'you declined it in your wallet';
  if (e === 'ANNULE_SUR_CHAINE') return 'it reverted on Base';
  if (e === 'EN_ATTENTE') return 'it was sent but is not confirmed yet (do not send it again; check your wallet)';
  if (e === 'PARTIEL') return 'your wallet applied only part of it';
  return String((r && (r.pourquoi || r.etat)) || 'no answer').replace(/ — nothing was sent$/, '').slice(0, 100);
}

/**
 * Ce qu un envoi a la suite NON confirme a fait, etape par etape.
 * @param {object} p  { plan (planPayerEnJeton), r (envoyerUnParUn : etat, pourquoi, hashes = les envois CONFIRMES), jeu (cle de JEUX) }
 * @returns {{ k, total, etape, swapFait, jeuFait, jeuTotal, finirEnUsdc }}  k = etapes confirmees ; etape = le role de l etape arretee
 */
export function bilanArret({ plan, r, jeu }) {
  const roles = etapesDuPaiement(plan), total = roles.length;
  const k = Math.min(total, Array.isArray(r && r.hashes) ? r.hashes.length : 0);
  const iSwap = roles.indexOf('swap');
  const jeux = roles.map((x, i) => (x === 'jeu' ? i : -1)).filter((i) => i >= 0);
  const swapFait = k > iSwap;
  const jeuFait = jeux.filter((i) => i < k).length;
  return { k, total, etape: k < total ? roles[k] : null, swapFait, jeuFait, jeuTotal: jeux.length, finirEnUsdc: swapFait && jeuFait === 0 && !!JEUX[jeu] };
}

/**
 * LA PHRASE d un arret, par etape atteinte (sans les approbations : celles-la sont LUES puis dites par phraseOuvertes).
 * @param {object} p  { plan, r, jeu, sym, fmtUsdc (brut -> texte) }
 */
export function phraseArret({ plan, r, jeu, sym, fmtUsdc }) {
  const J = JEUX[jeu] || JEUX.roll, b = bilanArret({ plan, r, jeu });
  const nomEtape = {
    approveJeton: 'the ' + sym + ' approval for the swap', swap: 'the swap to USDC', reset: 'the reset of the ' + sym + ' approval to 0',
    approveJeu: 'the USDC approval for the game', jeu: b.jeuTotal > 1 ? J.unite + ' ' + (b.jeuFait + 1) + ' of ' + b.jeuTotal : J.etape,
  }[b.etape] || 'a step';
  const tete = b.etape ? 'Stopped at step ' + (b.k + 1) + ' of ' + b.total + ', ' + nomEtape + ': ' + raisonArret(r) + '.' : 'Stopped: ' + raisonArret(r) + '.';
  let etat;
  if (!b.swapFait) etat = (b.k === 0 ? 'Nothing went through' : 'Only the approval went through') + ': no ' + sym + ' was swapped and nothing was paid to the game.';
  else {
    const recu = fmtUsdc(usdcRecu(plan.resume));
    if (b.jeuFait === 0) etat = 'The swap went through: ' + recu + ' USDC is now in your wallet. Nothing was paid to the game.';
    else etat = 'The swap went through and ' + b.jeuFait + ' of ' + b.jeuTotal + ' ' + J.unite + 's went through — '
      + (jeu === 'spin' ? 'they show here.' : 'they show under “Settle pending rolls”.') + ' The USDC for the other ' + (b.jeuTotal - b.jeuFait) + ' stays in your wallet.';
  }
  return tete + ' ' + etat;
}

/**
 * Les approbations LUES apres l arret. `lues` : [{ jeton, spender, montant: BigInt | null (non lue) }].
 * @param {object} p  { lues, usdc (adresse de l USDC), sym, fmtJeton (brut -> texte), fmtUsdc, routeur, jeu (adresse du contrat du jeu) }
 * @returns {{ texte, ouvertes: [{ jeton, spender, montant, libelle }] }}
 */
export function phraseOuvertes({ lues, usdc, sym, fmtJeton, fmtUsdc, routeur, jeu }) {
  const ouvertes = [], nonLues = (lues || []).filter((x) => x.montant === null || x.montant === undefined);
  for (const x of lues || []) {
    if (x.montant === null || x.montant === undefined || !(BigInt(x.montant) > 0n)) continue;
    const estUsdc = bas(x.jeton) === bas(usdc);
    const qui = bas(x.spender) === bas(routeur) ? 'the swap router' : bas(x.spender) === bas(jeu) ? 'the game' : x.spender.slice(0, 10) + '…';
    ouvertes.push({ jeton: bas(x.jeton), spender: bas(x.spender), montant: BigInt(x.montant), symbole: estUsdc ? 'USDC' : sym,
      quoi: 'your ' + (estUsdc ? 'USDC' : sym) + ' approval to ' + qui + ' (up to ' + (estUsdc ? fmtUsdc(x.montant) + ' USDC' : fmtJeton(x.montant) + ' ' + sym) + ')' });
  }
  const unique = ouvertes.length === 1;
  for (const o of ouvertes) o.libelle = unique ? 'Reset the approval' : 'Reset the ' + o.symbole + ' approval';
  const p = [];
  if (ouvertes.length) p.push('Still open: ' + ouvertes.map((o) => o.quoi).join(' and ') + '. ' + (unique ? 'Reset it to 0 with one call: “Reset the approval”.' : 'Reset each to 0 with one call.'));
  if (nonLues.length) p.push((ouvertes.length ? 'Another approval' : 'Your approvals') + ' could not be read just now — check ' + (nonLues.length === 1 && ouvertes.length ? 'it' : 'them') + ' in your wallet.');
  if (!ouvertes.length && !nonLues.length) p.push('No approval is left open.');
  return { texte: p.join(' '), ouvertes };
}
