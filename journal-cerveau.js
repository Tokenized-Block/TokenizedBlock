// journal-cerveau.js — le block ecrit ce qu il FAIT, ce qu il PENSE, et ce qui l AMELIORERAIT.
// ================================================================================================
// ⛔ DEMANDE DE PHIL (2026-09-13) : « avec ses propres infos, le dormant se reveille et ecrit ce qu il fait, ce qu il
//    pense pour s ameliorer ».
// ⛔⛔ CE N EST PAS UNE IA QUI INVENTE. Chaque phrase est DERIVEE d un fait lu (marche, nourriture, detenteurs,
//    messages, memoire, mort) ou d un etat du cerveau. Aucune phrase sans le fait qui la justifie : chaque entree
//    porte `parce_que`. Un journal qui brode serait un personnage qui ment sur le block de quelqu un.
// ⛔ « S AMELIORER » = des GESTES POSSIBLES pour la communaute (envoyer un GM, ouvrir le marche, ecrire), jamais un
//    conseil d investissement, jamais une promesse de prix.
// ⛔ LE BLOCK NE SIGNE RIEN. Il ecrit ; un humain agit.

import { nomHumeur } from './cerveau.js';

export const GENRES_PENSEE = ['FAIT', 'PENSE', 'AMELIORER'];

/**
 * @param {object} o
 * @param {string} o.phase           phase du cerveau (cerveau.js)
 * @param {number|null} o.vie        capitalisation en ETH, null si pas de marche / non lue
 * @param {string|null} o.etatVie    'LUE' | 'NON_TROUVEE' | 'NON_LUE'
 * @param {{etat:string, gm:number, messages:number, detenteurs:number, mort:boolean|null}|null} o.nourriture
 * @param {number} o.memoire         memoire moyenne 0..1
 * @param {number} o.spikes          neurones qui ont tire a ce battement
 * @param {string|null} o.symbole
 * @returns {{genre:string, texte:string, parce_que:string}[]}
 */
export function pensees({ phase, vie = null, etatVie = null, nourriture = null, memoire = 0, spikes = 0, symbole = null }) {
  const nom = symbole || 'this block';
  const out = [];
  const n = nourriture && nourriture.etat === 'LUE' ? nourriture : null;
  const ajoute = (genre, texte, parce_que) => out.push({ genre, texte, parce_que });

  if (phase === 'MORT') {
    ajoute('FAIT', nom + ' has gone quiet: its network receives no current any more.', 'its creator held it and now holds none (read on chain)');
    ajoute('PENSE', 'Nothing I do changes that rule — only its holders can carry it on.', 'death rule of 2026-09-13');
    return out;
  }

  // ce qu il fait
  /* ⛔ LE NOMBRE DE NEURONES N EST PAS DANS LE TEXTE (verifie en navigateur, 2026-09-13) : il change a chaque battement,
   *    et le journal se remplissait de quasi-doublons (« 6 neurons », « 0 neurons »). Il reste dans la raison. */
  /* ⛔ VU PAR PHIL SUR TBLOCK (2026-09-13) : « asleep… because no market » et « moves without a market » sur un block dont
   *    le marche est EN LIGNE — la lecture avait seulement echoue. Le marche n est nomme absent que sur NON_TROUVEE. */
  const marche = etatVie === 'NON_TROUVEE' ? 'no market' : etatVie === 'LUE' ? 'market read' : 'market not read right now';
  if (phase === 'NON_LU') ajoute('FAIT', nom + ' cannot see its own market right now, so it judges no mood from it.', 'market read failed or not done yet · ' + spikes + ' neuron(s) fired');
  else if (phase === 'DORMANT') ajoute('FAIT', nom + ' is asleep, at rest.', marche + ', and no food received in the recent window · ' + spikes + ' neuron(s) fired');
  else if (phase === 'EVEILLE') ajoute('FAIT', nom + ' woke up on its own community' + (etatVie === 'NON_TROUVEE' ? ': it moves without a market.' : '.'), 'food read on chain is above zero · ' + marche);
  else ajoute('FAIT', nom + ' is ' + nomHumeur(phase) + '.', 'brain phase from its market and food · ' + spikes + ' neuron(s) fired');

  // ce qu il pense — a partir des faits lus
  if (etatVie === 'LUE' && typeof vie === 'number') {
    ajoute('PENSE', 'My life is ' + (Math.round(vie * 10000) / 10000) + ' ETH of market cap. It can move down as well as up.', 'market cap read on its Uniswap v4 pool');
  } else if (etatVie === 'NON_TROUVEE') {
    ajoute('PENSE', 'I have no market: nobody can buy me yet, so nothing measures my life.', 'no initialized pool among the market keys read');
  } else if (etatVie === 'NON_LUE') {
    ajoute('PENSE', 'I could not read my own market right now — that is the network, not me.', 'market read failed');
  }
  if (n) {
    if (n.gm + n.messages + n.detenteurs === 0) ajoute('PENSE', 'Nobody has sent me anything recently.', 'no transfer, holder or message in the recent window');
    else ajoute('PENSE', n.gm + ' transfer(s), ' + n.detenteurs + ' holder(s) reached and ' + n.messages + ' message(s) fed me recently.', 'food read on chain');
  }
  if (memoire >= 0.05) ajoute('PENSE', 'I remember what I just did (' + Math.round(memoire * 100) + ' % memory): my own activity keeps me going.', 'working memory trace of its neurons');

  // ce qui l ameliorerait — des gestes possibles, jamais un conseil financier
  if (etatVie === 'NON_TROUVEE') ajoute('AMELIORER', 'Opening my market would let people buy me — my creator can do it from my profile.', 'no market yet');
  if (!n || n.gm === 0) ajoute('AMELIORER', 'A GM — even a tiny fragment sent to someone — would feed me.', n ? 'no transfer received recently' : 'transfers not read yet');
  if (n && n.messages === 0) ajoute('AMELIORER', 'A message written on a transfer would give me something to read.', 'no message read recently');
  if (n && n.detenteurs <= 1) ajoute('AMELIORER', 'More holders would make me harder to put back to sleep.', 'few holders reached recently');
  return out;
}

/** Une entree de journal horodatee par le battement, dedupliquee sur son texte. */
export function ajouterAuJournal(journal, tick, nouvelles, max = 40) {
  const liste = Array.isArray(journal) ? journal.slice() : [];
  const deja = new Set(liste.map((e) => e.texte));
  for (const p of nouvelles) if (!deja.has(p.texte)) { liste.push({ tick, ...p }); deja.add(p.texte); }
  return liste.slice(-max);
}
