/* test-rattrapage-budget-20261009.mjs — UN REFUS DE BUDGET N EST PAS UNE PANNE : LE RATTRAPAGE ATTEND, IL NE SAUTE RIEN.
 *
 * Mesure en prod, 2026-10-09 vers 20 h 30 UTC : budget d archive du jour epuise (10 000 / 10 000). Le rattrapage des createurs
 * comptait chaque passe refusee comme une panne du noeud ; a la 3e il SAUTAIT la fenetre et la notait dans `trousRattrapage` —
 * trou 50 889 029 -> 50 989 029 (51 pages) en une demi-heure. Ce trou n etait NI persiste NI relu, alors que le curseur l etait :
 * apres un redeploiement, `couvertureComplete` pouvait passer a VRAI sur des blocs jamais lus.
 * Les gardes, EXECUTEES sur le code extrait du fichier livre :
 *   A. refusDeBudget / archiveEpuisee : une liste vide n est pas un refus de budget ; un refus de noeud melange non plus.
 *   B. LE BLOC DE RATTRAPAGE LUI-MEME, sur plusieurs passes : budget epuise -> aucune lecture, curseur immobile, aucun trou ;
 *      budget epuise EN COURS de fenetre -> ni compte ni trou ; refus du NOEUD -> 3 passes puis trou (regle d avant, gardee).
 *   C. relireUnTrouRattrapage : rien sans archive ou budget epuise ; une page refusee laisse le trou ; une relecture complete le
 *      fait reculer (100 000 blocs au plus) et resout les createurs inconnus ; fini -> trousRattrapageRelus.
 *   D. persistance (sauvegarde + chargement + relecture unique), publication, et `couvertureComplete` exige zero trou.
 * ⛔ BORNE : le passage reel au noeud CDP (et le budget reel) n est pas exerce ici — la prod le montre dans /sante.archive. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const nu = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
const AsyncFunction = (async () => {}).constructor;
let n = 0;
const cas = async (titre, f) => { n++; try { await f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const entre = (debut, finMarque) => { const i = src.indexOf(debut); assert.ok(i > 0, debut + ' introuvable'); const j = src.indexOf(finMarque, i); assert.ok(j > i, finMarque + ' introuvable'); return src.slice(i, j); };
const BUDGET = 'archive node daily budget reached (10000 calls)';
const AUJ = new Date().toISOString().slice(0, 10);

/* ── A. les deux juges, extraits tels que livres ─────────────────────────────────────────────── */
const juges = entre('const RE_BUDGET_ARCHIVE', '/* ⛔⛔ 2026-10-09 (mesure en prod, noeud d archive pose)');
const monterJuges = (archive, compte, max) => new Function('RPC_ARCHIVE', 'archiveCompte', 'ARCHIVE_MAX_JOUR', juges + '\n; return { archiveEpuisee, refusDeBudget };')(archive, compte, max);

await cas('A1 refusDeBudget : vide -> non ; tout budget -> oui ; melange ou refus du noeud -> non', async () => {
  const { refusDeBudget } = monterJuges('https://a.example/x', {}, 10);
  assert.equal(refusDeBudget([]), false, 'une liste vide n est PAS un refus de budget');
  assert.equal(refusDeBudget(undefined), false);
  assert.equal(refusDeBudget([{ cause: BUDGET }, { cause: BUDGET }]), true);
  assert.equal(refusDeBudget([{ cause: BUDGET }, { cause: 'HTTP 503' }]), false, 'un refus du noeud melange doit compter comme refus');
  assert.equal(refusDeBudget([{ cause: 'over rate limit' }]), false);
  assert.equal(refusDeBudget([{}]), false);
});
await cas('A2 archiveEpuisee : lu sur le compteur du JOUR, et seulement avec un noeud d archive', async () => {
  assert.equal(monterJuges('https://a.example/x', { jour: AUJ, appels: 10 }, 10).archiveEpuisee(), true);
  assert.equal(monterJuges('https://a.example/x', { jour: AUJ, appels: 9 }, 10).archiveEpuisee(), false);
  assert.equal(monterJuges('https://a.example/x', { jour: '2000-01-01', appels: 99 }, 10).archiveEpuisee(), false, 'le compteur d un autre jour');
  assert.equal(monterJuges(null, { jour: AUJ, appels: 99 }, 10).archiveEpuisee(), false, 'sans archive, rien a epuiser');
});

/* ── B. le bloc de rattrapage, extrait et EXECUTE passe apres passe ──────────────────────────── */
const blocRattrapage = entre('    try {\n      if (rattrapageDepuis === null) rattrapageDepuis = fin;'.replace(/\n/g, src.includes('\r\n') ? '\r\n' : '\n'),
  "    } catch (e) { console.log('[createurs] rattrapage interrompu : ' + e.message); }");
const PARAMS = ['fin', 'PREMIER_BLOCK_TB', 'RPC_ARCHIVE', 'archiveEpuisee', 'refusDeBudget', 'archiveCompte', 'listerCreations', 'rpcHistoire', 'rpcServeur',
  'createurParBlock', 'createurDe', 'trousRattrapage', 'blocksConnus', 'masquerCle', 'console', 'rattrapageDepuis', 'refusDeSuite', 'attenteBudgetDite'];
const passe = new AsyncFunction(...PARAMS, blocRattrapage + '\n    } catch (e) { throw e; }\n    return { rattrapageDepuis, refusDeSuite, attenteBudgetDite };');
function rattrapeur({ epuise = () => false, lister }) {
  const e = { curseur: 2_000_000, refus: 0, dite: null, trous: [], createurs: new Map(), lectures: 0, journal: [] };
  const { refusDeBudget } = monterJuges('https://a.example/x', {}, 10);
  e.une = async () => {
    const r = await passe(2_000_000, 1_000_000, 'https://a.example/x', epuise, refusDeBudget, { jour: AUJ },
      async (o) => { e.lectures++; return lister(o); }, () => {}, () => {}, e.createurs, async ({ tx }) => ({ createur: '0x' + tx.slice(2, 42) }),
      e.trous, new Set(), (s) => s, { log: (m) => e.journal.push(m) }, e.curseur, e.refus, e.dite);
    e.curseur = r.rattrapageDepuis; e.refus = r.refusDeSuite; e.dite = r.attenteBudgetDite;
  };
  return e;
}
await cas('B1 budget epuise : 6 passes, AUCUNE lecture, curseur immobile, aucun trou, dit une fois', async () => {
  const e = rattrapeur({ epuise: () => true, lister: () => { throw new Error('ne doit pas lire'); } });
  for (let k = 0; k < 6; k++) await e.une();
  assert.equal(e.lectures, 0); assert.equal(e.curseur, 2_000_000); assert.equal(e.trous.length, 0); assert.equal(e.refus, 0);
  assert.equal(e.journal.filter((m) => /archive budget spent/.test(m)).length, 1, 'l attente se dit UNE fois par jour');
});
await cas('B2 budget epuise PENDANT la fenetre (toutes les pages refusees par le budget) : ni compte ni trou, sur 6 passes', async () => {
  const e = rattrapeur({ lister: () => ({ creations: [], fenetresRatees: [{ de: 1, a: 2, cause: BUDGET }, { de: 3, a: 4, cause: BUDGET }] }) });
  for (let k = 0; k < 6; k++) await e.une();
  assert.equal(e.lectures, 6); assert.equal(e.curseur, 2_000_000, 'le curseur est descendu sur des refus de budget');
  assert.equal(e.trous.length, 0, 'un trou a ete note sur des refus de budget'); assert.equal(e.refus, 0);
});
await cas('B3 refus du NOEUD : la regle d avant tient — 3 passes puis trou nomme et descente de 100 000', async () => {
  const e = rattrapeur({ lister: () => ({ creations: [], fenetresRatees: [{ de: 1, a: 2, cause: 'HTTP 503 upstream' }] }) });
  await e.une(); await e.une();
  assert.equal(e.curseur, 2_000_000); assert.equal(e.refus, 2); assert.equal(e.trous.length, 0);
  await e.une();
  assert.equal(e.curseur, 1_900_000); assert.equal(e.trous.length, 1); assert.deepEqual([e.trous[0].de, e.trous[0].a], [1_900_000, 2_000_000]);
});
await cas('B4 lecture propre : descente de 100 000 et createurs resolus', async () => {
  const e = rattrapeur({ lister: () => ({ creations: [{ jeton: '0xb2' + '1'.padStart(38, '0'), tx: '0x' + 'c'.repeat(40) + 'd'.repeat(24) }], fenetresRatees: [] }) });
  await e.une();
  assert.equal(e.curseur, 1_900_000); assert.equal(e.createurs.size, 1); assert.equal(e.trous.length, 0);
});

/* ── C. relireUnTrouRattrapage, extraite et executee ──────────────────────────────────────────── */
const iR = src.indexOf('async function relireUnTrouRattrapage() {');
const fR = /\r?\n\}\r?\n/.exec(src.slice(iR));
assert.ok(iR > 0 && fR, 'relireUnTrouRattrapage introuvable');
const corpsR = src.slice(iR, iR + fR.index + fR[0].length);
function relecteur({ archive = 'https://a.example/x', epuise = false, trous, lister, connus = [] }) {
  const e = { trous, relus: [], createurs: new Map(connus.map((j) => [j, '0x' + 'e'.repeat(40)])), appels: [] };
  const { refusDeBudget } = monterJuges(archive, {}, 10);
  e.f = new Function('RPC_ARCHIVE', 'trousRattrapage', 'trousRattrapageRelus', 'archiveEpuisee', 'refusDeBudget', 'listerCreations', 'rpcHistoire', 'createurParBlock', 'createurDe', 'rpcServeur',
    corpsR + '\n; return relireUnTrouRattrapage;')(archive, e.trous, e.relus, () => epuise, refusDeBudget,
    async (o) => { e.appels.push(o); return lister(o); }, () => {}, e.createurs, async ({ tx }) => ({ createur: '0x' + tx.slice(2, 42) }), () => {});
  return e;
}
const J = (k) => '0xb2' + String(k).padStart(38, '0');
const T = (k) => '0x' + 'c'.repeat(40 - String(k).length) + k + 'd'.repeat(24);
await cas('C1 sans archive, ou budget epuise : aucune lecture', async () => {
  const a = relecteur({ archive: null, trous: [{ de: 1, a: 9 }], lister: () => { throw new Error('non'); } });
  assert.equal(await a.f(), null); assert.equal(a.appels.length, 0);
  const b = relecteur({ epuise: true, trous: [{ de: 1, a: 9 }], lister: () => { throw new Error('non'); } });
  assert.equal(await b.f(), null); assert.equal(b.appels.length, 0);
});
await cas('C2 une page refusee (budget ou noeud) : le trou ne bouge pas, et le budget est nomme', async () => {
  const e = relecteur({ trous: [{ de: 1_000_000, a: 1_300_000 }], lister: () => ({ creations: [{ jeton: J(1), tx: T(1) }], fenetresRatees: [{ cause: BUDGET }] }) });
  const r = await e.f();
  assert.equal(r.ratees, 1); assert.equal(r.budget, true);
  assert.deepEqual(e.trous[0], { de: 1_000_000, a: 1_300_000 }); assert.equal(e.createurs.size, 0);
});
await cas('C3 relecture complete : 100 000 blocs au plus, le trou recule, seuls les createurs INCONNUS sont resolus', async () => {
  const e = relecteur({ trous: [{ de: 1_000_000, a: 1_300_000 }], connus: [J(2)],
    lister: () => ({ creations: [{ jeton: J(1), tx: T(1) }, { jeton: J(2), tx: T(2) }], fenetresRatees: [] }) });
  const r = await e.f();
  assert.equal(e.appels[0].fin, 1_100_000); assert.equal(e.appels[0].blocs, 100_000);
  assert.equal(e.trous[0].de, 1_100_000); assert.equal(r.nouvelles, 1); assert.equal(e.createurs.size, 2);
});
await cas('C4 fin du trou : il passe dans trousRattrapageRelus avec ses compteurs', async () => {
  const e = relecteur({ trous: [{ de: 1_000_000, a: 1_050_000 }], lister: () => ({ creations: [{ jeton: J(3), tx: T(3) }], fenetresRatees: [] }) });
  await e.f();
  assert.equal(e.appels[0].fin, 1_050_000, 'la derniere tranche ne depasse pas le trou');
  assert.equal(e.trous.length, 0); assert.equal(e.relus.length, 1); assert.equal(e.relus[0].nouvelles, 1); assert.ok(e.relus[0].fini);
});

/* ── D. persistance, relecture unique, publication ───────────────────────────────────────────── */
await cas('D1 sauvegarde ET chargement des trous du rattrapage ; relecture unique si le fichier precede ce correctif', async () => {
  assert.match(nu, /trousRattrapage: trousRattrapage\.slice\(-200\), trousRattrapageRelus: trousRattrapageRelus\.slice\(-50\), createursRelecture20261010,/);
  assert.match(nu, /for \(const t of \(Array\.isArray\(x\.trousRattrapage\) \? x\.trousRattrapage : \[\]\)\) if \(trouSain\(t\)\) trousRattrapage\.push\(/);
  assert.match(nu, /if \(x\.createursRelecture20261010 === true\) createursRelecture20261010 = true;\s+else \{\s+rattrapageDepuis = null; createursRelecture20261010 = true;/);
  assert.match(nu, /const TRENDING_CACHE_VER = 'quote-v5';/, 'changer la version jetterait l index des createurs');
});
await cas('D2 la passe relit les trous ; /api/blocks-de publie relus + attente ; complet exige zero trou', async () => {
  assert.match(nu, /const rr = await relireUnTrouRattrapage\(\);/);
  assert.match(nu, /plagesRelues: trousRattrapageRelus\.slice\(-5\),/);
  assert.match(nu, /attendBudgetArchive: rattrapageDepuis !== null && rattrapageDepuis > PREMIER_BLOCK_TB && archiveEpuisee\(\),/);
  assert.match(nu, /couvertureComplete: rattrapageDepuis !== null && rattrapageDepuis <= PREMIER_BLOCK_TB\s+&& trousRattrapage\.length === 0,/);
});

console.log('✓ ' + n + ' cas — un refus de budget fait attendre le rattrapage ; un trou se garde, se relit, et « complet » ne ment plus');
