// test-tam-melange-sciences-20261104.mjs -- banc du melange science x science (game128) + mutants sur COPIES de tam-science.js.
// Lancer : node test-tam-melange-sciences-20261104.mjs
// Ce qui est prouve : (a) la liste des partenaires = toutes les sciences sauf les systemes a plusieurs corps et les non-mintables ;
//   (b) la validation accepte { operateur, science, w } dans les bornes et refuse le reste (meme science, corps, cle en trop, poids, operateur) ;
//   (c) la vue melangee contre une REFERENCE ecrite ici (somme point a point ; composition = indice floor(frac(97 (x + 1) / 2) n)),
//       a partir de la vue partenaire publique ; (d) chaque partenaire certifie sur un porteur fixe ; (e) rejeu deterministe, et le
//       melange change bien les octets.
// Ce qui n est PAS prouve : la beaute d un melange ; l affichage (vu au navigateur, pas ici).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-science.js');
const PORTEUR = 'mendel', N = 1500;
const M = await import(pathToFileURL(join(ICI, 'tam-moteur.js')).href);

function normaliserRef(a) { // la regle publique : centre milieu, echelle commune -> [-1, 1]
  const n = a.length / 3, lo = [1 / 0, 1 / 0, 1 / 0], hi = [-1 / 0, -1 / 0, -1 / 0];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], a[3 * i + c]); hi[c] = Math.max(hi[c], a[3 * i + c]); }
  const r = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
  return a.map((v, k) => (v - (lo[k % 3] + hi[k % 3]) / 2) / r);
}

function suite(T, bavard = false, rapide = false) {
  const res = [];
  const ok = (nom, f) => { let c = false, det = ''; try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; } res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : '')); };
  const base = () => T.paramsScience(PORTEUR, {}), avec = (m) => ({ ...base(), melange: m });

  ok('partenaires : toutes les sciences sauf corps et non-mintables, gele', () => {
    const att = T.SYSTEMES.map((s) => s.id).filter((id) => !T.CORPS[id] && !T.NON_MINTABLES.has(id));
    assert.ok(Object.isFrozen(T.PARTENAIRES)); assert.deepEqual([...T.PARTENAIRES], att); assert.ok(att.length > 100);
    for (const id of Object.keys(T.CORPS)) assert.ok(!T.PARTENAIRES.includes(id), id);
    return att.length + ' partenaires';
  });
  ok('validation : forme science acceptee, chaque refus a sa raison', () => {
    assert.ok(T.certifierScience(avec({ operateur: 'somme', science: 'courseRoulante', w: 0.4 }), []).ok);
    assert.ok(T.certifierScience(avec({ operateur: 'composition', science: 'phasesLune', w: 0.1 }), []).ok);
    const refus = [{ operateur: 'somme', science: PORTEUR, w: 0.4 }, { operateur: 'somme', science: 'troisCorps', w: 0.4 }, { operateur: 'somme', science: 'inconnue', w: 0.4 },
      { operateur: 'couplage', science: 'phasesLune', w: 0.4 }, { operateur: 'somme', science: 'phasesLune', w: 0.05 }, { operateur: 'somme', science: 'phasesLune', w: 0.7 },
      { operateur: 'somme', science: 'phasesLune', w: '0.4' }, { operateur: 'somme', science: 'phasesLune', w: 0.4, motif: null }];
    for (const m of refus) assert.equal(T.certifierScience(avec(m), []).ok, false, JSON.stringify(m));
    /* un systeme a plusieurs corps ne PORTE pas de melange non plus */
    assert.equal(T.certifierScience({ ...T.paramsScience('troisCorps', {}), melange: { operateur: 'somme', science: 'phasesLune', w: 0.4 } }, []).ok, false);
  });
  for (const op of ['somme', 'composition']) for (const [sid, w] of [['phasesLune', 0.1], ['courseRoulante', 0.6], ['dureeJour', 0.35]]) ok(`vue ${op} avec ${sid} (w = ${w}) : egale la reference`, () => {
    const A = T.vuePartenaire(PORTEUR, N), B = T.vuePartenaire(sid, N), out = new Float64Array(3 * N);
    for (let i = 0; i < N; i++) {
      if (op === 'somme') for (let c = 0; c < 3; c++) out[3 * i + c] = (1 - w) * A[3 * i + c] + w * B[3 * i + c];
      else { const x = (A[3 * i] + 1) * 0.5 * 97, j = Math.min(N - 1, Math.floor((x - Math.floor(x)) * N)); out[3 * i] = B[3 * j]; out[3 * i + 1] = B[3 * j + 1]; out[3 * i + 2] = (1 - w) * B[3 * j + 2] + w * A[3 * i + 2]; }
    }
    const ref = normaliserRef(out), v = T.vueMelangee(Float64Array.from(A), N, { operateur: op, science: sid, w });
    let pire = 0; for (let k = 0; k < 3 * N; k++) pire = Math.max(pire, Math.abs(v[k] - ref[k]));
    assert.ok(pire < 1e-12, 'ecart ' + pire);
    return 'ecart ' + pire.toExponential(1);
  });
  /* (le mutant « reglages tires » survivait : la reference ci-dessus partait de vuePartenaire elle-meme) — reconstruite ici depuis la
   *   simulation PUBLIQUE a reglages par defaut, la standardisation et la projection du moteur, et la normalisation ecrite dans ce banc */
  ok('vue partenaire : reconstruite independamment (simuler par defaut + projeterND + angles par defaut)', () => {
    for (const sid of ['phasesLune', 'courseRoulante', 'enzyme', 'dureeJour']) {
      const o = T.systeme(sid).mod.simuler(sid, {}, { n: N }), ref = normaliserRef(M.projeterND(T.standardiserIso(o.brut, N, o.D, sid), N, o.D, T.anglesDefaut(o.D))), B = T.vuePartenaire(sid, N);
      assert.equal(B.length, ref.length, sid); let pire = 0; for (let k = 0; k < ref.length; k++) pire = Math.max(pire, Math.abs(B[k] - ref[k])); assert.ok(pire < 1e-12, sid + ' ' + pire);
    }
  });
  ok('vue partenaire : la science a ses reglages par defaut, vue normalisee dans [-1, 1]', () => {
    for (const sid of ['phasesLune', 'courseRoulante', 'enzyme']) { const B = T.vuePartenaire(sid, N); let m = 0; for (const x of B) { assert.ok(Number.isFinite(x)); m = Math.max(m, Math.abs(x)); } assert.ok(Math.abs(m - 1) < 1e-12, sid + ' ' + m); }
  });
  ok('rejeu : deterministe ; le melange change les octets ; somme et composition different', () => {
    const P = avec({ operateur: 'somme', science: 'courseRoulante', w: 0.4 }), a = T.rejouerScience(P), b = T.rejouerScience(JSON.parse(JSON.stringify(P)));
    assert.ok(a.ok && a.hash === b.hash);
    assert.notEqual(T.rejouerScience(base()).hash, a.hash);
    assert.notEqual(T.rejouerScience(avec({ operateur: 'composition', science: 'courseRoulante', w: 0.4 })).hash, a.hash);
    assert.notEqual(T.rejouerScience(avec({ operateur: 'somme', science: 'courseRoulante', w: 0.5 })).hash, a.hash);
  });
  ok('composition : un nuage (l ordre n est plus le temps), somme : l ordre du porteur', () => {
    assert.equal(T.estNuage(avec({ operateur: 'composition', science: 'enzyme', w: 0.3 }), { nuage: false }), true);
    assert.equal(T.estNuage(avec({ operateur: 'somme', science: 'enzyme', w: 0.3 }), { nuage: false }), false);
  });
  ok('cerveau : sur 60 graines, il melange aussi avec des sciences (jamais elle-meme, jamais un corps) et chaque choix est certifie', () => {
    let sci = 0, mot = 0;
    for (let g = 0; g < 60; g++) {
      const graine = '0x' + g.toString(16).padStart(64, '0'), r = T.choisirScience({ graine });
      assert.ok(r.ok, 'graine ' + g); const m = r.params.melange;
      assert.ok(T.certifierScience(r.params, []).ok);
      if (m && m.science) { sci++; assert.ok(m.science !== r.params.science && T.PARTENAIRES.includes(m.science)); } else if (m) mot++;
    }
    assert.ok(sci > 0, 'aucun partenaire science tire');
    return sci + ' melanges science, ' + mot + ' motifs, sur 60';
  });
  if (!rapide) ok(`chaque partenaire certifie sur le porteur ${PORTEUR} (somme, w = 0.5)`, () => {
    const ko = []; let n = 0;
    for (const sid of T.PARTENAIRES) { if (sid === PORTEUR) continue; n++; const c = T.certifierScience(avec({ operateur: 'somme', science: sid, w: 0.5 }), []); if (!c.ok) ko.push(sid + ': ' + (c.raisons || []).join('|')); }
    assert.equal(ko.length, 0, ko.slice(0, 5).join(' ; '));
    return n + '/' + n;
  });
  return res;
}

const T0 = await import(pathToFileURL(SOURCE).href);
const r0 = suite(T0, true), ech = r0.filter((x) => !x.ok);
let assertions = r0.length;

const src = readFileSync(SOURCE, 'utf8');
const MUTANTS = [
  ['somme : poids inverse', 'out[i] = (1 - w) * proj[i] + w * B[i];', 'out[i] = w * proj[i] + (1 - w) * B[i];'],
  ['composition : indice sans frac (u = x)', 'u = x - Math.floor(x), j =', 'u = x / 97, j ='],
  ['composition : z sans le porteur', 'out[3 * i + 2] = (1 - w) * B[3 * j + 2] + w * proj[3 * i + 2]; }', 'out[3 * i + 2] = B[3 * j + 2]; }'],
  ['validation : meme science acceptee', "|| m.science === P.science) return non('melange : science partenaire');", ") return non('melange : science partenaire');"],
  ['partenaires : corps inclus', 'filter((id) => !CORPS[id] && !NON_MINTABLES.has(id))', 'filter((id) => !NON_MINTABLES.has(id))'],
  ['validation : poids non borne', "if (!(typeof m.w === 'number' && m.w >= BORNES.w[0] && m.w <= BORNES.w[1])) return non('melange : poids');\n      if (!PARTENAIRES", "if (!(typeof m.w === 'number')) return non('melange : poids');\n      if (!PARTENAIRES"],
  ['cerveau : jamais de partenaire science', 'else P.melange = { operateur, science: autres[k - MOTIFS_MELANGE.length], w };', 'else { const [f, v] = MOTIFS_MELANGE[0]; P.melange = { operateur, motif: motifDefaut(f, v), w }; }'],
  ['vue partenaire : reglages tires, pas par defaut', 'o = s.mod.simuler(id, {}, { n });', 'o = s.mod.simuler(id, { graine: 7, seed: 7 }, { n: n + 1 });'],
];
const prefixe = pathToFileURL(ICI).href + '/';
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-melange-mutants-'));
let tues = 0;
console.log('\nMUTANTS :');
try {
  for (let i = 0; i < MUTANTS.length; i++) {
    const [nom, de, vers] = MUTANTS[i], k = src.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NON APPLIQUE (motif trouve ${k} fois) -> SURVIVANT`); continue; }
    const f = join(dossier, `mutant-${i + 1}.mjs`);
    writeFileSync(f, src.replace(de, vers).replaceAll("from './", `from '${prefixe}`));
    let r; try { r = suite(await import(pathToFileURL(f).href), false, true); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok); if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'TUE' : 'SURVIT'} (${rouges.length} rouges${rouges.length ? ', ex: ' + rouges.slice(0, 2).map((x) => x.nom).join(' | ') : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
assertions++; if (tues !== MUTANTS.length) ech.push({ nom: 'mutants', det: `${tues}/${MUTANTS.length}` });
console.log(`\nMUTANTS : ${tues}/${MUTANTS.length} tues`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.det || '')); process.exit(1); }
console.log(`test-tam-melange-sciences-20261104 : ${assertions} assertions OK`);
