/* test-trending-avancement-20261009.mjs — UN CORPS REJETE NE JETTE QUE LE CORPS ; LA FILE DES TROUS NE JETTE JAMAIS [0] ;
 * UN CREATEUR NON RESOLU EST GARDE ET REESSAYE.
 *
 * Audit du 2026-10-09 (budget d archive epuise), relu dans le code :
 *   - `chargerTrendingDisque` faisait `return` (version, ok:false, vide+ratees, forme) AVANT de relire l avancement : index des
 *     createurs, blocks connus, curseurs, drapeaux, files de trous. La sauvegarde suivante ecrivait des listes VIDES par-dessus.
 *   - la file `trousCreations` etait plafonnee a 50 par `splice(0, …)` : elle jetait [0], le trou en cours de relecture, sans un mot ;
 *     et la sauvegarde `slice(-50)` aussi.
 *   - un createur que `createurDe` ne resolvait pas (null) n etait garde nulle part, alors que le curseur avancait.
 * Les gardes, EXECUTEES sur le code extrait du fichier livre (fs et rpc sont des doublures) :
 *   A. chargerTrendingDisque : chaque rejet du corps laisse trCache vide ET relit tout l avancement ; un corps sain est servi.
 *   B. aller-retour : un fichier au corps rejete, puis une sauvegarde -> l avancement est dans la charge ecrite (le defaut de prod).
 *   C. la file des trous : au-dela de 50, [0] reste ; a 200, les plus anciens APRES [0] sont fondus (rien de jete, `fondus` cumule),
 *      et c est dit ; chargement d un fichier trop long, graine, sauvegarde : memes regles.
 *   D. createurs non resolus : le scan vers l avant les garde ; garderNonResolu valide, dedoublonne, borne en COMPTANT ;
 *      relireNonResolus : resolu -> sort, echec -> fin de file, 32 par passe, rien de retire si la passe s interrompt.
 * Ce banc ne s arrete pas au premier rouge : il dit CHAQUE cas rouge, puis sort en erreur.
 * ⛔ BORNE : ni le vrai volume /data, ni le vrai noeud, ni un vrai redemarrage ne sont exerces ici. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const AsyncFunction = (async () => {}).constructor;
let n = 0;
const rouges = [];
const cas = async (titre, f) => {
  n++;
  try { await f(); } catch (e) { rouges.push(titre); console.error('✗ ' + titre + '\n    ' + String((e && e.message) || e).split('\n')[0]); }
};
const fonction = (entete) => {
  const i = src.indexOf(entete);
  assert.ok(i >= 0, entete + ' introuvable');
  const f = /\r?\n\}\r?\n/.exec(src.slice(i));
  assert.ok(f, 'fin de ' + entete + ' introuvable');
  return src.slice(i, i + f.index + f[0].length);
};
const optionnelle = (entete, doublure) => (src.includes(entete) ? fonction(entete) : doublure);
const entre = (debut, finMarque) => {
  const i = src.indexOf(debut); assert.ok(i > 0, debut + ' introuvable');
  const j = src.indexOf(finMarque, i); assert.ok(j > i, finMarque + ' introuvable');
  return src.slice(i, j);
};
const constante = (nom, defaut) => { const m = new RegExp('const ' + nom + ' = (\\d+);').exec(src); return m ? Number(m[1]) : defaut; };
const VER = /const TRENDING_CACHE_VER = '([^']+)';/.exec(src)[1];
const TCMAX = constante('TROUS_CREATIONS_MAX', null);
const CNRMAX = constante('CREATEURS_NON_RESOLUS_MAX', 5000);

const J = (k) => '0xb2' + String(k).padStart(38, '0');
const C = (k) => '0x' + String(k).padStart(40, 'e');
const TX = (k) => '0x' + String(k).padStart(64, 'c');
const SEME = { de: 52302101, a: 52381409, fenetres: 35, t: '2026-10-09T00:00:00.000Z', seme: true };
const trou = (k) => ({ de: 52400000 + k * 1000, a: 52400000 + k * 1000 + 500, fenetres: 1, t: 't' + k });

/* ── le monde du disque : chargerTrendingDisque + sauverTrendingDisque extraites, etat partage, fs en doublure ─────────── */
function monde(contenu) {
  const ecrits = [], journal = [];
  const st = { blocksConnus: new Set(), createurParBlock: new Map(), trousRattrapage: [], trousRattrapageRelus: [], trousCreations: [], trousRelus: [], createursNonResolus: [] };
  const code = 'let blocsLusJusqua = null, rattrapageDepuis = null, trCache = { a: 0, corps: null }, createursRelecture20261009 = false,'
    + ' createursRelecture20261010 = false, trouSeme20261009 = false, createursNonResolusJetes = 0;\n'
    + optionnelle('function bornerTrousCreations(', 'function bornerTrousCreations() { return 0; }\n')
    + optionnelle('function garderNonResolu(', 'function garderNonResolu() {}\n')
    + fonction('function chargerTrendingDisque() {') + fonction('function sauverTrendingDisque() {')
    + '\nreturn { charger: chargerTrendingDisque, sauver: sauverTrendingDisque, servir: (c) => { trCache = { a: 1, corps: c }; },'
    + ' lire: () => ({ blocsLusJusqua, rattrapageDepuis, trCache, createursRelecture20261009, createursRelecture20261010, trouSeme20261009, createursNonResolusJetes }) };';
  const m = new Function('FICHIER_TRENDING', 'existsSync', 'readFileSync', 'writeFileSync', 'renameSync', 'TRENDING_CACHE_VER', 'CREATEURS_DISQUE_MAX',
    'TROUS_CREATIONS_MAX', 'CREATEURS_NON_RESOLUS_MAX', 'console', ...Object.keys(st), code)(
    '/data/trending-cache.json', () => contenu !== undefined, () => (typeof contenu === 'string' ? contenu : JSON.stringify(contenu)),
    (p, d) => ecrits.push({ p, d }), () => {}, VER, 100000, TCMAX || 200, CNRMAX, { log: (...a) => journal.push(a.join(' ')) }, ...Object.values(st));
  return { ...m, st, ecrits, journal, etat: () => ({ ...st, ...m.lire() }) };
}
const corpsSain = JSON.stringify({ ok: true, lu: 'x', blocksSuivis: 3, fenetresRatees: 0, emetteurEtat: 'LU', lignes: [{ adr: J(1), emetteur: null, quoteAdr: null }] });
const avancement = {
  adrs: [J(1), J(2), J(3)], createurs: [[J(1), C(1)], [J(2), C(2)]],
  createursNonResolus: [{ jeton: J(3), tx: TX(3) }], createursNonResolusJetes: 0,
  blocsLusJusqua: 52400000, rattrapageDepuis: 51000000, createursRelecture20261009: true, createursRelecture20261010: true,
  trousCreations: [{ ...SEME }, trou(1)], trousRelus: [{ de: 1, a: 2, fini: 'z' }], trouSeme20261009: true,
  trousRattrapage: [{ de: 50889029, a: 50989029, pages: 51 }], trousRattrapageRelus: [{ de: 1, a: 2 }],
};
const fichier = (o = {}) => ({ ver: VER, a: 123, corps: corpsSain, ...avancement, ...o });
/* l avancement d AVANT ce correctif (champs deja persistes) — puis, a part, les createurs non resolus (nouveaux) */
function avancementRelu(s) {
  assert.equal(s.blocsLusJusqua, 52400000, 'curseur du scan vers l avant perdu');
  assert.equal(s.rattrapageDepuis, 51000000, 'curseur du rattrapage des createurs perdu');
  assert.equal(s.createurParBlock.size, 2, 'index des createurs perdu');
  assert.equal(s.blocksConnus.size, 3, 'blocks connus perdus');
  assert.deepEqual(s.trousCreations.map((t) => t.de), [52302101, trou(1).de], 'file des trous de creations perdue');
  assert.equal(s.trousRelus.length, 1); assert.equal(s.trousRattrapage.length, 1); assert.equal(s.trousRattrapageRelus.length, 1);
  assert.equal(s.trouSeme20261009, true, 'drapeau de graine perdu : le trou du 10-09 serait re-seme');
  assert.equal(s.createursRelecture20261009, true); assert.equal(s.createursRelecture20261010, true, 'drapeau de relecture perdu : relecture complete relancee');
}
const REJETS = [
  ['version differente', { ver: 'quote-v4' }],
  ['corps ok:false', { corps: JSON.stringify({ ok: false, pourquoi: 'Trending not read: DexScreener refused all 3 reads' }) }],
  ['corps vide + fenetres ratees', { corps: JSON.stringify({ ok: true, lignes: [], fenetresRatees: 3, blocksSuivis: 0 }) }],
  ['forme perimee (pas d emetteurEtat)', { corps: JSON.stringify({ ok: true, blocksSuivis: 3, lignes: [{ adr: J(1), emetteur: null, quoteAdr: null }] }) }],
  ['corps absent', { corps: null }],
];

/* ── A. chargerTrendingDisque ─────────────────────────────────────────────────────────────────────────────────────────── */
await cas('A1 corps sain : servi, et tout l avancement relu', async () => {
  const w = monde(fichier()); w.charger(); const s = w.etat();
  assert.equal(s.trCache.corps, corpsSain);
  avancementRelu(s);
});
for (const [k, [nom, o]] of REJETS.entries()) {
  await cas('A' + (k + 2) + ' ' + nom + ' : le CORPS est jete (trCache vide), l AVANCEMENT est relu', async () => {
    const w = monde(fichier(o)); w.charger(); const s = w.etat();
    assert.equal(s.trCache.corps, null, 'un corps rejete a ete servi');
    avancementRelu(s);
  });
}
await cas('A7 corps rejete : les createurs NON resolus et leur compte de jetes sont relus aussi', async () => {
  const w = monde(fichier({ ver: 'quote-v4', createursNonResolusJetes: 4 })); w.charger(); const s = w.etat();
  assert.deepEqual(s.createursNonResolus, [{ jeton: J(3), tx: TX(3) }]);
  assert.equal(s.createursNonResolusJetes, 4);
});
await cas('A8 createurs non resolus au chargement : entree mal formee ignoree, doublon ignore, deja resolu ignore', async () => {
  const w = monde(fichier({ createursNonResolus: [{ jeton: 'pas une adresse', tx: TX(9) }, { jeton: J(3), tx: TX(3) }, { jeton: J(3), tx: TX(3) }, { jeton: J(1), tx: TX(1) }, null] }));
  w.charger();
  assert.deepEqual(w.etat().createursNonResolus, [{ jeton: J(3), tx: TX(3) }]);
});
await cas('A9 fichier qui n est pas un objet (null, tableau, nombre) ou absent : rien n est relu, rien ne casse', async () => {
  for (const brut of ['null', '[1,2]', '42']) {
    const w = monde(brut); w.charger(); const s = w.etat();
    assert.equal(s.trCache.corps, null); assert.equal(s.blocsLusJusqua, null); assert.equal(s.blocksConnus.size, 0);
  }
  const w = monde(undefined); w.charger(); assert.equal(w.etat().blocsLusJusqua, null);
});

/* ── B. aller-retour : le defaut de prod — un corps rejete, puis la sauvegarde ecrivait des listes vides ───────────────── */
await cas('B1 corps rejete (ok:false) puis une passe sauve : la charge ecrite PORTE l avancement relu', async () => {
  const w = monde(fichier(REJETS[1][1])); w.charger();
  w.servir(corpsSain); w.sauver();
  assert.equal(w.ecrits.length, 1, 'rien n a ete ecrit');
  const x = JSON.parse(w.ecrits[0].d);
  assert.equal(x.blocsLusJusqua, 52400000); assert.equal(x.rattrapageDepuis, 51000000);
  assert.equal(x.createurs.length, 2); assert.equal(x.adrs.length, 3);
  assert.equal(x.trousCreations.length, 2); assert.equal(x.trousCreations[0].de, 52302101);
  assert.equal(x.trousRattrapage.length, 1); assert.equal(x.trouSeme20261009, true); assert.equal(x.createursRelecture20261010, true);
});
await cas('B2 aller-retour des createurs non resolus : sauves, puis relus par un nouveau demarrage', async () => {
  const w = monde(fichier()); w.charger(); w.servir(corpsSain); w.sauver();
  const x = JSON.parse(w.ecrits[0].d);
  assert.deepEqual(x.createursNonResolus, [{ jeton: J(3), tx: TX(3) }]); assert.equal(x.createursNonResolusJetes, 0);
  const w2 = monde(x); w2.charger();
  assert.deepEqual(w2.etat().createursNonResolus, [{ jeton: J(3), tx: TX(3) }]);
});

/* ── C. la file des trous de creations ────────────────────────────────────────────────────────────────────────────────── */
const blocAvant = () => entre('      if ((cr.fenetresRatees || []).length) {', '      blocsLusJusqua = fin;');
function scanAvant(file) {
  const journal = [];
  new Function('trousCreations', 'cr', 'fin', 'blocs', 'blocsLusJusqua', 'console', 'TROUS_CREATIONS_MAX',
    optionnelle('function bornerTrousCreations(', '') + blocAvant())(
    file, { creations: [], fenetresRatees: [{ de: 1, a: 2 }] }, 52999999, 100, 52999000, { log: (...a) => journal.push(a.join(' ')) }, TCMAX || 200);
  return journal;
}
const couvre = (file, g) => file.some((q) => q.de <= g.de && q.a >= g.a);
await cas('C1 le plafond est 200 (comme trousRattrapage)', async () => { assert.equal(TCMAX, 200); });
await cas('C2 scan vers l avant, file de 50 (la graine en [0]) : le 51e trou entre, [0] RESTE', async () => {
  const file = [{ ...SEME }, ...Array.from({ length: 49 }, (_, k) => trou(k + 1))];
  scanAvant(file);
  assert.equal(file.length, 51, 'la file a ete coupee a 50');
  assert.equal(file[0].de, SEME.de, 'le trou en cours de relecture a ete jete');
});
await cas('C3 scan vers l avant, file pleine (200) : rien n est JETE — les plus anciens apres [0] sont fondus, et c est DIT', async () => {
  const avant = [{ ...SEME }, ...Array.from({ length: 199 }, (_, k) => trou(k + 1))];
  const file = avant.map((t) => ({ ...t }));
  const journal = scanAvant(file);
  assert.equal(file.length, 200); assert.equal(file[0].de, SEME.de);
  assert.deepEqual([file[1].de, file[1].a, file[1].fondus], [trou(1).de, trou(2).a, 2]);
  for (const g of [...avant, { de: 52999000, a: 52999999 }]) assert.ok(couvre(file, g), 'trou perdu : ' + g.de + '..' + g.a);
  assert.ok(journal.some((m) => /2 gap\(s\) merged/.test(m) && /cap of 200/.test(m)), 'la fusion n est pas dite : ' + journal.join(' | '));
  /* un 2e depassement fond la plage deja fondue avec la suivante : le compte `fondus` est CUMULE (2 + 1), rien n est perdu */
  scanAvant(file);
  assert.equal(file.length, 200); assert.equal(file[0].de, SEME.de);
  assert.deepEqual([file[1].de, file[1].a, file[1].fondus], [trou(1).de, trou(3).a, 3]);
  for (const g of avant) assert.ok(couvre(file, g), 'trou perdu au 2e depassement : ' + g.de + '..' + g.a);
});
await cas('C4 chargement d un fichier de 250 trous : borne a 200, [0] garde, tout couvert, dit ; la sauvegarde garde [0]', async () => {
  const longs = [{ ...SEME }, ...Array.from({ length: 249 }, (_, k) => trou(k + 1))];
  const w = monde(fichier({ trousCreations: longs })); w.charger();
  const file = w.etat().trousCreations;
  assert.ok(file.length <= 200, 'file non bornee au chargement : ' + file.length);
  assert.equal(file[0].de, SEME.de);
  for (const g of longs) assert.ok(couvre(file, g), 'trou perdu au chargement : ' + g.de);
  assert.ok(w.journal.some((m) => /merged/.test(m)), 'la fusion au chargement n est pas dite');
  w.servir(corpsSain); w.sauver();
  const x = JSON.parse(w.ecrits[0].d);
  assert.equal(x.trousCreations[0].de, SEME.de, 'la sauvegarde a jete le trou en cours de relecture');
  for (const g of longs) assert.ok(couvre(x.trousCreations, g), 'trou perdu a la sauvegarde : ' + g.de);
});
await cas('C5 graine sur une file pleine : elle entre en [0] et la file reste bornee', async () => {
  /* la ligne de la graine, et la ligne suivante si c est la borne (le code d avant n en a pas) */
  const m = /if \(RPC_ARCHIVE && !trouSeme20261009\) \{[^\r\n]*\}(\r?\n[ \t]*bornerTrousCreations\('seed'\);)?/.exec(src);
  assert.ok(m, 'ligne de la graine introuvable');
  const file = Array.from({ length: 200 }, (_, k) => trou(k + 1));
  new Function('RPC_ARCHIVE', 'trousCreations', 'TROU_MESURE_20261009', 'TROUS_CREATIONS_MAX', 'console',
    'let trouSeme20261009 = false;\n' + optionnelle('function bornerTrousCreations(', '') + m[0])('https://a.example/x', file, SEME, TCMAX || 200, { log: () => {} });
  assert.equal(file[0].de, SEME.de); assert.ok(file.length <= 200, 'file non bornee apres la graine : ' + file.length);
});

/* ── D. createurs non resolus ─────────────────────────────────────────────────────────────────────────────────────────── */
function garde(max = CNRMAX, connus = []) {
  const g = { liste: [], journal: [], createurParBlock: new Map(connus.map((j) => [j, C(9)])) };
  const r = new Function('createurParBlock', 'createursNonResolus', 'CREATEURS_NON_RESOLUS_MAX', 'console',
    'let createursNonResolusJetes = 0;\n' + fonction('function garderNonResolu(c) {') + '\n; return { garderNonResolu, jetes: () => createursNonResolusJetes };')(
    g.createurParBlock, g.liste, max, { log: (...a) => g.journal.push(a.join(' ')) });
  return { ...g, ...r };
}
await cas('D1 scan vers l avant : un createur non resolu est GARDE (le scan ne repassera plus sur ce block)', async () => {
  const bloc = entre('      const aResoudre = ', "    } catch (e) { console.log('[createurs] resolution partielle");
  const g = garde();
  await new AsyncFunction('cr', 'createurParBlock', 'createurDe', 'rpcServeur', 'console', 'garderNonResolu', bloc)(
    { creations: [{ jeton: J(1), tx: TX(1) }, { jeton: J(2), tx: TX(2) }] }, g.createurParBlock,
    async ({ tx }) => (tx === TX(2) ? { createur: null, raison: 'HTTP 429 (apres 4 essais)' } : { createur: C(1) }), () => {}, { log: () => {} },
    src.includes('function garderNonResolu(') ? g.garderNonResolu : () => {});
  assert.equal(g.createurParBlock.get(J(1)), C(1).toLowerCase());
  assert.deepEqual(g.liste, [{ jeton: J(2), tx: TX(2) }], 'le block non resolu du scan vers l avant est perdu');
});
await cas('D2 garderNonResolu : adresse invalide, doublon et deja resolu ignores ; au-dela de la borne, le plus ancien part, COMPTE et DIT', async () => {
  const g = garde(2, [J(7)]);
  g.garderNonResolu({ jeton: 'x', tx: TX(1) }); g.garderNonResolu({ jeton: J(7), tx: TX(7) });
  g.garderNonResolu({ jeton: J(1), tx: TX(1) }); g.garderNonResolu({ jeton: J(1).toUpperCase().replace('0X', '0x'), tx: TX(1) });
  assert.deepEqual(g.liste, [{ jeton: J(1), tx: TX(1) }]);
  g.garderNonResolu({ jeton: J(2), tx: TX(2) }); g.garderNonResolu({ jeton: J(3), tx: TX(3) });
  assert.deepEqual(g.liste.map((x) => x.jeton), [J(2), J(3)]);
  assert.equal(g.jetes(), 1);
  assert.ok(g.journal.some((m) => /1 unresolved creator\(s\) dropped/.test(m)), 'la coupe n est pas dite');
  /* un hash mal forme est garde SANS hash (le block n est pas perdu ; `createurDe` le refusera sans appel reseau) */
  const h = garde();
  h.garderNonResolu({ jeton: J(5), tx: 'pas un hash' }); h.garderNonResolu({ jeton: J(6) }); h.garderNonResolu({ jeton: J(8), tx: TX(8) });
  assert.deepEqual(h.liste, [{ jeton: J(5), tx: null }, { jeton: J(6), tx: null }, { jeton: J(8), tx: TX(8) }]);
});
function relance(liste, createur, connus = []) {
  const st = { liste, createurParBlock: new Map(connus.map((j) => [j, C(9)])), appels: [] };
  st.f = new Function('createursNonResolus', 'createurParBlock', 'createurDe', 'rpcServeur', fonction('async function relireNonResolus() {') + '\n; return relireNonResolus;')(
    st.liste, st.createurParBlock, async ({ tx }) => { st.appels.push(tx); return createur(tx); }, () => {});
  return st;
}
await cas('D3 relireNonResolus : un resolu sort et entre dans l index ; un echec repart en fin de file ; un deja resolu sort sans appel', async () => {
  const st = relance([{ jeton: J(1), tx: TX(1) }, { jeton: J(2), tx: TX(2) }, { jeton: J(3), tx: TX(3) }, { jeton: J(4), tx: TX(4) }],
    (tx) => ({ createur: tx === TX(2) ? null : '0x' + tx.slice(26) }), [J(4)]);
  const r = await st.f();
  assert.deepEqual(r, { essayes: 3, resolus: 2, restent: 1 });
  assert.deepEqual(st.liste, [{ jeton: J(2), tx: TX(2) }]);
  assert.ok(st.createurParBlock.has(J(1)) && st.createurParBlock.has(J(3)));
  assert.ok(!st.appels.includes(TX(4)), 'un block deja resolu a ete relu');
});
await cas('D4 relireNonResolus : 32 par passe au plus, et les echecs tournent (le 33e passe en tete)', async () => {
  const st = relance(Array.from({ length: 40 }, (_, k) => ({ jeton: J(k + 1), tx: TX(k + 1) })), () => ({ createur: null }));
  const r = await st.f();
  assert.equal(st.appels.length, 32); assert.equal(r.restent, 40); assert.equal(st.liste[0].jeton, J(33));
  assert.equal(new Set(st.liste.map((x) => x.jeton)).size, 40, 'un block a ete perdu ou double par la rotation');
});
await cas('D5 relireNonResolus : une passe interrompue (rpc qui jette) ne retire rien', async () => {
  const st = relance([{ jeton: J(1), tx: TX(1) }, { jeton: J(2), tx: TX(2) }], () => { throw new Error('coupure'); });
  await assert.rejects(st.f());
  assert.deepEqual(st.liste.map((x) => x.jeton), [J(1), J(2)]);
});
await cas('D6 la passe de lireTrending appelle la relance, et /api/blocks-de publie les comptes', async () => {
  assert.match(src, /const rn = await relireNonResolus\(\);/);
  const i = src.indexOf("chemin === '/api/blocks-de'");
  const bloc = src.slice(i, src.indexOf('borne:', i));
  assert.match(bloc, /trousCreations: trousCreations\.length,/);
  assert.match(bloc, /createursNonResolus: createursNonResolus\.length,/);
  assert.match(bloc, /createursNonResolusJetes,/);
});

if (rouges.length) {
  console.error('✗ ' + rouges.length + '/' + n + ' cas ROUGES');
  process.exit(1);
}
console.log('✓ ' + n + ' cas — un corps rejete ne jette que le corps ; [0] ne se jette jamais ; un createur non resolu est garde et reessaye');
