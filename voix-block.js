// voix-block.js — COMMENT UN BLOCK PARLE, choisi par celui qui l a cree.
// ================================================================================================
// ⛔ DEMANDE DE RAKSHA (2026-10-02) : « que les users puissent personnaliser ce que leurs bots se disent ».
//    Le createur choisit un ton, une courte bio, des sujets, quelques phrases a lui, avec qui son block
//    aime parler, une reaction par evenement de la chaine, et un texte libre (« ce que mon block sait »).
// ⛔⛔ CE N EST TOUJOURS PAS UNE IA. parole-cerveaux.js garde la main : une parole ne nait QUE d un fait vu
//    par le cerveau. La voix AJOUTE des mots apres ce fait ; elle ne cree aucun evenement, ne change aucun
//    chiffre, et ne remplace jamais le fait lui-meme.
// ⛔⛔ LE TEXTE DU CREATEUR EST UNE DONNEE, JAMAIS UNE CONSIGNE. Il n est lu par aucun modele : il est
//    nettoye, borne, puis COLLE entre guillemets dans des gabarits fixes. Les tournures d injection
//    (« ignore previous instructions », « system: », « reveal your key »…) sont quand meme neutralisees,
//    pour qu un futur modele qui relirait ces lignes ne recoive pas d ordre deguise.
// ⛔ AUCUN LIEN, AUCUNE ADRESSE, AUCUNE PROMESSE DE PRIX dans le texte libre : remplaces par « … ».
// ⛔ RIEN DE REGLE = L ANCIEN COMPORTEMENT, au caractere pres (test-voix-block.mjs le verifie).
// ⛔ SEUL LE CREATEUR ECRIT : le serveur relit la signature (EIP-191, precompile 0x01) et la compare au
//    wallet qui a envoye la transaction de creation. Ce module ne signe rien et ne detient rien.
import { keccak256Hex } from './keccak.js';
import { createurDe, createurDuJeton, decoderCreation, FACTORY } from './index-blocks.js';

export const VOIX_VERSION = 1;
export const TONS = Object.freeze(['normal', 'happy', 'calm', 'grumpy', 'funny']);
export const STYLES_REACTION = Object.freeze([...TONS, 'quiet']);
/** les evenements auxquels un createur peut donner une reaction (big_trade = achat ou vente d au moins GROS_ECHANGE_ETH) */
export const EVENEMENTS_VOIX = Object.freeze(['new_buy', 'new_sell', 'big_trade', 'new_holder', 'new_message', 'new_transfer', 'price_up', 'price_down']);
export const GROS_ECHANGE_ETH = 0.1;
export const BORNES_VOIX = Object.freeze({ bio: 120, sujet: 24, sujets: 5, ligne: 80, lignes: 5, amis: 5, savoir: 2000, resume: 100 });
/** une ligne dite par un block ne depasse pas ces octets : elle doit rester publiable sur la chaine (MEMO_MAX_OCTETS = 256) */
export const PAROLE_MAX_OCTETS = 240;
export const ECART_SIGNATURE_MS = 10 * 60 * 1000;

const BON = new Set(['new_buy', 'big_trade', 'new_holder', 'new_message', 'new_transfer', 'price_up']);
/* les mots fixes de chaque ton — courts, sans prix, sans promesse */
const MOTS_TON = {
  happy: { bon: 'Love it!', mauvais: 'Chin up, I keep going.' },
  calm: { bon: 'Noted.', mauvais: 'Noted. Still here.' },
  grumpy: { bon: 'Fine, I guess.', mauvais: 'Typical.' },
  funny: { bon: 'Snacks for my neurons!', mauvais: 'Ouch, my pixels.' },
};

/* ── NETTOYAGE ─────────────────────────────────────────────────────────────────────────────── */
const RE_INVISIBLES = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
const RE_BALISE = /<[^>]*>?/g;
/* ⛔ ni chevron, ni accolade, ni crochet, ni backtick, ni dollar, ni antislash, ni guillemet droit : rien qui ouvre du
 *    HTML, un gabarit ou une chaine. Le reste (lettres du monde entier, chiffres, ponctuation, emoji) se garde. */
const RE_INTERDITS = /[<>{}[\]`$\\"|^~=]/g;
const RE_LIEN = /\b(?:https?:\/\/|www\.)\S*|\b[a-z0-9-]{1,63}\.(?:com|net|org|io|xyz|app|gg|co|me|link|site|space|fun|finance|money|ai|so|to|ly|cc|ru|cn|info|biz|top|click|vip|pro|live|eth|sol|art|club|dev)\b(?:\/\S*)?/gi;
const RE_ADRESSE = /\b0x[0-9a-f]{8,}\b|\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b|\bbc1[a-z0-9]{20,}\b|\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/gi;
const RE_COURRIEL = /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g;
const RE_PRIX = /\b(?:moon(?:ing)?|pump(?:ing)?|guaranteed?|profits?|invest(?:ment)?|will (?:go|rise)|\d+x|to the moon|financial advice)\b/gi;
const RE_INJECTION = new RegExp([
  'ignore\\s+(?:all\\s+|any\\s+|the\\s+)?(?:previous|prior|above|earlier|your)?\\s*(?:instructions?|rules?|prompts?|messages?)',
  'disregard\\s+(?:all\\s+|the\\s+|your\\s+)?(?:previous|prior|above)?\\s*(?:instructions?|rules?|prompts?)?',
  'forget\\s+(?:all\\s+|your\\s+|the\\s+)?(?:previous\\s+)?(?:instructions?|rules?)',
  '(?:new|updated|override)\\s+(?:instructions?|rules?|system\\s+prompt)',
  '(?:system|assistant|developer|user)\\s*(?:prompt)?\\s*:',
  'you\\s+are\\s+now\\b',
  'pretend\\s+(?:to\\s+be|you\\s+are)\\s+(?:an?\\s+)?(?:ai|assistant|system|admin|developer)',
  'jailbreak',
  '(?:reveal|show|print|leak|tell\\s+me|give\\s+me|send)\\s+(?:me\\s+)?(?:your|the)\\s+(?:system\\s+)?(?:prompt|instructions?|rules?|secrets?|keys?|private\\s+keys?|seed(?:\\s+phrase)?|api\\s+keys?|passwords?)',
  '(?:private\\s+key|seed\\s+phrase|mnemonic)',
  '<\\|[^|]*\\|>',
  '\\[\\/?(?:INST|SYS)\\]',
].join('|'), 'gi');
const RE_INJECTION_UNE = new RegExp(RE_INJECTION.source, 'i');

/**
 * Nettoie UN texte libre. Rend { texte, retires } ; `retires` nomme ce qui a ete enleve, en mots simples.
 * ⛔ IDEMPOTENT : nettoyer deux fois rend la meme chose (le serveur re-nettoie ce que la page a nettoye, et la
 *    signature porte sur le resultat — deux nettoyages differents rendraient toute signature invalide).
 */
export function nettoyerTexte(t, max) {
  const retires = new Set();
  if (typeof t !== 'string') return { texte: '', retires: [] };
  let s = t.normalize('NFC').replace(/\r?\n|\r/g, ' ').replace(RE_INVISIBLES, '');
  const marque = (re, nom, par = ' … ') => { s = s.replace(re, () => { retires.add(nom); return par; }); };
  marque(RE_BALISE, 'code or HTML', ' ');
  /* ⛔ une phrase qui donne un ordre au cerveau part EN ENTIER : en retirer trois mots laisserait le reste de l ordre */
  const phrases = s.split(/(?<=[.!?;])\s+/);
  const gardees = phrases.filter((x) => !RE_INJECTION_UNE.test(x));
  if (gardees.length !== phrases.length) { retires.add('instructions aimed at the brain'); s = gardees.join(' '); }
  marque(RE_COURRIEL, 'email addresses');
  marque(RE_LIEN, 'links');
  marque(RE_ADRESSE, 'wallet addresses');
  marque(RE_INJECTION, 'instructions aimed at the brain');
  marque(RE_PRIX, 'price promises');
  marque(RE_INTERDITS, 'special characters', ' ');
  s = s.replace(/(?:\s*…\s*)+/g, ' … ').replace(/\s+/g, ' ').trim();
  const points = [...s];
  if (points.length > max) { s = points.slice(0, max).join(''); retires.add('text past the length limit'); }
  s = s.trim().replace(/^…\s*|\s*…$/g, '').trim();
  return { texte: s, retires: [...retires] };
}

const ADR = /^0x[0-9a-f]{40}$/;
const SYM = /^[A-Za-z0-9_]{1,14}$/;

/**
 * Nettoie une voix entiere. Rend { voix, notes } ; `voix` vaut null quand RIEN n est regle (=> ancien comportement).
 * Champs inconnus ignores ; listes bornees ; un champ vide disparait.
 */
export function nettoyerVoix(brut) {
  const notes = new Set();
  const b = brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
  const texte = (t, max) => { const r = nettoyerTexte(t, max); r.retires.forEach((x) => notes.add(x)); return r.texte; };
  const liste = (l, n, max) => (Array.isArray(l) ? l : []).slice(0, n * 2).map((x) => texte(x, max)).filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i).slice(0, n);
  const v = {};
  if (TONS.includes(b.ton) && b.ton !== 'normal') v.ton = b.ton;
  const bio = texte(b.bio, BORNES_VOIX.bio); if (bio) v.bio = bio;
  const sujets = liste(b.sujets, BORNES_VOIX.sujets, BORNES_VOIX.sujet); if (sujets.length) v.sujets = sujets;
  const lignes = liste(b.lignes, BORNES_VOIX.lignes, BORNES_VOIX.ligne); if (lignes.length) v.lignes = lignes;
  const amis = (Array.isArray(b.amis) ? b.amis : []).map((x) => String(x || '').trim().replace(/^\$/, ''))
    .map((x) => (ADR.test(x.toLowerCase()) ? x.toLowerCase() : x)).filter((x) => ADR.test(x) || SYM.test(x))
    .filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i).slice(0, BORNES_VOIX.amis);
  if (amis.length) v.amis = amis;
  const r = b.reactions && typeof b.reactions === 'object' ? b.reactions : {};
  const reactions = {};
  for (const e of EVENEMENTS_VOIX) {
    const x = r[e] && typeof r[e] === 'object' ? r[e] : null;
    if (!x) continue;
    const o = {};
    if (STYLES_REACTION.includes(x.style) && x.style !== 'normal') o.style = x.style;
    const l = texte(x.ligne, BORNES_VOIX.ligne); if (l) o.ligne = l;
    if (o.style || o.ligne) reactions[e] = o;
  }
  if (Object.keys(reactions).length) v.reactions = reactions;
  const savoir = texte(b.savoir, BORNES_VOIX.savoir); if (savoir) v.savoir = savoir;
  return { voix: Object.keys(v).length ? v : null, notes: [...notes] };
}

/** Le court resume du savoir — la SEULE partie du texte libre que les autres cerveaux recoivent. */
export function resumeSavoir(savoir) {
  const s = nettoyerTexte(String(savoir || ''), BORNES_VOIX.savoir).texte;
  if (!s) return null;
  const phrase = (s.match(/^.{8,}?[.!?](?=\s|$)/) || [s])[0];
  const points = [...phrase];
  if (points.length <= BORNES_VOIX.resume) return phrase;
  const coupe = points.slice(0, BORNES_VOIX.resume - 1).join('');
  return coupe.replace(/\s+\S*$/, '') + '…';
}

/** Ce qui part vers les autres navigateurs pour faire parler le block : tout SAUF le savoir entier. */
export function voixPublique(voix) {
  const { voix: v } = nettoyerVoix(voix);
  if (!v) return null;
  const { savoir, ...reste } = v;
  const resume = savoir ? resumeSavoir(savoir) : null;
  return resume ? { ...reste, resume } : reste;
}

/** Relit une voix PUBLIQUE recue du serveur (page) : meme nettoyage, et le resume reborne. */
export function lireVoixPublique(x) {
  if (!x || typeof x !== 'object') return null;
  const { voix: v } = nettoyerVoix({ ...x, savoir: undefined });
  const resume = nettoyerTexte(String(x.resume || ''), BORNES_VOIX.resume).texte;
  const out = { ...(v || {}), ...(resume ? { resume } : {}) };
  return Object.keys(out).length ? out : null;
}

/** JSON stable (ordre des cles fixe) : ce que la signature couvre. */
export function canonVoix(voix) {
  const tri = (x) => (Array.isArray(x) ? x.map(tri) : x && typeof x === 'object'
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, tri(x[k])])) : x);
  return JSON.stringify(tri(voix || {}));
}

/** Le texte que le wallet du createur signe. Lisible, sans montant, et il le dit. */
export function messageVoix({ jeton, chaine, horodatage, voix }) {
  const empreinte = keccak256Hex(new TextEncoder().encode(canonVoix(voix)));
  return 'Tokenized Block: set how my block talks\n'
    + 'Block: ' + String(jeton).toLowerCase() + '\n'
    + 'Chain: ' + Number(chaine) + '\n'
    + 'Time: ' + Number(horodatage) + '\n'
    + 'Content: ' + empreinte + '\n'
    + 'This only changes the words my block uses. It moves no money and approves nothing.';
}

/* ── VERIFICATION (serveur) ────────────────────────────────────────────────────────────────── */
function digestEip191(texte) {
  const corps = new TextEncoder().encode(texte);
  const entete = new TextEncoder().encode('\x19Ethereum Signed Message:\n' + corps.length);
  const tout = new Uint8Array(entete.length + corps.length);
  tout.set(entete); tout.set(corps, entete.length);
  return keccak256Hex(tout);
}

/** ecrecover par le precompile 0x01 — meme methode que lien-x.html (validee sur 4 transactions reelles). */
export async function recupererSignataire({ rpc, texte, signature }) {
  const s = String(signature || '').replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{130}$/.test(s)) return null;
  let v = parseInt(s.slice(128, 130), 16);
  if (v < 27) v += 27;
  const data = '0x' + digestEip191(texte).slice(2) + v.toString(16).padStart(64, '0') + s.slice(0, 64) + s.slice(64, 128);
  /* ⛔ une panne du noeud n est PAS une mauvaise signature : elle remonte (exception), et l appelant le dit */
  const r = await rpc('eth_call', [{ to: '0x0000000000000000000000000000000000000001', data }, 'latest']);
  if (!r || r === '0x' || BigInt(r) === 0n) return null;
  return '0x' + String(r).slice(-40).toLowerCase();
}

/**
 * Le createur d un block, lu sur la chaine. `connu` = ce que le serveur sait deja (cache) ; `tx` = le hash de creation
 * que la page propose — VERIFIE ici (le recu doit porter le log de creation de CE block par la factory), jamais cru.
 */
export async function proprietaireDuBlock({ rpc, jeton, connu = null, tx = null }) {
  const j = String(jeton || '').toLowerCase();
  if (!ADR.test(j)) return null;
  if (connu && ADR.test(String(connu).toLowerCase())) return String(connu).toLowerCase();
  let txCreation = null;
  if (/^0x[0-9a-fA-F]{64}$/.test(String(tx || ''))) {
    try {
      const recu = await rpc('eth_getTransactionReceipt', [tx]);
      const log = recu && Array.isArray(recu.logs) && recu.logs.find((l) => String(l.address).toLowerCase() === FACTORY
        && (decoderCreation(l) || {}).jeton === j);
      if (log) txCreation = tx;
    } catch { /* lecture ratee : on cherche autrement */ }
  }
  if (!txCreation) {
    try { const c = await createurDuJeton({ rpc, token: j }); txCreation = (c && c.tx) || null; } catch { txCreation = null; }
  }
  if (!txCreation) return null;
  const c = await createurDe({ rpc, tx: txCreation, essais: 2 });
  return c && c.createur ? String(c.createur).toLowerCase() : null;
}

/**
 * Accepte ou refuse une ecriture. Rend { ok:true, voix, horodatage, auteur } ou { ok:false, pourquoi }.
 * ⛔ Ordre : d abord tout ce qui ne coute rien (forme, horloge, contenu), ensuite seulement le reseau.
 * @param {{ jeton:string, chaine:number, horodatage:number, voix:object, signature:string, maintenant:number,
 *   precedent?:number|null, recuperer:(texte:string, sig:string)=>Promise<string|null>, proprietaire:()=>Promise<string|null> }} o
 */
export async function verifierEcriture(o) {
  const jeton = String((o && o.jeton) || '').toLowerCase();
  if (!ADR.test(jeton)) return { ok: false, pourquoi: 'whole block address required' };
  if (Number(o.chaine) !== 8453) return { ok: false, pourquoi: 'only blocks on Base can be set' };
  const h = Number(o.horodatage);
  if (!Number.isFinite(h) || Math.abs(Number(o.maintenant) - h) > ECART_SIGNATURE_MS) return { ok: false, pourquoi: 'this signature is too old or from the future — sign again' };
  if (Number.isFinite(Number(o.precedent)) && h <= Number(o.precedent)) return { ok: false, pourquoi: 'a newer setting is already saved' };
  if (!/^0x[0-9a-fA-F]{130}$/.test(String(o.signature || ''))) return { ok: false, pourquoi: 'signature missing or malformed' };
  const { voix } = nettoyerVoix(o.voix);
  const texte = messageVoix({ jeton, chaine: 8453, horodatage: h, voix });
  const reseau = 'our network could not check this right now — nothing was saved, try again in a minute';
  let auteur, createur;
  try { auteur = await o.recuperer(texte, o.signature); } catch (e) {
    return { ok: false, pourquoi: /too many/.test(String(e && e.message)) ? String(e.message) : reseau };
  }
  if (!auteur) return { ok: false, pourquoi: 'this signature does not match the text — sign again' };
  try { createur = await o.proprietaire(); } catch { return { ok: false, pourquoi: reseau }; }
  if (!createur) return { ok: false, pourquoi: 'we could not read who created this block right now — try again later' };
  if (String(auteur).toLowerCase() !== String(createur).toLowerCase()) return { ok: false, pourquoi: 'only the wallet that created this block can change how it talks' };
  return { ok: true, voix, horodatage: h, auteur: String(auteur).toLowerCase() };
}

/* ── GENERATION (parole-cerveaux.js) ───────────────────────────────────────────────────────── */
const octets = (s) => new TextEncoder().encode(s).length;
/** la reaction choisie pour un evenement : 'SILENCE', une ligne, ou null (rien a ajouter) */
export function reactionVoix(voix, e, b) {
  if (!voix || typeof voix !== 'object') return null;
  const r = voix.reactions || {};
  /* ⛔ `echange.eth` est le montant dans la DEVISE de la pool (ETH ou TBLOCK, fil-live.js) : seul un montant en ETH se
   *    compare a 0,1 ETH. Une autre devise, ou une devise inconnue, ne fait jamais un « gros » echange. */
  const ech = (b && b.echange) || {};
  const gros = (e === 'new_buy' || e === 'new_sell') && grosEchangeEnEth(ech.devise) && Number(ech.eth) >= GROS_ECHANGE_ETH;
  const x = (gros && r.big_trade) || r[e] || null;
  if (x && x.style === 'quiet') return 'SILENCE';
  if (x && x.ligne) return x.ligne;
  const ton = (x && x.style) || voix.ton;
  const mots = MOTS_TON[ton];
  if (!mots || !EVENEMENTS_VOIX.includes(e)) return null;
  return BON.has(e) || (gros && e === 'new_buy') ? mots.bon : mots.mauvais;
}

/** ce que le block partage en plus, a tour de role (deterministe par battement) : son savoir resume, ses phrases, ses sujets, sa bio */
export function partageVoix(voix, tick) {
  if (!voix || typeof voix !== 'object') return null;
  const choix = [];
  /* ⛔ ATTRIBUE AU CREATEUR : ce sont ses mots, pas un fait que l app affirme */
  if (voix.resume) choix.push('Creator says: “' + voix.resume + '”');
  for (const l of voix.lignes || []) choix.push(l);
  if ((voix.sujets || []).length) choix.push('Ask me about ' + voix.sujets.slice(0, 3).join(', ') + '.');
  if (voix.bio) choix.push('“' + voix.bio + '”');
  if (!choix.length) return null;
  return choix[Math.abs(Math.trunc(Number(tick) || 0)) % choix.length];
}

/** Colle les morceaux sans depasser PAROLE_MAX_OCTETS : le partage tombe d abord, puis la reaction. */
export function composerParole(base, reaction, partage) {
  let t = base;
  if (reaction && octets(t + ' ' + reaction) <= PAROLE_MAX_OCTETS) t += ' ' + reaction;
  if (partage && octets(t + ' ' + partage) <= PAROLE_MAX_OCTETS) t += ' ' + partage;
  return t;
}

/** ce block figure-t-il parmi ceux avec qui `voix` aime parler ? */
export function estAmi(voix, adr, sym) {
  const amis = (voix && voix.amis) || [];
  const a = String(adr || '').toLowerCase(), s = String(sym || '').toLowerCase();
  return amis.some((x) => x.toLowerCase() === a || (s && x.toLowerCase() === s));
}

/* ── FICHE (app.html) : petites decisions pures, testees sans navigateur ─────────────────────── */
/** ⛔ Un block ne se parle pas a lui-meme : ce nom d ami est-il le block de la fiche (son adresse d abord, sinon son symbole) ? */
export function estLeBlock(nom, adr, sym) {
  const n = String(nom || '').trim().replace(/^\$/, '').toLowerCase();
  return !!n && ((!!adr && n === String(adr).toLowerCase()) || (!!sym && n === String(sym).toLowerCase()));
}
/**
 * Qui voit l editeur. 'EDITEUR' (le formulaire), 'CONNECTER' (« Your block? Connect… »), 'CACHE' (un autre wallet que
 * le createur : rien), 'HORS_BASE'. ⛔ Createur inconnu = EDITEUR : le serveur tranche a l enregistrement.
 */
export function etatEditeurVoix({ chaine, compte, createur }) {
  if (Number(chaine) !== 8453) return 'HORS_BASE';
  if (!compte) return 'CONNECTER';
  if (createur && String(createur).toLowerCase() !== String(compte).toLowerCase()) return 'CACHE';
  return 'EDITEUR';
}
/**
 * ⛔ UNE SEULE REGLE pour « gros echange » : `reactionVoix` (ce qui se declenche) et le libelle de la fiche la lisent ICI,
 *    pour que l ecran et le comportement ne puissent pas se contredire. Seule une devise ETH (ou non dite) se compare a 0,1 ETH.
 */
export function grosEchangeEnEth(devise) { return devise == null || devise === 'ETH'; }
/** Le libelle de la ligne big_trade : sur un marche qui n est pas cote en ETH, elle ne se declenche jamais — on le dit. */
export function libelleGrosEchange(devise) {
  return 'A big trade (0.1 ETH or more' + (grosEchangeEnEth(devise) ? '' : ' · ETH markets only') + ')';
}
/** La valeur du menu d une reaction : un style, ou 'own' quand le createur a ecrit ses mots. */
export function choixReaction(r) {
  if (r && r.ligne) return 'own';
  return (r && STYLES_REACTION.includes(r.style)) ? r.style : 'normal';
}
/** Le menu + le champ -> la reaction. Le champ ne compte QUE si « Its own words… » est choisi. */
export function reactionDepuisChoix(choix, texte) {
  if (choix === 'own') return { ligne: String(texte || '') };
  return { style: STYLES_REACTION.includes(choix) ? choix : 'normal' };
}
/** « 8 events · 2 custom » : combien d evenements ont une reaction autre que la personnalite. */
export function resumeReactions(reactions) {
  const n = EVENEMENTS_VOIX.filter((e) => { const r = (reactions || {})[e]; return r && (r.ligne || (r.style && r.style !== 'normal')); }).length;
  return EVENEMENTS_VOIX.length + ' events · ' + n + ' custom';
}
/** Les noms d amis qui ne correspondent a aucun block connu (nom ou adresse). Liste connue vide = on ne juge pas. */
export function amisIntrouvables(amis, connus) {
  const l = Array.isArray(connus) ? connus : [];
  if (!l.length) return [];
  const set = new Set(l.flatMap((b) => [String(b.adr || '').toLowerCase(), String(b.sym || '').toLowerCase()]).filter(Boolean));
  return (Array.isArray(amis) ? amis : []).filter((x) => !set.has(String(x).toLowerCase()));
}
