/* commandes-panel.js — LES COMMANDES QU ON ECRIT AU CERVEAU, et les PRE-COMMANDES qu on touche. Un analyseur, rien d autre.
 *
 * ⛔⛔ POURQUOI (Phil, 2026-10-04 : « apres avoir ecrit la commande le brain s execute ; ajoute les pre-commandes pour savoir le
 *   diriger — swap, send — un bot de trading personnel en actions tokenisees ») : le panneau recoit du TEXTE. Ce module le
 *   transforme en une commande a champs fixes, ou dit pourquoi il ne la comprend pas. ⛔ CE N EST PAS UN MODELE DE LANGAGE : une
 *   petite grammaire, exacte, que ce fichier enumere en entier. Une phrase hors grammaire n est pas « interpretee », elle est
 *   REFUSEE avec les formes acceptees — deviner un montant ou un destinataire serait le pire defaut possible ici.
 * ⛔ IL NE RESOUT RIEN : un symbole reste un symbole, un montant reste le texte tape. C est le panneau qui lit la chaine
 *   (adresse d un symbole, decimales) — une adresse ne se complete jamais, un symbole ambigu se refuse la-bas.
 * ⛔ IL N EXECUTE RIEN : la commande rendue passe ensuite la porte du cerveau, le planificateur, puis le wallet de la personne. */
const NOMBRE = '([0-9]+(?:[.,][0-9]+)?)';
const JETON = '(0x[0-9a-fA-F]{40}|[A-Za-z][A-Za-z0-9.]{0,15})';
const ADRESSE = '(0x[0-9a-fA-F]{40})';
const propre = (t) => String(t || '').replace(/\s+/g, ' ').trim();
const nombre = (s) => String(s).replace(',', '.');

/** Les pre-commandes : un libelle a toucher, et le MODELE qu il ecrit dans le champ (a ajuster avant d envoyer). `ceBlock` : le
 *  modele parle du block affiche (« this »). Chaque modele est une phrase que analyserCommande() accepte — le test le verifie. */
export const PRECOMMANDES = Object.freeze([
  { cle: 'buy_stock', libelle: 'Buy a stock', modele: 'buy NVDAc with 5 USDC' },
  /* 2026-10-04 : le modele etait « sell 0.01 AMDc for USDC ». Au 1er passage sur le planificateur il a rendu REFUSE (« no initialized
   *   pool among the 17 keys read »), aux 2 suivants APPROBATIONS — refus NON reproduit, cause non elucidee. LLYc (pool v4 USDC) a
   *   rendu APPROBATIONS aux 3 passages : une pre-commande doit mener a un plan a chaque fois. */
  { cle: 'sell_stock', libelle: 'Sell a stock', modele: 'sell 0.01 LLYc for USDC' },
  /* 2026-10-10 (QA Grok, 2e passe) : « buy this with … ETH », le « … » SELECTIONNE : la frappe le remplace. Envoye tel quel, refuse.
 * 2026-10-10 (QA de Phil) : la puce pre-remplissait « 0.0005 ETH » — un montant choisi par nous. Le montant est laisse VIDE,
   *   le curseur pose a sa place : la phrase est refusee telle quelle, acceptee une fois le montant tape. */
  { cle: 'buy_block', libelle: 'Buy this block', modele: 'buy this with \u2026 ETH', ceBlock: true, aCompleter: true, curseur: 14, selection: 1, aide: 'Type how much ETH, then send.' },
  { cle: 'sell_block', libelle: 'Sell this block', modele: 'sell 1000 this', ceBlock: true },
  { cle: 'swap', libelle: 'Swap', modele: 'swap 5 USDC to NVDAc' },
  /* ⛔ `aCompleter` : ce modele est volontairement INCOMPLET — le destinataire se colle, il ne se propose jamais par defaut */
  { cle: 'send', libelle: 'Send', modele: 'send 1 USDC to 0x', aCompleter: true },
  { cle: 'show', libelle: 'Show a block', modele: 'show NVDAc' },
  { cle: 'tasks', libelle: 'What can it do?', modele: 'tasks' },
  /* 2026-10-18 (Phil 09:00 : « le brain lui-meme, qui par une commande peut avoir acces au game ») : le Game par le texte. `roll` = le roll
   *   classique (practice sans contrat ; 0,50 USDC par roll et 10 au plus par lot avec le contrat — le wallet signe) ; `game` = l etat du jeu ;
   *   `post task` ouvre le formulaire Post-a-task PRE-REMPLI (rien n est poste par la commande : le formulaire, puis le wallet). */
  { cle: 'game', libelle: 'Game', modele: 'game' },
  { cle: 'roll', libelle: 'Roll', modele: 'roll' },
  { cle: 'roll_x5', libelle: 'Roll ×5', modele: 'roll x5' },
  { cle: 'post_task', libelle: 'Post a task', modele: 'post task 100 10 10' },
  /* 2026-10-18 (Phil : « les brains peuvent se faire des duels ») : `duel` liste les defis ouverts et propose Accept / Challenge — rien ne se
   *   signe par la commande : le wallet signe chaque appel (bcSigner), et sans contrat servi la reponse dit « opens with its contract » */
  { cle: 'duel', libelle: 'Duel', modele: 'duel' },
]);
/* Phil 2026-10-18 : « jouer max 10x en un coup » — la MEME borne que planRolls (blockrolls-plan.js ROLLS_MAX) ; test-commandes-panel l epingle */
export const ROLLS_PAR_COMMANDE_MAX = 10;

export const AIDE_COMMANDES = Object.freeze([
  'buy <token> with <amount> <token>      e.g. buy NVDAc with 5 USDC',
  'sell <amount> <token> [for <token>]    e.g. sell 0.01 LLYc for USDC',
  'swap <amount> <token> to <token>       e.g. swap 5 USDC to NVDAc',
  'send <amount> <token> to <address>     e.g. send 1 USDC to 0x… (the whole address)',
  'show <token>                           e.g. show NVDAc',
  'market · trade · brain · chat          switch the view',
  'tasks                                  what this block’s brain accepts right now',
  'game                                   the Game: your ticket, today’s tickets, the pot, the last rolls',
  'roll · roll x5 · roll x10              the classic roll (0.50 USDC a roll with the contract, 10 at most; practice without it)',
  'post task <reward> <players> <hold>    e.g. post task 100 10 10 — opens Post-a-task filled in (block units)',
  'duel                                   open duels: accept one or open a challenge (winner 90%, reward pool 7%, TokenizedBlock 3%)',
  'A token is ETH, a symbol (USDC, NVDAc…), a whole address, or “this” for the block shown.',
]);

/**
 * @param {string} texte
 * @returns {{ ok:true, commande:object } | { ok:false, pourquoi:string }}
 *   swap  : { type:'swap', de, vers|null, montant }      (montant = le texte du nombre, en unites humaines de `de`)
 *   send  : { type:'send', jeton, montant, destinataire }
 *   select: { type:'select', jeton }
 *   tab   : { type:'show', tab }      tasks : { type:'tasks' }      help : { type:'help' }
 *   game  : { type:'game' }           roll  : { type:'roll', n }  (n = 1..ROLLS_PAR_COMMANDE_MAX ; « roll x11 » est REFUSE, jamais plafonne)
 *   duel  : { type:'duel' }           (« duel » ou « duels »)
 *   post_task : { type:'post_task', reward, players, hold }  (reward / hold = le texte du nombre, en unites humaines du block ; players = entier)
 */
export function analyserCommande(texte) {
  const t = propre(texte);
  if (!t) return { ok: false, pourquoi: 'write a command, or tap one below' };
  if (t.length > 200) return { ok: false, pourquoi: 'that is too long for a command' };
  let m;
  if (/^(help|\?)$/i.test(t)) return { ok: true, commande: { type: 'help' } };
  if (/^(tasks?|what can it do\??)$/i.test(t)) return { ok: true, commande: { type: 'tasks' } };
  if (/^game$/i.test(t)) return { ok: true, commande: { type: 'game' } };
  if (/^duels?$/i.test(t)) return { ok: true, commande: { type: 'duel' } };
  if (/^rolls?\b/i.test(t)) {
    /* roll · roll x5 · roll x 5 · roll 5 · rolls x10 — le nombre est LU, jamais plafonne : « roll x11 » est refuse, pas ramene a 10 */
    const refusRoll = { ok: false, pourquoi: 'roll takes 1 to ' + ROLLS_PAR_COMMANDE_MAX + ' rolls in one go: roll, roll x5, roll x10' };
    if (!(m = /^rolls?(?: ?x ?([0-9]{1,3})| ([0-9]{1,3}))?$/i.exec(t))) return refusRoll;
    const n = m[1] === undefined && m[2] === undefined ? 1 : Number(m[1] !== undefined ? m[1] : m[2]);
    if (!Number.isInteger(n) || n < 1 || n > ROLLS_PAR_COMMANDE_MAX) return refusRoll;
    return { ok: true, commande: { type: 'roll', n } };
  }
  if (/^post task\b/i.test(t)) {
    if ((m = new RegExp('^post task ' + NOMBRE + ' ([0-9]{1,5}) ' + NOMBRE + '$', 'i').exec(t))) {
      const players = Number(m[2]);
      if (players < 1 || players > 10000) return { ok: false, pourquoi: 'post task: 1 to 10 000 players' };
      return { ok: true, commande: { type: 'post_task', reward: nombre(m[1]), players, hold: nombre(m[3]) } };
    }
    return { ok: false, pourquoi: 'post task needs: post task <reward per player> <players> <must hold> — in block units, e.g. post task 100 10 10' };
  }
  if ((m = /^(market|trade|brain|chat)$/i.exec(t))) return { ok: true, commande: { type: 'show', tab: m[1].toLowerCase() } };
  if ((m = new RegExp('^(?:show|open|select) ' + JETON + '$', 'i').exec(t))) return { ok: true, commande: { type: 'select', jeton: m[1] } };
  if ((m = new RegExp('^buy ' + JETON + ' with ' + NOMBRE + ' ' + JETON + '$', 'i').exec(t))) {
    return { ok: true, commande: { type: 'swap', de: m[3], vers: m[1], montant: nombre(m[2]) } };
  }
  if ((m = new RegExp('^sell ' + NOMBRE + ' ' + JETON + '(?: (?:for|to|into) ' + JETON + ')?$', 'i').exec(t))) {
    return { ok: true, commande: { type: 'swap', de: m[2], vers: m[3] || null, montant: nombre(m[1]) } };
  }
  if ((m = new RegExp('^swap ' + NOMBRE + ' ' + JETON + ' (?:to|for|into|->) ' + JETON + '$', 'i').exec(t))) {
    return { ok: true, commande: { type: 'swap', de: m[2], vers: m[3], montant: nombre(m[1]) } };
  }
  if (/^send\b/i.test(t)) {
    if ((m = new RegExp('^send ' + NOMBRE + ' ' + JETON + ' to ' + ADRESSE + '$', 'i').exec(t))) {
      return { ok: true, commande: { type: 'send', jeton: m[2], montant: nombre(m[1]), destinataire: m[3].toLowerCase() } };
    }
    /* ⛔ un destinataire incomplet n est JAMAIS complete : on le dit, on ne devine pas */
    return { ok: false, pourquoi: 'send needs: send <amount> <token> to <the whole address, 0x and 40 characters>' };
  }
  return { ok: false, pourquoi: 'not understood — type “help” to see the commands' };
}

/** Un montant tape (« 0.5 ») -> des unites brutes, ou null s il a plus de decimales que le jeton n en porte, ou vaut 0. */
export function enUnitesBrutes(montant, decimales) {
  const t = nombre(propre(montant));
  if (!/^[0-9]+(\.[0-9]+)?$/.test(t) || !Number.isInteger(decimales) || decimales < 0 || decimales > 36) return null;
  const [e, f = ''] = t.split('.');
  if (f.length > decimales) return null;
  const v = BigInt(e + f.padEnd(decimales, '0'));
  return v > 0n ? v : null;
}
