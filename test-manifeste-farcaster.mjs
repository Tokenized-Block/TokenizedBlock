// test-manifeste-farcaster.mjs — SI L APP SE DECLARE MINI APP, LE MANIFESTE DOIT REPONDRE.
//
// ⛔⛔ LE DEFAUT QUE CE FICHIER EXISTE POUR EMPECHER (releve par Zero 1 depuis un terminal,
//     2026-09-21) : `https://tokenizedblock.space/.well-known/farcaster.json` rendait **404**,
//     pendant que le HTML servi portait les balises `fc:miniapp` ET `fc:frame`. L app se presentait
//     donc a Farcaster comme une Mini App, et n avait rien a lui montrer quand il venait verifier.
//
//     Le fichier EXISTAIT sur le disque depuis le 8 septembre. Il n etait simplement pas dans
//     `SERVIS`. Un fichier qui existe et qu on ne sert pas n existe pas — et rien ne criait,
//     puisque le serveur n avertit que pour les fichiers DECLARES et absents, pas pour les fichiers
//     presents et non declares.
//
// ⛔ SECOND DEFAUT, TROUVE EN LE LISANT : toutes ses URL pointaient vers `tokenized-block.github.io`,
//    l ancien host, qui redirige. Meme servi, il aurait envoye les visiteurs dans le vide. Corriger
//    le 404 sans lire le contenu aurait donc produit un vert parfaitement inutile.
//
// ⛔ CE QUE CE TEST NE PEUT PAS FAIRE : dire si Farcaster ACCEPTE le manifeste. Il verifie qu il est
//    servi, qu il est du JSON valide, et qu il ne promet aucun host mort. La validation par
//    Farcaster lui-meme reste a faire, et elle n est pas faite.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const CHEMIN = '.well-known/farcaster.json';
const HOTE = 'https://tokenizedblock.space';
/* ⛔ LES HOSTS MORTS, NOMMES. `tokenized-block.github.io` repond 301 vers `/#creer` (mesure curl du
 *    2026-09-21) : une URL qui pointe la-dedans ne mene nulle part. */
const HOTES_MORTS = [/tokenized-block\.github\.io/i, /tokenized-block\.up\.railway\.app/i];

/* ══ 1. LE FICHIER EXISTE ET EST DU JSON ════════════════════════════════════════════════════ */
const f = new URL('./' + CHEMIN, import.meta.url);
ok(existsSync(f), CHEMIN + ' existe sur le disque');
const brut = readFileSync(f, 'utf8');
let m = null;
try { m = JSON.parse(brut); } catch (e) { /* laisse `m` a null pour l assertion suivante */ }
ok(m !== null, CHEMIN + ' est du JSON valide — un manifeste casse vaut un 404');
ok(m && m.miniapp && typeof m.miniapp === 'object', 'il porte un objet `miniapp`');

/* ══ 2. IL EST SERVI ════════════════════════════════════════════════════════════════════════
 * ⛔ C EST LE CONTROLE QUI MANQUAIT. Le reste du test aurait ete vert pendant que le fichier
 *    rendait 404 : exister n est pas etre servi. */
const serveur = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const dansServis = new RegExp("'" + CHEMIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'").test(serveur);
ok(dansServis, CHEMIN + ' est declare dans SERVIS — sinon le serveur rend 404 sur un fichier present');

/* ══ 3. AUCUNE URL NE POINTE VERS UN HOST MORT ══════════════════════════════════════════════ */
const urls = [...brut.matchAll(/"(https?:\/\/[^"]+)"/g)].map((x) => x[1]);
ok(urls.length >= 4, urls.length + ' URL(s) dans le manifeste — pas une liste vide');
for (const u of urls) {
  for (const mort of HOTES_MORTS) {
    ok(!mort.test(u), 'aucune URL ne vise un host mort — trouve : ' + u);
  }
  ok(u.startsWith(HOTE), 'toute URL vise ' + HOTE + ' — trouve : ' + u);
}

/* ══ 4. LE MANIFESTE ET LES BALISES DISENT LA MEME CHOSE ════════════════════════════════════
 * ⛔ Deux endroits qui decrivent la meme app finissent par diverger. Ici ils se comparent. */
const page = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
ok(/name="fc:miniapp"/.test(page), 'la page se declare bien Mini App — sinon ce test n a pas lieu d etre');
const imageDansMeta = /fc:miniapp[^>]*imageUrl&quot;:&quot;([^&]+)&quot;/.exec(page);
ok(imageDansMeta !== null, 'la balise fc:miniapp porte une imageUrl lisible');
if (imageDansMeta) {
  eq(imageDansMeta[1], m.miniapp.imageUrl,
    "l'image annoncee dans la balise et celle du manifeste sont la MEME — "
    + 'balise : ' + imageDansMeta[1] + ' · manifeste : ' + m.miniapp.imageUrl);
}

/* ══ 5. LES IMAGES CITEES SONT SERVIES ══════════════════════════════════════════════════════ */
for (const champ of ['iconUrl', 'imageUrl', 'splashImageUrl']) {
  const u = m.miniapp[champ];
  ok(typeof u === 'string' && u.length > 0, 'le manifeste porte ' + champ);
  const nom = String(u).slice(HOTE.length + 1);
  ok(existsSync(new URL('./' + nom, import.meta.url)),
    champ + ' designe un fichier qui existe : ' + nom);
  ok(new RegExp("'" + nom + "'").test(serveur),
    champ + ' designe un fichier qui est SERVI : ' + nom);
}

/* ══ 6. LE TEMOIN — sans lui, un test qui ne verifierait rien passerait aussi ════════════════ */
{
  const faux = '{"miniapp":{"iconUrl":"https://tokenized-block.github.io/icon.png"}}';
  const u = /"(https?:\/\/[^"]+)"/.exec(faux)[1];
  ok(HOTES_MORTS.some((r) => r.test(u)),
    "temoin : l'ancienne URL du manifeste EST attrapee — c'est exactement ce qui y etait ecrit");
  ok(!HOTES_MORTS.some((r) => r.test(HOTE + '/icon.png')),
    "temoin inverse : l'URL correcte n'est pas signalee a tort");
}

console.log('test-manifeste-farcaster : ' + n + ' assertions, ' + urls.length + ' URL(s), OK');
