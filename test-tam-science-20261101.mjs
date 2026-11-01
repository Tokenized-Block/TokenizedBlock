// test-tam-science-20261101.mjs — game76 : le MINT des sciences avec TamArt v1 (tam-science.js).
// Ce que ce banc PROUVE : les 20 sciences se rejouent aux memes octets ; ces octets ont l en-tete que TamArt#mint exige ('T' 'A' 'M', v1,
//   q dans 1..16, nuage 0/1) et le decodeur du moteur les relit aux memes points ; un params non borne, une cle inconnue, un q ou des
//   angles faux sont REFUSES ; une oeuvre trop proche d une oeuvre mintee est DOUBLON ; une signature illisible -> NON_LU ; le serveur
//   route une science vers certifierScience ; l onglet rejoue une science avec rejouerScience avant de signer.
// Ce qu il NE prouve PAS : un mint reel sur Base (il faut un wallet), ni le rendu du SVG on-chain d une science (meme format : non mesure).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as T from './tam-science.js';
import { decoder, signature } from './tam-moteur.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const ICI = path.dirname(fileURLToPath(import.meta.url));
const MOI = '0x' + 'ab'.repeat(20);

/* 1. les 20 sciences : rejeu, en-tete, decodage, tailles */
ok(T.SYSTEMES.length === 20, '20 sciences : ' + T.SYSTEMES.length);
for (const s of T.SYSTEMES) {
  const P = T.paramsScience(s.id, {}, { minteur: MOI });
  const a = T.rejouerScience(JSON.parse(JSON.stringify(P))), b = T.rejouerScience(P);
  ok(a.ok && b.ok && a.hash === b.hash, s.id + ' : deux rejeux, memes octets');
  const o = a.octets;
  ok(o[0] === 0x54 && o[1] === 0x41 && o[2] === 0x4d && o[3] === 1 && o[4] >= 1 && o[4] <= 16 && o[5] <= 1, s.id + ' : en-tete accepte par TamArt#mint');
  ok(o.length >= 7 && o.length <= 16384 && JSON.stringify(P).length <= 4096, s.id + ' : ' + o.length + ' octets <= MAX_DATA, params <= MAX_PARAMS');
  const d = decoder(o), g = T.genererScience(P);
  ok(d.n === g.n && d.points.every((v, i) => v === g.points[i]) && d.ordre === (g.nuage ? 1 : 0), s.id + ' : le decodeur du moteur relit les memes points');
  ok(T.certifierScience(P, []).ok, s.id + ' : certificat local (aucune oeuvre mintee)');
}
/* 2. les bornes */
const P0 = T.paramsScience('schwarzschild', {}, { minteur: MOI });
ok(T.validerScience(P0).ok, 'temoin : params de paramsScience valides');
ok(!T.validerScience({ ...P0, params: { ...P0.params, L: 1e6 } }).ok, 'un parametre hors bornes (que le module ramenerait) est refuse');
ok(!T.validerScience({ ...P0, x: 1 }).ok, 'une cle inconnue est refusee');
ok(!T.validerScience({ ...P0, q: 16 }).ok, 'un autre q est refuse');
ok(!T.validerScience({ ...P0, science: 'inconnue' }).ok, 'une science inconnue est refusee');
const P9 = T.paramsScience('troisCorps', {}, {});
ok(P9.angles.length === 6 && T.validerScience(P9).ok && !T.validerScience({ ...P9, angles: P9.angles.slice(1) }).ok && !T.validerScience({ ...P9, angles: [...P9.angles.slice(1), 7] }).ok, 'angles : D-3, dans [0, 2pi]');
ok(!T.validerScience({ ...P0, minteur: '0x1234' }).ok, 'minteur tronque refuse');
/* 3. distinction et lecture */
const sig0 = signature(T.genererScience(P0).points, 12);
ok(T.certifierScience(P0, [sig0]).codes.includes('DOUBLON'), 'la meme oeuvre deja mintee : DOUBLON');
ok(T.certifierScience(P0, [new Float64Array(10)]).etat === 'NON_LU', 'une signature illisible : NON_LU, jamais ecartee en silence');
const autre = signature(T.genererScience(T.paramsScience('hydrogene', {}, {})).points, 12);
ok(T.certifierScience(P0, [autre]).ok, 'une oeuvre differente deja mintee : certifiee');
/* 4. cablage : serveur et onglet */
const serveur = fs.readFileSync(path.join(ICI, 'tam-serveur.js'), 'utf8'), onglet = fs.readFileSync(path.join(ICI, 'tam-onglet.js'), 'utf8'), web = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8');
ok(/P && P\.science \? certifierScience\(P, existantes\) : certifierReglage\(P, existantes\)/.test(serveur), 'le serveur certifie une science avec certifierScience');
ok(/\(S\.science \? TS\.rejouerScience : rejouer\)\(/.test(onglet) && /if \(S\.P\.regle \|\| S\.science\) \{/.test(onglet), 'l onglet rejoue une science et la fait certifier par le serveur avant de signer');
ok(/'tam-science\.js'/.test(web), 'tam-science.js est servi');

/* 5. mutants sur COPIES */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tam-science-mut-'));
for (const f of ['tam-moteur.js', 'tam-physique.js', 'tam-sciences.js', 'tam-fluides.js', 'keccak.js']) fs.copyFileSync(path.join(ICI, f), path.join(TMP, f));
const SRC = fs.readFileSync(path.join(ICI, 'tam-science.js'), 'utf8');
const MUTANTS = [
  ['params hors bornes acceptes', (s) => s.replace("if (canon(o.params) !== canon(P.params)) return non('parametres hors bornes (le module les ramene)');", '')],
  ['distinction ignoree', (s) => s.replace('else if (dmin < SEUIL_DISTINCT)', 'else if (false)')],
  ['q change', (s) => s.replace('export const Q_SCIENCE = 12;', 'export const Q_SCIENCE = 10;')],
  ['signature illisible ignoree', (s) => s.replace("if (!s || typeof s.length !== 'number' || s.length !== 512) { nonLues++; continue; }", 'if (!s || s.length !== 512) continue;')],
];
let tues = 0;
for (const [nom, muter] of MUTANTS) {
  const m = muter(SRC); assert.notEqual(m, SRC, 'mutant applique : ' + nom);
  const f = path.join(TMP, 'tam-science-' + tues + '-' + Math.abs(nom.length) + '.js'); fs.writeFileSync(f, m);
  const M = await import(pathToFileURL(f).href);
  const P = M.paramsScience('schwarzschild', {}, { minteur: MOI });
  const s0 = signature(M.genererScience(P).points, P.q);
  const tue = M.validerScience({ ...P, params: { ...P.params, L: 1e6 } }).ok || !M.certifierScience(P, [s0]).codes.includes('DOUBLON')
    || P.q !== 12 || M.certifierScience(P, [new Float64Array(10)]).etat !== 'NON_LU';
  console.log('  ' + nom + ' : ' + (tue ? 'TUE' : 'SURVIT')); if (tue) tues++;
}
fs.rmSync(TMP, { recursive: true, force: true });
ok(tues === MUTANTS.length, 'MUTANTS : ' + tues + '/' + MUTANTS.length);
console.log('MUTANTS : ' + tues + '/' + MUTANTS.length + ' tues');
console.log('test-tam-science-20261101 : ' + n + ' assertions OK');
