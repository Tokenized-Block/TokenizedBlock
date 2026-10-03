/* panel-sessions.js — LA TELECOMMANDE : un agent (Claude, Grok… via le MCP) PROPOSE des commandes a un panneau ouvert par un humain.
 *
 * ⛔⛔ POURQUOI (Phil, 2026-10-04) : « un Claude ou un Grok pourra facilement donner des commandes aux Blocks », avec un panneau
 *   visuel et des boutons. La regle du produit ne bouge pas : RIEN NE SE SIGNE SANS L HUMAIN. Une commande est une PROPOSITION
 *   qui s affiche dans le panneau ; le panneau la soumet au cerveau du block (portes de brain-tasks.js, deterministes, pas un
 *   LLM), construit le plan avec les planificateurs de l app, et c est le WALLET de l humain qui signe, bouton par bouton.
 * ⛔ CE MODULE NE FAIT QUE TENIR LES FILES, en memoire : il valide la FORME d une commande, lui donne un numero, la garde ; il
 *   garde les evenements que le panneau renvoie (verdict du cerveau, plan pret, signe, refuse) pour que l agent lise la suite.
 *   Il ne planifie rien, ne lit pas la chaine, ne signe rien.
 * ⛔ LA SESSION EST UN SECRET AU PORTEUR (128 bits, tire par l appelant) : qui la connait peut PROPOSER. Il ne peut rien faire
 *   signer — le pire qu un intrus obtienne est d afficher des propositions que l humain refuse. Le texte d un agent est rendu en
 *   TEXTE par le panneau (jamais en HTML) ; ici on borne sa longueur et on retire les caracteres de controle.
 * ⛔ BORNES DURES : sessions (500), duree de vie sans activite (2 h), commandes et evenements gardes par session (100 chacun),
 *   une commande par seconde et par session. Tout est perdu au redemarrage du serveur — le panneau le dit et rouvre une session. */
export const PANEL_MAX_SESSIONS = 500;
export const PANEL_TTL_MS = 2 * 60 * 60 * 1000;
export const PANEL_MAX_FILE = 100;
export const PANEL_INTERVALLE_MS = 1000;
export const ONGLETS_PANEL = Object.freeze(['market', 'trade', 'brain', 'chat']);
/* les taches du cerveau qu un agent peut proposer : celles du catalogue (brain-tasks.js ONCHAIN_TASKS), nommees ici pour que la
 *   forme se valide sans importer le catalogue — test-panel-sessions verifie que les deux listes sont identiques. */
export const TACHES_PANEL = Object.freeze(['export_snapshot', 'read_agent_catalog', 'decision_receipts', 'offer_food', 'trade_tblock', 'launch_wake', 'feed_trusted', 'record_memory']);

const ADR = /^0x[0-9a-fA-F]{40}$/;
const JETON = /^(?:eth|0x[0-9a-fA-F]{40})$/i;
const MONTANT = /^[1-9][0-9]{0,40}$/;
const ID = /^[0-9a-f]{32}$/;
/* les caracteres qu un texte d agent ne porte pas jusqu a l ecran : controle (0-31, 127), separateurs de ligne Unicode (0x2028, 0x2029)
 *   et les marques de sens d ecriture (0x202A-0x202E, 0x2066-0x2069 — elles retournent visuellement un texte). Ecrit en POINTS DE CODE,
 *   sans echappement : une premiere version en regex litterale a ete deposee avec les caracteres bruts, et ne se parsait plus. */
const caractereInterdit = (cp) => cp <= 31 || cp === 127 || cp === 0x2028 || cp === 0x2029 || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069);
const texteSur =(s, max) => Array.from(String(s), (ch) => (caractereInterdit(ch.codePointAt(0)) ? ' ' : ch)).join('').replace(/\s+/g, ' ').trim().slice(0, max);
const bas = (a) => String(a).toLowerCase();

/** Valide et NORMALISE une commande. Tout champ inconnu est refuse : une commande n emporte que ce que le panneau sait afficher. */
export function validerCommande(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return { ok: false, pourquoi: 'a command is an object' };
  const champs = (liste) => Object.keys(c).every((k) => liste.includes(k)) ? null : 'unknown field in this command';
  const non = (pourquoi) => ({ ok: false, pourquoi });
  switch (c.type) {
    case 'select': {
      const f = champs(['type', 'block']); if (f) return non(f);
      if (!ADR.test(String(c.block || ''))) return non('block must be a whole address');
      return { ok: true, commande: { type: 'select', block: bas(c.block) } };
    }
    case 'show': {
      const f = champs(['type', 'tab']); if (f) return non(f);
      if (!ONGLETS_PANEL.includes(c.tab)) return non('tab must be one of: ' + ONGLETS_PANEL.join(', '));
      return { ok: true, commande: { type: 'show', tab: c.tab } };
    }
    case 'trade': {
      const f = champs(['type', 'side', 'block', 'amount', 'with']); if (f) return non(f);
      if (c.side !== 'buy' && c.side !== 'sell') return non('side must be buy or sell');
      if (!ADR.test(String(c.block || ''))) return non('block must be a whole address');
      if (!MONTANT.test(String(c.amount || ''))) return non('amount must be a positive integer in raw units (of the token paid for a buy, of the block for a sell)');
      if (c.with !== undefined && !JETON.test(String(c.with))) return non('with must be ETH or a whole token address');
      return { ok: true, commande: { type: 'trade', side: c.side, block: bas(c.block), amount: String(c.amount), ...(c.with !== undefined ? { with: /^eth$/i.test(c.with) ? 'ETH' : bas(c.with) } : {}) } };
    }
    case 'task': {
      const f = champs(['type', 'task', 'block']); if (f) return non(f);
      if (!TACHES_PANEL.includes(c.task)) return non('task must be one of: ' + TACHES_PANEL.join(', '));
      if (!ADR.test(String(c.block || ''))) return non('block must be a whole address');
      return { ok: true, commande: { type: 'task', task: c.task, block: bas(c.block) } };
    }
    case 'birth': {
      const f = champs(['type', 'name', 'symbol', 'pair']); if (f) return non(f);
      const nom = texteSur(c.name || '', 64), sym = texteSur(c.symbol || '', 64);
      if (!nom || !sym) return non('a birth needs a name and a symbol');
      if (new TextEncoder().encode(nom).length > 32 || new TextEncoder().encode(sym).length > 32) return non('name and symbol are at most 32 bytes each');
      if (c.pair !== undefined && !JETON.test(String(c.pair))) return non('pair must be ETH or a whole currency address');
      return { ok: true, commande: { type: 'birth', name: nom, symbol: sym.toUpperCase(), pair: c.pair === undefined || /^eth$/i.test(c.pair) ? 'ETH' : bas(c.pair) } };
    }
    case 'say': {
      const f = champs(['type', 'text']); if (f) return non(f);
      const t = texteSur(c.text || '', 500);
      if (!t) return non('say needs a text');
      return { ok: true, commande: { type: 'say', text: t } };
    }
    default:
      return non('type must be one of: select, show, trade, task, birth, say');
  }
}

const TYPES_EVENEMENT = Object.freeze(['ready', 'verdict', 'plan', 'signed', 'declined', 'failed', 'note']);
/** Un evenement renvoye par le panneau : type connu, reference a une commande, et un petit texte / des champs courts. */
export function validerEvenement(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return { ok: false, pourquoi: 'an event is an object' };
  if (!TYPES_EVENEMENT.includes(e.type)) return { ok: false, pourquoi: 'type must be one of: ' + TYPES_EVENEMENT.join(', ') };
  const ev = { type: e.type };
  if (e.ref !== undefined) { if (!Number.isInteger(e.ref) || e.ref < 1) return { ok: false, pourquoi: 'ref must be a command number' }; ev.ref = e.ref; }
  if (e.text !== undefined) ev.text = texteSur(e.text, 300);
  if (e.account !== undefined) { if (!ADR.test(String(e.account))) return { ok: false, pourquoi: 'account must be a whole address' }; ev.account = bas(e.account); }
  if (e.block !== undefined) { if (!ADR.test(String(e.block))) return { ok: false, pourquoi: 'block must be a whole address' }; ev.block = bas(e.block); }
  if (e.tx !== undefined) { if (!/^0x[0-9a-fA-F]{64}$/.test(String(e.tx))) return { ok: false, pourquoi: 'tx must be a whole transaction hash' }; ev.tx = bas(e.tx); }
  if (e.etat !== undefined) ev.etat = texteSur(e.etat, 24);
  return { ok: true, evenement: ev };
}

/**
 * Le registre des sessions. `horloge` et `tirerId` sont injectes (tests : temps et identifiants deterministes).
 * @param {{ horloge?:()=>number, tirerId:()=>string }} deps  tirerId rend 32 caracteres hexadecimaux (128 bits de hasard)
 */
export function creerRegistrePanel(deps) {
  const horloge = (deps && deps.horloge) || Date.now;
  const tirerId = deps && deps.tirerId;
  if (typeof tirerId !== 'function') throw new Error('an id source is required');
  const sessions = new Map();
  const purger = () => {
    const t = horloge();
    for (const [id, s] of sessions) if (t - s.vu > PANEL_TTL_MS) sessions.delete(id);
  };
  const prendre = (id) => {
    if (!ID.test(String(id || ''))) return null;
    const s = sessions.get(String(id));
    if (!s) return null;
    if (horloge() - s.vu > PANEL_TTL_MS) { sessions.delete(String(id)); return null; }
    return s;
  };
  return {
    taille: () => { purger(); return sessions.size; },
    /** Ouvre une session. Rend { ok, session } ou { ok:false, pourquoi } quand le serveur est plein. */
    ouvrir({ block = null } = {}) {
      purger();
      if (block !== null && !ADR.test(String(block))) return { ok: false, pourquoi: 'block must be a whole address' };
      if (sessions.size >= PANEL_MAX_SESSIONS) return { ok: false, pourquoi: 'too many open panels right now — try again later' };
      const id = String(tirerId());
      if (!ID.test(id) || sessions.has(id)) return { ok: false, pourquoi: 'could not open a session' };
      const t = horloge();
      sessions.set(id, { cree: t, vu: t, block: block ? bas(block) : null, n: 0, commandes: [], m: 0, evenements: [], derniere: 0, panneauVu: null });
      return { ok: true, session: id };
    },
    /** L agent PROPOSE une commande. Rend { ok, n } (le numero de la commande) ou la raison. */
    pousser(id, commande) {
      const s = prendre(id);
      if (!s) return { ok: false, pourquoi: 'unknown or expired session — open the panel again', inconnue: true };
      const v = validerCommande(commande);
      if (!v.ok) return v;
      const t = horloge();
      if (t - s.derniere < PANEL_INTERVALLE_MS) return { ok: false, pourquoi: 'one command per second per panel', tropVite: true };
      s.derniere = t; s.vu = t; s.n += 1;
      s.commandes.push({ n: s.n, t, ...v.commande });
      while (s.commandes.length > PANEL_MAX_FILE) s.commandes.shift();
      return { ok: true, n: s.n, commande: v.commande, panneauOuvert: s.panneauVu !== null && t - s.panneauVu < 15000 };
    },
    /** Le PANNEAU lit les commandes apres `depuis` (et signale par la qu il est ouvert). */
    lireCommandes(id, depuis = 0) {
      const s = prendre(id);
      if (!s) return { ok: false, pourquoi: 'unknown or expired session', inconnue: true };
      const t = horloge(); s.vu = t; s.panneauVu = t;
      const d = Number.isInteger(depuis) && depuis >= 0 ? depuis : 0;
      return { ok: true, block: s.block, dernier: s.n, commandes: s.commandes.filter((c) => c.n > d) };
    },
    /** Le PANNEAU rend compte (verdict du cerveau, plan pret, signe, refuse…). */
    noter(id, evenement) {
      const s = prendre(id);
      if (!s) return { ok: false, pourquoi: 'unknown or expired session', inconnue: true };
      const v = validerEvenement(evenement);
      if (!v.ok) return v;
      const t = horloge(); s.vu = t; s.panneauVu = t; s.m += 1;
      if (v.evenement.type === 'ready' && v.evenement.block) s.block = v.evenement.block;
      s.evenements.push({ m: s.m, t, ...v.evenement });
      while (s.evenements.length > PANEL_MAX_FILE) s.evenements.shift();
      return { ok: true, m: s.m };
    },
    /** L AGENT lit ce qui s est passe : les evenements apres `depuis`, et si un panneau est ouvert en ce moment. */
    lireEvenements(id, depuis = 0) {
      const s = prendre(id);
      if (!s) return { ok: false, pourquoi: 'unknown or expired session — open the panel again', inconnue: true };
      const t = horloge(); s.vu = t;
      const d = Number.isInteger(depuis) && depuis >= 0 ? depuis : 0;
      return { ok: true, block: s.block, panneauOuvert: s.panneauVu !== null && t - s.panneauVu < 15000, commandesEnvoyees: s.n, dernier: s.m,
        evenements: s.evenements.filter((e) => e.m > d) };
    },
  };
}
