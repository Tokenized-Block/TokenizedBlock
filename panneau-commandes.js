/* panneau-commandes.js — LE PANNEAU DE COMMANDE EN QUATRE GROUPES (Phil, 2026-10-25 : « control panel upgrade — tous les boutons et
 *   l interaction marchent, mais on peut faire mieux »). Pur : aucun DOM, aucun reseau, aucun import.
 *
 * Ce fichier DIT, pour chaque bouton du panneau (vue Chat) :
 *   - son GROUPE et son rang (Talk · Play · Trade · Brain OS, dans cet ordre — decision du lead) ;
 *   - son BADGE : « reads » (rien a signer) ou « you sign » (une signature du wallet suit) ;
 *   - une DESCRIPTION d une ligne (title / aria) ;
 *   - s il peut tourner MAINTENANT, et sinon la raison en une ligne (jamais cache en silence) ;
 *   - l ACTION SUIVANTE qui termine sa reponse (une phrase, au plus un bouton).
 * ⛔ LE BADGE N EST PAS TAPE A LA MAIN SANS CONTROLE : `GESTES` dit, par commande, si elle CONSTRUIT des appels pour le wallet ; le banc
 *   test-panneau-groupes-20261025.mjs relit le code REEL de chaque commande dans app.html (le gestionnaire que le bouton declenche) et
 *   rougit si un badge ne dit pas ce que fait ce code (un mutant qui ecrit « reads » sur une commande qui signe doit le faire rougir).
 *   Regle : une commande dont le gestionnaire construit des appels (un plan, une carte d echange, un envoi) = « you sign » ; une commande
 *   qui lit, et ne propose une signature que par un bouton SUIVANT de sa reponse (Accept d un duel, une rencontre), = « reads ».
 * ⛔ IL N EXECUTE RIEN : app.html lit ces tables ; les gestes restent les siens (memes fonctions, memes appels). */

export const BADGES = Object.freeze({ lit: 'reads', signe: 'you sign' });

/** Les quatre groupes, dans l ordre ; chaque commande est une cle de PRECOMMANDES (commandes-panel.js) ou de PARLER (ci-dessous). */
export const GROUPES = Object.freeze([
  Object.freeze({ cle: 'talk', titre: 'Talk', cmds: Object.freeze(['how', 'would', 'trade_for_me', 'circle']) }),
  Object.freeze({ cle: 'play', titre: 'Play', cmds: Object.freeze(['spin', 'settle_spin', 'roll', 'roll_x5', 'duel', 'post_task', 'game', 'level', 'log']) }),
  Object.freeze({ cle: 'trade', titre: 'Trade', cmds: Object.freeze(['buy_stock', 'sell_stock', 'buy_block', 'sell_block', 'swap', 'send']) }),
  Object.freeze({ cle: 'os', titre: 'Brain OS', cmds: Object.freeze(['safety', 'explain', 'wallet', 'gas', 'show']) }),
]);

/** Les quatre boutons de conversation : peints par app.html (bcPeindreActions, dans cet ordre, ces libelles) — le banc le verifie. */
export const PARLER = Object.freeze([
  Object.freeze({ cle: 'how', libelle: 'How are you? 💬' }),
  Object.freeze({ cle: 'would', libelle: 'What would you do? 🧠' }),
  Object.freeze({ cle: 'trade_for_me', libelle: 'Trade for me 📈' }),
  Object.freeze({ cle: 'circle', libelle: 'Its circle 👥' }),
]);

/** Ce que fait chaque commande : 'lit' | 'signe' | 'contrat' (le roll : signe avec le contrat des rolls servi, sinon practice, rien a signer). */
export const GESTES = Object.freeze({
  how: 'lit', would: 'lit', trade_for_me: 'signe', circle: 'lit',
  spin: 'signe', settle_spin: 'signe', roll: 'contrat', roll_x5: 'contrat', duel: 'lit', post_task: 'lit', game: 'lit', level: 'lit', log: 'lit',
  buy_stock: 'signe', sell_stock: 'signe', buy_block: 'signe', sell_block: 'signe', swap: 'signe', send: 'signe',
  safety: 'lit', explain: 'lit', wallet: 'lit', gas: 'lit', show: 'lit',
});

/** Une ligne par commande : ce qu elle fait, vrai. `roll` depend du contrat servi (deux phrases). */
export const DESCRIPTIONS = Object.freeze({
  how: 'Its brain answers from its mood. Nothing to sign.',
  would: 'Its brain suggests a move from its mood. Nothing to sign.',
  trade_for_me: 'Its brain picks buy or sell from its mood and prepares the trade card. You sign.',
  circle: 'The brains that fire with its own; let two of them meet. Nothing to sign.',
  spin: 'BlockSlots: three Base blocks draw three faces; matching traits win a prize. You sign.',
  settle_spin: 'Settles your spin before its window closes; the prize goes to you. You sign.',
  roll: { contrat: 'Classic roll, paid on its contract. You sign.', practice: 'Classic roll, practice: free, nothing to sign.' },
  roll_x5: { contrat: 'Five classic rolls, paid on their contract. You sign.', practice: 'Five practice rolls: free, nothing to sign.' },
  duel: 'Open duels and yours in play. Accepting one is a next step you sign.',
  post_task: 'Fills the Post-a-task form; you post it there, and sign there.',
  game: 'Your ticket, the pot and the last rolls. Nothing to sign.',
  level: 'Its brain’s level from verified play. Nothing to sign.',
  log: 'What happened in the game today. Nothing to sign.',
  buy_stock: 'Writes a buy of a tokenized stock; the card shows the plan. You sign.',
  sell_stock: 'Writes a sale of a tokenized stock; the card shows the plan. You sign.',
  buy_block: 'Writes a buy of this block; type the ETH, the card shows the plan. You sign.',
  sell_block: 'Writes a sale of this block; the card shows the plan. You sign.',
  swap: 'Writes a swap; the card shows the plan. You sign.',
  send: 'Writes a send; paste the whole address. You sign.',
  safety: 'What is measured on this block: code, mint cap, pool, a round trip. Never a verdict.',
  explain: 'What a transaction did, read from its receipt. Paste the hash.',
  wallet: 'What your wallet holds, read on chain. Nothing to sign.',
  gas: 'The Base fee now, and what a swap or a roll costs. Nothing to sign.',
  show: 'Shows another block in this panel. Nothing to sign.',
});

/** Le groupe d une commande ('talk' | 'play' | 'trade' | 'os'), ou null (hors panneau : « tasks »). */
export function groupeDe(cle) {
  const g = GROUPES.find((x) => x.cmds.includes(cle));
  return g ? g.cle : null;
}
/** Le rang d une commande dans son groupe (0..), ou -1. */
export const rangDe = (cle) => { const g = GROUPES.find((x) => x.cmds.includes(cle)); return g ? g.cmds.indexOf(cle) : -1; };

/** 'lit' | 'signe' d une commande dans l etat donne ({ rollsContrat }) ; null = commande inconnue. */
export function gesteDe(cle, ctx = {}) {
  const g = GESTES[cle];
  if (g === undefined) return null;
  if (g === 'contrat') return ctx.rollsContrat ? 'signe' : 'lit';
  return g;
}
export const badgeDe = (cle, ctx = {}) => { const g = gesteDe(cle, ctx); return g ? BADGES[g] : null; };
export function descriptionDe(cle, ctx = {}) {
  const d = DESCRIPTIONS[cle];
  if (d && typeof d === 'object') return ctx.rollsContrat ? d.contrat : d.practice;
  return d || '';
}

/**
 * Peut-elle tourner maintenant ? { actif, raison, cache }. `raison` (une ligne) quand elle ne peut pas — jamais cachee en silence ;
 *   `cache` seulement pour « Settle my spin » sans spin a toi (decision du lead : montre quand un spin est reglable).
 * ctx : { compte, bloc, slots: { lu, rate (la derniere lecture du panneau a echoue), contrat, enCours, action: { cle, bouton, texte } | null }, duels: { contrat, ouverts } | null }
 */
export function etatCommande(cle, ctx = {}) {
  const oui = { actif: true, raison: '', cache: false };
  const non = (raison) => ({ actif: false, raison, cache: false });
  const s = ctx.slots || {};
  if (cle === 'spin') {
    if (!s.lu) return non(s.rate ? 'The slots could not be read just now.' : 'Reading the slots contract…');
    if (!s.contrat) return non('Spins open with their contract.');
    if (!ctx.compte) return non('Connect a wallet to spin.');
    if (s.enCours) return non('Waiting for your wallet.');
    return oui;
  }
  if (cle === 'settle_spin') {
    const a = s.action || null;
    const reglable = !!a && (a.bouton === 'regler' || a.bouton === 'accepter');
    const enAttente = !!a && (a.cle === 'ATTENDRE' || a.cle === 'ATTENDRE_REGLEUR' || a.cle === 'POSE');
    if (!s.contrat || !ctx.compte || (!reglable && !enAttente)) return { actif: false, raison: '', cache: true };
    if (s.enCours) return non('Waiting for your wallet.');
    if (!reglable) return non(a.cle === 'ATTENDRE_REGLEUR' ? 'Nothing to settle: the server’s keeper settles it.' : 'Nothing to settle yet: its 3 blocks are not in.');
    return oui;
  }
  if (cle === 'duel' && ctx.duels) {
    if (!ctx.duels.contrat) return non('Duels open with their contract.');
    if (!ctx.duels.ouverts) return non('Duels are closed on this contract; yours in play are in the Game tab.');
    return oui;
  }
  if (cle === 'level' && !ctx.compte) return non('Connect a wallet: the level is per wallet.');
  if (cle === 'wallet' && !ctx.compte) return non('Connect a wallet, or type “wallet 0x…”.');
  if ((cle === 'safety' || cle === 'buy_block' || cle === 'sell_block') && !ctx.bloc) return non('Pick a block first.');
  return oui;
}

/**
 * L ACTION SUIVANTE qui termine une reponse : { texte, bouton: { libelle, faire } | null }. `faire` : 'texte:<commande>' (envoyee au Chat),
 *   'parler:<cle>' (le bouton de conversation), 'connecter' (le connecter() de l en-tete), 'regler' | 'accepter' (les boutons de la carte Draws), 'reset' | 'finir' (un paiement en
 *   jeton arrete : les boutons de sa ligne). ⛔ Jamais un bouton sans geste derriere : sans geste, « Nothing to do… ».
 * ctx : { compte, slotsContrat, rollsContrat, reglable: 'regler' | 'accepter' | null, arret: { reset, finir } | null, n (rolls demandes),
 *   phase / conseil (le block montre : bcPhaseDe, conseilDe(...).geste), voisins (les blocks lus pour son cercle) }
 */
export function suiteDe(cle, ctx = {}) {
  const rien = (t = 'Nothing to do.') => ({ texte: t, bouton: null });
  const avec = (texte, libelle, faire) => ({ texte, bouton: { libelle, faire } });
  const regler = () => (ctx.reglable === 'accepter' ? avec('Next: your spin can be settled now — accept what the pot holds.', 'Settle my spin', 'accepter')
    : avec('Next: your spin can be settled now, before its window closes.', 'Settle my spin', 'regler'));
  const jouer = (texte) => (ctx.slotsContrat && ctx.compte ? avec(texte + ' Three Base blocks draw your faces.', 'Spin', 'texte:spin')
    : avec(texte + (ctx.rollsContrat ? ' A roll shows its price before you sign.' : ' A practice roll is free.'), 'Roll', 'texte:roll'));
  if ((cle === 'wallet' || cle === 'level' || cle === 'settle_spin') && !ctx.compte) return avec('Next: connect a wallet.', 'Connect wallet', 'connecter');
  switch (cle) {
    case 'how': return avec('Next: ask what it would do.', 'What would you do?', 'parler:would');
    case 'would': return rien('Nothing to do now: its mood does not call for a move.');
    /* 2026-10-25 (revue) : la phrase disait « check the trade card » meme quand AUCUNE carte n etait preparee (marche non lu, block mort) */
    case 'trade_for_me':
      if (ctx.conseil === 'buy' || ctx.conseil === 'sell_quarter') return rien('Next: check the trade card, then your wallet signs — or leave it.');
      if (ctx.phase === 'NON_LU') return avec('Next: ask again once its market is read.', 'Trade for me', 'parler:trade_for_me');
      if (ctx.phase === 'MORT') return rien('Nothing to do: this block is dead.');
      return rien('Next: pick a side above, or leave it.');
    /* 2026-10-25 (revue) : sans voisin lu, « Nothing to do » contredisait sa reponse (« open the Map once, then ask again ») */
    case 'circle': return ctx.voisins === 0 ? rien('Next: open the Map once, then ask again.') : rien();
    case 'game': return ctx.reglable ? regler() : jouer('Next: play.');
    case 'log': return avec('Next: see your ticket and the pot.', 'Game', 'texte:game');
    case 'level': return ctx.reglable ? regler() : jouer('Next: verified play earns XP.');
    case 'roll': case 'roll_x5': return ctx.rollsContrat ? rien() : avec('Next: roll again — practice, free.', 'Roll again', Number.isInteger(ctx.n) && ctx.n > 1 ? 'texte:roll x' + ctx.n : 'texte:roll');
    case 'duel': return rien();
    case 'post_task': return rien('Next: pick your block in the form, then “Post it” — your wallet signs there.');
    case 'wallet':
      if (ctx.arret && ctx.arret.reset) return avec('Next: a token payment stopped part-way and left an approval open.', 'Reset the approval', 'reset');
      if (ctx.arret && ctx.arret.finir) return avec('Next: a token payment stopped part-way — finish it with USDC.', 'Finish with USDC', 'finir');
      return ctx.reglable ? regler() : rien();
    case 'safety': return rien('Nothing to do: a reading, not a verdict.');
    case 'show': return avec('Next: ask it how it is.', 'How are you?', 'parler:how');
    default: return rien();
  }
}
