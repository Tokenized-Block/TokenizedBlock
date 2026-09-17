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
import { resumerLancementsOL, OL_LISTE_BASE } from './openlaunch.js';

/* ⛔ PONT OPENLAUNCH (tip 0022). Leur API ne renvoie aucun en-tete CORS : la page ne peut pas la lire. Ce serveur la
 * lit pour elle — GET seul, 8 s max, UNE lecture par minute quel que soit le trafic, et il ne renvoie que le RESUME
 * valide par openlaunch.js (jamais la reponse brute). Echec = { ok:false } dit tel quel, pas une liste vide. */
let olCache = { a: 0, corps: null }, olEnCours = null;
function listeOpenLaunch() {
  if (olCache.corps && Date.now() - olCache.a < 60_000) return Promise.resolve(olCache.corps);
  /* des visiteurs simultanes partagent la MEME lecture en cours */
  if (!olEnCours) olEnCours = lireOpenLaunch().finally(() => { olEnCours = null; });
  return olEnCours;
}
async function lireOpenLaunch() {
  let corps;
  try {
    const r = await fetch(OL_LISTE_BASE, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    corps = JSON.stringify({ ok: true, lu: new Date().toISOString(), ...resumerLancementsOL(await r.json()) });
  } catch (e) {
    corps = JSON.stringify({ ok: false, pourquoi: 'OpenLaunch not read: ' + String(e && e.message || e).slice(0, 80) });
  }
  olCache = { a: Date.now(), corps };
  return corps;
}

/* ⛔ TRENDING (tip 0034). Mesure 2026-09-17 : ~5,4 M$ de volume 24 h sur les blocks B20 nes en 24 h, lances AILLEURS ;
 * on ne capte leurs frais que si le trade passe par notre Buy/Sell. Ce serveur tient la liste des blocks crees (logs
 * de la factory B20, lecture seule, 3 jours puis increments), lit DexScreener par lots de 30 et renvoie le classement.
 * Une lecture complete au plus toutes les 5 min, partagee par tous les visiteurs. Echec = { ok:false }, dit tel quel. */
import { listerCreations } from './index-blocks.js';
import { resumerTrending } from './trending.js';
const RPC_BASE = 'https://mainnet.base.org';
let rpcId = 0;
async function rpcServeur(methode, params) {
  for (let k = 0; k < 5; k++) {
    const r = await fetch(RPC_BASE, { method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: methode, params }) });
    const j = await r.json();
    if (!j.error) return j.result;
    if (!/rate|limit|timeout/i.test(String(j.error.message))) throw new Error(j.error.message);
    await new Promise((ok) => setTimeout(ok, 1200 * (k + 1)));
  }
  throw new Error('node rate limit');
}
const blocksConnus = new Set();
let blocsLusJusqua = null, trCache = { a: 0, corps: null }, trEnCours = null;
function trending() {
  if (trCache.corps && Date.now() - trCache.a < 300_000) return Promise.resolve(trCache.corps);
  if (!trEnCours) trEnCours = lireTrending().finally(() => { trEnCours = null; });
  /* une ancienne liste vaut mieux qu une attente de 2 min : on la rend pendant le rafraichissement */
  return trCache.corps ? Promise.resolve(trCache.corps) : trEnCours;
}
async function lireTrending() {
  let corps;
  try {
    const fin = parseInt(await rpcServeur('eth_blockNumber', []), 16);
    const blocs = blocsLusJusqua === null ? 3 * 43200 : Math.max(1, fin - blocsLusJusqua);
    const cr = await listerCreations({ rpc: rpcServeur, blocs, fin });
    for (const c of cr.creations || []) if (/^0x[0-9a-fA-F]{40}$/.test(c.jeton || '')) blocksConnus.add(c.jeton.toLowerCase());
    if (!(cr.fenetresRatees || []).length) blocsLusJusqua = fin;
    const adrs = [...blocksConnus], paires = [];
    for (let i = 0; i < adrs.length; i += 30) {
      const r = await fetch('https://api.dexscreener.com/tokens/v1/base/' + adrs.slice(i, i + 30).join(','), { signal: AbortSignal.timeout(10000) });
      if (r.ok) { const j = await r.json(); if (Array.isArray(j)) paires.push(...j); }
      await new Promise((ok) => setTimeout(ok, 250));
    }
    corps = JSON.stringify({ ok: true, lu: new Date().toISOString(), blocksSuivis: adrs.length,
      fenetresRatees: (cr.fenetresRatees || []).length, ...resumerTrending(paires, adrs, { max: 400 }) }); /* tip 0038 : tous les blocks vivants pour la map (Trade en montre 40) */
  } catch (e) {
    corps = trCache.corps || JSON.stringify({ ok: false, pourquoi: 'Trending not read: ' + String(e && e.message || e).slice(0, 80) });
  }
  trCache = { a: Date.now(), corps };
  return corps;
}
/* premiere lecture des le demarrage : le premier visiteur n attend pas 3 jours de logs */
setTimeout(() => { void trending(); }, 2000);

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
  'visage.js', 'logo.js', 'faits.js', 'envoi.js', 'cerveau.js', 'metiers.js', 'frais-creation.js', 'prix-eth.js', 'messages.js', 'paires.js', 'face.js', 'lancer-pool.js', 'nourriture.js', 'apercu.js', 'mes-blocks.js', 'fil-live.js', 'achats.js', 'tokenomics.js', 'lancer-pool-v2.js', 'memoire-chaine.js', 'resume-tx.js', 'origine.js', 'echange.js', 'journal-cerveau.js', 'liquidite.js', 'regles-cerveau.js', 'fragments-cerveau.js', 'parole-cerveaux.js', 'export-cerveau.js', 'brain-tasks.js', 'stades.js', 'pools-du-jeton.js', 'messagerie-blocks.js', 'relais-cerveaux.js', 'pnl-swaps.js', 'openlaunch.js', 'openlaunch-launch.js', 'map3d.js', 'trending.js',
  'abi.json', 'known-bad.json', 'A-SIGNER-mainnet.json', 'brain-agent.json',
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

/** Le build du fichier SERVI, lu dans son `data-build` — jamais une constante tapee a cote. */
function buildServi() {
  const e = cache.get('/' + RACINE);
  if (!e) return null;
  const m = /data-build="([0-9-]{6,32})"/.exec(e.corps.toString('utf8').slice(0, 200000));
  return m ? m[1] : null;
}

/* ⛔⛔ INCIDENT 2026-09-17 : un deploiement fait hors git servait app.html SANS map3d.js / openlaunch.js /
 * openlaunch-launch.js (absents de SERVIS) -> 404 -> le module de l app ne se chargeait plus, map vide,
 * mais la page repondait 200 et /sante disait ok. Desormais on relit les imports de app.html au demarrage :
 * tout module importe et non servi est journalise ET fait repondre /sante ok:false avec la liste. */
const modulesManquants = [];
try {
  const html = readFileSync(join(ici, RACINE), 'utf8');
  for (const m of html.matchAll(/from\s+'\.\/([A-Za-z0-9_-]+\.m?js)'/g)) {
    if (!cache.has('/' + m[1]) && !modulesManquants.includes(m[1])) modulesManquants.push(m[1]);
  }
} catch (e) {
  modulesManquants.push('app.html illisible : ' + e.message);
}
if (modulesManquants.length) console.error('[servi] ⛔ MODULES IMPORTES MAIS NON SERVIS (app cassee) : ' + modulesManquants.join(', '));

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
  'cache-control': e.image ? 'public, max-age=86400' : 'no-store, max-age=0',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
});

createServer((req, res) => {
  /* ⛔ Old Railway host name must never serve content — always send people to MAIN. */
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  if (host === 'tokenized-block-production.up.railway.app') {
    const raw = String(req.url || '/');
    const dest = 'https://tokenized-block.up.railway.app' + (raw.startsWith('/') ? raw : '/' + raw);
    res.writeHead(301, { Location: dest, 'Cache-Control': 'public, max-age=3600' });
    res.end();
    return;
  }

  const chemin = String(req.url || '/').split('?')[0];

  /* ⛔ 2026-09-14: Instant Create retired — factory createB20 unpaid on MAIN.
   * Hard 301 → /#creer (app.html free factory create; life fee at Launch → a6cf).
   * tip 2349: Create free on MAIN + Practice; fee moment = Launch. */
  if (chemin === '/index.html' || chemin === '/block-0.html') {
    res.writeHead(301, {
      Location: '/#creer',
      'Cache-Control': 'no-store, max-age=0',
    });
    res.end();
    return;
  }

  if (chemin === '/api/trending') {
    trending().then((corps) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(corps);
    });
    return;
  }

  if (chemin === '/api/ol/list') {
    listeOpenLaunch().then((corps) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(corps);
    });
    return;
  }

  /* sonde de sante — pour qu un cron puisse demander « es-tu vivant » sans charger l app */
  if (chemin === '/sante') {
    /* ok:false (et 503) si un module importe par l app n est pas servi : la page repondrait 200 mais serait morte */
    const ok = modulesManquants.length === 0;
    res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    /* ⛔ LE BUILD SERVI, POUR QU UN ONGLET DEJA OUVERT SACHE QU IL EST PERIME (2026-09-17 : Phil lisait
     * une page d avant le deploiement et en concluait que le travail n avait pas ete fait). Lu dans le
     * fichier SERVI, jamais recopie a la main. */
    res.end(JSON.stringify({ ok, servis: cache.size, racine: RACINE, build: buildServi(), ...(ok ? {} : { modulesManquants }) }));
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
  /* ⛔ 2026-09-14: never 304 HTML/JS — Chrome kept Paid Create / Brain unread after Railway tip. Images still etag. */
  if (!e.image && req.headers['if-none-match'] === e.etag) {
    /* fall through to 200 with full body */
  } else if (e.image && req.headers['if-none-match'] === e.etag) {
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
