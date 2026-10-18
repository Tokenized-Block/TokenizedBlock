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
  { cle: 'roll', libelle: 'Roll', modele: 'roll' },
  { cle: 'roll_x5', libelle: 'Roll ×5', modele: 'roll x5' },
  { cle: 'post_task', libelle: 'Post a task', modele: 'post task 100 10 10' },
  /* ══ LA GRILLE « BRAIN OS » (2026-10-18, Phil : « copy how Base Rooms did it and rebuild an OS for our brains ») : `os: true` = la MEME boucle
   *   de peinture que les puces (app.html, `for (const p of PRECOMMANDES)`) pose ce bouton dans la grille #bcOs au lieu de la rangee #bcPre ;
   *   le clic ECRIT le modele dans le champ du Chat (bcEcrireModele), comme une puce — aucun second chemin. Les quatre lectures (brain-os.js :
   *   safety, explain, wallet, gas) et les quatre lectures du jeu (game, log, level, duel). ⛔ Rien ici ne signe : ce sont des lectures. */
  { cle: 'safety', libelle: 'Safety', modele: 'safety this', ceBlock: true, os: true },
  /* ⛔ `aCompleter` : le hash se colle (0x + 64 caracteres) — jamais propose par nous */
  { cle: 'explain', libelle: 'Explain a tx', modele: 'explain 0x', aCompleter: true, os: true, aide: 'Paste the transaction hash (0x and 64 characters), then send.' },
  { cle: 'wallet', libelle: 'Wallet', modele: 'wallet', os: true },
  { cle: 'gas', libelle: 'Gas', modele: 'gas', os: true },
  { cle: 'game', libelle: 'Game', modele: 'game', os: true },
  /* 2026-10-18 : le journal du jour (/api/jeu/journal) */
  { cle: 'log', libelle: 'Log', modele: 'log', os: true },
  /* 2026-10-18 : le niveau du brain (XP de gestes verifies par le serveur, /api/jeu/niveau) — une lecture, rien a signer */
  { cle: 'level', libelle: 'Level', modele: 'level', os: true },
  /* 2026-10-18 (Phil : « les brains peuvent se faire des duels ») : `duel` liste les defis ouverts et propose Accept / Challenge — rien ne se
   *   signe par la commande : le wallet signe chaque appel (bcSigner), et sans contrat servi la reponse dit « opens with its contract » */
  { cle: 'duel', libelle: 'Duels', modele: 'duel', os: true },
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
  'log · today                            what happened in the game today (the last 10)',
  'roll · roll x5 · roll x10              the classic roll (0.50 USDC a roll with the contract, 10 at most; practice without it)',
  'post task <reward> <players> <hold>    e.g. post task 100 10 10 — opens Post-a-task filled in (block units)',
  'duel                                   open duels: accept one or open a challenge (winner 90%, reward pool 7%, TokenizedBlock 3%)',
  'level                                  its brain’s level: XP from verified play, and the weekly-draw perk',
  /* 2026-10-18 : le Brain OS — quatre LECTURES (brain-os.js), chaque ligne dit ce qui a ete mesure ou « not read » ; jamais « safe » */
  'safety <token>                         e.g. safety UNIT — what is measured: B20 code, mint cap, its pool, a buy-then-sell round trip. Never a verdict',
  'explain <tx hash>                      what a transaction did: status, fee, transfers, swaps, our hooks and game events; the rest is said unknown',
  'wallet [address]                       what a wallet holds: ETH, USDC, stocks, blocks, today’s ticket, rolls waiting (no address = the connected wallet)',
  'gas                                    Base fee now, and what a swap or a roll costs, from recent real transactions',
  'A token is ETH, a symbol (USDC, NVDAc…), a whole address, or “this” for the block shown.',
]);

/* ══ LA TABLE DES COMMANDES (2026-10-18, palette Ctrl+K) — UNE SEULE, lue par DEUX lecteurs : analyserCommande (le dispatcher du Chat)
 *   la parcourt dans l ordre ; la palette (palette.js, entreesCommandes) en tire sa liste. Une commande ajoutee ici est comprise ET listee ;
 *   retiree, elle disparait des deux — elles ne peuvent pas diverger (test-palette-20261018 le prouve sur une table amputee).
 * Chaque entree : `cle` ; `lire(t)` = la phrase NORMALISEE (espaces reduits) -> null (pas la sienne), { ok:true, commande } ou { ok:false,
 *   pourquoi } (une forme reconnue mais incomplete se REFUSE ici, elle ne glisse pas a l entree suivante) ; `palette` = les lignes montrees
 *   par Ctrl+K, chacune un `modele` (le texte ecrit au Chat), un `nom`, des `mots` ; `ecrire: true` = la ligne ECRIT le modele dans le champ
 *   du Chat, a ajuster avant d envoyer (un montant, un block, une adresse se choisissent — jamais par nous) ; sinon elle l ENVOIE, comme tape.
 * ⛔ L ORDRE COMPTE : c est celui des `if` d avant, inchange (« show NVDAc » avant « buy », « send » refuse avant le message final). */
let m;
/* un modele n est ecrit qu UNE fois : celui de la pre-commande (test-panneau-finitions mute ce texte-la et doit le trouver seul) */
const PRE = Object.fromEntries(PRECOMMANDES.map((p) => [p.cle, p]));
export const COMMANDES = Object.freeze([
  { cle: 'help', lire: (t) => (/^(help|\?)$/i.test(t) ? { ok: true, commande: { type: 'help' } } : null),
    palette: [{ nom: 'Help — every command', modele: 'help', mots: 'commands list ?' }] },
  { cle: 'tasks', lire: (t) => (/^(tasks?|what can it do\??)$/i.test(t) ? { ok: true, commande: { type: 'tasks' } } : null),
    palette: [{ nom: 'What can its brain do?', modele: PRE.tasks.modele, mots: 'tasks accepts refuses brain' }] },
  { cle: 'game', lire: (t) => (/^game$/i.test(t) ? { ok: true, commande: { type: 'game' } } : null),
    palette: [{ nom: 'Game — my ticket, the pot, last rolls', modele: PRE.game.modele, mots: 'ticket draw pot rolls today status' }] },
  /* 2026-10-18 (Phil) : les duels — « duel » ou « duels » ; la commande dit elle-meme si le contrat n est pas ouvert */
  { cle: 'duel', lire: (t) => (/^duels?$/i.test(t) ? { ok: true, commande: { type: 'duel' } } : null),
    palette: [{ nom: 'Duels — open challenges, accept or settle', modele: 'duel', mots: 'duel challenge stake versus fight' }] },
  /* 2026-10-18 : le journal du jour (/api/jeu/journal) — « log » ou « today » */
  { cle: 'log', lire: (t) => (/^(log|today)$/i.test(t) ? { ok: true, commande: { type: 'log' } } : null),
    palette: [{ nom: 'Today — what the brains did today', modele: 'log', mots: 'log journal today events feed' }] },
  /* 2026-10-18 : le niveau du brain (/api/jeu/niveau) — « level », « lvl » ou « xp » */
  { cle: 'level', lire: (t) => (/^(level|lvl|xp)$/i.test(t) ? { ok: true, commande: { type: 'level' } } : null),
    palette: [{ nom: 'Level — its brain’s XP and weekly perk', modele: 'level', mots: 'level xp rank perk brain' }] },
  /* ══ LE BRAIN OS (2026-10-18) — quatre LECTURES de brain-os.js. STRICT : un jeton = un symbole, une adresse entiere ou « this » ; un hash =
   *   0x + 64 hex ; une adresse = 0x + 40 hex. Une forme reconnue mais incomplete se REFUSE ici avec la forme attendue — rien n est complete. */
  { cle: 'safety', lire: (t) => {
    if (!/^safety\b/i.test(t)) return null;
    if ((m = new RegExp('^safety ' + JETON + '$', 'i').exec(t))) return { ok: true, commande: { type: 'safety', jeton: m[1] } };
    return { ok: false, pourquoi: 'safety needs: safety <token> — a symbol (UNIT, NVDAc…), a whole address, or “this” for the block shown' };
  }, palette: [{ nom: 'Safety — what is measured on this block', modele: PRE.safety.modele, mots: 'safety check rug honeypot tax round trip sell back token', ecrire: true }] },
  { cle: 'explain', lire: (t) => {
    if (!/^explain\b/i.test(t)) return null;
    if ((m = /^explain (0x[0-9a-fA-F]{64})$/i.exec(t))) return { ok: true, commande: { type: 'explain', hash: m[1].toLowerCase() } };
    /* ⛔ un hash tronque n est JAMAIS complete : on le dit */
    return { ok: false, pourquoi: 'explain needs: explain <transaction hash — 0x and 64 characters, whole>' };
  }, palette: [{ nom: 'Explain a transaction', modele: PRE.explain.modele, mots: 'tx hash receipt decode what happened transfers swap', ecrire: true }] },
  { cle: 'wallet', lire: (t) => {
    if (!/^wallet\b/i.test(t)) return null;
    if (/^wallet$/i.test(t)) return { ok: true, commande: { type: 'wallet', adresse: null } };
    if ((m = new RegExp('^wallet ' + ADRESSE + '$', 'i').exec(t))) return { ok: true, commande: { type: 'wallet', adresse: m[1].toLowerCase() } };
    return { ok: false, pourquoi: 'wallet takes nothing (the connected wallet) or a whole address, 0x and 40 characters' };
  }, palette: [{ nom: 'My wallet — what it holds, read on chain', modele: PRE.wallet.modele, mots: 'balance holdings eth usdc stocks blocks rolls ticket' }] },
  { cle: 'gas', lire: (t) => (/^gas$/i.test(t) ? { ok: true, commande: { type: 'gas' } } : null),
    palette: [{ nom: 'Gas — Base fee, the cost of a swap and a roll', modele: PRE.gas.modele, mots: 'gas fee gwei price cost cheap' }] },
  { cle: 'roll', lire: (t) => {
    if (!/^rolls?\b/i.test(t)) return null;
    /* roll · roll x5 · roll x 5 · roll 5 · rolls x10 — le nombre est LU, jamais plafonne : « roll x11 » est refuse, pas ramene a 10 */
    const refusRoll = { ok: false, pourquoi: 'roll takes 1 to ' + ROLLS_PAR_COMMANDE_MAX + ' rolls in one go: roll, roll x5, roll x10' };
    if (!(m = /^rolls?(?: ?x ?([0-9]{1,3})| ([0-9]{1,3}))?$/i.exec(t))) return refusRoll;
    const n = m[1] === undefined && m[2] === undefined ? 1 : Number(m[1] !== undefined ? m[1] : m[2]);
    if (!Number.isInteger(n) || n < 1 || n > ROLLS_PAR_COMMANDE_MAX) return refusRoll;
    return { ok: true, commande: { type: 'roll', n } };
  }, palette: [
    { nom: 'Roll', modele: PRE.roll.modele, mots: 'dice play practice' },
    { nom: 'Roll ×5', modele: PRE.roll_x5.modele, mots: 'dice play five' },
    { nom: 'Roll ×10', modele: 'roll x10', mots: 'dice play ten' },
  ] },
  { cle: 'post_task', lire: (t) => {
    if (!/^post task\b/i.test(t)) return null;
    if ((m = new RegExp('^post task ' + NOMBRE + ' ([0-9]{1,5}) ' + NOMBRE + '$', 'i').exec(t))) {
      const players = Number(m[2]);
      if (players < 1 || players > 10000) return { ok: false, pourquoi: 'post task: 1 to 10 000 players' };
      return { ok: true, commande: { type: 'post_task', reward: nombre(m[1]), players, hold: nombre(m[3]) } };
    }
    return { ok: false, pourquoi: 'post task needs: post task <reward per player> <players> <must hold> — in block units, e.g. post task 100 10 10' };
  }, palette: [{ nom: 'Post a task', modele: PRE.post_task.modele, mots: 'mission reward players hold board', ecrire: true }] },
  { cle: 'view', lire: (t) => ((m = /^(market|trade|brain|chat)$/i.exec(t)) ? { ok: true, commande: { type: 'show', tab: m[1].toLowerCase() } } : null),
    palette: [
      { nom: 'Panel · Chat view', modele: 'chat', mots: 'panel view talk' },
      { nom: 'Panel · Market view', modele: 'market', mots: 'panel view live activity' },
      { nom: 'Panel · Trade view', modele: 'trade', mots: 'panel view ticket holdings' },
      { nom: 'Panel · Skin view', modele: 'brain', mots: 'panel view brain cube' },
    ] },
  { cle: 'select', lire: (t) => ((m = new RegExp('^(?:show|open|select) ' + JETON + '$', 'i').exec(t)) ? { ok: true, commande: { type: 'select', jeton: m[1] } } : null),
    palette: [{ nom: 'Show a block', modele: PRE.show.modele, mots: 'open select find block stock', ecrire: true }] },
  { cle: 'buy', lire: (t) => ((m = new RegExp('^buy ' + JETON + ' with ' + NOMBRE + ' ' + JETON + '$', 'i').exec(t))
    ? { ok: true, commande: { type: 'swap', de: m[3], vers: m[1], montant: nombre(m[2]) } } : null),
    palette: [{ nom: 'Buy', modele: PRE.buy_stock.modele, mots: 'purchase stock block trade', ecrire: true }] },
  { cle: 'sell', lire: (t) => ((m = new RegExp('^sell ' + NOMBRE + ' ' + JETON + '(?: (?:for|to|into) ' + JETON + ')?$', 'i').exec(t))
    ? { ok: true, commande: { type: 'swap', de: m[2], vers: m[3] || null, montant: nombre(m[1]) } } : null),
    palette: [{ nom: 'Sell', modele: PRE.sell_stock.modele, mots: 'stock block trade', ecrire: true }] },
  { cle: 'swap', lire: (t) => ((m = new RegExp('^swap ' + NOMBRE + ' ' + JETON + ' (?:to|for|into|->) ' + JETON + '$', 'i').exec(t))
    ? { ok: true, commande: { type: 'swap', de: m[2], vers: m[3], montant: nombre(m[1]) } } : null),
    palette: [{ nom: 'Swap', modele: PRE.swap.modele, mots: 'exchange convert trade', ecrire: true }] },
  { cle: 'send', lire: (t) => {
    if (!/^send\b/i.test(t)) return null;
    if ((m = new RegExp('^send ' + NOMBRE + ' ' + JETON + ' to ' + ADRESSE + '$', 'i').exec(t))) {
      return { ok: true, commande: { type: 'send', jeton: m[2], montant: nombre(m[1]), destinataire: m[3].toLowerCase() } };
    }
    /* ⛔ un destinataire incomplet n est JAMAIS complete : on le dit, on ne devine pas */
    return { ok: false, pourquoi: 'send needs: send <amount> <token> to <the whole address, 0x and 40 characters>' };
  }, palette: [{ nom: 'Send', modele: PRE.send.modele, mots: 'transfer pay address', ecrire: true }] },
]);

/** Le dispatcher, construit sur UNE table : celle-ci (analyserCommande) ou, pour un test, une copie amputee. */
export function creerAnalyseur(table) {
  return function analyser(texte) {
    const t = propre(texte);
    if (!t) return { ok: false, pourquoi: 'write a command, or tap one below' };
    if (t.length > 200) return { ok: false, pourquoi: 'that is too long for a command' };
    for (const c of table) { const r = c.lire(t); if (r) return r; }
    return { ok: false, pourquoi: 'not understood — type “help” to see the commands' };
  };
}
/**
 * @param {string} texte
 * @returns {{ ok:true, commande:object } | { ok:false, pourquoi:string }}
 *   swap  : { type:'swap', de, vers|null, montant }      (montant = le texte du nombre, en unites humaines de `de`)
 *   send  : { type:'send', jeton, montant, destinataire }
 *   select: { type:'select', jeton }
 *   tab   : { type:'show', tab }      tasks : { type:'tasks' }      help : { type:'help' }
 *   level : { type:'level' }
 *   game  : { type:'game' }           roll  : { type:'roll', n }  (n = 1..ROLLS_PAR_COMMANDE_MAX ; « roll x11 » est REFUSE, jamais plafonne)
 *   duel  : { type:'duel' }           (« duel » ou « duels »)        log : { type:'log' }  (« log » ou « today » : le journal du jour)
 *   post_task : { type:'post_task', reward, players, hold }  (reward / hold = le texte du nombre, en unites humaines du block ; players = entier)
 *   safety : { type:'safety', jeton }   explain : { type:'explain', hash }  (0x + 64 hex, en minuscules)
 *   wallet : { type:'wallet', adresse|null }  (null = le wallet connecte)   gas : { type:'gas' }
 */
export const analyserCommande = creerAnalyseur(COMMANDES);

/** Un montant tape (« 0.5 ») -> des unites brutes, ou null s il a plus de decimales que le jeton n en porte, ou vaut 0. */
export function enUnitesBrutes(montant, decimales) {
  const t = nombre(propre(montant));
  if (!/^[0-9]+(\.[0-9]+)?$/.test(t) || !Number.isInteger(decimales) || decimales < 0 || decimales > 36) return null;
  const [e, f = ''] = t.split('.');
  if (f.length > decimales) return null;
  const v = BigInt(e + f.padEnd(decimales, '0'));
  return v > 0n ? v : null;
}
