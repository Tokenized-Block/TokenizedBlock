// test-pensee-lexique-20261027 — owner (Phil) 2026-10-27:
//   1. the auctioneer LIVES with no auction (CSS idle loop), paused when hidden/folded, static under reduced motion, never a fake bid;
//   2. the live thought says WHY (the engine's own rule), covers the whole beat, picks its words from a DICTIONARY deterministically,
//      every clause maps to a datum, the tier follows the numbers;
//   3. (coordinator) the brain scene background = BLACK without an owned skin, for every mood; the mood shows as flashes only.
// Mutants: run with no env var -> the bench re-runs itself on mutant COPIES (written next to the modules, removed after); each must FAIL.
// Env: LX_PENSEE / LX_LEX / LX_VI (another module file name in this directory), LX_APP (another app.html path).
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const DIR = new URL('./', import.meta.url);
const P = await import(new URL(process.env.LX_PENSEE || 'pensee-cerveau.js', DIR).href);
const LX = await import(new URL(process.env.LX_LEX || 'lexique-cerveau.js', DIR).href);
const VI = await import(new URL(process.env.LX_VI || 'vision-inside.js', DIR).href);
const C = await import(new URL('cerveau.js', DIR).href);
const app = readFileSync(process.env.LX_APP || new URL('app.html', DIR), 'utf8').replace(/\r\n/g, '\n');
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };

/* ── a REAL run of the engine: 3 blocks x 48 beats with varied facts (trades, transfers, unread market, no market, death) ── */
const ADRS = ['0x' + '1'.repeat(40), '0x8f3c' + 'a'.repeat(36), '0x' + '7e'.repeat(20)];
const ROLES = ['GARDIEN', 'MOMENTUM', 'ACCUEIL'];
function run(adr, role) {
  let e = C.etatInitial(adr); const histo = [], etats = [], faitsL = [];
  let cum = { gm: 0, achats: 0, ventes: 0, detenteurs: 0, messages: 0 }, vie = 5000;
  for (let k = 0; k < 48; k++) {
    const avant = { ...cum }, vieAvant = vie;
    const s = (k * 37 + adr.charCodeAt(5)) % 11;
    if (s === 1) cum.achats += 1 + (k % 5); if (s === 2) cum.ventes += 1 + (k % 4); if (s === 3) cum.gm += 2; if (s === 4) cum.detenteurs += 1;
    if (s === 5) cum.messages += 1; if (s === 6) vie = vie * 1.08; if (s === 7) vie = vie * 0.9; if (s === 8) vie = vie * 1.01;
    const faits = k >= 30 && k < 34 ? { vie: null, etatVie: 'NON_LUE', role } : k >= 34 && k < 40 ? { vie: null, gm: cum.gm, gmAvant: avant.gm, role, reveil: k === 36 }
      : k === 47 ? { mort: true, role } : { vie, vieAvant, ...Object.fromEntries(Object.keys(cum).map((x) => [x, cum[x]])), ...Object.fromEntries(Object.keys(avant).map((x) => [x + 'Avant', avant[x]])), role };
    const r = C.pas(e, faits); e = r.etat; histo.push(r.vu); etats.push(e); faitsL.push(faits);
  }
  return { histo, etats, faitsL };
}
const runs = ADRS.map((a, j) => ({ adr: a, ...run(a, ROLES[j]) }));
const phases = new Set(runs.flatMap((r) => r.histo.map((v) => v.phase)));
ok(['EXCITE', 'INQUIET', 'NON_LU', 'MORT'].every((p) => phases.has(p)) && (phases.has('CALME') || phases.has('CURIEUX')) && (phases.has('DORMANT') || phases.has('EVEILLE')), 'the real run covers the moods: ' + [...phases].join(','));

/* the datum each traced key names, recomputed independently from the record */
function datum(key, ctx) {
  const { vu, prev, H, i, voisins, etat, faits } = ctx;
  if (key === 'phase') return vu.phase;
  if (key.startsWith('nouveaux.')) return vu.nouveaux[key.slice(9)];
  if (['delta', 'spikes', 'nourriture', 'memoire', 'virage', 'vitesse', 'gauche_hz', 'droite_hz'].includes(key)) return vu[key];
  if (key === 'memoireAvant') return prev.memoire;
  if (key === 'vitesseAvant') return prev.vitesse;
  if (key === 'average' || key === 'averageOver') { const a = H.slice(Math.max(0, i - 8), i); return key === 'average' ? a.reduce((s, v) => s + v.spikes, 0) / a.length : a.length; }
  if (key === 'deltaHumeur') return C.INTERNES.deltaHumeur;
  if (key === 'tirsCurieux') return C.INTERNES.tirsCurieux;
  if (key === 'voisins') return voisins;
  if (key === 'nearThreshold') return etat && etat.tick === vu.tick ? etat.potentiels.filter((p) => p >= 0.75 && p < 1).length : 'NOT LIVE';
  if (key === 'role') return etat && etat.tick === vu.tick ? faits.role : 'NOT LIVE';
  if (key === 'reveil') return etat && etat.tick === vu.tick ? faits.reveil : 'NOT LIVE';
  if (key === 'nothing') return ['achats', 'ventes', 'detenteurs', 'gm', 'messages'].every((k) => !(vu.nouveaux[k] > 0)) && !vu.delta ? null : 'SOMETHING ARRIVED';
  return 'UNKNOWN KEY ' + key;
}
const nums = (s) => (s.match(/\d+(?:\.\d+)?/g) || []).map(Number);
const variants = (x) => (typeof x === 'number' ? [x, Math.round(x * 100) / 100, Math.round(x * 1000) / 1000, Math.round(x * 10000) / 10000, Math.round(Math.abs(x) * 1000) / 10] : []);
let clausesChecked = 0, beats = 0;
const texts = new Set(), moveWords = new Set();
for (const r of runs) {
  r.histo.forEach((vu, i) => {
    /* the live state and facts are passed for EVERY beat: only the beat they belong to may use them */
    const ctx = { vu, prev: r.histo[i - 1], H: r.histo, i, voisins: 4, etat: r.etats[i + 2] || r.etats[i], faits: r.faitsL[i] };
    const ctxLive = { ...ctx, etat: r.etats[i] };
    for (const c of [ctx, ctxLive]) {
      const p = P.pensee(c.H, i, { voisins: 4, etat: c.etat, faits: c.faits });
      ok(p.text === P.pensee(c.H, i, { voisins: 4, etat: c.etat, faits: c.faits }).text, 'same beat -> same text');
      texts.add(p.text); beats++;
      for (const cl of p.clauses) {
        ok(Array.isArray(cl.from) && cl.from.length > 0, 'clause traced: ' + cl.text);
        for (const f of cl.from) {
          const d = datum(f.key, c);
          ok(Object.is(d, f.value) || (typeof d === 'number' && Math.abs(d - f.value) < 1e-9), 'datum ' + f.key + ' = ' + f.value + ' (recomputed ' + d + ') in: ' + cl.text);
        }
        const vals = cl.from.flatMap((f) => variants(f.value));
        for (const n of nums(cl.text)) ok(n === 128 || vals.some((v) => Math.abs(v - n) < 1e-9), 'number ' + n + ' traced in: ' + cl.text);
        /* the words say what the data say */
        const fv = (k) => (cl.from.find((f) => f.key === k) || {}).value;
        if (/trace rises|builds up|grows stronger/.test(cl.text)) ok(fv('memoire') > fv('memoireAvant'), 'trace rising = memory rose');
        const mm = cl.text.match(/\(([\d.]+) → ([\d.]+)\)/);
        if (mm && !/holds|stays level/.test(cl.text)) ok(mm[1] !== mm[2], 'a changing trace never prints two equal numbers: ' + mm[0]);
        if (/trace fades|thins out|grows fainter/.test(cl.text)) ok(fv('memoire') < fv('memoireAvant'), 'trace fading = memory fell');
        const TURN = 'I (drift slightly|ease a touch|turn|lean|veer|bank hard|swing) ';
        if (new RegExp(TURN + 'left').test(cl.text)) ok(fv('virage') < 0, 'left = steering < 0');
        if (new RegExp(TURN + 'right').test(cl.text)) ok(fv('virage') > 0, 'right = steering > 0');
        const w = cl.text.match(/My (left|right) wing drives/);
        if (w) ok(w[1] === 'left' ? fv('gauche_hz') > fv('droite_hz') : fv('droite_hz') > fv('gauche_hz'), 'the wing that drives = the faster one');
        if (/speed up|quicken|pick up pace/.test(cl.text)) ok(fv('vitesse') > fv('vitesseAvant'), 'faster = speed rose');
        const m = cl.text.match(/something new reached me \(([^)]+)\)/);
        if (m) { const names = { buy: 'achats', 'new holder': 'detenteurs', transfer: 'gm', message: 'messages' };
          const said = m[1].split(/, | and /).map((x) => names[x]).sort(), arrived = ['achats', 'detenteurs', 'gm', 'messages'].filter((k) => vu.nouveaux[k] > 0).sort();
          ok(JSON.stringify(said) === JSON.stringify(arrived), 'the new inputs named = those that arrived: ' + m[1]); }
        const a = cl.text.match(/; no ([a-z ,]+?) came/);
        if (a) for (const nm of a[1].split(/, | or /)) ok(cl.from.some((f) => f.value === 0 && f.key.startsWith('nouveaux.')), 'absent input traced at 0: ' + nm);
        clausesChecked++;
      }
      /* WHY: on a real engine record the reason is always re-derived (never "cannot tell") and names the mood */
      const cause = P.causeHumeur(vu);
      ok(cause.ok, 'the engine reason re-derives phase ' + vu.phase + ' on beat ' + vu.tick + ': ' + cause.text);
      ok(p.clauses[0].text === cause.text, 'the thought opens with WHY');
      if (vu.phase === 'NON_LU') ok(/^I judge no mood because my market could not be read on this beat\.$/.test(cause.text), 'NON_LU: why no mood');
      /* the reading: its word is one of ITS tier's words; labelled with its key */
      const rd = p.reading;
      ok(LX.HUMEURS[rd.key][rd.tier].includes(rd.word), 'reading word "' + rd.word + '" belongs to ' + rd.key + '/' + rd.tier);
      const mv = p.clauses.find((x) => /I (drift|ease|turn|lean|veer|bank|swing|hold|keep|fly)/.test(x.text));
      if (mv) moveWords.add(mv.text.match(/I (\w+)/)[1]);
      /* the live state (potentials, role, wake-up) speaks ONLY on its own beat */
      if (c.etat.tick !== vu.tick) ok(!p.clauses.some((x) => x.from.some((f) => ['nearThreshold', 'role', 'reveil'].includes(f.key))), 'not its beat -> no live-state clause');
      else if (vu.phase !== 'MORT') ok(p.clauses.some((x) => x.from.some((f) => f.key === 'nearThreshold')) && p.clauses.some((x) => x.from.some((f) => f.key === 'role')), 'its own beat -> near-threshold and role said');
    }
  });
}
ok(texts.size > runs.length * 40, 'different beats read differently (' + texts.size + ' distinct texts)');
ok(moveWords.size >= 4, 'movement words vary: ' + [...moveWords].join(','));
ok(runs.some((r) => r.histo.some((v, i) => v.phase !== 'MORT' && P.pensee(r.histo, i, { etat: r.etats[i], faits: r.faitsL[i] }).text.includes('daily wake-up pulse — not a market event'))), 'the daily wake-up is said on its beat, as NOT a market event');
/* a record that does not hold its reason -> says so, never guesses */
ok(!P.causeHumeur({ tick: 1, phase: 'EXCITE', spikes: 3, delta: 0, nouveaux: { achats: 0, ventes: 0, detenteurs: 0, gm: 0, messages: 0 } }).ok
  && /does not hold enough to tell why/.test(P.causeHumeur({ tick: 1, phase: 'CALME', spikes: 3 }).text), 'no re-derivable reason -> "cannot tell"');

/* ── the tier follows the numbers ── */
const N = (o) => ({ achats: 0, ventes: 0, detenteurs: 0, gm: 0, messages: 0, ...o });
const b = (tick, o = {}) => ({ tick, phase: 'EXCITE', spikes: 10, virage: 0, vitesse: 0.3, nouveaux: N(), delta: 0, ...o });
const tier = (h) => P.lecture(h, h.length - 1).tier;
ok(tier([b(1, { nouveaux: N({ achats: 1 }) })]) === 'low' && tier([b(1, { nouveaux: N({ achats: 3 }) })]) === 'mid' && tier([b(1, { nouveaux: N({ achats: 6, ventes: 1 }) })]) === 'high', 'eager tier = buys over sells');
ok(tier([b(1, { nouveaux: N({ ventes: 1 }) })]) === 'low' && tier([b(1, { nouveaux: N({ ventes: 5 }) })]) === 'high', 'wary tier = sells over buys');
const base = [b(1), b(2), b(3)];
ok(tier([...base, b(4, { spikes: 16 })]) === 'low' && tier([...base, b(4, { spikes: 25 })]) === 'mid' && tier([...base, b(4, { spikes: 40 })]) === 'high', 'stirred tier = fired / average');
ok(tier([...base, b(4, { spikes: 6 })]) === 'low' && tier([...base, b(4, { spikes: 0 })]) === 'high', 'settling tier = average / fired');
ok(LX.palier(1, 2, 4) === 'low' && LX.palier(2, 2, 4) === 'mid' && LX.palier(4, 2, 4) === 'high', 'palier bounds');
for (const k of Object.keys(LX.HUMEURS)) for (const t of LX.PALIERS) ok(LX.HUMEURS[k][t].length >= 2, 'several words for ' + k + '/' + t);
ok(LX.variete({ tick: 5, cablage: '0x0000000a' }) === LX.variete({ tick: 5, cablage: '0x0000000a' }) && LX.variete({ tick: 5, cablage: '0x0000000a' }) !== LX.variete({ tick: 6, cablage: '0x0000000a' }), 'variety = beat + wiring, deterministic');
for (const f of [process.env.LX_PENSEE || 'pensee-cerveau.js', process.env.LX_LEX || 'lexique-cerveau.js']) {
  ok(!/Math\.random|Date\.now|performance\.now|fetch\(|https?:\/\//.test(readFileSync(new URL(f, DIR), 'utf8').replace(/^\s*(\/\/|\*|\/\*).*$/gm, '')), 'no randomness, clock or network in ' + f);
}

/* ── the scene background: black without an owned skin, for every mood; the owned skin's own colour otherwise ── */
for (const ph of C.PHASES) ok(VI.sceneBackground(null) === '#000000' && VI.sceneBackground({ fond: '' }) === '#000000', 'no skin -> black (' + ph + ')');
ok(VI.sceneBackground.length === 1 && VI.sceneBackground({ fond: ' rgb(12 34 56)' }) === 'rgb(12 34 56)' && VI.sceneBackground({ fond: 'url(x)' }) === '#000000', 'owned skin -> its colour; anything else -> black');
ok(VI.moodFlash(0, true) === 1 && VI.moodFlash(0.5, true) === 0 && VI.moodFlash(0.1, false) === 0.5 && VI.moodFlash(0.9, false) === 0.5, 'mood flash timed with the beat; static with reduced motion');
const p3 = app.slice(app.indexOf('function bvPaint3D('), app.indexOf('function bvStartLoop('));
const fondLine = (p3.match(/ctx\.fillStyle = ([^;]+);\n\s*ctx\.fillRect\(0, 0, L, H\);/) || [])[1];
ok(fondLine === 'sceneBackground(vision.fondScene)', 'the scene is filled with sceneBackground only: ' + fondLine);
ok(/vision\.fondScene = dlv && \/\^#\\d\+\$\/\.test\(dlv\.dataset\.skin \|\| ''\) \? \{ fond: getComputedStyle\(dlv\)\.getPropertyValue\('--creux'\) \} : null;/.test(app), 'fondScene = the OWNED skin palette only (data-skin="#id"), else null');
ok(/const flash = moodFlash\(progress, plan\.light !== 'static'\);/.test(p3) && (p3.match(/flash > 0\) \{ ctx\.strokeStyle = 'hsl\(' \+ th/g) || []).length === 2 && /const beatK = pl\.animated \? flash : 0\.5;/.test(p3), 'mood = flashes on fired neurons, read inputs and the edge');

/* ── the auctioneer's idle life ── */
const css = app.slice(app.indexOf('@keyframes skSouffle'), app.indexOf('@media (max-width:420px){.skStage'));
for (const k of ['skSouffle', 'skCligne', 'skRegard', 'skAjuste', 'skRepos', 'skParle']) ok(new RegExp('@keyframes ' + k + '\\{').test(css), 'idle animation ' + k);
ok(/@media \(prefers-reduced-motion:reduce\)\{\.skCrieur\.tape \.skMarteau,\.skCrieur \*,\.skCrieur\.parle \.skBouche\{animation:none!important\}\}/.test(css), 'reduced motion: a static pose');
ok(/#skPop\.bcReduit \.skCrieur \*,\.skCrieur\.pause \*\{animation-play-state:paused!important\}/.test(css) && /classList\.toggle\('pause', document\.hidden\)/.test(app), 'paused when folded or the page hidden');
ok(/\.skPaupieres\{[^}]*transform:scaleY\(0\)/.test(css), 'eyes open in the static pose');
const repos = (css.match(/@keyframes skRepos\{([^\n]+)\}/) || [])[1] || '';
ok(/rotate\(-7deg\)/.test(repos) && !/-28deg/.test(repos), 'the idle gavel lift is small and is not the real tap');
const svg = app.slice(app.indexOf('id="skCrieur"'), app.indexOf('id="skBulle"'));
for (const c of ['skSouffle', 'skYeux', 'skPaupieres', 'skLunettes', 'skBouche', 'skMarteauRepos']) ok(svg.includes('class="' + c + '"'), 'drawing part ' + c);
const room = app.slice(app.indexOf('const salle = {'), app.indexOf("$('#skVersMarket')"));
ok(!/requestAnimationFrame/.test(room) && /if \(salle\.dit !== dit\)/.test(room), 'no JS frame loop; he gestures only when his line changes');
ok(/if \(salle\.offrePodium && salle\.offrePodium !== o\)/.test(room), 'the real tap still needs a bid change read on chain');

console.log('test-pensee-lexique-20261027: ' + count + ' checks OK (' + beats + ' thoughts, ' + clausesChecked + ' clauses mapped to data)');

/* ── MUTANTS ── */
if (!process.env.LX_PENSEE && !process.env.LX_LEX && !process.env.LX_VI && !process.env.LX_APP) {
  const me = fileURLToPath(import.meta.url), here = fileURLToPath(DIR);
  const pen = readFileSync(new URL('pensee-cerveau.js', DIR), 'utf8'), lex = readFileSync(new URL('lexique-cerveau.js', DIR), 'utf8');
  const vi = readFileSync(new URL('vision-inside.js', DIR), 'utf8');
  const M = [
    ['LX_PENSEE', 'mut-lx-nouveaux.tmp.mjs', pen, pen.replace("const nouv = ['achats', 'detenteurs', 'gm', 'messages'].filter((k) => N[k] > 0);", "const nouv = ['achats', 'detenteurs', 'gm', 'messages'].filter((k) => N[k] >= 0);")],
    ['LX_PENSEE', 'mut-lx-trace.tmp.mjs', pen, pen.replace("vu.memoire > prev.memoire ? 'monte' : vu.memoire < prev.memoire ? 'baisse'", "vu.memoire > prev.memoire ? 'baisse' : vu.memoire < prev.memoire ? 'monte'")],
    ['LX_PENSEE', 'mut-lx-live.tmp.mjs', pen, pen.replace('const live = !!(etat && etat.tick === vu.tick);', 'const live = !!etat;')],
    ['LX_PENSEE', 'mut-lx-tier.tmp.mjs', pen, pen.replace("pick('eager', palier(a - s, 2, 4)", "pick('eager', palier(a - s + 3, 2, 4)")],
    ['LX_PENSEE', 'mut-lx-invente.tmp.mjs', pen, pen.replace("bouts.push('my role is ' + role.titre);", "bouts.push('my role is ' + role.titre + ' and 2 whales follow me');")],
    ['LX_PENSEE', 'mut-lx-devine.tmp.mjs', pen, pen.replace("    return nondit;\n  }\n  if (d >= lim || nouv.length", "    return { ok: true, text: 'My engine judges me excited because the market feels hot.', from: [P] };\n  }\n  if (d >= lim || nouv.length")],
    ['LX_LEX', 'mut-lx-hasard.tmp.mjs', lex, lex.replace('return (t * 7 + c + sel * 13) >>> 0;', 'return (t * 7 + c + sel * 13 + Math.floor(Math.random() * 1000)) >>> 0;')],
    ['LX_VI', 'mut-lx-fond.tmp.mjs', vi, vi.replace("export const SCENE_BLACK = '#000000';", "export const SCENE_BLACK = '#0b0d12';")],
    ['LX_APP', 'mut-lx-reduit.tmp.html', app, app.replace('.skCrieur *,.skCrieur.parle .skBouche{animation:none!important}', '.skCrieur.parle .skBouche{animation:none!important}')],
    ['LX_APP', 'mut-lx-humeurfond.tmp.html', app, app.replace("{ fond: getComputedStyle(dlv).getPropertyValue('--creux') } : null;", "{ fond: getComputedStyle(dlv).getPropertyValue('--creux') } : { fond: 'hsl(' + th + ' 45% 9%)' };")],
  ];
  let dead = 0;
  for (const [env, file, orig, body] of M) {
    if (body === orig) { console.log('  MUTANT NOT APPLIED: ' + file); continue; }
    const path = here + file; writeFileSync(path, body);
    try {
      const r = spawnSync(process.execPath, [me], { env: { ...process.env, [env]: env === 'LX_APP' ? path : file }, encoding: 'utf8' });
      if (r.status !== 0) dead++; else console.log('  MUTANT SURVIVED: ' + file);
    } finally { rmSync(path, { force: true }); }
  }
  console.log('mutants killed: ' + dead + '/' + M.length);
  assert.equal(dead, M.length, 'every mutant dies');
}
