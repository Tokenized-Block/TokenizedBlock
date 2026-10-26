// test-shared-brain-20261026.mjs — game57 #5: ONE brain per address on the page, shared by the map, the profile, Brain / the
//   Control panel, the Brain window and Live (Grok Super QA game56, check1-live-unit.png: UNIT added from the Live field said
//   "no beat yet / not beating on this page" while from the Map it showed beat 92).
//   A. page-brains.js: one address = ONE instance (created once), one beat per cycle however many views look at it;
//   B. app.html#liveSourceDe reads THAT instance (the QA case: UNIT beats off-map, in its profile — Live sees it);
//   C. app.html#battreLive keeps the shared instance alive for a Live tile (no second cold instance);
//   D. the places that each created their own brain (map, profile, Brain) go through the registry.
// ⛔ EOL-agnostic; every extraction asserts it found its function.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const P = await import(new URL(process.env.SHARED_MODULE || './page-brains.js', import.meta.url).href);
const C = await import(new URL('./cerveau.js', import.meta.url).href);
const L = await import(new URL('./vision-live.js', import.meta.url).href);
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
const FACTS = { vie: 12000, vieAvant: 11000, gm: 1, messages: 0, detenteurs: 1, mort: false, etatVie: 'LUE' };

/* ══ A. THE REGISTRY ══ */
let creations = 0;
const create = (a) => { creations++; return C.etatInitial(a); };
{
  const R = P.createPageBrains({ create });
  const e1 = R.state(UNIT), e2 = R.state(UNIT.toUpperCase().replace('0X', '0x'));
  ok(e1 && e1 === e2 && creations === 1, 'A: one address = one instance, created only once (case ignored)');
  ok(R.state('not an address') === null, 'A: an unreadable address has no brain');
  /* three views beat in the SAME cycle: a single step */
  const a = R.step(UNIT, FACTS, C.pas, 1, { source: 'carte' });
  const b = R.step(UNIT, FACTS, C.pas, 1, { source: 'profil' });
  const c = R.step(UNIT, FACTS, C.pas, 1, { source: 'brain' });
  ok(a.vu.tick === 1 && b.vu === a.vu && c.vu === a.vu && b.already && c.already, 'A: three views in one cycle = ONE beat');
  R.step(UNIT, FACTS, C.pas, 2, { source: 'profil' });
  ok(R.read(UNIT).vu.tick === 2 && R.read(UNIT).histo.length === 2 && R.read(UNIT).source === 'profil', 'A: the next cycle moves on by a single beat');
  ok(R.state(UNIT) === R.read(UNIT).etat && R.state(UNIT).tick === 2, 'A: the state returned is the one that beats');
  ok(R.read('0x' + '9'.repeat(40)) === null && creations === 1, 'A: read never creates a brain');
}

/* ══ B. LIVE READS THE INSTANCE THAT IS ALREADY BEATING (the QA scenario) ══ */
const app = read('./app.html');
const extract = (header) => { const i = app.indexOf(header); ok(i > 0, 'extraction found: ' + header); const f = /\n\}/.exec(app.slice(i)); return app.slice(i, i + f.index + 2); };
{
  creations = 0;
  const R = P.createPageBrains({ create });
  let k = null; for (let i = 1; i <= 92; i++) k = R.step(UNIT, FACTS, C.pas, i, { source: 'profil', nourritureLue: true });
  ok(k.vu.tick === 92, 'B: UNIT beats in its profile, beat 92');
  const src = extract('function liveSourceDe(adr, deja) {');
  /* UNIT off-map, profile CLOSED since (profilCerveau = null), Brain on another block: only the shared instance beats */
  const f = new Function('habitants', 'brainAdr', 'brainHisto', 'brainFaitsVus', 'profilCerveau', 'pageBrains', src + '\nreturn liveSourceDe;')(
    [], '0x' + '1'.repeat(40), [], null, null, R);
  const s = f(UNIT, null);
  ok(s && s.vu && s.vu.tick === 92, 'B: Live sees beat 92 of the instance already beating');
  const live = L.creerLive(); L.ajouterTuile(live, { adr: UNIT, sym: 'UNIT' });
  L.nourrirLive(live, f);
  ok(L.etiquetteTuile(live.tuiles[0]).tick === 92 && L.etiquetteTuile(live.tuiles[0]).humeur !== 'no beat yet', 'B: the UNIT tile shows beat 92, not "no beat yet"');
  ok(creations === 1, 'B: no second instance');
}

/* ══ C. A LIVE TILE KEEPS THE SHARED INSTANCE ALIVE ══ */
{
  creations = 0;
  const R = P.createPageBrains({ create });
  for (let i = 1; i <= 5; i++) R.step(UNIT, FACTS, C.pas, i, { source: 'brain' });
  const srcL = extract('function liveSourceDe(adr, deja) {');
  const srcB = extract('function battreLive() {');
  const painted = [];
  const live = L.creerLive(); L.ajouterTuile(live, { adr: UNIT, sym: 'UNIT' });
  const env = { habitants: [], brainAdr: null, brainHisto: [], brainFaitsVus: null, profilCerveau: null, pageBrains: R, live,
    liveOuvert: () => true, nourrirLive: L.nourrirLive, peindreTuileLive: (t) => painted.push(t.histo[t.histo.length - 1].tick), liveMesures: new Map(),
    window: {}, beatCycle: 6, cerveauPas: C.pas, offMapFacts: () => FACTS, pageFoodRead: () => false };
  const names = Object.keys(env);
  const g = new Function(...names, srcL + '\n' + srcB + '\nreturn battreLive;')(...names.map((x) => env[x]));
  g();
  ok(R.read(UNIT).vu.tick === 6 && painted[0] === 6, 'C: UNIT beats nowhere else — Live makes the SAME instance beat (5 -> 6)');
  ok(creations === 1, 'C: no second cold instance');
}

/* ══ D. THE THREE PLACES THAT CREATED THEIR OWN BRAIN GO THROUGH THE REGISTRY ══ */
{
  ok(/import \{[^}]*createPageBrains[^}]*\} from '\.\/page-brains\.js';/.test(app), 'D: app.html imports the registry');
  ok(/const pageBrains = createPageBrains\(\{ create: \(a\) => cerveauAvecMemoire\(a\) \}\);/.test(app), 'D: the registry creates from THIS browser\'s memory, once');
  const uses = (app.match(/cerveauAvecMemoire\(/g) || []).length;
  ok(uses === 2, 'D: cerveauAvecMemoire is only called by the registry (definition + registry), seen ' + uses);
  ok(/cerveau = pageBrains\.state\(c\.jeton\)/.test(app), 'D: the map takes the shared brain');
  ok(/profilCerveau = \{ etat: pageBrains\.state\(adr\)/.test(app), 'D: the profile takes the shared brain');
  ok(/brainEtat = pageBrains\.state\(adr\)/.test(app), 'D: Brain / Control panel take the shared brain');
  for (const [name, pattern] of [['map', /const r = pageBrains\.step\(h\.adr, faitsH, cerveauPas, beatCycle/], ['profile', /const r = pageBrains\.step\(profilCerveau\.adr, fP, cerveauPas, beatCycle/],
    ['brain', /const r = pageBrains\.step\(brainAdr, fB, cerveauPas, beatCycle/]]) ok(pattern.test(app), 'D: ' + name + ' beats through the registry (one step per cycle)');
  ok(/beatCycle\+\+/.test(extract('function battre() {')), 'D: each page beat is a cycle');
  ok(read('./serveur-web.js').includes("'page-brains.js',"), 'D: the module is served');
}

console.log('test-shared-brain-20261026 : ' + n + ' assertions, OK');
