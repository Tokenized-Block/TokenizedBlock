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

/* ══ 4. LA CLASSE, PAS LA PHRASE — le defaut est revenu par la porte d a cote ═════════════════
 * ⛔⛔⛔ CE MATIN J AI « CORRIGE » CE DEFAUT EN NE VISANT QU UNE FORMULATION (« Open your wallet to
 *   continue »), sur sept sites. Phil a ressorti une capture le meme jour : « Connect your wallet
 *   first: it is the one that signs... » en ROUGE sur l ecran de naissance. La classe etait restee
 *   ouverte. Un correctif qui vise une PHRASE au lieu d une CLASSE laisse le defaut revenir.
 *   ⇒ Le validateur de creation porte maintenant `prealable: true`, et les DEUX rendus le lisent.
 *     Ce bloc verifie la MECANIQUE, pas une chaine de caracteres : ajouter demain un sixieme
 *     prealable le fera suivre sans toucher a ce test. */
/* ⛔⛔⛔ ON NE SCANNE QUE LES LIGNES DE CODE DU VALIDATEUR, PAS LE FICHIER. Ma premiere version
 *   cherchait les motifs dans tout `app.html` et une assertion a rougi sur MON PROPRE COMMENTAIRE :
 *   il cite la phrase « The name is over 32 bytes » ET le mot `prealable` a quelques lignes, et un
 *   commentaire ne contient aucune accolade pour borner la recherche. C est la TROISIEME fois dans
 *   la journee qu une garde statique lit de la prose comme du code (deja vu sur un nom de compteur,
 *   puis sur un motif cite en commentaire).
 *   ⇒ On isole le corps de `validerCreation` et on jette les lignes de commentaire. Une garde qui
 *     ne sait pas distinguer le code du commentaire accuse au hasard. */
const corpsValidateur = (html.match(/function validerCreation\(\)[\s\S]*?\n\}/) || [''])[0]
  .split('\n').filter((l) => !/^\s*(\/\*|\*|\/\/)/.test(l)).join('\n');
t('le corps du validateur a bien ete isole', /if \(!compte\) return/.test(corpsValidateur));
t('le validateur de creation marque ses prealables',
  /return \{ ko: '[^']*', prealable: true \}/.test(corpsValidateur));
/* ⛔ ET IL EN MARQUE PLUSIEURS : un seul marquage serait un cas particulier, pas un canal. */
t('il y a au moins quatre prealables marques',
  (corpsValidateur.match(/prealable: true \}/g) || []).length >= 4);
/* ⛔⛔ LA MOITIE INVERSE, ENCORE : les vraies erreurs de saisie ne portent PAS le drapeau. Si tout
 *   le portait, le canal ne distinguerait plus rien et on aurait juste tout repeint en neutre. */
t('« over 32 bytes » reste une VRAIE erreur, sans le drapeau',
  /ko: 'The name is over 32 bytes[^}]*\}/.test(corpsValidateur)
  && !/The name is over 32 bytes[^}]*prealable/.test(corpsValidateur));
t('« Connect your wallet first » porte le drapeau',
  /Connect your wallet first[^}]*prealable: true/.test(corpsValidateur));
/* ⛔ LES DEUX RENDUS LISENT LE DRAPEAU. Deux rendus du meme verdict qui choisiraient des couleurs
 *   differentes apprendraient que la couleur est du hasard. */
t('le recap lit le drapeau', /!neutre && !v\.prealable \? ' wKo'/.test(html));
t('le second rendu lit le drapeau aussi', /if \(v\.prealable\) direPrealable\(e,/.test(html));
/* ⛔ ET LE COMPTEUR RESTE : un prealable non franchi est une creation qui n a pas eu lieu. La
 *   repeindre en neutre ne doit pas la rendre invisible dans l entonnoir. */
t('un prealable de creation reste COMPTE', /cree_refus_forme/.test(html));

console.log((ko.length ? 'KO ' + ko.length : 'OK') + ' — ' + ok + ' assertions');
for (const k of ko) console.log('  KO ' + k);
process.exit(ko.length ? 1 : 0);
