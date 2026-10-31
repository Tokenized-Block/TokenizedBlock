// test-tam-moteur-20261031.mjs -- banc du moteur TAM (phase A) + mutants sur COPIES.
// Lancer : node test-tam-moteur-20261031.mjs
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { keccak256Hex } from './keccak.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-moteur.js');
const egaux = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const graineDe = (s) => keccak256Hex(new TextEncoder().encode(s)); // pseudo-hash de bloc (PAS un vrai bloc)

function suite(T, bavard = false) {
  const res = []; const ok = (nom, c, det = '') => { res.push({ nom, ok: !!c, det }); if (bavard) console.log((c ? 'OK  ' : 'ECHEC ') + nom + (det ? '  ' + det : '')); };
  const G = graineDe('bloc-1'), E = { tick: 7, neurones: [1, 0, 1] };
  // 1. determinisme
  const a = T.choisirOeuvre({ graine: G, etatCerveau: E }), b = T.choisirOeuvre({ graine: G, etatCerveau: E });
  ok('choix ok', a.ok, a.ok ? a.params.famille + '/' + a.params.operateur + ' essai ' + a.params.essai : JSON.stringify(a.rejets).slice(0, 200));
  ok('meme graine -> octets identiques', a.ok && b.ok && egaux(a.octets, b.octets) && a.hash === b.hash);
  const r = a.ok && T.rejouer(JSON.parse(JSON.stringify(a.params)));
  ok('rejouer(params JSON) -> octets identiques', r && r.ok && egaux(r.octets, a.octets) && r.hash === a.hash);
  const Gb = '0x' + (parseInt(G.slice(2, 4), 16) ^ 1).toString(16).padStart(2, '0') + G.slice(4);
  const c = T.choisirOeuvre({ graine: Gb, etatCerveau: E });
  ok('un bit de graine -> autre oeuvre', c.ok && c.hash !== a.hash && JSON.stringify(c.params.params) !== JSON.stringify(a.params.params));
  const d = T.choisirOeuvre({ graine: G, etatCerveau: { ...E, tick: 8 } });
  ok('autre etat cerveau -> autre oeuvre', d.ok && d.hash !== a.hash);
  // 2. Lyapunov : temoin positif et temoins negatifs
  const lor = T.generer({ famille: 'lorenz' }), cl = T.certifier(lor);
  ok('Lorenz lambda in [0.6, 1.2]', lor.lyapunov > 0.6 && lor.lyapunov < 1.2, 'lambda=' + lor.lyapunov.toFixed(4));
  ok('Lorenz certifie', cl.ok, cl.raisons.join(','));
  const cyc = T.generer({ famille: 'rossler', params: { a: 0.2, b: 0.2, c: 2.5 } }), cc = T.certifier(cyc);
  ok('Rossler c=2.5 (cycle limite) |lambda| < LYAP_MIN', Math.abs(cyc.lyapunov) < T.LYAP_MIN, 'lambda=' + cyc.lyapunov.toFixed(4));
  ok('cycle limite REJETE (non chaotique)', !cc.ok && cc.raisons.some((x) => x.startsWith('non chaotique')));
  const fix = T.generer({ famille: 'lorenz', params: { r: 14 } });
  ok('Lorenz r=14 (point fixe) lambda < 0', fix.lyapunov < 0, 'lambda=' + fix.lyapunov.toFixed(4));
  ok('point fixe REJETE', !T.certifier(fix).ok);
  // 3. borne
  const ex = T.generer({ famille: 'explosion' }), ce = T.certifier(ex);
  ok('explosion : bornee=false', ex.bornee === false, 'echappeA=' + ex.echappeA);
  ok('explosion REJETEE (diverge)', !ce.ok && ce.raisons.includes('diverge'));
  ok('Lorenz bornee', lor.bornee === true);
  // 4. aller-retour d'encodage
  for (const [nom, o] of [['lorenz', lor], ['choix', a.oeuvre], ['clifford', T.generer({ famille: 'clifford' })]]) {
    const oct = T.encoderOeuvre(o), dec = T.decoder(oct), M = (1 << o.params.q) - 1;
    ok('decode(encode) points exacts ' + nom, egaux(Array.from(dec.points), Array.from(o.points)));
    ok('encode(decode) octets exacts ' + nom, egaux(T.encoder(dec), oct));
    ok('positions = dequantification q=' + o.params.q + ' ' + nom, dec.positions.every((v, i) => v === o.points[i] / M * 2 - 1));
  }
  let tronque = false; try { T.decoder(T.encoderOeuvre(lor).slice(0, -1)); } catch { tronque = true; }
  ok('octets tronques refuses', tronque);
  // 5. N-D jusqu'a 12
  for (const p of [{ famille: 'lorenz96', dim: 12, angles: [0.3, 1.1, 2.0, 0.7, 2.9, 1.4, 0.2, 2.2, 1.9] }, { famille: 'lorenz', operateur: 'couplage', k: 4, eps: 0.2, angles: [0.5, 1, 1.5, 2, 2.5, 3, 0.1, 0.9, 1.7] }]) {
    const o = T.generer(p), co = T.certifier(o), L = T.couches(o);
    ok('N-D ' + p.famille + '/' + (p.operateur || 'seul') + ' D=12', o.D === 12 && L.series.length === 12 && L.paires.length === 66 && L.plansCaches.length === 9);
    ok('N-D ' + p.famille + ' certifie (lambda>0, borne, dim)', co.ok, 'lambda=' + o.lyapunov.toFixed(3) + ' dim=' + co.dimension.toFixed(3) + ' ' + co.raisons.join(','));
  }
  const rot0 = T.generer({ famille: 'lorenz96', dim: 8 }), rot1 = T.generer({ famille: 'lorenz96', dim: 8, angles: [1, 1, 1, 1, 1] });
  ok('rotation des plans caches change la projection', !egaux(Array.from(rot0.points), Array.from(rot1.points)));
  // 5b. (phase C) CHAQUE dimension compte dans la vue STOCKEE : pour D = 6, 9, 12 et chaque k, eteindre k (colonne a 0) change la vue
  for (const p of [{ famille: 'lorenz', operateur: 'couplage', k: 2, eps: 0.2, angles: [0.5, 1, 1.5] }, { famille: 'lorenz', operateur: 'couplage', k: 3, eps: 0.2, angles: [0.5, 1, 1.5, 2, 2.5, 3] },
    { famille: 'lorenz96', dim: 12, angles: [0.3, 1.1, 2.0, 0.7, 2.9, 1.4, 0.2, 2.2, 1.9] }]) {
    const o = T.generer({ n: 300, ...p }), D = o.D, n = o.n, z = T.standardiserND(o.brut, n, D), ref = T.projeterND(z, n, D, o.params.angles);
    const muettes = [];
    for (let k = 0; k < D; k++) {
      const zk = z.slice(); for (let i = 0; i < n; i++) zk[i * D + k] = 0;
      const pk = T.projeterND(zk, n, D, o.params.angles); let dmax = 0; for (let i = 0; i < pk.length; i++) dmax = Math.max(dmax, Math.abs(pk[i] - ref[i]));
      if (!(dmax > 1e-3)) muettes.push('x' + (k + 1));
    }
    ok('D=' + D + ' : chacune des ' + D + ' dimensions change la vue stockee', muettes.length === 0, muettes.length ? 'muettes : ' + muettes.join(',') : '');
  }
  // 6. distinction
  const cd = T.certifier(lor, [T.certifier(lor).signature]);
  ok('quasi-doublon REJETE', !cd.ok && cd.raisons.includes('quasi-doublon'), 'distance=' + cd.distanceMin);
  const a2 = T.choisirOeuvre({ graine: G, etatCerveau: E, existantes: [a.certificats.signature] });
  ok('choix avec existante identique -> autre oeuvre distincte', a2.ok && a2.hash !== a.hash && a2.certificats.distanceMin >= T.SEUIL_DISTINCT, a2.ok ? 'essai ' + a2.params.essai + ' d=' + a2.certificats.distanceMin.toFixed(3) : '');
  // 7. dimension boite
  ok('Lorenz dimension boite in [1.5, 2.3]', cl.dimension > 1.5 && cl.dimension < 2.3, 'D=' + cl.dimension.toFixed(3));
  // 8. (2026-11-01, campagne tam-sim) les graines FAUTIVES de la campagne : graine = keccak("sim-"+i), etat null. L ancien choix (essai
  //    et famille/operateur releves dans indep0.json) doit etre REJETE pour la raison attendue, et le nouveau tenir a n = 4500.
  const FAUTIVES = [[10, 0, 'rossler/somme', 'CYCLE_LONG'], [225, 0, 'halvorsen/couplage', 'CYCLE_LONG'], [146, 0, 'rossler/composition', 'CYCLE_LONG'],
    [232, 3, 'aizawa/couplage', 'CYCLE_LONG'], [266, 1, 'halvorsen/couplage', 'COURBE'], [730, 0, 'halvorsen/couplage', 'COURBE'],
    [893, 2, 'halvorsen/couplage', 'COURBE'], [158, 0, 'rossler/couplage', 'PLAT'], [906, 0, 'aizawa/couplage', 'PLAT']];
  for (const [i, essai, fo, code] of FAUTIVES) {
    const ch = T.choisirOeuvre({ graine: graineDe('sim-' + i), etatCerveau: null });
    const rj = ch.rejets && ch.rejets.find((x) => x.essai === essai);
    const c45 = ch.ok && T.certifier(T.generer({ ...ch.params, n: 4500 }), []);
    ok('graine sim-' + i + ' : ancien choix ' + fo + ' (essai ' + essai + ') rejete ' + code + ', nouveau tient a n=4500',
      ch.ok && ch.params.essai > essai && rj && rj.famille + '/' + rj.operateur === fo && (rj.codes || []).includes(code) && c45 && c45.ok,
      ch.ok ? 'nouveau ' + ch.params.famille + '/' + ch.params.operateur + ' essai ' + ch.params.essai + (rj ? ' ; rejet ' + (rj.codes || []).join('+') : ' ; pas de rejet a cet essai') : 'aucun');
  }
  // 8b. les DEUX fenetres sont exigees (une trajectoire chaotique puis lente, ou l inverse, est refusee)
  for (const fen of [[0.5, 0.001], [0.001, 0.5]]) {
    const cw = T.certifier({ ...lor, prolonger: () => ({ bornee: true, etapes: T.LYAP_ETAPES_LONG, fenetres: fen }) }, []);
    ok('fenetres ' + fen.join('/') + ' -> REJETE CYCLE_LONG', !cw.ok && cw.codes.includes('CYCLE_LONG'));
  }
  const cw2 = T.certifier({ ...lor, prolonger: () => ({ bornee: false, etapes: 10, fenetres: [] }) }, []);
  ok('trajectoire longue qui diverge -> REJETE', !cw2.ok && cw2.codes.includes('DIVERGE_LONG'));
  // 9. geometrie : une feuille plate REJETEE ; lorenz non
  const gl = T.geometrie(lor.points);
  ok('geometrie Lorenz : plat >= PLAT_MIN', gl.plat >= T.PLAT_MIN, 'plat=' + gl.plat.toFixed(3));
  const feuille = { ...lor, points: Int32Array.from(lor.points, (v, k) => (k % 3 === 2 ? 2048 : v)) };
  const cf = T.certifier(feuille, []);
  ok('feuille (z constant) REJETEE plat', !cf.ok && cf.codes.includes('PLAT'), 'plat=' + cf.plat);
  // 10. le minteur entre dans la graine ; une signature illisible -> NON_LU, jamais ecartee
  const m1 = T.choisirOeuvre({ graine: G, etatCerveau: E, minteur: '0x' + '1'.repeat(40) }), m2 = T.choisirOeuvre({ graine: G, etatCerveau: E, minteur: '0x' + '2'.repeat(40) });
  ok('deux minteurs, meme bloc -> deux oeuvres differentes', m1.ok && m2.ok && m1.hash !== m2.hash && m1.params.minteur === '0x' + '1'.repeat(40));
  const m1b = m1.ok && T.rejouer(JSON.parse(JSON.stringify(m1.params)));
  ok('oeuvre avec minteur : rejeu octet pour octet', m1b && m1b.ok && egaux(m1b.octets, m1.octets));
  let refusMinteur = false; try { T.choisirOeuvre({ graine: G, minteur: '0x12' }); } catch { refusMinteur = true; }
  ok('minteur invalide refuse', refusMinteur);
  const nl = T.choisirOeuvre({ graine: G, etatCerveau: E, existantes: [a.certificats.signature, null] });
  ok('signature existante illisible -> NON_LU (pas de choix)', nl.ok === false && nl.etat === 'NON_LU');
  const cnl = T.certifier(lor, [new Float64Array(3)]);
  ok('certifier : signature illisible -> NON_LU, jamais ecartee', !cnl.ok && cnl.etat === 'NON_LU' && cnl.codes.includes('SIGNATURE_NON_LUE'));
  return res;
}

// ---------- banc sur le vrai module ----------
const T = await import(pathToFileURL(SOURCE).href);
const res = suite(T, true);
const ech = res.filter((r) => !r.ok);
console.log(`\nBANC : ${res.length - ech.length}/${res.length} verts`);

// source : aucun appel interdit (CONTROLE de presence, pas une preuve d'usage -- les mutants le sont)
const src = readFileSync(SOURCE, 'utf8').replace(/\/\/.*$/gm, '');
const interdits = ['Math.random', 'Date', 'performance', 'Math.sin', 'Math.cos', 'Math.log', 'Math.exp', 'Math.pow', 'document', 'window', 'fetch', 'require('];
const trouves = interdits.filter((m) => src.includes(m));
console.log('source : appels interdits trouves =', trouves.length ? trouves : 0);

// ---------- echantillons : 5 oeuvres, tailles reelles ----------
console.log('\nECHANTILLONS (graines = keccak("tam-echantillon-i"), pas de vrais blocs) :');
const existantes = [];
for (let i = 1; i <= 5; i++) {
  const ch = T.choisirOeuvre({ graine: graineDe('tam-echantillon-' + i), etatCerveau: { tick: i }, existantes });
  if (!ch.ok) { console.log(i, 'AUCUNE oeuvre certifiee en', T.ESSAIS_MAX, 'essais'); continue; }
  existantes.push(ch.certificats.signature);
  const P = ch.params, c = ch.certificats;
  console.log(`#${i} ${P.famille}/${P.operateur}${P.motif ? '+' + P.motif.famille + (P.motif.variante ? ':' + P.motif.variante : '') : ''}${P.k ? ' k=' + P.k : ''} D=${ch.oeuvre.D} essai=${P.essai} rejets=${ch.rejets.length}` +
    ` | ${ch.octets.length} octets (${P.n} pts, q=${P.q}, ordre=${P.ordre})` +
    ` | lambda=${c.lyapunov.toFixed(4)} ${c.uniteLyapunov} | dimBoite=${c.dimension.toFixed(3)} | dMin=${c.distanceMin.toFixed(3)} | ${ch.hash.slice(0, 18)}`);
  if (ch.rejets.length) console.log('    rejets :', ch.rejets.map((r) => r.famille + '/' + r.operateur + ':' + r.raisons.join('+')).join(' ; '));
}

// ---------- mutants sur COPIES ----------
const MUTANTS = [
  ['Math.random injecte', 'unite() { return this.u32() / 4294967296; }', 'unite() { return Math.random(); }'],
  ['signe Lyapunov inverse', "lyapunov: somme / (n * P.pas * dt)", "lyapunov: -somme / (n * P.pas * dt)"],
  ['quantification decode != encode', 'const q = o[4], ordre = o[5];', 'const q = o[4] - 1, ordre = o[5];'],
  ['distinction retiree', "else if (dmin < SEUIL_DISTINCT) refus('DOUBLON');", ''],
  ['trajectoire longue ignoree', "else if (!(L.fenetres.length === LYAP_FENETRES && L.fenetres.every((x) => x > LYAP_MIN))) refus('CYCLE_LONG');", ''],
  ['une seule fenetre exigee', 'L.fenetres.every((x) => x > LYAP_MIN)', 'L.fenetres.some((x) => x > LYAP_MIN)'],
  ['certificat geometrie retire', "if (!(geo.plat >= PLAT_MIN)) refus('PLAT');", ''],
  ['DIM_MIN couplage = DIM_MIN', "o.params.operateur === 'couplage' ? DIM_MIN_COUPLAGE : DIM_MIN", 'DIM_MIN'],
  ['minteur ignore dans la graine', 'const base = keccak256(mt ? concat(concat(g, he), hexEnOctets(mt)) : concat(g, he));', 'const base = keccak256(concat(g, he));'],
  ['signature illisible ecartee en silence', "if (nonLues > 0) return { ok: false, etat: 'NON_LU'", "if (false) return { ok: false, etat: 'NON_LU'"],
  ['borne retiree', 'if (!(v <= B && v >= -B)) return true;', ''],
  ['seuil Lyapunov desactive', "if (!(lyap > LYAP_MIN))", "if (!(lyap > -1e9))"],
  ['varint casse', 'v >>>= 7; }', 'v >>>= 6; }'],
  ['rotation plans caches ignoree', 'v[m] = c * a - s * b; v[m + 3] = s * a + c * b;', ''],
  ['ordre CROISSANT restaure (x7..x12 invisibles)', 'for (let m = D - 4; m >= 0; m--)', 'for (let m = 0; m + 3 < D; m++)'],
];
const brut = readFileSync(SOURCE, 'utf8');
let tues = 0;
console.log('\nMUTANTS :');
for (const [i, [nom, de, vers]] of MUTANTS.entries()) {
  const n = brut.split(de).length - 1;
  if (n !== 1) { console.log(`  M${i + 1} ${nom} : NON APPLIQUE (motif trouve ${n} fois) -> compte comme SURVIVANT`); continue; }
  const f = join(ICI, `tam-mutant-${i + 1}.tmp.js`);
  writeFileSync(f, brut.replace(de, vers));
  let r;
  try { r = suite(await import(pathToFileURL(f).href + '?m=' + i)); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
  finally { unlinkSync(f); }
  const tueurs = r.filter((x) => !x.ok);
  if (tueurs.length) tues++;
  console.log(`  M${i + 1} ${nom} : ${tueurs.length ? 'TUE' : 'SURVIT'} (${tueurs.length} rouges${tueurs.length ? ', ex: ' + tueurs.slice(0, 2).map((x) => x.nom).join(' | ') : ''})`);
}
console.log(`\nMUTANTS : ${tues}/${MUTANTS.length} tues`);
const vert = ech.length === 0 && trouves.length === 0 && tues === MUTANTS.length;
console.log(vert ? 'VERDICT : VERT' : 'VERDICT : ROUGE');
process.exit(vert ? 0 : 1);
