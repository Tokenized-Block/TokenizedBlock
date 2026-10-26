/* test-recherche-b20-20261026.mjs — UNE RECHERCHE POUR TOUT B20 (/api/recherche, recherche-b20.js), proprietaire 2026-10-26 :
 *   « improve the block search so every B20 is easy to find ». Mesure de depart (prod game53) : Map Find « RBLXc » -> « No block named »,
 *   alors que RBLXc etait dans la liste des actions PROUVEES du serveur ; UNIT absent de /api/chercher juste apres un deploiement.
 * EXECUTE : validerRequete (refus), construireIndex + chercherB20 (classement), l index des noms persiste (charger / exporter), et la VRAIE
 *   fonction `indexRecherche` de serveur-web.js (extraite, dependances doublees) : chaque source y est necessaire — un mutant qui en retire
 *   une doit faire rougir ce banc (TB_SRV=<copie mutee> node test-recherche-b20-20261026.mjs).
 * LIT : le cablage de la route (GET, 400 sur refus, 429, aucune lecture de chaine) et celui d app.html (Map, Blocks, Market).
 * NE PROUVE PAS : le rendu au navigateur, ni le remplissage de l index des noms en prod (debit inchange : 120 adresses / min).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
/* TB_MOD=<copie mutee de recherche-b20.js> : le meme banc contre un mutant du module (voir le commit) */
const { validerRequete, construireIndex, chercherB20, normaliser } = await import(process.env.TB_MOD || './recherche-b20.js');
import { creerIndexNoms, adressesANommer } from './recherche-noms.js';

let n = 0;
const cas = async (t, f) => { n += 1; try { await f(); console.log('  ok  ' + t); } catch (e) { console.error('✗ ' + t); throw e; } };

const UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
const RBLX = '0xb2000000000000000000005bd7ae89b9e6189bb5';
const TSLA = '0xb2000000000000000000001e800a7f5189430cd0';
const IB022 = '0xb200000000000000000000e4b0c5fbe9c8df579e';
const IMPOSTEUR = '0x' + 'a7'.repeat(20);
const NVDA = '0xb20000000000000000000078ee7ce2fe4908108c'; /* dans la liste prouvee SANS le « c » (« NVDA »), comme en prod */
const TOTO = '0x' + 'b2'.repeat(20), UNITY = '0x' + 'c3'.repeat(20), PAUVRE = '0x' + 'd4'.repeat(20), RECENT = '0x' + 'e5'.repeat(20), NU = '0x' + 'f6'.repeat(20);
const top = (q, idx, k) => { const v = validerRequete(q, k); assert.ok(v.ok, q + ' refuse : ' + v.pourquoi); return chercherB20(v, idx); };

await cas('validation : mauvaises entrees REFUSEES, avec une raison ; bonnes acceptees', async () => {
  for (const [q, k] of [[null], [''], ['   '], ['x'.repeat(49)], ['x'.repeat(201)], ['a‮b'], ['a\u0000b'], ['ab​c'], ['0x'], ['0X'], ['0x' + 'a'.repeat(41)],
    ['UNIT', '0'], ['UNIT', '21'], ['UNIT', 'abc'], ['UNIT', '-1'], ['UNIT', '1.5'], [42]]) {
    const v = validerRequete(q, k);
    assert.equal(v.ok, false, JSON.stringify(q) + ' / ' + k + ' accepte');
    assert.ok(typeof v.pourquoi === 'string' && v.pourquoi.length > 5, 'refus sans raison');
  }
  assert.deepEqual(validerRequete('  Société  ', null), { ok: true, q: 'societe', mode: 'TEXTE', limite: 8, brut: 'Société' });
  assert.equal(validerRequete('0xB2000000000000000000007AFA', '20').mode, 'ADRESSE');
  assert.equal(validerRequete('0xB2000000000000000000007AFA', '20').limite, 20);
  assert.equal(normaliser('ÉLON  Musk'), 'elon musk');
});

const SOURCES = [
  { nom: 'app', entrees: [{ adr: UNIT, sym: 'UNIT', notre: true }] },
  { nom: 'trending', entrees: [{ adr: TSLA, sym: 'TSLAc', nom: 'Tesla Inc.', marche: true, action: true, volume: 5e6 }, { adr: TOTO, sym: 'UNITED', nom: 'United coin', marche: true, volume: 0 },
    /* un HOMONYME de UNIT, avec marche et volume : UNIT doit quand meme passer devant (notre block) */
    { adr: IMPOSTEUR, sym: 'UNIT', nom: 'Unit', marche: true, volume: 9e6 }] },
  { nom: 'actions', entrees: [{ adr: RBLX, sym: 'RBLXc', action: true }, { adr: TSLA, sym: 'TSLA', action: true }, { adr: NVDA, sym: 'NVDA', action: true }] },
  { nom: 'creations', entrees: [{ adr: RECENT, sym: 'FRESH', nom: 'Crème brûlée' }] },
  { nom: 'noms', entrees: [{ adr: IB022, sym: 'IB022', nom: 'Smoke IB022' }, { adr: UNITY, sym: 'UNITY', nom: 'Communauté' }, { adr: PAUVRE, sym: 'XUNIT', nom: 'Poor unit' }, { adr: UNIT, sym: 'UNIT', nom: 'Unit' }] },
  { nom: 'connus', entrees: [{ adr: NU }, { adr: 'pas une adresse' }] },
];
const idx = construireIndex(SOURCES);

await cas('index : fusion par adresse, adresses mal formees ignorees, nommes comptes', async () => {
  assert.equal(idx.taille, 11);
  assert.equal(idx.nommes, 10, 'le block sans nom ne compte pas comme nomme');
  const t = idx.entrees.find((e) => e.adr === TSLA);
  assert.deepEqual(t.sources, ['trending', 'actions']);
});

await cas('⛔⛔ UNIT d abord : « UNIT », « unit », « Unit », debut d adresse « 0xb2000000000000000000007afa »', async () => {
  for (const q of ['UNIT', 'unit', 'Unit', '0xb2000000000000000000007afa', UNIT, UNIT.toUpperCase().replace('0X', '0x')]) {
    const r = top(q, idx);
    assert.equal(r.resultats[0].adr, UNIT, q + ' -> ' + JSON.stringify(r.resultats[0]));
  }
  assert.equal(top('UNIT', idx).resultats[0].rang, 'SYMBOLE');
  assert.equal(top(UNIT, idx).resultats[0].rang, 'ADRESSE');
});

await cas('classement : symbole exact > debut de symbole > debut de mot du nom ; a rang egal, marche avant sans marche', async () => {
  const r = top('unit', idx, 10).resultats;
  assert.deepEqual(r.map((x) => x.rang), ['SYMBOLE', 'SYMBOLE', 'SYMBOLE_DEBUT', 'SYMBOLE_DEBUT', 'NOM_DEBUT'], JSON.stringify(r));
  assert.equal(r[0].adr, UNIT, 'l homonyme a marche passe devant notre block');
  assert.equal(r[1].adr, IMPOSTEUR);
  assert.equal(r[2].adr, TOTO, 'UNITED (marche, volume 0) doit passer avant UNITY (sans marche, symbole plus court) au meme rang');
  assert.equal(r[4].adr, PAUVRE);
});

await cas('actions : symbole avec ou sans « c », par nom, par debut d adresse ; RBLXc trouve depuis la liste prouvee seule', async () => {
  for (const q of ['RBLXc', 'rblx', 'RBLX', '0xb2000000000000000000005bd7']) assert.equal(top(q, idx).resultats[0].adr, RBLX, q);
  for (const q of ['TSLAc', 'tsla', 'tesla']) assert.equal(top(q, idx).resultats[0].adr, TSLA, q);
  assert.equal(top('tsla', idx).resultats[0].sym, 'TSLAc', 'le symbole servi est celui de la premiere source (trending)');
  /* l alias : « NVDAc » trouve l action que la liste prouvee appelle « NVDA », au rang EXACT ; « RBLX » est exact aussi */
  assert.equal(top('NVDAc', idx).resultats[0] && top('NVDAc', idx).resultats[0].adr, NVDA, 'NVDAc introuvable (alias du « c »)');
  assert.equal(top('NVDAc', idx).resultats[0].rang, 'SYMBOLE');
  assert.equal(top('RBLX', idx).resultats[0].rang, 'SYMBOLE');
});

await cas('homonymes : la CASSE exacte tapee passe devant les homonymes a marche (mesure : SHADR 19e derriere 18 « Shadr »)', async () => {
  const S1 = '0x' + '31'.repeat(20), S2 = '0x' + '32'.repeat(20), S3 = '0x' + '33'.repeat(20);
  const h = construireIndex([{ nom: 'trending', entrees: [{ adr: S1, sym: 'Shadr', marche: true, volume: 5e5 }, { adr: S2, sym: 'Shadr', marche: true, volume: 9e5 }] },
    { nom: 'creations', entrees: [{ adr: S3, sym: 'SHADR', nom: 'Shadr Privacy' }] }]);
  assert.equal(top('SHADR', h).resultats[0].adr, S3, 'la casse exacte ne departage pas');
  assert.equal(top('Shadr', h).resultats[0].adr, S2, 'a casse egale, le marche (et son volume) d abord');
  assert.equal(top('shadr', h).resultats[0].adr, S2, 'aucune casse exacte : le marche d abord');
  assert.equal(top('UNIT', idx).resultats[0].adr, UNIT, 'la casse exacte d un homonyme passe devant notre block');
  const minus = construireIndex([{ nom: 'app', entrees: [{ adr: UNIT, sym: 'UNIT', notre: true }] },
    { nom: 'trending', entrees: [{ adr: IMPOSTEUR, sym: 'unit', marche: true, action: false, volume: 1e12 }] }]);
  assert.equal(top('unit', minus).resultats[0].adr, UNIT, '« unit » en minuscules, a marche et gros volume, passe devant notre block');
});
await cas('un rang domine TOUS les bonus : un nom exact (notre block, action, marche, casse) ne passe jamais devant un symbole exact nu', async () => {
  const X = '0x' + '41'.repeat(20), Y = '0x' + '42'.repeat(20);
  const i = construireIndex([{ nom: 'app', entrees: [{ adr: X, sym: 'ZED', nom: 'Moon', notre: true, action: true, marche: true, volume: 1e12 }] },
    { nom: 'noms', entrees: [{ adr: Y, sym: 'MOON' }] }]);
  assert.equal(top('Moon', i).resultats[0].adr, Y, JSON.stringify(top('Moon', i).resultats));
});
await cas('sans casse ni diacritiques ; nom par mot ; vieux block par l index des noms', async () => {
  assert.equal(top('creme brulee', idx).resultats[0].adr, RECENT);
  assert.equal(top('CRÈME', idx).resultats[0].adr, RECENT);
  assert.equal(top('communaute', idx).resultats[0].adr, UNITY);
  assert.equal(top('ib022', idx).resultats[0].adr, IB022);
  assert.equal(top('IB022', idx).resultats[0].rang, 'SYMBOLE');
});

await cas('borne : n resultats au plus, `plus` le dit ; rien = ABSENT (aucun resultat), pas une erreur', async () => {
  const r = top('0xb2', idx, 2);
  assert.equal(r.resultats.length, 2); assert.equal(r.plus, true); assert.ok(r.total >= 4);
  assert.equal(top('zzzzzz', idx).resultats.length, 0);
});

await cas('noms servis : sans caractere invisible, bornes', async () => {
  const sale = construireIndex([{ nom: 'noms', entrees: [{ adr: NU, sym: 'AB‮C', nom: 'x'.repeat(200) }] }]);
  const r = top('abc', sale).resultats[0];
  assert.equal(r.sym, 'ABC'); assert.equal(r.nom.length, 64);
});

await cas('index des noms PERSISTE : exporter -> charger, champs valides seulement, un nom lu n est pas ecrase', async () => {
  const a = creerIndexNoms({ lire: async () => { throw new Error('pas de chaine ici'); } });
  assert.equal(a.charger([[UNIT, 'Unit', 'UNIT'], ['nope', 'x', 'y'], [IB022, null, null], [RBLX, 'R‮', 'RBLXc'], [TSLA, 'x'.repeat(65), 'TSLAc'], 'pas un tableau']), 3);
  assert.deepEqual(a.exporter().map((e) => e[0]).sort(), [UNIT, RBLX, TSLA].sort());
  assert.equal(a.entrees().find((e) => e.adr === RBLX).nom, null, 'un nom a caractere de format a ete admis');
  const b = creerIndexNoms({ lire: async () => '0x' });
  b.charger([[UNIT, 'Unit', 'UNIT']]);
  assert.equal(b.charger([[UNIT, 'Faux', 'FAUX']]), 0, 'le disque a ecrase un nom deja lu');
  assert.equal(b.entrees()[0].sym, 'UNIT');
});

/* ── la VRAIE fonction du serveur ── */
const cheminSrv = process.env.TB_SRV || new URL('./serveur-web.js', import.meta.url);
/* fins de ligne : `\r?\n` partout (test-tests-portables) — le depot est en CRLF sous Windows, en LF ailleurs */
const srv = readFileSync(cheminSrv, 'utf8');
const d = srv.indexOf('let indexRechercheEtat');
const f0 = srv.indexOf('async function indexRecherche()', d);
const finF = f0 > 0 ? /\r?\n\}\r?\n/.exec(srv.slice(f0)) : null;
assert.ok(d > 0 && f0 > d && finF, 'indexRecherche introuvable dans serveur-web.js');
const tranche = srv.slice(d, f0 + finF.index + finF[0].length);

async function lancerIndexServeur() {
  const corps = JSON.stringify({ ok: true, lignes: [{ adr: TSLA, sym: 'TSLAc', nom: 'Tesla Inc.', volume24hUsd: 5e6, routeAction: { achetable: true } }],
    actionsChaine: { liste: [{ adr: RBLX, sym: 'RBLXc' }] } });
  const deps = {
    trending: async () => corps,
    nosBlocksEtat: { blocks: new Set(['0x' + 'aa'.repeat(20)]) },
    UNIT_BLOCK: UNIT,
    faitsCreation: new Map([[RECENT, { bloc: 1, symbole: 'FRESH', nom: 'Fresh' }]]),
    indexNoms: { entrees: () => [{ adr: IB022, sym: 'IB022', nom: 'Smoke IB022' }] },
    adressesANommer,
    createurParBlock: new Map([[NU, '0x' + '11'.repeat(20)]]),
    blocksConnus: new Set(),
    construireIndex,
  };
  const fn = new Function(...Object.keys(deps), tranche + '\nreturn indexRecherche();');
  return fn(...Object.values(deps));
}

await cas('⛔⛔ serveur : CHAQUE source de indexRecherche porte un block que les autres n ont pas (UNIT, trending, actions, creations, noms, connus)', async () => {
  const e = await lancerIndexServeur();
  const i = e.index;
  const trouve = (q) => { const r = top(q, i); return r.resultats[0] && r.resultats[0].adr; };
  assert.equal(trouve('UNIT'), UNIT, 'source app (UNIT) absente');
  assert.equal(trouve('0x' + 'aa'.repeat(20)), '0x' + 'aa'.repeat(20), 'nos blocks absents');
  assert.equal(trouve('tesla'), TSLA, 'source trending absente');
  assert.equal(trouve('RBLXc'), RBLX, 'source actions (liste prouvee) absente');
  assert.equal(trouve('FRESH'), RECENT, 'source creations absente');
  assert.equal(trouve('IB022'), IB022, 'source noms absente');
  assert.equal(trouve('0x' + 'f6'.repeat(6)), NU, 'source connus (adresses sans nom) absente');
  assert.equal(i.entrees.find((x) => x.adr === TSLA).action, true, 'une ligne d action du trending n est pas marquee action');
  assert.equal(e.actions, 1); assert.equal(e.trending, 1); assert.equal(e.creations, 1);
});

await cas('route : GET, refus 400 avec raison, 429 borne par IP, cache, AUCUNE lecture de chaine dans la route', async () => {
  const a = srv.indexOf("if (chemin === '/api/recherche') {"), finR = a > 0 ? /\r?\n {2}\}\r?\n/.exec(srv.slice(a)) : null;
  assert.ok(a > 0 && finR, 'route /api/recherche absente');
  const r = srv.slice(a, a + finR.index);
  assert.match(r, /req\.method !== 'GET'/);
  assert.match(r, /if \(!v\.ok\) \{ rendreR\(400, \{ ok: false, etat: 'REFUSE', pourquoi: v\.pourquoi \}\)/);
  assert.match(r, /nIpR > RECHERCHE_IP_MINUTE \|\| rechercheBudget\.n >= RECHERCHE_MINUTE\) \{ rendreR\(429/);
  assert.match(r, /couverture: \{ connus: idx\.index\.taille, nommes: idx\.index\.nommes/);
  assert.doesNotMatch(r, /rpc[A-Z][a-zA-Z]*\(|eth_call|eth_getLogs|fetch\(/, 'la route lit la chaine ou le reseau');
  assert.doesNotMatch(tranche, /rpc[A-Z][a-zA-Z]*\(|eth_call|eth_getLogs|fetch\(/, 'l index lit la chaine ou le reseau');
  assert.match(srv, /adressesANommer\(\[UNIT_BLOCK\], adressesANommer\(nosBlocksEtat\.blocks, blocksConnus, createurParBlock\.keys\(\)\)\)/, 'UNIT n est pas nomme en premier');
  assert.match(srv, /\.finally\(\(\) => \{ nomsEnCours = false; sauverNomsDisque\(\); \}\)/, 'l index des noms n est pas sauve apres un tour');
  assert.match(srv, /^chargerNomsDisque\(\);\r?$/m,'l index des noms n est pas relu au demarrage');
});

await cas('app.html : Map Find, onglet Blocks et filtre du Market passent par /api/recherche', async () => {
  const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
  assert.match(app, /fetch\('\/api\/recherche\?q=' \+ encodeURIComponent/);
  const c = app.slice(app.indexOf('function chercherBlock() {'), app.indexOf("$('#bTrouver').addEventListener"));
  assert.match(c, /await rechercheB20\(brut, 6\)/, 'Map Find ne passe pas par la recherche B20');
  assert.doesNotMatch(c, /\.includes\(q\)/, 'le includes local (qui ouvrait un autre block) est revenu');
  assert.match(app, /brancherRechercheB20\(\{ champ: \$\('#trFiltre'\), liste: \$\('#trResultats'\)/);
  assert.match(app, /brancherRechercheB20\(\{ champ: \$\('#mienTrouver'\), liste: \$\('#mienResultats'\)/);
  for (const id of ['mapResultats', 'trFiltre', 'trResultats', 'mienTrouver', 'mienResultats']) assert.equal(app.split('id="' + id + '"').length, 2, id + ' absent ou double');
  assert.doesNotMatch(app, /No block named « ' \+ brut/, 'la phrase « No block named » de la Map est revenue');
});

console.log('test-recherche-b20-20261026 :', n, 'cas OK — NE PROUVE PAS le rendu navigateur ni le remplissage des noms en prod');
