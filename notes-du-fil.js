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

/** La phrase affichee au-dessus de la liste. ⛔ Jamais « 0 messages » : elle part du compte du Feed. */
export function phraseNotes(r, blocBas, blocHaut) {
  const f = (x) => Number(x).toLocaleString('en-US');
  const plage = Number.isFinite(blocBas) && Number.isFinite(blocHaut)
    ? (blocBas === blocHaut ? ' in chain block ' + f(blocBas) : ' in chain blocks ' + f(blocBas) + '–' + f(blocHaut)) : '';
  const bouts = [r.total + ' note' + (r.total === 1 ? '' : 's') + ' counted by the Feed' + plage];
  if (r.avecTexte) bouts.push(r.avecTexte + ' with readable text');
  if (r.sansTexte) bouts.push(r.sansTexte + ' with no text attached (a 0-amount transfer)');
  if (r.illisibles) bouts.push(r.illisibles + ' with extra bytes that are not text');
  if (r.enAttente) bouts.push(r.enAttente + ' being read…');
  if (r.nonLues) bouts.push('⚠️ ' + r.nonLues + ' could not be read right now — not empty, tap again to retry');
  return bouts.join(' · ');
}
