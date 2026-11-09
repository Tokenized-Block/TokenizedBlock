// test-human-brain-map-20261109.mjs — the brain MAP (human-brain-parts.js + the page wiring), with mutants.
// Proves: every node in exactly one part; the part-to-part counts ARE the measured edges (structure and function); "talks most with" is
// sorted and leaves the part itself out; an emotion's parts hold exactly its regions; short names keep the side; the page imports only what
// the module exports and the server serves the module (a module not served = a dead page in production).
// Does NOT prove: what the page looks like (checked by eye, 09/11, desktop and 375 px), frame time on a phone, or that a "known for" sentence
// is the best plain summary (they are OUR textbook summaries and the page says so).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const D = await import(pathToFileURL(join(ICI, 'human-brain-data.js')).href);
const PAGE = readFileSync(join(ICI, 'human-brain.js'), 'utf8').replace(/\r\n/g, '\n'), HTML = readFileSync(join(ICI, 'human-brain.html'), 'utf8');
const SERVEUR = readFileSync(join(ICI, 'serveur-web.js'), 'utf8');

function suite(H, serveur = SERVEUR) {
  const out = [], ok = (nom, f) => { try { out.push({ nom, ok: true, d: f() }); } catch (e) { out.push({ nom, ok: false, d: String(e && e.message || e).slice(0, 200) }); } };
  ok('every one of the 89 nodes in exactly one part; ids and colours unique', () => {
    const counts = D.REGIONS.map((r) => H.PARTS.filter((p) => p.members.includes(/^[LR]_/.test(r.id) ? r.id.slice(2) : r.id)).length);
    assert.ok(counts.every((c) => c === 1), 'nodes in 0 or 2+ parts: ' + D.REGIONS.filter((_, i) => counts[i] !== 1).map((r) => r.id).join(' '));
    assert.ok(D.REGIONS.every((r) => H.partOf(r.id) !== null));
    assert.equal(new Set(H.PARTS.map((p) => p.id)).size, H.PARTS.length); assert.equal(new Set(H.PARTS.map((p) => p.color)).size, H.PARTS.length);
    assert.equal(H.partOf('nothing'), null);
    return D.REGIONS.length + ' nodes, ' + H.PARTS.length + ' parts';
  });
  ok('part-to-part counts = the measured edges, for the wiring AND the functional network', () => {
    for (const E of [D.WIRING, D.FUNCTION]) {
      const L = H.partLinks(D.REGIONS, E), pos = E.filter(([, , w]) => w > 0);
      assert.equal(L.reduce((s, l) => s + l.count, 0), pos.length, 'count');
      const ab = H.partOf(D.REGIONS[pos[0][0]].id), cd = H.partOf(D.REGIONS[pos[0][1]].id), [a, b] = [ab, cd].sort();
      const brute = pos.filter(([i, j]) => { const [x, y] = [H.partOf(D.REGIONS[i].id), H.partOf(D.REGIONS[j].id)].sort(); return x === a && y === b; }).length;
      assert.equal(L.find((l) => l.a === a && l.b === b).count, brute, 'one pair recounted by hand');
    }
    return 'wiring ' + D.WIRING.filter((e) => e[2] > 0).length + ', function ' + D.FUNCTION.filter((e) => e[2] > 0).length;
  });
  ok('"talks most with": other parts only, most connections first', () => {
    const L = H.partLinks(D.REGIONS, D.WIRING);
    for (const p of H.PARTS) {
      const t = H.talksWith(L, p.id);
      assert.ok(t.every((x) => x.part !== p.id), p.id + ' talks with itself');
      for (let k = 1; k < t.length; k++) assert.ok(t[k - 1].count >= t[k].count, p.id + ' order');
    }
    /* witnesses the real data cannot give: an unsorted input, a zero-weight edge */
    const hand = H.talksWith([{ a: 'amygdala', b: 'frontal', count: 2, strength: 1 }, { a: 'amygdala', b: 'temporal', count: 5, strength: 1 }], 'amygdala');
    assert.deepEqual(hand.map((x) => x.part), ['temporal', 'frontal'], 'sorts its own input');
    assert.equal(H.partLinks(D.REGIONS, [[0, 1, 0], [0, 1, 2], [0, 1, -1]]).reduce((s, l) => s + l.count, 0), 1, 'a zero or negative weight is no connection');
    const amy = H.talksWith(L, 'amygdala'); return 'amygdala: ' + amy.slice(0, 3).map((x) => x.part + ' ' + x.count).join(', ');
  });
  ok('an emotion\'s parts hold exactly its regions, in PARTS order (every emotion of every pack)', () => {
    let n = 0;
    for (const pk of D.PACKS) for (const e of pk.emotions) {
      const g = H.partsOfEmotion(D.REGIONS, e.regions), got = g.flatMap((x) => x.regions).sort((a, b) => a - b);
      const want = [...new Set((e.regions || []).map((id) => D.REGIONS.findIndex((r) => r.id === id)).filter((i) => i >= 0))].sort((a, b) => a - b);
      assert.deepEqual(got, want, e.name);
      assert.ok(g.every((x) => x.regions.every((i) => H.partOf(D.REGIONS[i].id) === x.part)), e.name + ' wrong part');
      const order = g.map((x) => H.PARTS.findIndex((p) => p.id === x.part)); assert.deepEqual(order, [...order].sort((a, b) => a - b));
      n++;
    }
    return n + ' emotions';
  });
  ok('short names keep the side', () => {
    assert.equal(H.shortName({ name: 'Left amygdala' }), 'Amygdala (L)'); assert.equal(H.shortName({ name: 'Right insula' }), 'Insula (R)');
    assert.equal(H.shortName({ name: 'Hypothalamus' }), 'Hypothalamus');
  });
  ok('the page imports only what the module exports; the server serves the module and the page', () => {
    const imp = /import \{([^}]+)\} from '\.\/human-brain-parts\.js';/.exec(PAGE);
    assert.ok(imp, 'import line'); for (const name of imp[1].split(',').map((x) => x.trim())) assert.ok(typeof H[name] !== 'undefined', 'missing export ' + name);
    assert.ok(/'human-brain\.js', 'human-brain-parts\.js'/.test(serveur), 'served list');
    const onglet = readFileSync(join(ICI, 'tam-onglet.js'), 'utf8');
    assert.ok(/\.\.\.\(id === 'emotionWiringHCP' \? \[el\('p', \{ class: 'tamDoux' \}, el\('a', \{ href: 'human-brain\.html'/.test(onglet), 'TAM tab links the brain subject to the map');
    for (const id of ['partList', 'partInfo', 'tour', 'showAll', 'emotionInfo', 'regionInfo', 'netCount']) assert.ok(HTML.includes('id="' + id + '"'), 'element ' + id);
  });
  return out;
}

let n = 0; const ech = [];
const H0 = await import(pathToFileURL(join(ICI, 'human-brain-parts.js')).href);
for (const r of suite(H0)) { n++; console.log((r.ok ? 'OK    ' : 'ECHEC ') + r.nom + (r.d ? '  ' + r.d : '')); if (!r.ok) ech.push(r); }

const SRC = readFileSync(join(ICI, 'human-brain-parts.js'), 'utf8').replace(/\r\n/g, '\n');
const MUT = [
  ['cortex prefix not stripped', "const s = String(id), base = /^[LR]_/.test(s) ? s.slice(2) : s;", 'const s = String(id), base = s;'],
  ['a node in two parts', "members: ['Lthal', 'Rthal'] },", "members: ['Lthal', 'Rthal', 'Lamyg'] },"],
  ['zero-weight edges counted', 'if (!(w > 0)) continue;', ''],
  ['talks with itself', "links.filter((l) => l.a !== l.b && (l.a === pid || l.b === pid))", 'links.filter((l) => (l.a === pid || l.b === pid))'],
  ['talks unsorted', '.sort((x, y) => y.count - x.count || y.strength - x.strength);', ';'],
  ['emotion region dropped', "const i = regions.findIndex((r) => r.id === id); if (i < 0) continue;", "const i = regions.findIndex((r) => r.id === id); if (i <= 0) continue;"],
  ['side lost', "' (' + m[1][0] + ')'", "''"],
];
const dir = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'brain-map-mut-'));
let tues = 0;
try {
  for (let i = 0; i < MUT.length; i++) {
    const [nom, de, vers] = MUT[i], k = SRC.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NOT APPLIED (${k}) -> SURVIVES`); continue; }
    const p = join(dir, `m${i + 1}.mjs`); writeFileSync(p, SRC.replace(de, () => vers));
    const r = suite(await import(pathToFileURL(p).href)), rouges = r.filter((x) => !x.ok); if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'KILLED' : 'SURVIVES'}${rouges.length ? ' (' + rouges[0].nom.slice(0, 60) + ')' : ''}`);
  }
  /* the server mutant: the module left out of the served list */
  const r = suite(H0, SERVEUR.replace("'human-brain.js', 'human-brain-parts.js',", () => "'human-brain.js',")), rouges = r.filter((x) => !x.ok);
  if (rouges.length) tues++; console.log(`  M${MUT.length + 1} module not served : ${rouges.length ? 'KILLED' : 'SURVIVES'}`);
} finally { rmSync(dir, { recursive: true, force: true }); }
n++; if (tues !== MUT.length + 1) ech.push({ nom: 'mutants', d: tues + '/' + (MUT.length + 1) });
console.log(`MUTANTS : ${tues}/${MUT.length + 1} killed`);
if (ech.length) { console.log('ECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.d || '')); process.exit(1); }
console.log(`test-human-brain-map-20261109 : ${n} assertions OK`);
