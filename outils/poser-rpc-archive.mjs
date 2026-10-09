/* poser-rpc-archive.mjs — MESURE PUIS POSE LE NOEUD D ARCHIVE (CDP Node) SUR RAILWAY, SANS QUE PERSONNE NE LISE SA CLE.
 *
 * usage :
 *   node outils/poser-rpc-archive.mjs "<fichier>"            # MESURE seulement : rien n est pose
 *   node outils/poser-rpc-archive.mjs "<fichier>" --poser    # mesure, puis pose BASE_RPC_ARCHIVE si l archive est servie
 *
 * Le fichier contient l URL du noeud, telle que le portail CDP la donne (Node > Base Mainnet) :
 *   https://api.developer.coinbase.com/rpc/v1/base/<CLIENT_API_KEY>
 * soit seule sur une ligne, soit sous la forme `BASE_RPC_ARCHIVE=<url>`.
 *
 * ⛔⛔ LA CLE NE SORT JAMAIS DE CE PROCESSUS (meme regle que poser-cle-cdp.mjs) : lue dans le fichier, envoyee au noeud et a
 *   `railway` par argument de processus (shell: false, aucun historique), JAMAIS imprimee ; toute sortie est masquee.
 * ⛔ PROBE BEFORE CODING : la doc CDP ne dit RIEN de l archive ni des plafonds de getLogs (lue le 2026-10-09). Ce script le
 *   MESURE avec les fenetres que le serveur demandera (999 blocs, PoolManager v4 Initialize, adresse et topic LUS dans
 *   serveur-web.js), a 5 profondeurs dont le bloc du Block 0. Il ne pose rien si l archive profonde n est pas servie.
 * ⚠️ CE QU IL NE MESURE PAS : le cout en BU d un getLogs (non documente) — le serveur plafonne donc ses appels par jour
 *   (BASE_RPC_ARCHIVE_MAX_JOUR, 3 000 par defaut) et publie sa consommation dans /sante.archive.
 * ⛔ Jamais `process.exit` apres un fetch : sous Windows (Node 24) il fait planter libuv (assertion UV_HANDLE_CLOSING, mesure le
 *   2026-10-09). Le script rend son code par `process.exitCode` et laisse le processus finir seul. */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SERVICE = 'tokenized-block';
const BLOC_ZERO = 50861088; /* naissance du Block 0 : le plancher du balayage des frais (HOOKS_FRAIS dans serveur-web.js) */

export function lireUrl(brutFichier) {
  for (const ligne of String(brutFichier).replace(/\r/g, '').split('\n')) {
    const l = ligne.trim();
    if (!l || l.startsWith('#')) continue;
    const m = /^BASE_RPC_ARCHIVE\s*=\s*(.*)$/.exec(l);
    let v = (m ? m[1] : l).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (/^https:\/\//.test(v)) return v;
  }
  return null;
}
/** Masque chaque segment long du chemin (la cle) et l URL entiere dans un texte, avant tout affichage. */
export function masqueur(url) {
  let segs = [];
  try { segs = new URL(url).pathname.split('/').filter((s) => s.length >= 12); } catch { segs = []; }
  return (s) => { let o = String(s ?? ''); o = o.split(url).join('«url masquée»'); for (const seg of segs) o = o.split(seg).join('«clé masquée»'); return o.slice(0, 300); };
}
/** La forme attendue : Base MAINNET chez CDP. Rend la longueur de la cle, jamais la cle. */
export function formeCdp(url) {
  let x;
  try { x = new URL(url); } catch { return { ok: false, pourquoi: 'URL illisible' }; }
  const segs = x.pathname.split('/').filter(Boolean);
  if (x.protocol !== 'https:' || x.host !== 'api.developer.coinbase.com' || segs.slice(0, 3).join('/') !== 'rpc/v1/base' || !segs[3] || segs.length !== 4) {
    return { ok: false, pourquoi: 'forme inattendue (hote ' + x.host + ', chemin ' + segs.slice(0, 3).join('/') + '/…) : on attend https://api.developer.coinbase.com/rpc/v1/base/<cle>, Base MAINNET' };
  }
  return { ok: true, longueurCle: segs[3].length };
}

async function principal(argv) {
  const CHEMIN = argv[2];
  const POSER = argv.includes('--poser');
  if (!CHEMIN) { console.log('usage : node outils/poser-rpc-archive.mjs "<fichier contenant l URL CDP Node>" [--poser]'); return 2; }
  const src = readFileSync(path.join(ICI, '..', 'serveur-web.js'), 'utf8');
  const PM_V4 = (src.match(/const PM_V4 = '(0x[0-9a-fA-F]{40})'/) || [])[1];
  const TOPIC_INITIALIZE = (src.match(/const TOPIC_INITIALIZE = '(0x[0-9a-f]{64})'/) || [])[1];
  if (!PM_V4 || !TOPIC_INITIALIZE) { console.log('⛔ PM_V4 / TOPIC_INITIALIZE introuvables dans serveur-web.js : rien n est mesure'); return 1; }
  let url;
  try { url = lireUrl(readFileSync(CHEMIN, 'utf8')); } catch (e) { console.log('⛔ fichier illisible : ' + String(e.code || e.message)); return 1; }
  if (!url) { console.log('⛔ aucune URL https dans ce fichier (rien n a ete affiche)'); return 1; }
  const forme = formeCdp(url);
  if (!forme.ok) { console.log('⛔ ' + forme.pourquoi); return 1; }
  const masquer = masqueur(url);
  console.log('✅ URL de forme CDP Node Base mainnet (cle de ' + forme.longueurCle + ' caracteres, NON affichee)');

  const appel = async (methode, params) => {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: methode, params }) });
      const j = await r.json().catch(() => null);
      const ms = Date.now() - t0;
      if (j && j.error) return { ok: false, ms, quoi: 'refus HTTP ' + r.status + ' : ' + masquer(j.error.message) };
      if (!j || j.result === undefined) return { ok: false, ms, quoi: 'HTTP ' + r.status + ' sans resultat' };
      return { ok: true, ms, result: j.result };
    } catch (e) { return { ok: false, ms: Date.now() - t0, quoi: 'muet : ' + masquer(e && e.message) }; }
  };

  const chaine = await appel('eth_chainId', []);
  if (!chaine.ok || chaine.result !== '0x2105') { console.log('⛔ eth_chainId : ' + (chaine.ok ? chaine.result + ' (pas Base mainnet 0x2105)' : chaine.quoi)); return 1; }
  const teteR = await appel('eth_blockNumber', []);
  if (!teteR.ok) { console.log('⛔ eth_blockNumber : ' + teteR.quoi); return 1; }
  const tete = parseInt(teteR.result, 16);
  console.log('✅ chainId 0x2105 · tete ' + tete + ' (' + teteR.ms + ' ms)');

  const profondeurs = [['recent (-2 000)', tete - 2000], ['-20 000', tete - 20000], ['-200 000', tete - 200000], ['-1 000 000', tete - 1000000], ['Block 0 (' + BLOC_ZERO + ')', BLOC_ZERO]];
  const verdicts = [];
  for (const [nom, bas] of profondeurs) {
    const r = await appel('eth_getLogs', [{ address: PM_V4, topics: [TOPIC_INITIALIZE], fromBlock: '0x' + bas.toString(16), toBlock: '0x' + (bas + 998).toString(16) }]);
    const ok = r.ok && Array.isArray(r.result);
    verdicts.push({ nom, ok });
    console.log((ok ? '✅' : '⛔') + ' getLogs 999 blocs, ' + nom.padEnd(22) + (ok ? r.result.length + ' log(s)' : r.quoi) + ' · ' + r.ms + ' ms');
    await new Promise((fin) => setTimeout(fin, 300));
  }
  /* la largeur : le serveur demande 999 ; on note si 2 000 passe aussi (sans en dependre) */
  const large = await appel('eth_getLogs', [{ address: PM_V4, topics: [TOPIC_INITIALIZE], fromBlock: '0x' + (tete - 22000).toString(16), toBlock: '0x' + (tete - 20001).toString(16) }]);
  console.log('ℹ️  getLogs 2 000 blocs a -20 000 : ' + (large.ok && Array.isArray(large.result) ? 'servi' : large.quoi));

  const servies = verdicts.filter((v) => v.ok).length;
  const profonde = verdicts[verdicts.length - 1].ok;
  console.log('\nVERDICT : ' + servies + '/' + verdicts.length + ' profondeurs servies ; Block 0 ' + (profonde ? 'SERVI' : 'NON servi') + '.');
  if (!POSER) { console.log('Mesure seulement. Pour poser : relancer avec --poser.'); return profonde ? 0 : 1; }
  if (!profonde) { console.log('⛔ RIEN N EST POSE : ce noeud ne sert pas l historique profond dont le serveur a besoin.'); return 1; }

  const BIN = process.env.RAILWAY_BIN || 'C:\\Users\\VolKov\\AppData\\Roaming\\npm\\node_modules\\@railway\\cli\\bin\\railway.exe';
  console.log('→ railway variables --service ' + SERVICE + ' --set BASE_RPC_ARCHIVE=…');
  const r = spawnSync(BIN, ['variables', '--service', SERVICE, '--set', 'BASE_RPC_ARCHIVE=' + url], { shell: false, encoding: 'utf8' });
  if (r.error) { console.log('⛔ railway n a pas pu etre lance : ' + String(r.error.code || r.error.message)); return 1; }
  if (r.status !== 0) { console.log('⛔ railway a refuse (code ' + r.status + ')\n' + masquer(r.stderr || r.stdout)); return 1; }
  console.log('✅ BASE_RPC_ARCHIVE pose sur « ' + SERVICE + ' ». Railway redeploie le service.');
  console.log('   A lire ensuite : /sante.archive (pose:true, appels, servis, erreurs) et /sante.noeuds (noeud CDP, dans l heure).');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal(process.argv).then((code) => { process.exitCode = code; }, (e) => { console.log('⛔ ' + String((e && e.message) || e).slice(0, 200)); process.exitCode = 1; });
}
