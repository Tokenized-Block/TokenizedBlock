// serveur-web.js — sert l app en production, avec les en-tetes que GitHub Pages ne laisse pas regler.
// ================================================================================================
// ⛔ LA RAISON D ETRE DE CE FICHIER EST UNE MESURE. Le 2026-09-10, `tokenized-block.github.io`
//    repondait `Cache-Control: max-age=600` sur chaque page, et cet en-tete n est pas configurable
//    la-bas. Dix minutes pendant lesquelles un visiteur revoit le deploiement PRECEDENT — Phil l a
//    constate en rechargeant et en retrouvant l ancienne version. Un correctif deploye qu on ne peut
//    pas montrer n est pas un correctif.
//
// ⇒ ICI LE HTML NE SE MET JAMAIS EN CACHE. `no-cache` ne veut pas dire « ne garde rien » : ca veut
//   dire « redemande-moi avant de reutiliser ». Le navigateur garde sa copie, envoie son ETag, et
//   recoit 304 si rien n a bouge. Cout : une requete. Gain : plus jamais d ancienne version.
//
// ⛔ LISTE BLANCHE EXPLICITE, PAS DE PARCOURS DE DOSSIER. Un serveur statique qui resout un chemin
//    demande sert `../../.env` le jour ou quelqu un le demande. Ici un chemin absent de la table
//    n existe pas, point — meme discipline que le serveur de developpement.
//
// ⛔ AUCUN SECRET, AUCUNE CLE, AUCUNE ECRITURE. Ce processus ne fait que lire des fichiers publics
//    deja servis par GitHub Pages : rien de neuf n est expose par ce deploiement.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ici = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

/* ⛔ CE QUI EST SERVI, NOMME UN PAR UN. Ajouter un fichier a l app demande de l ajouter ici — c est
 * volontairement un peu penible : la meme discipline a deja evite qu un module importe mais non
 * declare parte en production en 404 silencieux. */
const SERVIS = [
  'app.html', 'index.html', 'block-0.html', 'lien-x.html',
  'apparence.js', 'classement.js', 'consentement.js', 'criblage.js', 'encodeur.js',
  'index-blocks.js', 'keccak.js', 'lancement.js', 'lecteur.js', 'lien-x.js', 'marche.js',
  'montants.js', 'motssimples.js', 'photo.js', 'pointsdevie.js', 'pool.js', 'vitalite.js',
  'visage.js', 'logo.js', 'faits.js', 'envoi.js', 'cerveau.js', 'metiers.js', 'frais-creation.js', 'prix-eth.js', 'messages.js', 'paires.js', 'face.js', 'lancer-pool.js', 'nourriture.js', 'apercu.js', 'mes-blocks.js', 'fil-live.js', 'achats.js', 'tokenomics.js', 'lancer-pool-v2.js', 'memoire-chaine.js', 'resume-tx.js', 'origine.js', 'echange.js', 'journal-cerveau.js', 'liquidite.js', 'regles-cerveau.js',
  'abi.json', 'known-bad.json', 'A-SIGNER-mainnet.json',
  'icon.png', 'splash.png', 'embed.png',
];

/* ⛔ L APP NEUVE EST LA RACINE. L ancien ecran reste atteignable a son nom, mais ce n est plus lui
 * qu on montre en premier — c est la decision produit du 2026-09-10. */
const RACINE = 'app.html';

/* ETag calcule au demarrage : les fichiers ne changent pas pendant la vie du processus, et un
 * recalcul par requete ferait lire le disque pour rien. */
const cache = new Map();
for (const nom of SERVIS) {
  const chemin = join(ici, nom);
  if (!existsSync(chemin)) {
    /* ⛔ ON LE DIT AU DEMARRAGE, PAS EN 404 SILENCIEUX A MINUIT. Un fichier declare et absent est un
     * defaut de deploiement, et il doit se voir dans les journaux tout de suite. */
    console.warn('[servi] DECLARE MAIS ABSENT : ' + nom);
    continue;
  }
  const corps = readFileSync(chemin);
  cache.set('/' + nom, {
    corps,
    type: TYPES[nom.slice(nom.lastIndexOf('.'))] || 'application/octet-stream',
    etag: '"' + createHash('sha256').update(corps).digest('hex').slice(0, 24) + '"',
    image: nom.endsWith('.png'),
  });
}

/* ⛔⛔ XMTP VENDORISE, VERIFIE AU DEMARRAGE, FICHIER PAR FICHIER. Les fichiers viennent du CDN via
 * `vendor-xmtp.mjs` (lance avant ce serveur) ; ICI on recalcule chaque sha256 et on refuse de servir
 * tout fichier dont l empreinte differe du manifeste. Un seul fichier suspect n eteint pas l app :
 * seule la messagerie privee s arrete, et le journal le dit.
 * ⛔ UNIQUEMENT LES CHEMINS DU MANIFESTE, sous /npm/, sans `..` : pas de parcours de dossier. */
let xmtpServis = 0, xmtpRefuses = 0;
try {
  const manifeste = JSON.parse(readFileSync(join(ici, 'xmtp-manifeste.json'), 'utf8'));
  for (const [servi, attendu] of Object.entries(manifeste.fichiers || {})) {
    if (!servi.startsWith('/npm/') || servi.includes('..')) { xmtpRefuses++; continue; }
    const chemin = join(ici, 'vendor', ...servi.split('/').filter(Boolean));
    if (!existsSync(chemin)) { xmtpRefuses++; continue; }
    const corps = readFileSync(chemin);
    const empreinte = createHash('sha256').update(corps).digest('hex');
    if (empreinte !== attendu.sha256) {
      console.warn('[xmtp] EMPREINTE DIFFERENTE, non servi : ' + servi);
      xmtpRefuses++;
      continue;
    }
    cache.set(servi, {
      corps,
      type: servi.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8',
      etag: '"' + empreinte.slice(0, 24) + '"',
      image: false,
    });
    xmtpServis++;
  }
} catch (e) {
  console.warn('[xmtp] manifeste illisible — messagerie privee indisponible : ' + e.message);
}
console.log('[xmtp] ' + xmtpServis + ' fichier(s) servis, ' + xmtpRefuses + ' refuse(s)');

const entete = (e) => ({
  'content-type': e.type,
  etag: e.etag,
  /* ⛔ LES IMAGES PEUVENT DORMIR, LE CODE NON. Une icone qui change est un evenement rare ; un
   * module JavaScript qui change est le quotidien de ce projet, et le servir depuis un cache
   * remettrait exactement le probleme qu on vient de fuir. */
  'cache-control': e.image ? 'public, max-age=86400' : 'no-cache',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
});

createServer((req, res) => {
  const chemin = String(req.url || '/').split('?')[0];

  /* sonde de sante — pour qu un cron puisse demander « es-tu vivant » sans charger l app */
  if (chemin === '/sante') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, servis: cache.size, racine: RACINE }));
    return;
  }

  const cle = chemin === '/' ? '/' + RACINE : chemin;
  const e = cache.get(cle);
  if (!e) {
    /* ⛔ UN 404 EST UN 404. Rediriger vers l accueil ferait passer une faute de frappe pour une
     * page valide, et casserait le temoin negatif de nos sondes de production. */
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end('not served');
    return;
  }
  if (req.headers['if-none-match'] === e.etag) {
    res.writeHead(304, entete(e));
    res.end();
    return;
  }
  res.writeHead(200, entete(e));
  res.end(req.method === 'HEAD' ? undefined : e.corps);
}).listen(PORT, '0.0.0.0', () => {
  console.log('tokenized-block sert ' + cache.size + ' fichier(s) sur le port ' + PORT);
  console.log('racine -> ' + RACINE + '  ·  HTML et JS en no-cache, images 24 h');
});
