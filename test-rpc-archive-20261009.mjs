/* test-rpc-archive-20261009.mjs — LE NOEUD D ARCHIVE (CDP Node) : BRANCHE, BORNE, ET SA CLE NE SORT JAMAIS.
 *
 * Contexte (2026-10-09) : aucun noeud gratuit ne sert l historique profond (base.org 429, publicnode 403 au-dela de ~9 000 blocs,
 * drpc 10 blocs) ; le proprietaire pose un CDP Node. Son URL PORTE LA CLE dans son chemin
 * (https://api.developer.coinbase.com/rpc/v1/base/<cle>, doc CDP). Les gardes :
 *   A. EXECUTE (bloc extrait de serveur-web.js) : URL validee (https, sans identifiants), budget PAR JOUR compte et refuse au-dela
 *      (refus nomme, jamais une liste vide), compteurs servis/erreurs, remise a zero au changement de jour ; libelleNoeud = l hote ;
 *      masquerCle retire la cle d un message.
 *   B. CABLAGE : l archive passe APRES publicnode ; la sonde publie libelleNoeud(url), jamais l URL ; /sante.archive ne porte
 *      que le libelle ; le mode essai n a pas d archive.
 *   C. LE SCRIPT outils/poser-rpc-archive.mjs : lecture du fichier, forme Base MAINNET exigee, masquage ; il n imprime jamais
 *      `url` ni un segment du chemin.
 * ⛔ BORNE : que CDP serve l archive n est PAS prouve ici (cle non posee au moment du banc) — le script le mesure. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { lireUrl, masqueur, formeCdp, urlDepuisCleNue, formeDeCle } from './outils/poser-rpc-archive.mjs';

let n = 0;
const cas = async (titre, f) => { n++; try { await f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const nu = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
const CLE = 'k3yNEVERshownABCDEFGH1234';
const URL_CDP = 'https://api.developer.coinbase.com/rpc/v1/base/' + CLE;

/* le bloc RPC_ARCHIVE … lecteurArchive … masquerCle … libelleNoeud, extrait tel que livre */
const i = src.indexOf('const RPC_ARCHIVE = (() => {');
const j = src.indexOf('let repliServeur = null;', i);
assert.ok(i > 0 && j > i, 'bloc archive introuvable');
/* un faux disque : `fichiers` tient ce que le bloc ecrit, pour juger la persistance du compteur */
const fabrique = (env, essai = false, lire = async () => [], fichiers = new Map()) => new Function('process', 'ESSAI_SRV', 'lecteurUrl',
  'existsSync', 'join', 'readFileSync', 'writeFileSync', 'renameSync',
  src.slice(i, j) + '\n; return { RPC_ARCHIVE, ARCHIVE_MAX_JOUR, archiveCompte, lecteurArchive, libelleNoeud, masquerCle };')(
  { env }, { actif: essai }, () => lire,
  (p) => p === '/data' || fichiers.has(p), (...x) => x.join('/'), (p) => fichiers.get(p), (p, v) => fichiers.set(p, v), (a, b) => { fichiers.set(b, fichiers.get(a)); fichiers.delete(a); });

await cas('A1 URL validee : https sans identifiants ; absente, http ou mode essai = pas d archive', async () => {
  assert.equal(fabrique({ BASE_RPC_ARCHIVE: URL_CDP }).RPC_ARCHIVE, URL_CDP);
  assert.equal(fabrique({}).RPC_ARCHIVE, null);
  assert.equal(fabrique({ BASE_RPC_ARCHIVE: 'http://api.developer.coinbase.com/rpc/v1/base/x' }).RPC_ARCHIVE, null);
  assert.equal(fabrique({ BASE_RPC_ARCHIVE: 'https://u:p@exemple.com/x' }).RPC_ARCHIVE, null);
  assert.equal(fabrique({ BASE_RPC_ARCHIVE: URL_CDP }, true).RPC_ARCHIVE, null, 'le mode essai (fork local) ne doit joindre aucun noeud public');
});
await cas('A2 budget par jour : 3 000 par defaut, refus NOMME au-dela, compte', async () => {
  let appels = 0;
  const m = fabrique({ BASE_RPC_ARCHIVE: URL_CDP, BASE_RPC_ARCHIVE_MAX_JOUR: '2' }, false, async () => { appels++; return [{ x: 1 }]; });
  assert.equal(fabrique({ BASE_RPC_ARCHIVE: URL_CDP }).ARCHIVE_MAX_JOUR, 3000);
  const lire = m.lecteurArchive();
  assert.deepEqual(await lire('eth_getLogs', [{}]), [{ x: 1 }]);
  await lire('eth_getLogs', [{}]);
  await assert.rejects(lire('eth_getLogs', [{}]), /daily budget reached \(2 calls\)/);
  assert.equal(appels, 2, 'le noeud a ete appele au-dela du budget');
  assert.equal(m.archiveCompte.appels, 2); assert.equal(m.archiveCompte.servis, 2); assert.equal(m.archiveCompte.refusBudget, 1);
});
await cas('A2b le compteur du jour SURVIT a un redemarrage (meme jour) et repart a 0 un autre jour', async () => {
  const disque = new Map();
  const m1 = fabrique({ BASE_RPC_ARCHIVE: URL_CDP }, false, async () => [], disque);
  const lire = m1.lecteurArchive();
  for (let k = 0; k < 25; k++) await lire('eth_getLogs', [{}]);
  assert.ok(disque.has('/data/archive-compte.json'), 'le compteur n a pas ete sauve au 25e appel');
  const m2 = fabrique({ BASE_RPC_ARCHIVE: URL_CDP }, false, async () => [], disque);
  assert.equal(m2.archiveCompte.appels, 25, 'un redemarrage a remis le compteur a zero');
  /* au-dela du plafond, `appels` ne bouge plus : les REFUS doivent etre sauves eux aussi (prod : 53 refus -> 51 apres redeploiement) */
  const plein = new Map();
  const p1 = fabrique({ BASE_RPC_ARCHIVE: URL_CDP, BASE_RPC_ARCHIVE_MAX_JOUR: '1' }, false, async () => [], plein);
  const lp = p1.lecteurArchive();
  await lp('eth_getLogs', [{}]);
  for (let k = 0; k < 25; k++) await assert.rejects(lp('eth_getLogs', [{}]), /daily budget/);
  assert.equal(fabrique({ BASE_RPC_ARCHIVE: URL_CDP, BASE_RPC_ARCHIVE_MAX_JOUR: '1' }, false, async () => [], plein).archiveCompte.refusBudget, 25,
    'les refus au-dela du plafond ont ete perdus au redemarrage');
  const vieux = new Map([['/data/archive-compte.json', JSON.stringify({ jour: '2000-01-01', appels: 9999, servis: 9999, erreurs: 0, refusBudget: 0 })]]);
  assert.equal(fabrique({ BASE_RPC_ARCHIVE: URL_CDP }, false, async () => [], vieux).archiveCompte.appels, 0, 'le compteur d un autre jour a ete repris');
});
await cas('A3 une erreur du noeud est comptee et RE-LEVEE (jamais une liste vide)', async () => {
  const m = fabrique({ BASE_RPC_ARCHIVE: URL_CDP }, false, async () => { throw new Error('401 invalid key'); });
  await assert.rejects(m.lecteurArchive()('eth_getLogs', [{}]), /401/);
  assert.equal(m.archiveCompte.erreurs, 1);
});
await cas('A3b un refus TRANSITOIRE (debit) est relance et finit servi ; un refus definitif ne l est pas', async () => {
  let n = 0;
  const m = fabrique({ BASE_RPC_ARCHIVE: URL_CDP }, false, async () => { n++; if (n === 1) throw new Error('over rate limit'); return ['ok']; });
  assert.deepEqual(await m.lecteurArchive()('eth_getLogs', [{}]), ['ok']);
  assert.equal(m.archiveCompte.erreurs, 0); assert.equal(m.archiveCompte.relances, 1); assert.equal(m.archiveCompte.servis, 1);
  assert.equal(m.archiveCompte.appels, 2, 'la relance doit compter au budget');
  let k = 0;
  const d = fabrique({ BASE_RPC_ARCHIVE: URL_CDP }, false, async () => { k++; throw new Error('invalid params'); });
  await assert.rejects(d.lecteurArchive()('eth_getLogs', [{}]), /invalid params/);
  assert.equal(k, 1, 'un refus definitif a ete relance');
});
await cas('A3c QUI depense et QUELLES erreurs : par origine+methode (relances comprises), erreurs par classe — et ca survit au redemarrage', async () => {
  /* prod 2026-10-09 : 10 000 / 10 000 et 549 erreurs, sans savoir qui avait depense ni de quel type */
  const disque = new Map();
  let appelsCall = 0;
  const m = fabrique({ BASE_RPC_ARCHIVE: URL_CDP }, false, async (methode) => {
    if (methode === 'eth_call' && ++appelsCall === 1) throw new Error('HTTP 429 over rate limit');
    if (methode === 'eth_getBlockByNumber') throw new Error('upstream 503 unavailable');
    if (methode === 'eth_getCode') throw new Error('invalid params');
    return [];
  }, disque);
  const h = m.lecteurArchive('histoire'), r = m.lecteurArchive('repli');
  for (let x = 0; x < 3; x++) await h('eth_getLogs', [{}]);
  await r('eth_call', [{}]); /* 1er essai 429 -> relance -> servi */
  await assert.rejects(r('eth_getBlockByNumber', []), /503/); /* 3 essais, puis erreur finale « 5xx » */
  await assert.rejects(r('eth_getCode', []), /invalid params/); /* definitif : 1 essai, « autre » */
  assert.deepEqual(m.archiveCompte.par, { 'histoire eth_getLogs': 3, 'repli eth_call': 2, 'repli eth_getBlockByNumber': 3, 'repli eth_getCode': 1 });
  assert.equal(Object.values(m.archiveCompte.par).reduce((a, b) => a + b, 0), m.archiveCompte.appels, 'par ne couvre pas tous les appels');
  assert.deepEqual(m.archiveCompte.erreursPar, { '5xx': 1, autre: 1 });
  assert.equal(m.archiveCompte.derniereErreur, 'invalid params');
  /* redemarrage le meme jour : tout est relu (le sauvetage a lieu tous les 25 appels — on le force ici) */
  for (let x = 0; x < 16; x++) await h('eth_getLogs', [{}]);
  assert.equal(m.archiveCompte.appels, 25);
  const m2 = fabrique({ BASE_RPC_ARCHIVE: URL_CDP }, false, async () => [], disque);
  assert.equal(m2.archiveCompte.par['histoire eth_getLogs'], 19);
  assert.deepEqual(m2.archiveCompte.erreursPar, { '5xx': 1, autre: 1 });
  assert.equal(m2.archiveCompte.derniereErreur, 'invalid params');
  assert.equal(m2.archiveCompte.relances, 3);
  /* un fichier corrompu ne fait pas entrer de cle non entiere */
  const sale = new Map([['/data/archive-compte.json', JSON.stringify({ jour: new Date().toISOString().slice(0, 10), appels: 1, par: { ok: 2, mal: 'x', neg: -1 }, erreursPar: [1] })]]);
  const m3 = fabrique({ BASE_RPC_ARCHIVE: URL_CDP }, false, async () => [], sale);
  assert.deepEqual(m3.archiveCompte.par, { ok: 2 }); assert.deepEqual(m3.archiveCompte.erreursPar, {});
});
await cas('A4 libelleNoeud publie l hote, jamais le chemin ; masquerCle retire la cle', async () => {
  const m = fabrique({ BASE_RPC_ARCHIVE: URL_CDP });
  assert.equal(m.libelleNoeud(URL_CDP), 'api.developer.coinbase.com (path hidden)');
  assert.equal(m.libelleNoeud('https://base-rpc.publicnode.com'), 'base-rpc.publicnode.com');
  assert.ok(!m.libelleNoeud(URL_CDP).includes(CLE));
  assert.ok(!m.masquerCle('bad key ' + CLE + ' for ' + URL_CDP).includes(CLE));
});

await cas('B1 cablage : archive APRES publicnode ; la sonde et /sante ne publient que des libelles', async () => {
  assert.match(nu, /avecRepliLogs\(rpcServeurBrut, \[\.\.\.REPLIS_LOGS_SERVEUR\.map\(\(u\) => lecteurUrl\(u\)\), \.\.\.\(RPC_ARCHIVE \? \[lecteurArchive\('repli'\)\] : \[\]\)\]\)/);
  assert.match(nu, /archiveDirect = lecteurArchive\('histoire'\);/, 'l histoire directe doit porter son origine');
  assert.match(nu, /res\[libelleNoeud\(url\)\] = n;/);
  assert.ok(!/res\[url\.replace\(/.test(nu), 'la sonde publie encore l URL brute');
  assert.match(nu, /archive: \{ pose: Boolean\(RPC_ARCHIVE\), noeud: RPC_ARCHIVE \? libelleNoeud\(RPC_ARCHIVE\) : null, maxJour: ARCHIVE_MAX_JOUR, \.\.\.archiveCompte \}/);
  /* RPC_ARCHIVE n est jamais imprime ni concatene a un texte */
  assert.ok(!/console\.(log|warn|error)\([^)]*RPC_ARCHIVE(?!\s*\?)/.test(nu), 'RPC_ARCHIVE imprime dans un journal');
  assert.ok(!/['"`]\s*\+\s*RPC_ARCHIVE\b/.test(nu), 'RPC_ARCHIVE concatene a un texte');
  assert.match(nu, /'refus: ' \+ masquerCle\(/);
});

const script = readFileSync(new URL('./outils/poser-rpc-archive.mjs', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
await cas('C1 le script : forme Base MAINNET exigee, lecture du fichier, masquage', async () => {
  assert.equal(lireUrl('# c\nBASE_RPC_ARCHIVE="' + URL_CDP + '"\r\n'), URL_CDP);
  assert.equal(lireUrl(URL_CDP + '\n'), URL_CDP);
  assert.equal(lireUrl('rien'), null);
  /* le portail donne la cle SEULE (projects/api-keys > Client API Key) : elle devient l URL Base mainnet */
  assert.equal(urlDepuisCleNue('  ' + CLE + '\r\n'), URL_CDP);
  assert.equal(urlDepuisCleNue('deux mots ' + CLE), null);
  assert.equal(urlDepuisCleNue('court'), null);
  assert.equal(urlDepuisCleNue('https://x/' + CLE), null);
  assert.deepEqual(formeCdp(URL_CDP), { ok: true, longueurCle: CLE.length, forme: 'alphanumerique' });
  assert.equal(formeDeCle('123e4567-e89b-12d3-a456-426614174000'), 'UUID', 'un UUID est la forme d un Project ID / Secret key ID');
  assert.equal(formeDeCle('abc_def'), 'autre');
  assert.equal(formeCdp('https://api.developer.coinbase.com/rpc/v1/base-sepolia/' + CLE).ok, false);
  assert.equal(formeCdp('https://evil.example/rpc/v1/base/' + CLE).ok, false);
  const m = masqueur(URL_CDP);
  assert.ok(!m('erreur sur ' + URL_CDP + ' et ' + CLE).includes(CLE));
});
await cas('C2 le script n imprime jamais l URL ni un segment du chemin ; railway sans shell', async () => {
  /* les ARGUMENTS de chaque console.log : ni `url` nu, ni un segment du chemin (masquer(...) les neutralise) */
  const args = [...script.matchAll(/console\.log\(([^;]*)\);/g)].map((m) => m[1].replace(/masquer\([^)]*\)/g, 'M'));
  assert.ok(args.length >= 10, 'trop peu de console.log trouves : ' + args.length);
  for (const a of args) {
    assert.ok(!/\burl\b/.test(a), 'console.log qui imprime l URL : ' + a.slice(0, 120));
    assert.ok(!/segs?\[\d\](?!\.length)/.test(a), 'console.log qui imprime un segment du chemin : ' + a.slice(0, 120));
  }
  /* temoin : la sonde attrape une ligne fautive */
  assert.ok(/\burl\b/.test("'noeud : ' + url"), 'temoin');
  assert.match(script, /spawnSync\(BIN, \['variables', '--service', SERVICE, '--set', 'BASE_RPC_ARCHIVE=' \+ url\], \{ shell: false, encoding: 'utf8', cwd: path\.join\(ICI, '\.\.'\) \}\)/,
    'railway doit tourner depuis la racine du depot lie, pas depuis le dossier de l appelant');
  assert.ok(!/process\.exit\(/.test(script), 'process.exit apres fetch fait planter libuv sous Windows');
});

console.log('✓ ' + n + ' cas — noeud d archive : branche apres publicnode, borne par jour, cle jamais publiee');
