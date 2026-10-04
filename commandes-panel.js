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
  { cle: 'sell_stock', libelle: 'Sell a stock', modele: 'sell 0.01 AMDc for USDC' },
  { cle: 'buy_block', libelle: 'Buy this block', modele: 'buy this with 0.0005 ETH', ceBlock: true },
  { cle: 'sell_block', libelle: 'Sell this block', modele: 'sell 1000 this', ceBlock: true },
  { cle: 'swap', libelle: 'Swap', modele: 'swap 5 USDC to NVDAc' },
  /* ⛔ `aCompleter` : ce modele est volontairement INCOMPLET — le destinataire se colle, il ne se propose jamais par defaut */
  { cle: 'send', libelle: 'Send', modele: 'send 1 USDC to 0x', aCompleter: true },
  { cle: 'show', libelle: 'Show a block', modele: 'show NVDAc' },
  { cle: 'tasks', libelle: 'What can it do?', modele: 'tasks' },
]);

export const AIDE_COMMANDES = Object.freeze([
  'buy <token> with <amount> <token>      e.g. buy NVDAc with 5 USDC',
  'sell <amount> <token> [for <token>]    e.g. sell 0.01 AMDc for USDC',
  'swap <amount> <token> to <token>       e.g. swap 5 USDC to NVDAc',
  'send <amount> <token> to <address>     e.g. send 1 USDC to 0x… (the whole address)',
  'show <token>                           e.g. show NVDAc',
  'market · trade · brain · chat          switch the view',
  'tasks                                  what this block’s brain accepts right now',
  'A token is ETH, a symbol (USDC, NVDAc…), a whole address, or “this” for the block shown.',
]);

/**
 * @param {string} texte
 * @returns {{ ok:true, commande:object } | { ok:false, pourquoi:string }}
 *   swap  : { type:'swap', de, vers|null, montant }      (montant = le texte du nombre, en unites humaines de `de`)
 *   send  : { type:'send', jeton, montant, destinataire }
 *   select: { type:'select', jeton }
 *   tab   : { type:'show', tab }      tasks : { type:'tasks' }      help : { type:'help' }
 */
export function analyserCommande(texte) {
  const t = propre(texte);
  if (!t) return { ok: false, pourquoi: 'write a command, or tap one below' };
  if (t.length > 200) return { ok: false, pourquoi: 'that is too long for a command' };
  let m;
  if (/^(help|\?)$/i.test(t)) return { ok: true, commande: { type: 'help' } };
  if (/^(tasks?|what can it do\??)$/i.test(t)) return { ok: true, commande: { type: 'tasks' } };
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
