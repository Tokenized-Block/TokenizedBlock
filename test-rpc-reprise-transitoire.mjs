/* test-rpc-reprise-transitoire.mjs — UN HOQUET NE DOIT PAS TUER UNE LECTURE SANS SECOURS.
 *
 * ⛔⛔ CE QUI A ETE MESURE, 2026-09-25, chargement neuf en production : UN refus `403` parmi ~89
 *     ressources. Chez publicnode le 403 est un etranglement deguise — le commentaire du pin de la
 *     factory B20 en comptait 34 par chargement. Or la reprise de `rpcReseau` ne couvrait QUE le
 *     429 : un 403, un 502 ou un `Failed to fetch` passaient au noeud suivant sans reessayer.
 *     Et pour les lectures EPINGLEES (factory B20 : un seul noeud, par decision deliberee) il n y a
 *     pas de noeud suivant. Un seul hoquet suffisait donc a faire echouer la lecture.
 *
 * ⛔ CE TEST N EST PAS STRUCTUREL. Il EXTRAIT `rpcReseau` de app.html et l EXECUTE, avec un `fetch`
 *   et un `setTimeout` de laboratoire : on compte les appels reels et on lit les attentes reelles.
 *   `guards-measured-transport-not-execution` : une garde qui lit du texte source prouve qu une
 *   ligne existe, pas qu elle agit. Ici on fait agir la fonction livree.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que les deux echecs de mise en vie du 2026-09-24
 *   (`vie_ko_etape1`, `vie_ko_etape4`) venaient de la. Leur cause n est PAS mesuree — l entonnoir
 *   ne garde que l etape atteinte. Ce fichier repare un chemin qui pouvait casser, sans pretendre
 *   savoir qu il a casse.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

/* ── extraction de la VRAIE fonction, par equilibrage d accolades ─────────────────────────────── */
const debut = html.indexOf('async function rpcReseau(');
assert.ok(debut > 0, 'rpcReseau est introuvable dans app.html : ce test ne garde plus rien');
let prof = 0, fin = -1, dansTexte = null;
for (let i = html.indexOf('{', debut); i < html.length; i++) {
  const c = html[i], p = html[i - 1];
  if (dansTexte) { if (c === dansTexte && p !== '\\') dansTexte = null; continue; }
  if (c === '"' || c === "'" || c === '`') { dansTexte = c; continue; }
  if (c === '{') prof++;
  else if (c === '}') { prof--; if (!prof) { fin = i + 1; break; } }
}
assert.ok(fin > debut, 'les accolades de rpcReseau ne s equilibrent pas : extraction abandonnee');
const source = html.slice(debut, fin);
/* ⛔ la borne doit etre VRAIE : si on avait coupe trop court, la fonction ne contiendrait pas son
 *   `throw` final et le test verdirait sur une moitie de code. */
assert.match(source, /throw derniere \|\| new Error\('RPC unreachable on all nodes'\)/,
  'l extraction s est arretee avant la fin de rpcReseau');

/** Fabrique une copie executable en lui injectant ses dependances de portee exterieure.
 *  `setTimeout` est un parametre : il masque le global, donc les attentes sont INSTANTANEES et
 *  MESUREES au lieu d etre subies. */
function fabriquer({ noeuds, secours = [], reponses, b20Rpc = null }) {
  const appels = [], dodos = [];
  const fetchLabo = async (url) => {
    appels.push(url);
    const r = reponses[Math.min(appels.length - 1, reponses.length - 1)];
    if (r.jette) throw new TypeError('Failed to fetch');
    return { status: r.statut, ok: r.statut >= 200 && r.statut < 300, json: async () => r.corps };
  };
  const RESEAUX = { 8453: { rpc: noeuds, secours, b20Rpc, logsMultiRpc: null } };
  const faire = new Function('RESEAUX', 'CHAINE', 'ESSAIS_429', 'fetch', 'setTimeout',
    'let idRpc = 0; return (' + source + ');')(
    RESEAUX, 8453, 5, fetchLabo, (k, ms) => { dodos.push(ms); k(); });
  return { faire, appels, dodos };
}

let n = 0;
const v = (nom, fn) => { fn(); n++; };
const CAS = [];
const asynchrone = (nom, fn) => { CAS.push([nom, fn]); };

asynchrone('⛔⛔ un 403 sur le SEUL noeud est repris, et la lecture aboutit', async () => {
  /* ⛔⛔ LE CAS CENTRAL, et l ancien comportement etait : un appel, un echec, terminé. */
  const l = fabriquer({ noeuds: 'https://a.example', reponses: [
    { statut: 403 }, { statut: 403 }, { statut: 200, corps: { result: '0x2a' } }] });
  const r = await l.faire('eth_blockNumber', []);
  assert.equal(r, '0x2a', 'la lecture echoue encore apres deux hoquets transitoires');
  assert.equal(l.appels.length, 3, 'nombre d appels reseau inattendu : ' + l.appels.length);
  assert.deepEqual(l.dodos, [250, 700], 'les attentes de reprise ne sont plus 250 ms puis 700 ms');
});

asynchrone('⛔ la reprise est BORNEE a deux : un noeud mort rend la main', async () => {
  /* ⛔⛔ Sans borne, une page entiere attendrait un noeud qui ne repondra jamais — on aurait
   *     remplace une lecture ratee par une app qui gele. Trois appels au total, pas plus. */
  const l = fabriquer({ noeuds: 'https://a.example', reponses: [{ statut: 503 }] });
  await assert.rejects(() => l.faire('eth_blockNumber', []), /HTTP 503/);
  assert.equal(l.appels.length, 3, 'la reprise n est plus bornee a deux : ' + l.appels.length + ' appels');
  assert.equal(l.dodos.reduce((a, b) => a + b, 0), 950,
    'le cout maximal ajoute n est plus ~1 s : ' + l.dodos.reduce((a, b) => a + b, 0) + ' ms');
});

asynchrone('une coupure reseau (fetch qui jette) est transitoire aussi', async () => {
  /* ⛔ Un `Failed to fetch` n a pas de statut. Sans le cas `statut === 0`, la panne la plus banale
   *   — un wifi qui cligne — resterait le seul hoquet non repris. */
  const l = fabriquer({ noeuds: 'https://a.example', reponses: [
    { jette: true }, { statut: 200, corps: { result: '0x7' } }] });
  assert.equal(await l.faire('eth_blockNumber', []), '0x7');
  assert.equal(l.appels.length, 2);
});

asynchrone('⛔ un 400 n est PAS repris — une requete mal formee le restera', async () => {
  /* ⛔ Rejouer un 400 n offre que de la latence. Le distinguer est le test qui prouve que la
   *   condition regarde le STATUT et pas seulement « ca a echoue ». */
  const l = fabriquer({ noeuds: 'https://a.example', reponses: [{ statut: 400 }] });
  await assert.rejects(() => l.faire('eth_call', [{ to: '0x1' }]), /HTTP 400/);
  assert.equal(l.appels.length, 1, 'un 400 est repris : ' + l.appels.length + ' appels');
  assert.deepEqual(l.dodos, [], 'un 400 fait attendre');
});

asynchrone('⛔⛔ une erreur JSON-RPC n est jamais rejouee — un revert est une REPONSE', async () => {
  /* ⛔⛔ Le noeud a repondu 200 et a dit « ca revert ». Le rejouer donnerait le meme revert, deux
   *     fois plus lentement, et ferait passer une reponse claire pour une panne reseau. */
  const l = fabriquer({ noeuds: 'https://a.example', reponses: [
    { statut: 200, corps: { error: { message: 'execution reverted' } } }] });
  await assert.rejects(() => l.faire('eth_call', [{ to: '0x1' }]), /execution reverted/);
  assert.equal(l.appels.length, 1, 'un revert est rejoue : ' + l.appels.length + ' appels');
});

asynchrone('⛔ tant qu il reste un secours, on y va TOUT DE SUITE', async () => {
  /* ⛔ La reprise ne doit pas retarder le repli : insister sur un noeud qui vient de refuser est
   *   plus lent ET moins sur que d essayer le suivant. Premier noeud : un seul appel. */
  const l = fabriquer({ noeuds: 'https://a.example', secours: ['https://b.example'], reponses: [
    { statut: 403 }, { statut: 200, corps: { result: '0x1' } }] });
  assert.equal(await l.faire('eth_blockNumber', []), '0x1');
  assert.deepEqual(l.appels, ['https://a.example', 'https://b.example'],
    'le premier noeud a ete rejoue au lieu de laisser la place au secours');
  assert.deepEqual(l.dodos, [], 'un repli disponible a quand meme fait attendre');
});

asynchrone('⛔ mais le DERNIER secours, lui, a droit a la reprise', async () => {
  /* ⛔ C est la moitie qu on oublie : la garde ne doit pas dire « un seul noeud », elle doit dire
   *   « plus de noeud derriere ». Sinon une configuration a trois noeuds perd la reprise entiere. */
  const l = fabriquer({ noeuds: 'https://a.example', secours: ['https://b.example'], reponses: [
    { statut: 403 }, { statut: 403 }, { statut: 200, corps: { result: '0x5' } }] });
  assert.equal(await l.faire('eth_blockNumber', []), '0x5');
  assert.deepEqual(l.appels, ['https://a.example', 'https://b.example', 'https://b.example'],
    'le dernier noeud n a pas ete repris : ' + l.appels.join(' → '));
});

asynchrone('⛔⛔ la lecture EPINGLEE de la factory B20 profite de la reprise', async () => {
  /* ⛔⛔ C est le vrai motif de ce correctif. Le pin sur un seul noeud est deliberé (un secours qui
   *     se trompe rendrait une LISTE VIDE indistinguable de « aucun evenement ») — mais il privait
   *     ces lectures, 34 par chargement, de toute reprise. Le pin reste ; la reprise arrive. */
  const FACTORY = '0xb20f000000000000000000000000000000000000';
  const l = fabriquer({ noeuds: 'https://pn.example', secours: ['https://autre.example'],
    b20Rpc: 'https://officiel.example',
    reponses: [{ statut: 403 }, { statut: 200, corps: { result: '0xbeef' } }] });
  assert.equal(await l.faire('eth_call', [{ to: FACTORY, data: '0x1234' }]), '0xbeef');
  assert.deepEqual(l.appels, ['https://officiel.example', 'https://officiel.example'],
    'la lecture de la factory a quitte son noeud epingle ou n a pas ete reprise');
});

v('le 429 garde sa politique mesuree, intacte', () => {
  /* ⛔⛔ NON-CHANGEMENT DELIBERE, consigne ici pour qu il ne soit pas « corrige » plus tard : elargir
   *     la reprise du 429 au dernier noeud ferait attendre ~22 s par lecture quand les trois noeuds
   *     etranglent ensemble. Sous la charge d une map vivante, ca change un ralentissement en gel.
   *     Le reglage a 5 essais vient d une mesure du 2026-09-13 ; on ne le rejoue pas a l aveugle. */
  assert.match(source, /if \(essai < ESSAIS_429 && noeuds\.length === 1\)/,
    'la politique du 429 a change : si c est voulu, mesurer le cas « les trois noeuds etranglent »');
});

for (const [nom, fn] of CAS) { await fn(); n++; }
assert.equal(n, 9, 'compte de cas inattendu : ' + n);
console.log('ok rpc-reprise-transitoire — ' + n + ' cas, fonction REELLE executee : 403/5xx/coupure');
console.log('   repris deux fois max (~1 s), 400 et revert jamais, repli toujours prioritaire.');
console.log('⚠️ NE PROUVE PAS que les echecs de mise en vie du 09-24 venaient de la : leur cause');
console.log('   n est pas mesuree, l entonnoir ne garde que l etape atteinte.');
