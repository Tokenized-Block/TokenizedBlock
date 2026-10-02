// notes-du-fil.js — ce que cache une ligne groupee du Feed, et le texte des notes qu elle a comptees.
// ================================================================================================
// ⛔⛔ DEFAUT MESURE EN PRODUCTION (QA du 2026-10-02, 11:44) : le Feed disait « 📝 NVDAc got 4 notes »
//     (blocs 52,071,384–52,072,345) ; le toucher ouvrait le profil, qui relisait SA propre source —
//     les 30 derniers transferts du block sur 2 000 blocs — et concluait « 0 messages ». Deux lectures
//     differentes, deux plages differentes, et l ecran les presentait comme la meme question.
//     Et la ligne groupee JETAIT ses enfants : `peindreLive` ne gardait qu un compte et une plage.
// ⇒ La ligne garde maintenant ses evenements (`enfants`), et les notes se lisent A PARTIR D EUX :
//   memes transactions, memes blocs que le compte affiche. Le compte ne peut plus diverger de la liste.
// ⛔ UNE NOTE NON LUE N EST PAS UNE NOTE VIDE : elle reste dans le total, marquee NON_LU.
// ⚠️ CE QUE CE MODULE NE PROUVE PAS : qu une note « sans texte » n est pas du spam (un transfert de 0
//   est aussi la forme classique de l empoisonnement d adresse). Il dit ce que la chaine porte.

/** Combien d enfants on montre a l ouverture, puis a chaque « show more ». */
export const ENFANTS_PAS = 10;

/** Une ligne se deplie si elle cache plusieurs evenements, ou si c est une note (son texte est ailleurs). */
export function estDepliable(ligne) {
  return !!ligne && Array.isArray(ligne.enfants) && ligne.enfants.length > 0
    && (ligne.type === 'NOTE' || ligne.enfants.length > 1);
}

/** Cle stable d une ligne a travers les rafraichissements (20 s) : GM/NOTE = une ligne par jeton ;
 *  un groupe d echanges consecutifs = son evenement le plus ancien, qui ne bouge pas quand le haut grandit. */
export function cleGroupe(ligne) {
  if (!ligne) return '';
  const j = String(ligne.jeton || '').toLowerCase();
  if (ligne.type === 'GM' || ligne.type === 'NOTE') return ligne.type + ':' + j;
  const enf = Array.isArray(ligne.enfants) && ligne.enfants.length ? ligne.enfants[ligne.enfants.length - 1] : ligne;
  return ligne.type + ':' + j + ':' + (enf.tx || '') + ':' + (enf.logIndex ?? '');
}

/**
 * Lit le texte de chaque note A PARTIR DE SA TRANSACTION. Rend une Map tx -> lecture.
 * lecture = { etat: 'LU' | 'AUCUN' | 'ILLISIBLE' | 'NON_LU', texte?, signataire? }
 * ⛔ `cache` est partage (Map) : une transaction deja lue ne se relit pas ; un NON_LU, si.
 */
export async function lireNotes({ rpc, notes, lireMemo, cache = new Map(), auPas = null }) {
  for (const n of notes || []) {
    const tx = n && n.tx ? String(n.tx).toLowerCase() : '';
    if (!tx) continue;
    const deja = cache.get(tx);
    if (deja && deja.etat !== 'NON_LU') continue;
    let brut = null;
    try { brut = await rpc('eth_getTransactionByHash', [n.tx]); } catch (_) { brut = null; }
    if (!brut || typeof brut.input !== 'string') cache.set(tx, { etat: 'NON_LU' });
    else {
      const m = lireMemo(brut.input);
      cache.set(tx, { etat: m.etat === 'LU' ? 'LU' : m.etat === 'ILLISIBLE' ? 'ILLISIBLE' : 'AUCUN',
        texte: m.etat === 'LU' ? m.texte : null, signataire: brut.from || null });
    }
    if (typeof auPas === 'function') auPas();
  }
  return cache;
}

/** Le bilan des notes d une ligne : le TOTAL est toujours celui du Feed, lu ou pas. */
export function resumeNotes(notes, cache) {
  const r = { total: 0, avecTexte: 0, sansTexte: 0, illisibles: 0, nonLues: 0, enAttente: 0 };
  for (const n of notes || []) {
    r.total++;
    const l = n && n.tx ? cache && cache.get(String(n.tx).toLowerCase()) : null;
    if (!l) r.enAttente++;
    else if (l.etat === 'LU') r.avecTexte++;
    else if (l.etat === 'AUCUN') r.sansTexte++;
    else if (l.etat === 'ILLISIBLE') r.illisibles++;
    else r.nonLues++;
  }
  return r;
}

/* ⛔⛔ REVUE 2026-10-02 13:32 : le mot « note » est RESERVE aux entrees qui portent un texte. Un transfert
 *     de 0 sans texte s appelle un « empty transfer (0 amount) » — c est la forme classique du spam par
 *     copie d adresse, et l appeler « note » invitait a l ouvrir et a recopier l adresse. */
const pl = (n, un, plusieurs) => n + ' ' + (n === 1 ? un : plusieurs);
export const AVERT_SPAM = 'These look like address-copy spam — never copy an address from them.';

/** Le titre d une ligne NOTE. `notes` = au moins une entree porte un texte (seul cas ou le mot « note » sert). */
export function libelleNotes(r) {
  const attente = r.enAttente;
  const vides = r.sansTexte + r.illisibles;
  if (!r.avecTexte && attente === r.total) {
    return { notes: false, texte: pl(r.total, '0-amount transfer', '0-amount transfers') + ' · checking for text…' };
  }
  const bouts = [];
  if (r.avecTexte) bouts.push('got ' + pl(r.avecTexte, 'note', 'notes'));
  if (r.sansTexte) bouts.push(pl(r.sansTexte, 'empty transfer', 'empty transfers') + ' (0 amount)');
  if (r.illisibles) bouts.push(pl(r.illisibles, '0-amount transfer', '0-amount transfers') + ' with bytes that are not text');
  if (attente) bouts.push(attente + ' not checked yet');
  if (r.nonLues) bouts.push('⚠️ ' + r.nonLues + ' could not be read');
  return { notes: r.avecTexte > 0, texte: bouts.join(' · '), spam: !r.avecTexte && vides > 0 };
}

/** Le compte du profil. ⛔ Jamais « N notes » pour des transferts vides ; jamais « 0 messages » sec quand le Feed en a vu. */
export function compteProfil(nMessages, r) {
  if (!r) return pl(nMessages, 'message', 'messages');
  const vides = r.sansTexte ? pl(r.sansTexte, 'empty 0-amount transfer', 'empty 0-amount transfers') : '';
  const enSuspens = r.enAttente + r.nonLues;
  return [nMessages ? pl(nMessages, 'message', 'messages') : 'No messages yet', vides,
    r.illisibles ? r.illisibles + ' with bytes that are not text' : '',
    enSuspens ? '⚠️ ' + enSuspens + ' not read' : ''].filter(Boolean).join(' · ');
}

/** La phrase affichee au-dessus de la liste. ⛔ Elle part du compte du Feed, et « note » = avec texte. */
export function phraseNotes(r, blocBas, blocHaut) {
  const f = (x) => Number(x).toLocaleString('en-US');
  const plage = Number.isFinite(blocBas) && Number.isFinite(blocHaut)
    ? (blocBas === blocHaut ? ' in chain block ' + f(blocBas) : ' in chain blocks ' + f(blocBas) + '–' + f(blocHaut)) : '';
  const bouts = [pl(r.total, '0-amount transfer', '0-amount transfers') + ' counted by the Feed' + plage];
  if (r.avecTexte) bouts.push(pl(r.avecTexte, 'note', 'notes') + ' with readable text');
  if (r.sansTexte) bouts.push(r.sansTexte + ' empty (no text attached)');
  if (r.illisibles) bouts.push(r.illisibles + ' with extra bytes that are not text');
  if (r.enAttente) bouts.push(r.enAttente + ' being read…');
  if (r.nonLues) bouts.push('⚠️ ' + r.nonLues + ' could not be read right now — not empty, tap again to retry');
  return bouts.join(' · ');
}

/* ⛔⛔ REVUE 2026-10-02 13:32 : « sent 33× · 195,820.19 → 0x52a8… » montrait le montant et le destinataire
 *     du SEUL dernier envoi, comme s il resumait les 33. Le resume dit le TOTAL et le nombre de wallets. */
/** Somme EXACTE de montants decimaux en texte (« 22146.665951691321294165 ») — jamais en flottant. */
export function sommeDecimale(textes) {
  let dec = 0;
  const ok = [];
  for (const t of textes) {
    const m = /^(\d+)(?:\.(\d+))?$/.exec(String(t).trim());
    if (!m) return null;
    ok.push(m); dec = Math.max(dec, (m[2] || '').length);
  }
  let total = 0n;
  for (const m of ok) total += BigInt(m[1] + (m[2] || '').padEnd(dec, '0'));
  const s = total.toString().padStart(dec + 1, '0');
  return dec ? (s.slice(0, -dec) + '.' + s.slice(-dec)).replace(/\.?0+$/, '') : s;
}

/** Le bilan d un groupe d envois : combien, le total des montants LUS, combien sans montant, combien de wallets. */
export function resumeEnvois(enfants) {
  const lus = (enfants || []).map((c) => c && c.quantite).filter((q) => q != null && q !== '');
  const wallets = new Set((enfants || []).map((c) => String((c && c.a) || '').toLowerCase()).filter(Boolean));
  return { n: (enfants || []).length, total: lus.length ? sommeDecimale(lus) : null, sansMontant: (enfants || []).length - lus.length, wallets: wallets.size };
}

/** « sent 33 transfers · 195,820.19 · 3 wallets ». `lisible` = le formateur d affichage de la page. */
export function titreEnvois(r, lisible) {
  const montant = r.total === null ? (r.sansMontant ? 'amount not read' : null)
    : lisible(r.total) + (r.sansMontant ? ' (+' + r.sansMontant + ' without a read amount)' : '');
  return ['sent ' + pl(r.n, 'transfer', 'transfers'), montant, r.wallets ? pl(r.wallets, 'wallet', 'wallets') : null].filter(Boolean).join(' · ');
}
