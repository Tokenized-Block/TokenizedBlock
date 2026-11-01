// test-tam-astro-20261101.mjs -- banc de tam-astro.js (vue ASTRO, non frappable) + mutants sur COPIES.
// Lancer : node test-tam-astro-20261101.mjs
// Tolerances annoncees (valeurs connues de la physique, pas des chiffres recopies de la sortie) :
//   periodes siderales des 8 planetes a 0.5 % de la valeur connue ET de la 3e loi de Kepler ; Terre-Soleil 0.983..1.017 UA ;
//   S2 : precession a 2 % de 6 pi GM / (c^2 a (1-e^2)) (~ 12 arcmin), Newton < 1 % de cette valeur, periode a 0.1 % de 16.0455 an ;
//   binaire : temps de Peters a 1e-6 (circulaire : (a0^4 - a^4) / (4 beta) ; excentrique : integrale de Peters 1964), e decroit,
//   constante de Peters a 1e-9 ; amas : energie < 1e-3, viriel 2K/|W| moyen 0.8..1.2 a l equilibre ; supernova : exposant
//   libre a 1 % de 1, Sedov a 2 % de 0.4, rayon de Sedov a 1 % ; galaxies : E des noyaux = 0 (parabole) a 1e-8, pericentre a 1e-3.
//   S2 : f_SP simule a 2 % de 1 et dans 1 sigma de GRAVITY 2020 (1.10 +- 0.19).
//   supernovaHydro (vs Sedov-Taylor exact) : xi calcule a 0.1 % de 1.152 ; R(t) a 3 % a chaque instant t >= 0.1 ; saut de densite
//   a 15 % de 4 (lissage) ; energie totale a 1 % ; exposant 0.40 +- 0.02.
//   binaireFusion (GW150914, 36 + 29, LIGO PRL 116 061102 / 241102) : Mc 28..30 ; M_f a 5 % de 62 ; chi_f a 5 % de 0.67 ;
//   f_220 a 5 % de 250 Hz ; eta = 0.25 : chi_f a 1e-3 de 0.68637 et E_rad a 1e-3 de 0.0484161 (Jimenez-Forteza 2017) ;
//   chirp monotone ; df/dt newtonien a 1 % a f = 0.05 Hz.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-astro.js');
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const rel = (x, ref) => Math.abs(x - ref) / Math.abs(ref);

function suite(T, texte, bavard = false) {
  const res = [];
  const ok = (nom, f) => {
    let c = false, det = '';
    try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; }
    res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : ''));
  };
  const sim = (id, p, o) => T.simuler(id, p, o);
  // 1. forme, bornes, determinisme
  ok('SYSTEMES gele, 8 systemes', () => { assert.ok(Object.isFrozen(T.SYSTEMES)); assert.equal(T.SYSTEMES.length, 8); assert.ok(Object.isFrozen(T.SYSTEMES[0].params) && Object.isFrozen(T.SYSTEMES[0].bornes)); });
  const defaut = {};
  for (const s of T.SYSTEMES) {
    ok(`${s.id} : bornee, brut n*D fini, 3 <= D <= 12, points null`, () => {
      const r = defaut[s.id] = sim(s.id);
      assert.equal(r.bornee, true, r.raison); assert.equal(r.D, s.D); assert.ok(s.D >= 3 && s.D <= 12); assert.equal(r.n, 1500);
      assert.equal(r.brut.length, 1500 * s.D); assert.ok(r.brut.every(Number.isFinite)); assert.equal(r.points, null);
      assert.equal(!!r.nuage, !!s.nuage); assert.ok(r.lyapunov === null || Number.isFinite(r.lyapunov)); assert.ok(typeof r.uniteLyapunov === 'string');
      assert.ok(typeof s.phrase === 'string' && s.phrase.length > 40 && s.nom && s.science);
    });
    ok(`${s.id} : determinisme (octets identiques)`, () => assert.ok(octets(sim(s.id).brut).equals(octets(defaut[s.id].brut))));
  }
  ok('n = 7 : forme respectee pour chaque systeme', () => { for (const s of T.SYSTEMES) { const r = sim(s.id, {}, { n: 7 }); assert.equal(r.bornee, true, s.id); assert.equal(r.brut.length, 7 * s.D, s.id); } });
  // 2. systeme solaire
  const interne = defaut.systemeSolaire, externe = sim('systemeSolaire', { groupe: 1, annees: 170 });
  for (const [r, noms] of [[interne, ['Mercury', 'Venus', 'Earth', 'Mars']], [externe, ['Jupiter', 'Saturn', 'Uranus', 'Neptune']]]) for (const nom of noms) {
    ok(`${nom} : periode siderale mesuree a 0.5 % de la connue et de Kepler III`, () => {
      const p = r.invariants['periode' + nom]; assert.ok(p && p.orbites >= 1, 'aucune orbite');
      assert.ok(p.ecartConnue < 0.005 && p.ecart < 0.005, `${p.mesure} j vs ${p.connue} / ${p.formule}`);
      return `${p.mesure.toFixed(3)} j vs ${p.connue} (Kepler ${p.formule.toFixed(2)})`;
    });
  }
  ok('Terre-Soleil : min 0.983 et max 1.017 UA (a 0.001)', () => {
    const d = interne.invariants.distanceEarth; assert.ok(Math.abs(d.min - 0.983) < 0.001 && Math.abs(d.max - 1.017) < 0.001, `${d.min} ${d.max}`);
    return `${d.min.toFixed(5)}..${d.max.toFixed(5)}`;
  });
  ok('Mercure : perihelie 0.3075, aphelie 0.4667 UA (a 0.001)', () => { const d = interne.invariants.distanceMercury; assert.ok(Math.abs(d.min - 0.3075) < 0.001 && Math.abs(d.max - 0.4667) < 0.001, `${d.min} ${d.max}`); });
  ok('Jupiter a ~5.20 UA en moyenne, Neptune ~30.07', () => { assert.ok(rel(externe.invariants.distanceJupiter.moyenne, 5.2029) < 0.01); assert.ok(rel(externe.invariants.distanceNeptune.moyenne, 30.07) < 0.01); });
  // 3. S2 autour de Sagittarius A*
  const s2 = sim('etoileS2', { tours: 4 }), s2n = sim('etoileS2', { tours: 4, rg: 0 });
  ok('S2 RG : precession a 2 % de 6 pi GM/(c^2 a (1-e^2)) ~ 12 arcmin', () => {
    const p = s2.invariants.precession; assert.ok(p.orbites >= 3); assert.ok(p.formule > 11.5 && p.formule < 12.5, String(p.formule));
    assert.ok(p.ecart < 0.02, `${p.mesure} vs ${p.formule}`); return `${p.mesure.toFixed(3)}' vs ${p.formule.toFixed(3)}' (${(100 * p.ecart).toFixed(2)} %)`;
  });
  ok('S2 Newton : precession < 1 % de la valeur RG', () => { const p = s2n.invariants.precession; assert.ok(p.orbites >= 3 && Math.abs(p.mesure) < 0.01 * p.formuleRG, String(p.mesure)); return p.mesure.toExponential(2) + "'"; });
  ok('S2 : periode mesuree a 0.1 % de 16.0455 an', () => { const p = s2.invariants.periode; assert.ok(p.ecart < 0.001, String(p.mesure)); return p.mesure.toFixed(4) + ' an'; });
  ok('S2 : pericentre ~119 UA, vitesse max 2.4-2.8 % de c', () => {
    const r = s2.invariants.pericentre.mesure, f = s2.invariants.vitesseMax.fractionDeC; assert.ok(rel(r, 119) < 0.01 && f > 0.024 && f < 0.028, `${r} ${f}`);
    return `${r.toFixed(1)} UA, ${s2.invariants.vitesseMax.mesure.toFixed(0)} km/s`;
  });
  ok('S2 : f_SP simule (precession / formule RG) dans 1 sigma de la mesure GRAVITY 2020 (1.10 +- 0.19)', () => {
    const p = s2.invariants.precession; assert.ok(Math.abs(p.fSP - 1) < 0.02 && Math.abs(p.fSP - p.fSPmesureGRAVITY) < p.fSPincertitude, JSON.stringify(p)); return `f_SP ${p.fSP.toFixed(4)}`;
  });
  ok('S2 Newton : derive energie < 1e-9', () => { const d = s2n.invariants.energie.derive; assert.ok(d < 1e-9, String(d)); return d.toExponential(2); });
  ok('S2 RG : energie 1PN revient a l apocentre (< 1e-9), oscillation d ordre 2PN < 1e-4', () => {
    const E = s2.invariants.energie; assert.ok(rel(E.fin, E.debut) < 1e-9 && E.derive < 1e-4, `${rel(E.fin, E.debut)} ${E.derive}`); return `${rel(E.fin, E.debut).toExponential(1)} / ${E.derive.toExponential(1)}`;
  });
  // 4. binaire de trous noirs
  const bc = sim('binaireTrouNoir', { e0: 0 }), be = defaut.binaireTrouNoir, bq = sim('binaireTrouNoir', { q: 0.2, a0: 25, e0: 0.7 });
  ok('binaire circulaire : temps = (a0^4 - a^4) / (4 beta) a 1e-6', () => { const t = bc.invariants.tempsFusion; assert.ok(t.ecart < 1e-6 && rel(t.aFinal, 6) < 1e-6, JSON.stringify(t)); return `${t.mesure.toFixed(2)} vs ${t.formule.toFixed(2)} GM/c^3`; });
  for (const [nom, r] of [['defaut', be], ['q 0.2 a0 25 e0 0.7', bq]]) {
    ok(`binaire ${nom} : temps = integrale de Peters a 1e-6, e decroit, constante de Peters < 1e-9`, () => {
      const t = r.invariants.tempsFusion, e = r.invariants.excentricite, c = r.invariants.constantePeters;
      assert.ok(t.ecart < 1e-6, `${t.mesure} vs ${t.formule}`); assert.ok(e.decroissante && e.fin < e.debut - 0.05, JSON.stringify(e));
      assert.ok(c.derive < 1e-9, String(c.derive)); assert.ok(r.invariants.demiGrandAxe.fin < r.invariants.demiGrandAxe.debut);
      return `${t.mesure.toFixed(1)} GM/c^3, e ${e.debut.toFixed(3)} -> ${e.fin.toFixed(3)}, ${r.invariants.orbites.mesure.toFixed(1)} orbites`;
    });
  }
  ok('binaire : q plus petit -> spirale plus lente (beta ~ eta)', () => { const a = sim('binaireTrouNoir', { e0: 0, q: 0.25 }).invariants.tempsFusion.mesure; assert.ok(rel(a / bc.invariants.tempsFusion.mesure, 0.25 / 0.16) < 1e-6, String(a)); });
  // 5. amas d etoiles
  const am = defaut.amasEtoiles, af = sim('amasEtoiles', { viriel: 0.05 });
  ok('amas : derive energie < 1e-3, |L| < 1e-10', () => { const I = am.invariants; assert.ok(I.energie.derive < 1e-3 && I.momentCinetique.derive < 1e-10, `${I.energie.derive}`); return I.energie.derive.toExponential(2); });
  ok('amas a l equilibre : 2K/|W| moyen dans 0.8..1.2', () => { const v = am.invariants.viriel; assert.ok(rel(v.debut, 1) < 1e-9 && v.moyenne > 0.8 && v.moyenne < 1.2, JSON.stringify(v)); return v.moyenne.toFixed(3); });
  ok('amas froid (viriel 0.05) : 2K/|W| part de 0.1 et depasse 0.8 (effondrement)', () => { const v = af.invariants.viriel; assert.ok(rel(v.debut, 0.1) < 1e-9 && v.max > 0.8 && af.invariants.energie.derive < 1e-3, JSON.stringify(v)); return `max ${v.max.toFixed(3)}`; });
  ok('amas : Lyapunov fini et > 0.1 (N corps chaotique)', () => { assert.ok(am.lyapunov > 0.1 && Number.isFinite(am.lyapunov), String(am.lyapunov)); return am.lyapunov.toFixed(3); });
  ok('amas : trou noir 10 -> energie < 1e-3 aussi', () => { const d = sim('amasEtoiles', { masseTrouNoir: 10, duree: 2 }).invariants.energie.derive; assert.ok(d < 1e-3, String(d)); return d.toExponential(2); });
  ok('amas : autre graine -> autres trajets', () => assert.ok(!octets(sim('amasEtoiles', { graine: 2 }).brut).equals(octets(am.brut))));
  // 6. supernova
  const sn = defaut.supernova;
  ok('supernova : exposant libre a 1 % de 1', () => { const x = sn.invariants.exposantLibre.mesure; assert.ok(rel(x, 1) < 0.01, String(x)); return x.toFixed(5); });
  ok('supernova : exposant Sedov a 2 % de 0.4', () => { const x = sn.invariants.exposantSedov.mesure; assert.ok(rel(x, 0.4) < 0.02, String(x)); return x.toFixed(5); });
  ok('supernova E=1e51 n=1 a 10 000 ans : rayon a 1 % de 1.15 (E t^2 / rho)^(1/5) (~12.4 pc)', () => {
    const t = 1e4 * 3.15576e7, R = 1.15 * Math.pow(1e51 * t * t / (1.4 * 1.6726e-24), 0.2) / 3.0857e18;
    const m = sim('supernova', { annees: 10000 }).invariants.rayonFinal.mesure; assert.ok(rel(m, R) < 0.01, `${m} vs ${R}`); return `${m.toFixed(3)} vs ${R.toFixed(3)} pc`;
  });
  ok('supernova : 4x plus dense -> rayon x 4^(-1/5) en phase Sedov (a 1 %)', () => {
    const a = sn.invariants.rayonFinal.mesure, b = sim('supernova', { densite: 4 }).invariants.rayonFinal.mesure; assert.ok(rel(b / a, Math.pow(4, -0.2)) < 0.01, String(b / a));
  });
  ok('supernova : autre graine -> autre nuage', () => assert.ok(!octets(sim('supernova', { graine: 2 }).brut).equals(octets(sn.brut))));
  // 6b. supernova par hydrodynamique (Lagrange 1-D, von Neumann-Richtmyer) contre Sedov-Taylor EXACT
  const sh = defaut.supernovaHydro;
  ok('Sedov : xi CALCULE pour gamma = 5/3 a 0.1 % de 1.152', () => { const x = sh.invariants.xiSedov.mesure; assert.ok(rel(x, 1.152) < 0.001, String(x)); return x.toFixed(5); });
  ok('hydro : rayon du choc a 3 % de xi (E t^2 / rho)^(1/5) a CHAQUE instant t >= 0.1', () => {
    const R = sh.invariants.rayonChoc; assert.ok(R.ecartMax < 0.03 && R.ecart < 0.03, JSON.stringify(R)); return `ecart max ${(100 * R.ecartMax).toFixed(2)} %, final ${(100 * R.ecart).toFixed(2)} %`;
  });
  ok('hydro : saut de densite au choc a 15 % de (g+1)/(g-1) = 4 (lissage numerique)', () => {
    const s = sh.invariants.sautDensite; assert.equal(s.formule, 4); assert.ok(s.ecart < 0.15 && s.min > 3.4 && s.max < 4.6, JSON.stringify(s)); return `${s.min.toFixed(3)}..${s.max.toFixed(3)}`;
  });
  ok('hydro : energie totale conservee a 1 %', () => { const E = sh.invariants.energie; assert.ok(rel(E.debut, 1) < 1e-5 && E.derive < 0.01, JSON.stringify(E)); return E.derive.toExponential(2); });
  ok('hydro : exposant mesure 0.40 +- 0.02', () => { const x = sh.invariants.exposant.mesure; assert.ok(Math.abs(x - 0.4) < 0.02, String(x)); return x.toFixed(4); });
  ok('hydro E=1e51 n=1 a 10 000 ans : rayon a 3 % de 1.152 (E t^2 / rho)^(1/5) en parsecs', () => {
    const t = 1e4 * 3.15576e7, R = 1.152 * Math.pow(1e51 * t * t / (1.4 * 1.6726e-24), 0.2) / 3.0857e18, m = sh.invariants.rayonChoc.rayonPc;
    assert.ok(rel(m, R) < 0.03, `${m} vs ${R}`); return `${m.toFixed(3)} vs ${R.toFixed(3)} pc`;
  });
  ok('hydro : nuage dans le choc (rayon max <= 1.05 R final), colonnes temps et densite plausibles', () => {
    const b = sh.brut, Rf = sh.invariants.rayonChoc.rayonPc; let rmax = 0, dmax = 0;
    for (let i = 0; i < sh.n; i++) { const o = i * 5, r = Math.hypot(b[o], b[o + 1], b[o + 2]); if (r > rmax) rmax = r; if (b[o + 4] > dmax) dmax = b[o + 4]; assert.ok(b[o + 3] > 0 && b[o + 3] <= 10000 + 1e-6); }
    assert.ok(rmax <= 1.05 * Rf && rmax > 0.8 * Rf && dmax > 3, `${rmax} ${Rf} ${dmax}`); return `r max ${rmax.toFixed(2)} pc, rho max ${dmax.toFixed(2)}`;
  });
  // 6c. fusion de trous noirs (TaylorT4 3.5PN + formules ajustees)
  const bf = defaut.binaireFusion, beq = sim('binaireFusion', { m1: 30, m2: 30 });
  ok('fusion GW150914 (36 + 29) : masse de chirp 28..30 masses solaires (entree)', () => { const m = bf.invariants.masseChirp.mesure; assert.ok(m > 28 && m < 30, String(m)); return m.toFixed(3); });
  ok('fusion GW150914 : masse finale a 5 % de 62 et spin a 5 % de 0.67 (LIGO 2016)', () => {
    const R = bf.invariants.resteFinal; assert.ok(rel(R.masse, 62) < 0.05 && rel(R.spin, 0.67) < 0.05, JSON.stringify(R)); return `${R.masse.toFixed(2)} Msol, spin ${R.spin.toFixed(4)}`;
  });
  ok('fusion GW150914 : frequence du mode 220 (Berti 2006) a 5 % de 250 Hz', () => { const f = bf.invariants.ringdown.frequence; assert.ok(rel(f, 250) < 0.05, String(f)); return `${f.toFixed(1)} Hz, tau ${bf.invariants.ringdown.tempsAmortissement.toFixed(2)} ms`; });
  ok('fusion masses egales : chi_f et E_rad a 1e-3 des valeurs de Jimenez-Forteza 2017 a eta = 0.25 (0.68637, 0.0484161)', () => {
    const R = beq.invariants.resteFinal; assert.ok(Math.abs(R.spin - 0.68637) < 1e-3 && rel(R.energieRayonnee / 60, 0.0484161) < 1e-3, JSON.stringify(R));
  });
  ok('fusion : frequence monotone (chirp) sur la spirale, jamais decroissante ensuite', () => {
    assert.equal(bf.invariants.spirale.croissante, true); const b = bf.brut;
    for (let i = 1; i < bf.n; i++) { assert.ok(b[i * 4 + 3] >= b[(i - 1) * 4 + 3], 'f decroit en ' + i); assert.ok(b[i * 4] > b[(i - 1) * 4], 't recule en ' + i); }
    const s = bf.invariants.spirale; return `${s.fDepart.toFixed(1)} -> ${s.fRaccord.toFixed(1)} Hz, ${s.cycles.toFixed(1)} cycles, ${s.duree.toFixed(3)} s`;
  });
  ok('fusion : limite newtonienne df/dt = (96/5) pi^(8/3) Mc^(5/3) f^(11/3) a 1 % (mesure sur l integrateur, f = 0.05 Hz)', () => {
    const L = bf.invariants.limiteNewton; assert.ok(L.ecart < 0.01, JSON.stringify(L)); return `${(100 * L.ecart).toFixed(3)} %`;
  });
  ok('fusion : amplitude ~ 1/distance (820 Mpc -> strain / 2 a 1e-9)', () => {
    const a = bf.invariants.strainMax.mesure, b = sim('binaireFusion', { distance: 820 }).invariants.strainMax.mesure; assert.ok(rel(a / b, 2) < 1e-9, String(a / b)); return a.toExponential(3);
  });
  // 7. collision de galaxies
  const gp = defaut.collisionGalaxies, gr = sim('collisionGalaxies', { inclinaison1: 180 });
  ok('galaxies : noyaux sur parabole (E = 0 a 1e-12), conservee a 1e-8', () => {
    const E = gp.invariants.energieCoeurs; assert.ok(Math.abs(E.debut) < 1e-12 && E.derive < 1e-8, JSON.stringify(E)); return E.derive.toExponential(2);
  });
  ok('galaxies : pericentre 1 a 1e-3, atteint a t = 0 (Barker) a 2 pas', () => {
    const p = gp.invariants.pericentre; assert.ok(Math.abs(p.mesure - 1) < 1e-3 && Math.abs(p.tempsMesure) < 2 * p.pas, JSON.stringify(p));
  });
  ok('galaxies : disque direct -> queues de maree (> 10 %), retrograde -> presque rien (< 2 %)', () => {
    const a = gp.invariants.queues.galaxie1, b = gr.invariants.queues.galaxie1; assert.ok(a > 0.1 && b < 0.02 && a > 5 * b, `${a} ${b}`); return `${(100 * a).toFixed(1)} % vs ${(100 * b).toFixed(1)} %`;
  });
  /* 2026-11-01 (demande du proprietaire) : la collision est un FILM (12 x 125), ses queues sont lues sur l image finale */
  ok('galaxies : film 12 images x 125 etoiles, image 0 = disques au depart (noyaux a 8), temps croissants jusqu a duree', () => {
    const f = gp.film, b = gp.brut, I = gp.invariants.film; assert.equal(gp.nuage, true);
    assert.equal(f.images, 12); assert.equal(f.parImage, 125); assert.equal(f.images * f.parImage, gp.n); assert.deepEqual(f.debuts, Array.from({ length: 12 }, (_, k) => 125 * k));
    assert.equal(I.temps.length, 12); assert.ok(rel(I.temps[11], 4) < 1e-9 && I.temps[0] < -8); for (let k = 1; k < 12; k++) assert.ok(I.temps[k] > I.temps[k - 1]);
    const c0 = I.coeurs[0]; assert.ok(rel(Math.hypot(c0[2] - c0[0], c0[3] - c0[1]), 8) < 1e-9);
    /* image 0 : chaque etoile a 0.2..0.7 de son noyau ; images 0 et 11 differentes */
    for (let j = 0; j < 125; j++) { const g = j < 63 ? 0 : 1, d = Math.hypot(b[3 * j] - c0[2 * g], b[3 * j + 1] - c0[2 * g + 1], b[3 * j + 2]); assert.ok(d > 0.19 && d < 0.71, `etoile ${j} a ${d}`); }
    assert.ok(!octets(b.subarray(0, 375)).equals(octets(b.subarray(11 * 375))));
    return `t ${I.temps[0].toFixed(2)} -> ${I.temps[11].toFixed(2)}`;
  });
  ok('galaxies n = 50 : film 10 x 5 (plus grand diviseur <= 12)', () => { const r = sim('collisionGalaxies', {}, { n: 50 }); assert.equal(r.bornee, true); assert.deepEqual([r.film.images, r.film.parImage], [10, 5]); });
  ok('supernova et supernovaHydro : film de 16 instants, disposition MESUREE (93 ou 94 lignes, debuts croissants)', () => {
    for (const r of [sn, sh]) {
      const f = r.film; assert.equal(f.images, 16); assert.equal(f.debuts[0], 0); assert.equal(f.tailles.reduce((a, x) => a + x, 0), r.n); assert.equal(f.parImage, null);
      for (let k = 0; k < 16; k++) { const t = r.brut[f.debuts[k] * r.D + 3]; for (let i = f.debuts[k]; i < f.debuts[k] + f.tailles[k]; i++) assert.equal(r.brut[i * r.D + 3], t); if (k) assert.ok(t > r.brut[f.debuts[k - 1] * r.D + 3]); }
    }
  });
  ok('binaire : fin = periastre 6M a la derniere ligne', () => { const f = be.fin; assert.equal(f.evenement, 'periastron-6M'); assert.equal(f.indice, be.n - 1); assert.ok(rel(f.periastre, 6) < 1e-9 && rel(f.t, be.invariants.tempsFusion.mesure) < 1e-12); });
  ok('systemeSolaire : annees par defaut selon le groupe (0 -> 4, 1 -> 165, Neptune fait un tour) ; annees donnees respectees', () => {
    assert.equal(interne.params.annees, 4); const e = sim('systemeSolaire', { groupe: 1 });
    assert.equal(e.params.annees, 165); assert.ok(e.invariants.periodeNeptune.orbites >= 1 && e.invariants.periodeNeptune.ecartConnue < 0.005);
    assert.equal(sim('systemeSolaire', { groupe: 1, annees: 10 }, { n: 20 }).params.annees, 10); assert.equal(T.reglagesPhysique('systemeSolaire', { groupe: 1 })[1].valeur, 165);
  });
  // 8. bornage
  ok('bornage : hors bornes ramene, NaN -> defaut, entiers arrondis, periastre >= 6.5', () => {
    assert.deepEqual(sim('systemeSolaire', { groupe: 7.6, annees: -3 }, { n: 20 }).params, { groupe: 1, annees: 0.5 });
    assert.deepEqual(sim('etoileS2', { tours: 99.4, rg: 0.4 }, { n: 20 }).params, { tours: 20, rg: 0 });
    assert.equal(sim('amasEtoiles', { duree: 1e9 }, { n: 20 }).params.duree, 12);
    assert.deepEqual(sim('binaireTrouNoir', { q: 5, a0: 8, e0: 0.9 }, { n: 20 }).params, { q: 1, a0: 8, e0: 1 - 6.5 / 8 });
    assert.deepEqual(sim('amasEtoiles', { etoiles: 33.6, graine: NaN, masseTrouNoir: 'x', viriel: 9, duree: 0 }, { n: 20 }).params, { masseTrouNoir: 1, etoiles: 34, viriel: 1, duree: 1, graine: 1 });
    assert.deepEqual(sim('collisionGalaxies', { rapportMasses: 0, inclinaison1: -9, duree: 99 }, { n: 20 }).params, { rapportMasses: 0.25, inclinaison1: 0, inclinaison2: 60, duree: 10 });
  });
  ok('reglagesPhysique : forme reglagesDe, valeur bornee', () => {
    const r = T.reglagesPhysique('supernova', { densite: 1e9 });
    assert.deepEqual(r.map((x) => x.chemin), ['params.energie', 'params.masseEjecta', 'params.densite', 'params.annees', 'params.graine']);
    assert.deepEqual(r[2], { chemin: 'params.densite', nom: 'densite', min: 0.01, max: 10, valeur: 10 });
    assert.throws(() => T.simuler('inconnu'));
  });
  // 9. source : aucune transcendante native, aucune horloge, aucun hasard natif
  ok('source : ni Math.sin/cos/tan/exp/log/pow/atan/hypot/asin/acos/cbrt/random, ni Date/performance ; ** une seule fois (2 ** k entier)', () => {
    const code = texte.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    const m = code.match(/Math\.(sin|cos|tan|exp|expm1|log|log2|log10|log1p|pow|atan|atan2|hypot|asin|acos|sinh|cosh|tanh|cbrt|random)\b|\bDate\b|performance\./g);
    assert.equal(m, null, String(m)); assert.equal(code.split('**').length - 1, 1);
  });
  return res;
}

// ---------- banc ----------
const texte = readFileSync(SOURCE, 'utf8');
const T = await import(pathToFileURL(SOURCE).href);
const res = suite(T, texte, true), ech = res.filter((x) => !x.ok);
let assertions = res.length;
console.log('\nTEMPS simuler(id) a n = 1500 (mediane de 3) :');
for (const s of T.SYSTEMES) {
  const t = []; for (let k = 0; k < 3; k++) { const a = performance.now(); T.simuler(s.id); t.push(performance.now() - a); }
  t.sort((a, b) => a - b); const ms = t[1];
  console.log(`  ${s.id.padEnd(20)} ${ms.toFixed(1)} ms`);
  assertions++; if (!(ms < 300)) ech.push({ nom: 'temps ' + s.id + ' < 300 ms', det: ms.toFixed(1) });
}

// ---------- mutants (copies dans un dossier temporaire ; l import du moteur pointe vers l original) ----------
const MUTANTS = [
  ['Jupiter : signe du taux de L inverse (retrograde)', '3034.74612775', '-3034.74612775'],
  ['Terre : excentricite fausse (0.067)', '0.01671123', '0.0671123'],
  ['S2 : terme 1PN retire', 'ax += f * (A * x + 4 * nv * vx); ay += f * (A * yy + 4 * nv * vy);', ''],
  ['Peters : signe de de/dt inverse', 'const dedt = -(304 / 15)', 'const dedt = (304 / 15)'],
  ['Peters : facteur 64/5 -> 32/5 dans da/dt', 'const dadt = -(64 / 5)', 'const dadt = -(32 / 5)'],
  ['Sedov : exposant 1/4 au lieu de 1/5', 'lnD(c.E * t * t / c.rho) / 5', 'lnD(c.E * t * t / c.rho) / 4'],
  ['amas : premier demi-coup de saute-mouton retire', 'v[j] += 0.5 * h * a[j]; x[j] += h * v[j]; ve[j]', 'x[j] += h * v[j]; ve[j]'],
  ['galaxies : equation de Barker sans le facteur 1/2', '(Dd + Dd * Dd * Dd / 3) / 2', '(Dd + Dd * Dd * Dd / 3)'],
  ['Math.random injecte (supernova)', 'alea = mulberry32(P.graine >>> 0), somme', 'alea = Math.random, somme'],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
  ['galaxies : film fige (chaque image = l etat initial)', 'brut.set(x, 3 * n * k); tImages', 'brut.set(k ? brut.subarray(0, 3 * n) : x, 3 * n * k); tImages'],
  ['systeme solaire : defaut par groupe retire', 'P.annees = P.groupe ? ANNEES_GROUPE1 : s.params.annees;', ''],
  ['S2 : demi-grand axe 125.058 -> 126.058 mas', 'aMas: 125.058', 'aMas: 126.058'],
  ['S2 : excentricite 0.884649 -> 0.874649', 'e: 0.884649', 'e: 0.874649'],
  ['Sedov : xi faux (delta 2/5 -> 1/2 dans les equations auto-semblables)', 'del = 0.4, eps', 'del = 0.5, eps'],
  ['hydro : viscosite artificielle retiree', 'CQ2_SN = 2, CQ1_SN = 0.3', 'CQ2_SN = 0, CQ1_SN = 0'],
  ['hydro : travail avec la pression du debut de pas (schema non compatible)', 'e[z] -= dt * Ph[z] * (b - a) / m[z];', 'e[z] -= dt * Pz[z] * (b - a) / m[z];'],
  ['QNM : coefficient f2 de Berti -1.1568 -> -1.0568', 'f2: -1.1568', 'f2: -1.0568'],
  ['TaylorT4 : 32/5 -> 16/5', 'return 32 / 5 * nu * v9 * b;', 'return 16 / 5 * nu * v9 * b;'],
  ['spin final : a2 3.833 -> 4.833', 'a2: 3.833', 'a2: 4.833'],
];
const moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-astro-mutants-'));
let tues = 0;
console.log('\nMUTANTS :');
try {
  for (let i = 0; i < MUTANTS.length; i++) {
    const [nom, de, vers] = MUTANTS[i], k = texte.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NON APPLIQUE (motif trouve ${k} fois) -> SURVIVANT`); continue; }
    const f = join(dossier, `mutant-${i + 1}.mjs`), mute = texte.replace(de, vers);
    writeFileSync(f, mute.replace("from './tam-moteur.js'", `from '${moteur}'`));
    let r; try { r = suite(await import(pathToFileURL(f).href), mute); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok);
    if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'TUE' : 'SURVIT'} (${rouges.length} rouges${rouges.length ? ', ex: ' + rouges.slice(0, 2).map((x) => x.nom).join(' | ') : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
assertions++; if (tues !== MUTANTS.length) ech.push({ nom: 'mutants', det: `${tues}/${MUTANTS.length}` });
console.log(`\nMUTANTS : ${tues}/${MUTANTS.length} tues`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.det || '')); process.exit(1); }
console.log(`test-tam-astro-20261101 : ${assertions} assertions OK`);
