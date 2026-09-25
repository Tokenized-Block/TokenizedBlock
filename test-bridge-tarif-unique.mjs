/* test-bridge-tarif-unique.mjs — LE TARIF DU BRIDGE N A QU UNE SEULE SOURCE.
 *
 * ⛔⛔ CE QUI A ETE MESURE, 2026-09-25, sur la page LIVE a 375 px. Le panneau Bridge affichait :
 *         « ETH/USDC 0.01% skim (live) »   et   « Sell / swap … — 0.01% fee »
 *     alors que `BRIDGE_FEE_BPS` vaut 50n : le prelevement est `total * 50n / 10000n`, soit 0,5 %.
 *     UN FACTEUR CINQUANTE entre le tarif lu et le tarif preleve, sur l ecran ou quelqu un decide
 *     de payer. Dix-huit litteraux « 0.01% » au total entre app.html et bridge.js.
 *
 * ⛔ PERSONNE N A MENTI — ET C EST BIEN LE PROBLEME. Le chiffre a change le 2026-09-24 (« écris
 *   0.5% alors »), les constantes ont suivi, les phrases non. Un tarif recopie a la main derive
 *   toujours ; la seule protection est qu il n existe qu a un endroit.
 *
 * ⛔ ET LE MOT « live » ETAIT FAUX AUSSI : la jambe `skim` est marquee `live: false` dans le module.
 *   bridge.js avait deja corrige sa propre phrase, mais le HTML en gardait une copie — corriger une
 *   source d un texte duplique laisse l autre gagner a l ecran.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que 0,5 % soit le bon prix. C est une decision produit, prise
 *   par Phil. Il prouve que le prix AFFICHE est celui qui est PRELEVE — rien de plus, et c est
 *   deja ce qui manquait.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { BRIDGE_FEE_BPS, BRIDGE_FEE_RATE, BRIDGE_FEE_LABEL } from './bridge.js';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('./bridge.js', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

/** Le code sans ses commentaires : un commentaire qui CITE le defaut historique est legitime et
 *  doit le rester — c est la memoire de l incident. Seul ce qui peut atteindre l ecran est juge. */
const sansCommentaires = (s) => s
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');

v('⛔⛔ les trois constantes disent le MEME tarif', () => {
  /* ⛔⛔ LE CAS CENTRAL. Si le libelle et les bps divergent, tout le reste de ce fichier garde une
   *     coherence autour d une valeur fausse — la garde tiendrait la mauvaise moitie. */
  const bps = Number(BRIDGE_FEE_BPS);
  assert.equal(BRIDGE_FEE_RATE, bps / 10000,
    'BRIDGE_FEE_RATE (' + BRIDGE_FEE_RATE + ') ne correspond pas a ' + bps + ' centiemes de point');
  const attendu = (bps / 100).toFixed(2).replace(/\.?0+$/, '') + '%';
  assert.equal(BRIDGE_FEE_LABEL, attendu,
    'le libelle affiche « ' + BRIDGE_FEE_LABEL + ' » alors que le prelevement vaut « ' + attendu + ' »');
});

v('⛔⛔ aucun tarif de bridge n est ecrit en dur dans ce qui atteint l ecran', () => {
  /* ⛔⛔ C EST LE DEFAUT EXACT QUI A ETE LIVRE. Un pourcentage recopie est un pourcentage qui
   *     derivera : il ne bouge pas quand la decision bouge, et personne ne relit les dix-sept
   *     autres copies. */
  /* ⛔⛔ MA PREMIERE VERSION A ACCUSE A TORT, et je l ai bornee plutot que de l assouplir : en
   *     balayant app.html en entier elle attrapait le 0,5 % LEGITIME de Buy/Sell (qui vient de
   *     `FRAIS_INTERFACE_BPS`, une autre source de verite, correcte), plus « fee above 0% » et un
   *     affichage de frais de hook. Une garde qui liste des faux positifs finit ignoree comme celle
   *     qui crie au loup — `never-accuse-on-own-incompleteness`.
   *   ⇒ Le perimetre est le BRIDGE : la section `v-bridge`, et les surfaces bridge situees hors
   *     section, nommement listees ci-dessous. Tout le reste de l app ne regarde pas cette garde. */
  const d = html.indexOf('id="v-bridge"');
  assert.ok(d > 0, 'la section Bridge est introuvable : cette garde ne protege plus rien');
  const finSection = html.indexOf('</section>', d);
  assert.ok(finSection > d, 'la section Bridge ne se referme pas');
  const horsSection = [...html.matchAll(/[^\n]*(?:on Bridge volume|via your Bridge block)[^\n]*/g)]
    .map((m) => m[0]).join('\n');
  const corpsHtml = sansCommentaires(html.slice(d, finSection) + '\n' + horsSection);
  const corpsJs = sansCommentaires(js);
  /* ⛔ on ne cherche pas « 0.01% » (le tarif d hier) mais TOUT pourcentage colle au vocabulaire du
   *   bridge : sinon la garde ne verrait pas le prochain chiffre faux, seulement l ancien. */
  const motif = /(?:fee|skim|frais)[^<>\n]{0,40}?\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*%[^<>\n]{0,20}?(?:fee|skim|on Bridge volume)/gi;
  for (const [source, nom] of [[corpsHtml, 'app.html · section Bridge'], [corpsJs, 'bridge.js']]) {
    const trouves = [...source.matchAll(motif)]
      .map((m) => m[0].replace(/\s+/g, ' ').trim())
      /* le partage de supply « <0.01% » n est pas un tarif : c est une part de jetons detenue */
      .filter((s) => !/<\s*0\.01%/.test(s))
      /* ⛔ LA DECLARATION DU LIBELLE EST LA SOURCE, pas une copie — c est le seul endroit ou le
       *   tarif a le droit d etre ecrit. Le premier cas de ce fichier verifie deja qu il
       *   correspond aux bps reellement preleves, donc l exempter ici n ouvre aucun trou. */
      .filter((s) => !/FEE_LABEL\s*=/.test(s));
    assert.deepEqual(trouves, [],
      'tarif ecrit en dur dans ' + nom + ' — il derivera comme le precedent :\n   · '
      + trouves.join('\n   · '));
  }
});

v('les emplacements du tarif existent et valent « — » au repos', () => {
  /* ⛔⛔ FAIL-CLOSED SUR LE PRIX. Si le peintre ne tourne jamais (erreur plus haut, module non
   *     charge), l ecran montre un tiret. Un prix manquant est honnete ; un prix faux ne l est pas.
   *     Mettre « 0.5% » en dur comme repli aurait recree le defaut qu on corrige. */
  const emplacements = [...html.matchAll(/<(b|span)\s+data-frais-bridge\s*>([^<]*)</g)];
  assert.ok(emplacements.length >= 5,
    'seulement ' + emplacements.length + ' emplacement(s) de tarif : les autres sont-ils revenus en dur ?');
  for (const m of emplacements) {
    assert.equal(m[2].trim(), '—',
      'un emplacement de tarif contient « ' + m[2].trim() +' » au repos au lieu d un tiret');
  }
});

v('⛔ le peintre lit la constante, jamais une valeur recopiee', () => {
  const corps = sansCommentaires(html);
  assert.match(corps, /querySelectorAll\('\[data-frais-bridge\]'\)\)\s*el\.textContent = BRIDGE_FEE_LABEL/,
    'le peintre du tarif a disparu ou n utilise plus BRIDGE_FEE_LABEL');
  assert.match(corps, /import \{[^}]*BRIDGE_FEE_LABEL[^}]*\} from '\.\/bridge\.js'/,
    'app.html n importe plus le libelle : il ne peut donc plus le peindre');
});

v('⛔⛔ le mot « live » ne qualifie plus une jambe marquee morte', () => {
  /* ⛔⛔ « live » etait le mot le plus cher du panneau : il disait « cet echange fonctionne » la ou
   *     le module dit `live: false`. Le HTML en gardait une copie apres la correction du module. */
  const corps = sansCommentaires(html);
  assert.doesNotMatch(corps, /skim \(live\)/i,
    'le panneau annonce de nouveau un « skim (live) » alors que la jambe est marquee live: false');
  assert.doesNotMatch(corps, /Fee[^<>\n]{0,30}skim is live/i,
    'le panneau annonce de nouveau un prelevement « live »');
});

v('⛔⛔ le bouton porte le nom de ce qu il FAIT', () => {
  /* ⛔⛔ Il s appelait « Confirm Bridge fee » et il VEND les blocks par leur pool. Confirmer « un
   *     frais » n est pas consentir a se separer de ce qu on detient : c est un probleme de
   *     consentement, pas de formulation. */
  const i = html.indexOf('id="brConfirm"');
  assert.ok(i > 0, 'le bouton de confirmation du Bridge est introuvable');
  const balise = html.slice(html.lastIndexOf('<', i), html.indexOf('</button>', i));
  assert.match(balise, /Sell/i,
    'le bouton ne dit plus qu il vend : ' + balise.slice(balise.indexOf('>') + 1));
  assert.doesNotMatch(balise, /Confirm Bridge fee/i,
    'le bouton est redevenu « Confirm Bridge fee » pour un geste qui vend des blocks');
});

assert.equal(n, 6, 'compte de cas inattendu : ' + n);
console.log('ok bridge-tarif-unique — ' + n + ' cas · tarif servi par BRIDGE_FEE_LABEL ('
  + BRIDGE_FEE_LABEL + '), emplacements fail-closed,');
console.log('   plus aucun « live » sur une jambe morte, et le bouton dit qu il vend.');
console.log('⚠️ NE PROUVE PAS que 0,5 % soit le bon prix — c est une decision produit. Il prouve');
console.log('   que le prix AFFICHE est celui qui est PRELEVE.');
