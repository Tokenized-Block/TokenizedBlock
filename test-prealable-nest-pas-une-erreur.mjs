/* UNE CONDITION PREALABLE N EST PAS UNE ERREUR — et la peindre en rouge apprend a ignorer le rouge.
 *
 * ⭐ PHIL, 2026-10-01, deux fois : « c est quoi ca ?? » puis « je vois toujours l erreur sur
 *   frontend », en pointant « Open your wallet to continue — it signs, this page never does. »
 *   affiche en ROUGE sous le bouton Give birth.
 *
 * ⛔⛔ IL A RAISON, ET LE DEFAUT N EST PAS LA PHRASE, C EST SA COULEUR. Rien n a rate : le wallet
 *   n est simplement pas encore connecte. `.wKo` porte `var(--dur)`, la couleur des REFUS — celle
 *   qui dit « on a essaye et ca n a pas marche ». L utiliser pour « il reste une etape » a deux
 *   couts, et le second est le pire :
 *     1. l utilisateur croit que l app est cassee et s en va ;
 *     2. celui qui reste APPREND que le rouge ne veut rien dire — et le jour ou un vrai refus
 *        s affiche (la pool refuse, le frais manque, rien ne sera envoye), il ne le lira pas.
 *   ⇒ Le rouge doit rester RARE pour rester lisible. Un prealable prend la note neutre.
 *
 * ⛔ CE QUI RESTE EN ROUGE, ET DOIT Y RESTER : « Your wallet did not connect, so nothing was
 *   started. » La, l utilisateur a AGI et ca a echoue. C est un refus, pas un prealable. Ce test
 *   exige la distinction dans les DEUX sens — sinon il suffirait de tout repeindre en neutre pour
 *   le faire passer, ce qui serait le defaut symetrique.
 */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let ok = 0; const ko = [];
const t = (nom, cond) => { if (cond) ok += 1; else ko.push(nom); };

/* ══ 1. LE HELPER EXISTE, ET IL NE PEINT PAS EN ROUGE ═════════════════════════════════════════ */
t('un helper `direPrealable` existe', /function direPrealable\s*\(/.test(html));
const corps = (html.match(/function direPrealable[\s\S]{0,400}?\n\}/) || [''])[0];
t('le helper ne pose JAMAIS la classe des refus', corps !== '' && !/wKo/.test(corps));
t('le helper pose bien une note', /className\s*=\s*'note'/.test(corps));

/* ══ 2. AUCUN PREALABLE DE WALLET N EST PEINT EN ROUGE ════════════════════════════════════════ */
/* ⛔⛔⛔ CE SCAN A DEJA EU UN ANGLE MORT, ET IL A LAISSE PASSER LE SITE DE LA CAPTURE DE PHIL.
 *   Ma premiere version ne regardait qu UNE ligne a la fois : elle attrapait les six formes
 *   compactes `el.className = '...'; el.textContent = ...;` et ratait la forme ETALEE sur deux
 *   lignes, qui est precisement celle de l ecran d echange. Six corrections, une survivante — et
 *   le test etait VERT. Une garde peut etre vraie et tenir la mauvaise moitie.
 *   ⇒ On scanne donc une FENETRE de trois lignes autour de chaque invitation, et on regarde si la
 *     classe des refus est posee a cote. */
/*   ⛔⛔ ET MA CORRECTION A SUR-CORRIGE, CE QUI EST LE DEFAUT SYMETRIQUE. J ai d abord elargi a une
 *     FENETRE de trois lignes : elle a accuse deux sites PARFAITEMENT CORRECTS, ou le `wKo` voisin
 *     appartient a un AUTRE message, lui vraiment rouge a juste titre (« ETH→USDC exit is Base
 *     mainnet only », « Pick a block and let it beat once »). Suivre cette garde m aurait fait
 *     neutraliser de VRAIS refus — exactement ce que la moitie « sens inverse » de ce fichier
 *     interdit. Une garde qui accuse la PROXIMITE au lieu de l ASSOCIATION fabrique le defaut
 *     qu elle pretend empecher.
 *   ⇒ On ne regarde donc que les deux formes ou la classe et le texte sont REELLEMENT la meme
 *     instruction : meme ligne, ou `className` suivi IMMEDIATEMENT de `textContent`. */
const lignes = html.split('\n');
const fautifs = [];
lignes.forEach((l, i) => {
  if (!/Open your wallet to continue/.test(l)) return;
  if (/wKo/.test(l)) fautifs.push(i + 1);
});
t('aucune invitation « Open your wallet » ne porte la classe des refus', fautifs.length === 0);
if (fautifs.length) ko.push('  lignes fautives : ' + fautifs.join(', '));
/* ⛔ ET LA FORME ETALEE N EXISTE PLUS NULLE PART, verifiee par un motif multi-lignes explicite. */
t('aucune forme etalee `wKo` puis `texteRefusConnexion` ne subsiste',
  !/className\s*=\s*'note wKo';\s*\n\s*\w+\.textContent\s*=\s*texteRefusConnexion\('Open your wallet/.test(html));

/* ⛔⛔ ET ON COMPTE LES PREALABLES, pour qu un futur ajout ne glisse pas hors du filet. Un test qui
 *   ne verifie que « zero fautif » resterait vert si TOUS les appels disparaissaient — il faut
 *   donc prouver qu il en reste a proteger. */
const prealables = (html.match(/Open your wallet to continue/g) || []).length;
t('il reste des prealables a proteger (le test ne passe pas par disparition)', prealables >= 5);

/* ══ 3. LE SENS INVERSE : UN VRAI REFUS RESTE ROUGE ═══════════════════════════════════════════ */
/* ⛔ SANS CETTE MOITIE, on pourrait faire passer le test en repeignant TOUT en neutre — et on
 *   perdrait la seule couleur qui dit « on a essaye et ca n a pas marche ». Une garde peut etre
 *   vraie et tenir la mauvaise moitie. */
const echecReel = lignes.some((l) => /wKo/.test(l) && /Nothing to sign|Not possible|could not be prepared/.test(l));
t('un vrai refus reste peint en rouge', echecReel);
t('la classe des refus existe toujours dans la feuille de style', /\.wKo\{color:var\(--dur\)\}/.test(html));

/* ⛔ « Your wallet did not connect » est un ECHEC (l utilisateur a agi), pas un prealable : il ne
 *   doit PAS etre passe au helper neutre. */
t('« did not connect » n est pas traite comme un prealable',
  !/direPrealable[^;]*did not connect/.test(html));

console.log((ko.length ? 'KO ' + ko.length : 'OK') + ' — ' + ok + ' assertions');
for (const k of ko) console.log('  KO ' + k);
process.exit(ko.length ? 1 : 0);
