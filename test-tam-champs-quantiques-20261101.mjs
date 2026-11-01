// test-tam-champs-quantiques-20261101.mjs -- banc de tam-champs-quantiques.js (vue CHAMPS QUANTIQUES, non frappable) + mutants sur COPIES.
// Lancer : node test-tam-champs-quantiques-20261101.mjs
// Le banc a le droit a Math.sin/cos/exp/log/acosh (il n est pas la vue) : ses references sont calculees independamment du module.
// REFERENCES : chaque valeur publiee comparee ici a ete lue le 2026-11-01 a l URL indiquee (champ lu = texte tel que lu) ;
//   le banc relit lu et exige l egalite exacte avec valeur (meme regle pour SOURCES du module).
// Tolerances annoncees (mesurees le 2026-11-01, puis marge) :
//   champLibre : energie < 1e-6 (saute-mouton), omega mesure a 5e-4 de la dispersion du reseau, vitesse de groupe a 1 % ;
//   fluctuationsVide : chaque variance de mode a 4.5 sigma, correlation a 5 sigma ; interactionChamps : energie < 1e-3,
//   mode le plus rapide a 2 modes de l argmax de Floquet, taux a 10 % de Floquet, Floquet a 15 % de q/2 (KLS, ordre dominant) ;
//   Schwinger : taux a 1e-10 de la serie, E_crit a 0.5 % de 1.32e18 V/m (3 chiffres lus) ; Unruh : T(1 m/s^2) a 0.2 % de 4.06e-21 K ;
//   QED : Delta alpha leptons une boucle a 2e-4 de Steinhauser (une boucle), a 0.5 % du total trois boucles ;
//   Compton : sigma a 1e-6 de la formule totale de Klein-Nishina, Thomson a 0.3 % de sigma_e CODATA ;
//   atomes : raies de Lyman-alpha / H-alpha a 2e-5 (structure fine et Lamb negligees) ; quarks : niveaux a 3 MeV du modele BGS publie,
//   ecart J/psi - psi(2S) a 3 % de la PDG (le modele publie lui-meme est a 1.2 %).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-champs-quantiques.js');
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

// ---------- valeurs de reference lues (URL + texte lu) ----------
const R = (valeur, url, lu) => ({ valeur, url, lu });
const REF = {
  // https://physics.nist.gov/cgi-bin/cuu/Value?sigmae : 6.652 458 7051(62) x 10^-29 m^2
  sigmaE: R(6.6524587051e-29, 'https://physics.nist.gov/cgi-bin/cuu/Value?sigmae', '6.652 458 7051(62) x 10^-29'),
  // https://en.wikipedia.org/wiki/Schwinger_limit : "E_c = m_e^2 c^3 / (q_e hbar) ~ 1.32 x 10^18 V/m"
  eCrit: R(1.32e18, 'https://en.wikipedia.org/wiki/Schwinger_limit', '1.32 x 10^18'),
  // https://en.wikipedia.org/wiki/Unruh_effect : "an acceleration of 1 m s^-2 corresponds to a temperature of 4.06 x 10^-21 K"
  unruh1: R(4.06e-21, 'https://en.wikipedia.org/wiki/Unruh_effect', '4.06 x 10^-21'),
  // Steinhauser, hep-ph/9803313, Table 1 (x 1e-4) : somme des leptons, une boucle "314.19007", total "314.97686"
  dAlpha1: R(314.19007e-4, 'https://ar5iv.arxiv.org/html/hep-ph/9803313', '314.19007 x 10^-4'),
  dAlphaTot: R(314.97686e-4, 'https://ar5iv.arxiv.org/html/hep-ph/9803313', '314.97686 x 10^-4'),
  // https://arxiv.org/abs/2203.08271 : PDG 2022 "alpha_S(m_Z^2) = 0.1179 +- 0.0009"
  alphaS: R(0.1179, 'https://ar5iv.arxiv.org/html/2203.08271', '0.1179'),
  // NIST ASD, H I, vide : Lyman-alpha 1s - 2 observe "121.56701" nm ; H-alpha 2 - 3 Ritz "656.4632" nm
  //   https://physics.nist.gov/cgi-bin/ASD/lines1.pl?spectra=H+I (fenetres 121-122 nm et 656-657 nm)
  lymanAlpha: R(121.56701, 'https://physics.nist.gov/cgi-bin/ASD/lines1.pl?spectra=H+I&low_w=121&upp_w=122&unit=1', '121.56701'),
  hAlpha: R(656.4632, 'https://physics.nist.gov/cgi-bin/ASD/lines1.pl?spectra=H+I&low_w=656&upp_w=657&unit=1', '656.4632'),
  // https://en.wikipedia.org/wiki/Slater%27s_rules, exemple du fer (Z = 26) : Z_eff 4s 3.75, 3d 6.25, 3s3p 14.75, 2s2p 21.85, 1s 25.70
  slFe4s: R(3.75, 'https://en.wikipedia.org/wiki/Slater%27s_rules', '3.75'),
  slFe3d: R(6.25, 'https://en.wikipedia.org/wiki/Slater%27s_rules', '6.25'),
  slFe3sp: R(14.75, 'https://en.wikipedia.org/wiki/Slater%27s_rules', '14.75'),
  slFe2sp: R(21.85, 'https://en.wikipedia.org/wiki/Slater%27s_rules', '21.85'),
  slFe1s: R(25.70, 'https://en.wikipedia.org/wiki/Slater%27s_rules', '25.70'),
  // Barnes, Godfrey, Swanson hep-ph/0505002, Table 1, modele NR : J/psi "3090 MeV", psi(2S) "3672 MeV"
  bgsJPsi: R(3090, 'https://ar5iv.arxiv.org/html/hep-ph/0505002', '3090'),
  bgsPsi2S: R(3672, 'https://ar5iv.arxiv.org/html/hep-ph/0505002', '3672'),
  // https://pdglive.lbl.gov/Particle.action?node=M070 : J/psi(1S) "3096.900 +-0.006 MeV" ; node=M071 : psi(2S) "3686.097 +-0.010 MeV"
  pdgJPsi: R(3096.900, 'https://pdglive.lbl.gov/Particle.action?node=M070&init=0', '3096.900'),
  pdgPsi2S: R(3686.097, 'https://pdglive.lbl.gov/Particle.action?node=M071&init=0', '3686.097'),
  // https://pdglive.lbl.gov/Particle.action?node=S032 : D0 "1864.84 +-0.04 MeV"
  pdgD0: R(1864.84, 'https://pdglive.lbl.gov/Particle.action?node=S032&init=0', '1864.84'),
};
const ref = (k) => REF[k].valeur;
/* relit le texte lu : "10 973 731.568 157(12)" ou "6.652 458 7051(62) x 10^-29" -> nombre */
function relire(lu) {
  const [mant, ex] = lu.replace(/\(\d+\)/g, '').split(/\s*x\s*10\^/);
  return parseFloat(mant.replace(/\s+/g, '') + (ex ? 'e' + ex.trim() : ''));
}

// ---------- references independantes (Math autorise ici) ----------
const wLat = (k, m) => Math.sqrt(m * m + 4 * Math.sin(k / 2) ** 2);
function tauxSchwingerRef(eps) { let s = 0; for (let n = 1; n <= 2000; n++) s += Math.exp(-n * Math.PI / eps) / (n * n); return eps * eps / (4 * Math.PI ** 3) * s; }
/* Klein-Nishina total (forme lue sur https://en.wikipedia.org/wiki/Klein%E2%80%93Nishina_formula), en unites de 2 pi r_e^2 */
function knTotal(e) { const l = Math.log(1 + 2 * e); return 2 * Math.PI * ((1 + e) / e ** 3 * (2 * e * (1 + e) / (1 + 2 * e) - l) + l / (2 * e) - (1 + 3 * e) / (1 + 2 * e) ** 2); }
const knDiff = (c, e) => { const P = 1 / (1 + e * (1 - c)); return P * P * (P + 1 / P - (1 - c * c)); };
function integrer(f, a, b, K = 20000) { let s = 0; const h = (b - a) / K; for (let i = 0; i <= K; i++) s += (i === 0 || i === K ? 1 : i % 2 ? 4 : 2) * f(a + i * h); return s * h / 3; }
/* Floquet de chi'' + (kappa^2 + g^2 Phi^2 cos^2 t) chi = 0, periode pi : mu = acosh(|tr M|/2)/pi (0 si stable) */
function floquet(k2, g2P2) {
  const pas = 3000, h = Math.PI / pas, w2 = (t) => k2 + g2P2 * Math.cos(t) ** 2;
  const sol = (y0, v0) => {
    let y = y0, v = v0, t = 0;
    for (let i = 0; i < pas; i++) {
      const a1 = v, b1 = -w2(t) * y, a2 = v + h / 2 * b1, b2 = -w2(t + h / 2) * (y + h / 2 * a1), a3 = v + h / 2 * b2, b3 = -w2(t + h / 2) * (y + h / 2 * a2), a4 = v + h * b3, b4 = -w2(t + h) * (y + h * a3);
      y += h / 6 * (a1 + 2 * a2 + 2 * a3 + a4); v += h / 6 * (b1 + 2 * b2 + 2 * b3 + b4); t += h;
    }
    return [y, v];
  };
  const tr = sol(1, 0)[0] + sol(0, 1)[1];
  return Math.abs(tr) > 2 ? Math.acosh(Math.abs(tr) / 2) / Math.PI : 0;
}
/* polarisation du vide une boucle, integrale de definition (genre espace) */
/*   symetrie x <-> 1-x puis x = u^2 (lisse le logarithme pres de 0) */
const piInt = (Q, m, alpha) => 2 * alpha / Math.PI * 2 * integrer((u) => { const x = u * u; return 2 * u * x * (1 - x) * Math.log(1 + Q * Q * x * (1 - x) / (m * m)); }, 0, Math.sqrt(0.5), 4000);
/* moments du spectre de Planck x^2/(e^x - 1) */
const planck = (p) => integrer((x) => (x < 1e-12 ? 0 : x ** (2 + p) / (Math.exp(x) - 1)), 0, 60, 60000);

function suite(T, bavard = false) {
  const res = [];
  const ok = (nom, f) => {
    let c = false, det = '';
    try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; }
    res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : ''));
  };
  const sim = (id, p, o) => T.simuler(id, p, o);
  const cache = new Map(), S = (id, p = {}) => { const k = id + JSON.stringify(p); if (!cache.has(k)) cache.set(k, sim(id, p)); return cache.get(k); };
  const SRC = T.SOURCES, sv = (k) => SRC[k].valeur;
  // 1. forme, bornes, determinisme
  ok('SYSTEMES gele, 9 systemes, science QFT', () => { assert.ok(Object.isFrozen(T.SYSTEMES)); assert.equal(T.SYSTEMES.length, 9); assert.ok(Object.isFrozen(T.SYSTEMES[0].params)); assert.ok(T.SYSTEMES.every((s) => s.science === 'Quantum field theory')); });
  for (const s of T.SYSTEMES) {
    ok(`${s.id} : bornee, brut n*D fini, 3 <= D <= 12, points null, lyapunov null`, () => {
      const r = S(s.id);
      assert.equal(r.bornee, true, r.raison); assert.equal(r.D, s.D); assert.ok(r.D >= 3 && r.D <= 12); assert.equal(r.n, 1500);
      assert.equal(r.brut.length, 1500 * s.D); assert.ok(r.brut.every(Number.isFinite)); assert.equal(r.points, null); assert.equal(r.lyapunov, null);
      assert.ok(typeof r.uniteLyapunov === 'string' && r.uniteLyapunov.length > 5);
      if (r.film) { assert.equal(r.film.tailles.reduce((a, b) => a + b, 0), 1500); assert.equal(r.film.images, r.film.debuts.length); }
      assert.ok(typeof s.phrase === 'string' && s.phrase.length > 80 && /visualisation/.test(s.phrase) && s.nom);
    });
    ok(`${s.id} : determinisme (octets identiques)`, () => assert.ok(octets(sim(s.id).brut).equals(octets(S(s.id).brut))));
    ok(`${s.id} : petits n (2 et 7) bornes et finis`, () => { for (const n of [2, 7]) { const r = sim(s.id, {}, { n }); assert.equal(r.bornee, true); assert.equal(r.brut.length, n * s.D); assert.ok(r.brut.every(Number.isFinite)); } });
  }
  ok('SOURCES : chaque valeur = texte lu, URL https', () => {
    for (const [k, e] of Object.entries(SRC)) { assert.ok(/^https:\/\//.test(e.url), k); assert.equal(relire(e.lu), e.valeur, k + ' : ' + e.lu); }
    for (const [k, e] of Object.entries(REF)) { assert.ok(/^https:\/\//.test(e.url), k); assert.equal(relire(e.lu), e.valeur, k + ' : ' + e.lu); }
    return Object.keys(SRC).length + ' + ' + Object.keys(REF).length + ' valeurs relues';
  });
  // 2. champLibre
  for (const p of [{}, { m: 1, k0: 2, largeur: 8 }]) ok(`champLibre ${JSON.stringify(p)} : energie < 1e-6, omega a 5e-4 du reseau, v_g a 1 %, paquet s etale`, () => {
    const I = S('champLibre', p).invariants, P = S('champLibre', p).params, d = I.dispersion, wth = wLat(d.k, P.m);
    assert.ok(I.energie.derive < 1e-6, String(I.energie.derive));
    assert.ok(Math.abs(d.formule - wth) < 1e-12 * wth, `formule ${d.formule} vs ${wth}`); assert.ok(Math.abs(d.mesure - wth) < 5e-4 * wth, `${d.mesure} vs ${wth}`);
    const vth = Math.sin(P.k0) / wLat(P.k0, P.m), v = I.vitesseGroupe;
    assert.ok(Math.abs(v.formule - vth) < 1e-12, String(v.formule)); assert.ok(Math.abs(v.mesure - vth) < 0.01 * vth, `${v.mesure} vs ${vth}`);
    assert.ok(v.mesure < 1); assert.ok(I.largeurPaquet.fin >= I.largeurPaquet.debut);
    return `dE ${I.energie.derive.toExponential(1)}, omega ${d.mesure.toFixed(5)}/${wth.toFixed(5)}, v_g ${v.mesure.toFixed(4)}/${vth.toFixed(4)}`;
  });
  // 3. fluctuationsVide
  for (const p of [{}, { m: 1.2, graine: 7 }]) ok(`fluctuationsVide ${JSON.stringify(p)} : <|phi_k|^2> = 1/(2 omega_k) a 4.5 sigma, correlation = somme exacte a 5 sigma`, () => {
    const r = S('fluctuationsVide', p), I = r.invariants, m = r.params.m, N = 64; let pire = 0, pireC = 0;
    I.variancesModes.k.forEach((k, j) => { const th = 1 / (2 * wLat(k, m)); assert.ok(Math.abs(I.variancesModes.theorie[j] - th) < 1e-12 * th); pire = Math.max(pire, Math.abs(I.variancesModes.mesure[j] - th) / I.variancesModes.erreur[j]); });
    assert.ok(pire < 4.5, String(pire));
    I.correlation.r.forEach((rr, i) => {
      let th = 0; for (let j = 0; j < N; j++) th += Math.cos(2 * Math.PI * j * rr / N) / (2 * wLat(2 * Math.PI * j / N, m)); th /= N;
      pireC = Math.max(pireC, Math.abs(I.correlation.mesure[i] - th) / I.correlation.erreur[i]);
    });
    assert.ok(pireC < 5, String(pireC));
    const c = I.correlation.theorie; assert.ok(c[0] > c[4] && c[4] > c[16]);
    return `pire mode ${pire.toFixed(2)} sigma, pire correlation ${pireC.toFixed(2)} sigma`;
  });
  // 4. interactionChamps
  for (const p of [{}, { g: 1.2 }]) ok(`interactionChamps ${JSON.stringify(p)} : energie < 1e-3, mode le plus rapide = bande de Mathieu (Floquet + KLS), energie passee a chi`, () => {
    const r = S('interactionChamps', p), I = r.invariants, z = I.resonance, P = r.params, q = P.g * P.g * P.Phi * P.Phi / 4, N = 256;
    assert.ok(I.energieTotale.derive < 1e-3, String(I.energieTotale.derive));
    let jF = 1, muF = 0; const mus = [];
    for (let j = 1; j < 64; j++) { const k2 = (4 * Math.sin(Math.PI * j / N)) ** 2; const mu = floquet(k2, P.g * P.g * P.Phi * P.Phi); mus[j] = mu; if (mu > muF) { muF = mu; jF = j; } }
    assert.ok(Math.abs(z.kappa2Max - (4 * Math.sin(Math.PI * z.jMax / N)) ** 2) < 1e-12);
    assert.ok(Math.abs(z.jMax - jF) <= 2, `j ${z.jMax} vs Floquet ${jF}`);
    assert.ok(Math.abs(z.tauxMax - muF) < 0.10 * muF, `${z.tauxMax} vs ${muF}`);
    assert.ok(z.kappa2Max > 1 - 3 * q && z.kappa2Max < 1 - q, `kappa2 ${z.kappa2Max} hors [${1 - 3 * q}, ${1 - q}]`);
    assert.ok(Math.abs(muF - q / 2) < 0.15 * q / 2, `Floquet ${muF} vs q/2 ${q / 2}`);
    assert.ok(I.transfert.fractionChiFin > 0.01, String(I.transfert.fractionChiFin));
    return `dE ${I.energieTotale.derive.toExponential(1)}, j ${z.jMax}/${jF}, taux ${z.tauxMax.toFixed(4)} Floquet ${muF.toFixed(4)} q/2 ${(q / 2).toFixed(4)}, chi ${(100 * I.transfert.fractionChiFin).toFixed(1)} %`;
  });
  // 5. paireSchwinger
  ok('paireSchwinger : taux = serie de Schwinger (1e-10), suppression exp(-pi/eps), E_crit ~ 1.32e18 V/m', () => {
    for (const e of [0.05, 0.2, 0.5, 1, 3]) { const G = S('paireSchwinger', { champ: e }).invariants.taux.naturel, g = tauxSchwingerRef(e); assert.ok(Math.abs(G - g) <= 1e-10 * g, `${e} : ${G} vs ${g}`); }
    const a = S('paireSchwinger', { champ: 0.05 }).invariants.taux.naturel, b = S('paireSchwinger', { champ: 0.1 }).invariants.taux.naturel;
    assert.ok(Math.abs(Math.log(a / b) - (2 * Math.log(0.5) - 10 * Math.PI)) < 1e-6);
    const Ec = sv('me') ** 2 * sv('c') ** 3 / (sv('e') * sv('hbar')), I = S('paireSchwinger').invariants;
    assert.ok(Math.abs(I.taux.champCritique - Ec) < 1e-12 * Ec); assert.ok(Math.abs(Ec - ref('eCrit')) < 0.005 * ref('eCrit'), String(Ec));
    return `E_crit ${Ec.toExponential(4)} V/m, Gamma(0.5) ${I.taux.naturel.toExponential(3)}`;
  });
  for (const e of [0.5, 3]) ok(`paireSchwinger champ ${e} : hyperboles exactes (1e-8), vitesses < c, paires s ecartent`, () => {
    const r = S('paireSchwinger', { champ: e }), I = r.invariants;
    assert.ok(I.hyperbole.derive < 1e-8, String(I.hyperbole.derive)); assert.ok(I.vitesseMax.fin < 1 && I.vitesseMax.fin > 0.5); assert.ok(I.separationMax.fin > 2 / e);
    return `v max ${I.vitesseMax.fin.toFixed(4)} c`;
  });
  // 6. effetUnruh
  ok('effetUnruh : T(1 m/s^2) = 4.06e-21 K (0.2 %), formule CODATA exacte, T(1e20 m/s^2) lineaire', () => {
    const I = S('effetUnruh').invariants.temperature, t = sv('hbar') / (2 * Math.PI * sv('c') * sv('kB'));
    assert.ok(Math.abs(I.pourUnMetreParSeconde2 - t) < 1e-12 * t); assert.ok(Math.abs(t - ref('unruh1')) < 0.002 * ref('unruh1'), String(t));
    const J = S('effetUnruh', { log10a: 20 }).invariants.temperature; assert.ok(Math.abs(J.SI - 1e20 * t) < 1e-9 * J.SI, String(J.SI));
    return `T = ${t.toExponential(4)} K pour 1 m/s^2`;
  });
  ok('effetUnruh : x^2 - t^2 = 1/a^2, |u| = 1, acceleration propre constante (1e-9), energie moyenne = bain a T = a/(2 pi) (4 sigma)', () => {
    const r = S('effetUnruh'), I = r.invariants, n = r.n;
    assert.ok(I.hyperbole.derive < 1e-9 && I.normeVitesse.derive < 1e-9 && I.accelerationPropre.derive < 1e-9);
    let s = 0; for (let i = 0; i < n; i++) s += r.brut[4 * i + 2];
    const m0 = planck(0), m1 = planck(1) / m0, m2 = planck(2) / m0, Tn = 1 / (2 * Math.PI), th = m1 * Tn, sg = Math.sqrt(m2 - m1 * m1) * Tn / Math.sqrt(n);
    for (let i = 0; i < n; i++) { const x = r.brut[4 * i], t = r.brut[4 * i + 1]; assert.ok(Math.abs(x * x - t * t - 1) < 1e-9); }
    assert.ok(Math.abs(s / n - th) < 4 * sg, `${s / n} vs ${th} +- ${sg}`); assert.ok(Math.abs(I.energieMoyenne.theorie - th) < 1e-6 * th);
    return `<omega> ${(s / n).toFixed(4)} vs ${th.toFixed(4)} (${(Math.abs(s / n - th) / sg).toFixed(2)} sigma)`;
  });
  // 7. couplageCourant
  ok('couplageCourant : Delta alpha leptons (une boucle) a 2e-4 de Steinhauser, a 0.5 % du total trois boucles', () => {
    const D = S('couplageCourant').invariants.deltaAlphaLeptonsMZ;
    assert.ok(Math.abs(D.uneBoucle - ref('dAlpha1')) < 2e-4 * ref('dAlpha1'), String(D.uneBoucle));
    assert.ok(Math.abs(D.uneBoucle - ref('dAlphaTot')) < 0.005 * ref('dAlphaTot')); assert.ok(Math.abs(D.genreEspace - D.uneBoucle) < 1e-4 * D.uneBoucle);
    return `${(D.uneBoucle * 1e4).toFixed(5)}e-4 vs ${(ref('dAlpha1') * 1e4).toFixed(5)}e-4 (une boucle publiee)`;
  });
  ok('couplageCourant : courbe 1/alpha(Q) = integrale de polarisation (1e-7), 1/alpha(Q->0) = CODATA, alpha croit', () => {
    const r = S('couplageCourant'), b = r.brut, n0 = r.film.tailles[0], al = 1 / sv('alphaInverse'), ml = [sv('meMeV'), sv('mmuMeV'), sv('mtauMeV')].map((x) => x / 1000);
    for (let i = 0; i < n0; i += 37) { const Q = 10 ** b[3 * i]; let d = 0; for (const m of ml) d += piInt(Q, m, al); assert.ok(Math.abs(b[3 * i + 1] - (1 - d) / al) < 1e-7 * 137, `Q ${Q} : ${b[3 * i + 1]} vs ${(1 - d) / al}`); }
    for (let i = 1; i < n0; i++) assert.ok(b[3 * i + 1] <= b[3 * (i - 1) + 1] + 1e-12);
    assert.ok(Math.abs(r.invariants.inverseAlpha.Q0 - sv('alphaInverse')) < 2e-3 && r.invariants.inverseAlpha.Q0 <= sv('alphaInverse'));
    return `1/alpha : ${b[1].toFixed(4)} -> ${b[3 * (n0 - 1) + 1].toFixed(4)} (leptons seuls)`;
  });
  ok('couplageCourant : alpha_s(M_Z) = 0.1179, 1/alpha_s lineaire en ln Q (pente b0/2pi), decroissant', () => {
    const r = S('couplageCourant'), b = r.brut, n0 = r.film.tailles[0], n = r.n, I = r.invariants.alphaS;
    assert.ok(Math.abs(I.MZ - ref('alphaS')) < 1e-12); const sl = (11 - 10 / 3) / (2 * Math.PI) * Math.log(10);
    for (let i = n0 + 1; i < n; i++) { const d = (b[3 * i + 1] - b[3 * (i - 1) + 1]) / (b[3 * i] - b[3 * (i - 1)]); assert.ok(Math.abs(d - sl) < 1e-9 * sl, String(d)); assert.equal(b[3 * i + 2], 1); }
    assert.ok(I.Q10 > I.MZ && I.MZ > I.Q1000);
  });
  // 8. comptonKleinNishina
  ok('compton : sigma = Klein-Nishina total (1e-6), limite basse energie = sigma_e CODATA (0.3 %), 8 pi r_e^2/3 = sigma_e (1e-9)', () => {
    const re = sv('rayonElectron');
    for (const e of [0.001, 0.5, 5]) { const s = S('comptonKleinNishina', { energie: e }).invariants.sectionEfficace.mesure, t = re * re * knTotal(e); assert.ok(Math.abs(s - t) < 1e-6 * t, `${e} : ${s} vs ${t}`); }
    const I = S('comptonKleinNishina', { energie: 0.001 }).invariants.sectionEfficace;
    assert.ok(Math.abs(I.thomson - ref('sigmaE')) < 1e-9 * ref('sigmaE'), String(I.thomson)); assert.ok(Math.abs(I.mesure - ref('sigmaE')) < 0.003 * ref('sigmaE'));
    return `sigma(1 keV-ish) ${I.mesure.toExponential(5)} vs sigma_e ${ref('sigmaE').toExponential(5)}`;
  });
  for (const e of [0.01, 1, 20]) ok(`compton energie ${e} : decalage de Compton exact (1e-12), fraction vers l avant = KN (4 sigma)`, () => {
    const r = S('comptonKleinNishina', { energie: e }), I = r.invariants, n = r.n; let av = 0;
    assert.ok(I.decalageCompton.pireEcart < 1e-12, String(I.decalageCompton.pireEcart));
    for (let i = 0; i < n; i++) { const c = r.brut[4 * i + 2]; if (c > 0) av++; assert.ok(Math.abs(r.brut[4 * i + 3] - 1 / (1 + e * (1 - c))) < 1e-14); }
    const th = integrer((c) => knDiff(c, e), 0, 1) / integrer((c) => knDiff(c, e), -1, 1), sg = Math.sqrt(th * (1 - th) / n);
    assert.ok(Math.abs(av / n - th) < 4 * sg, `${av / n} vs ${th}`);
    return `avant ${(av / n).toFixed(3)} vs ${th.toFixed(3)}`;
  });
  ok('compton : pic vers l avant a haute energie (fraction(20) > fraction(0.01) + 0.3)', () => assert.ok(S('comptonKleinNishina', { energie: 20 }).invariants.avant.fraction > S('comptonKleinNishina', { energie: 0.01 }).invariants.avant.fraction + 0.3));
  // 9. atomes
  ok('atomes Fe : Z_eff de Slater = exemple publie (1e-12), configuration de Madelung', () => {
    const I = S('atomes', { Z: 26 }).invariants, s = I.slater;
    for (const [g, k] of [['4sp', 'slFe4s'], ['3d', 'slFe3d'], ['3sp', 'slFe3sp'], ['2sp', 'slFe2sp'], ['1s', 'slFe1s']]) assert.ok(Math.abs(s[g].Zeff - ref(k)) < 1e-12, `${g} ${s[g].Zeff}`);
    assert.equal(I.configuration, '1s2 2s2 2p6 3s2 3p6 4s2 3d6');
  });
  ok('atomes H : Lyman-alpha et H-alpha (Rydberg CODATA, masse reduite) a 2e-5 de NIST ASD (vide)', () => {
    const L = S('atomes', { Z: 1 }).invariants.raies;
    assert.ok(Math.abs(L.lymanAlpha - ref('lymanAlpha')) < 2e-5 * ref('lymanAlpha'), String(L.lymanAlpha));
    assert.ok(Math.abs(L.balmerAlpha - ref('hAlpha')) < 2e-5 * ref('hAlpha'), String(L.balmerAlpha));
    return `Ly-a ${L.lymanAlpha.toFixed(5)} / ${ref('lymanAlpha')} nm, H-a ${L.balmerAlpha.toFixed(4)} / ${ref('hAlpha')} nm`;
  });
  ok('atomes : <r> 1s de H a 5 % de 3/2 a0, 2p de Ne a 10 % de (3n^2 - l(l+1))/(2 Z_eff)', () => {
    const h = S('atomes', { Z: 1 }).invariants.rayonsMoyens['1s']; assert.ok(Math.abs(h.mesure - 1.5) < 0.075, String(h.mesure));
    const ne = S('atomes', { Z: 10 }).invariants.rayonsMoyens['2p']; assert.ok(Math.abs(ne.mesure - ne.theorie) < 0.1 * ne.theorie && Math.abs(ne.theorie - 5 / (Math.round(ne.Zeff * 100) / 100)) < 1e-9);
    return `H 1s ${h.mesure.toFixed(3)}, Ne 2p ${ne.mesure.toFixed(4)} vs ${ne.theorie.toFixed(4)}`;
  });
  // 10. quarks
  ok('quarks : niveaux J/psi et psi(2S) a 3 MeV du modele BGS publie, ecart a 3 % de la PDG', () => {
    const I = S('quarks').invariants.spectre;
    assert.ok(Math.abs(I.JPsi - ref('bgsJPsi')) < 3, String(I.JPsi)); assert.ok(Math.abs(I.psi2S - ref('bgsPsi2S')) < 3, String(I.psi2S));
    const pdg = ref('pdgPsi2S') - ref('pdgJPsi'); assert.ok(Math.abs(I.ecart - pdg) < 0.03 * pdg, `${I.ecart} vs ${pdg}`);
    return `J/psi ${I.JPsi.toFixed(1)}, psi(2S) ${I.psi2S.toFixed(1)}, ecart ${I.ecart.toFixed(1)} vs PDG ${pdg.toFixed(3)} MeV`;
  });
  ok('quarks : montee lineaire (dV/dr a 2 % de b), cassure a 2 m_D, psi(2S) sous le seuil (modele et PDG)', () => {
    const I = S('quarks').invariants;
    assert.ok(Math.abs(I.penteLongue.mesure - sv('bgsB')) < 0.02 * sv('bgsB'));
    assert.ok(Math.abs(I.cassure.energie - (2 * ref('pdgD0') / 1000 - 2 * sv('bgsMc'))) < 1e-9);
    assert.ok(I.cassure.sousSeuil2S && ref('pdgPsi2S') < 2 * ref('pdgD0'));
    assert.ok(Math.abs(I.hbarcGeVfm - sv('hbar') * sv('c') / sv('e') / 1e-6) < 1e-12);
    return `r cassure ${I.cassure.rayonFm.toFixed(3)} fm`;
  });
  // 11. bornage
  ok('bornage : hors bornes ramene, NaN -> defaut, entiers arrondis', () => {
    assert.deepEqual(sim('champLibre', { m: 100, k0: -5, largeur: NaN, duree: 'x' }, { n: 50 }).params, { m: 2, k0: 0.2, largeur: 10, duree: 80 });
    assert.deepEqual(sim('atomes', { Z: 99.6, graine: 2.4 }, { n: 50 }).params, { Z: 36, graine: 2 });
    assert.deepEqual(sim('paireSchwinger', { champ: 1e9, paires: 3.2 }, { n: 50 }).params, { champ: 3, paires: 5, duree: 10, graine: 1 });
  });
  ok('reglagesPhysique : forme, valeur bornee', () => {
    const r = T.reglagesPhysique('effetUnruh', { log10a: 99 });
    assert.deepEqual(r.map((x) => x.chemin), ['params.log10a', 'params.tauMax', 'params.graine']);
    assert.deepEqual(r[0], { chemin: 'params.log10a', nom: 'log10a', min: 0, max: 22, valeur: 22 });
  });
  return res;
}

// ---------- banc ----------
const T = await import(pathToFileURL(SOURCE).href);
const res = suite(T, true), ech = res.filter((x) => !x.ok);
let assertions = res.length;
const src = readFileSync(SOURCE, 'utf8'), moi = readFileSync(fileURLToPath(import.meta.url), 'utf8');
/* source : aucune fonction Math transcendante, aucun Math.random */
const interdits = src.match(/Math\.(sin|cos|tan|exp|log|pow|atan2?|asin|acos|hypot|sinh|cosh|tanh|cbrt|expm1|log1p|log2|log10|random)\b/g);
assertions++; if (interdits) ech.push({ nom: 'source sans Math transcendante', det: interdits.join(',') });
console.log(`${interdits ? 'ECHEC ' : 'OK    '}source : aucune Math.sin/cos/exp/log/pow/atan/... ni Math.random`);
/* aucune valeur marquee comme sans source lue (motif assemble pour ne pas se trouver lui-meme) */
const marque = new RegExp(['de m' + 'emoire', 'from m' + 'emory', 'de t' + 'ete', 'a sour' + 'cer', 'unsour' + 'ced', 'non sour' + 'ce', 'TO' + 'DO'].join('|'), 'i');
const marques = [src, moi].flatMap((t, i) => t.split('\n').map((l, j) => [i ? 'test' : 'module', j + 1, l]).filter(([, , l]) => marque.test(l)));
assertions++; if (marques.length) ech.push({ nom: 'valeur marquee sans source lue', det: marques.map(([f, j]) => f + ':' + j).join(',') });
console.log(`${marques.length ? 'ECHEC ' : 'OK    '}aucune valeur marquee sans source lue (module + banc)`);

console.log('\nTEMPS simuler(id) a n = 1500 (mediane de 3) :');
for (const s of T.SYSTEMES) {
  const t = []; for (let k = 0; k < 3; k++) { const a = performance.now(); T.simuler(s.id); t.push(performance.now() - a); }
  t.sort((a, b) => a - b); const ms = t[1];
  console.log(`  ${s.id.padEnd(20)} ${ms.toFixed(1)} ms`);
  assertions++; if (!(ms < 300)) ech.push({ nom: 'temps ' + s.id + ' < 300 ms', det: ms.toFixed(1) });
}

// ---------- mutants (copies dans un dossier temporaire ; l import du moteur pointe vers l original) ----------
const MUTANTS = [
  ['dispersion du reseau : 2 sin(k/2) -> k', 'const kLat = (k) => 2 * sinD(k / 2);', 'const kLat = (k) => k;'],
  ['variance du vide 1/(2w) -> 1/w', 'const varianceMode = (w) => 1 / (2 * w);', 'const varianceMode = (w) => 1 / w;'],
  ['energie de couplage retiree du total', 'total: (ef + ex + ei) * a', 'total: (ef + ex) * a'],
  ['Schwinger : exposant pi -> 2 pi', 'expD(-k * PI / eps)', 'expD(-k * 2 * PI / eps)'],
  ['Unruh : 2 pi -> pi', 'hbar * a / (2 * PI * c * kB)', 'hbar * a / (PI * c * kB)'],
  ['Klein-Nishina -> Thomson seul', 'function kn(c, eps) { const P = 1 / (1 + eps * (1 - c));', 'function kn(c, eps) { const P = 1;'],
  ['constante de Rydberg changee', "const RYDBERG = V_('rydberg');", 'const RYDBERG = 10970000;'],
  ['Cornell : facteur 4/3 retire', 'const coulomb = (r, as) => -(4 / 3) * as / r;', 'const coulomb = (r, as) => -as / r;'],
  ['hyperfin retire (S.S = 0)', '(sg / Math.sqrt(PI)) * 0.25;', '(sg / Math.sqrt(PI)) * 0;'],
  ['Slater : 0.85 -> 1.00 pour n-1', '0.35 * autres + 0.85 * (parN[nn - 1] || 0)', '0.35 * autres + 1.00 * (parN[nn - 1] || 0)'],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
  ['Math.random injecte', 'const alea = mulberry32(P.graine >>> 0), brut = new Float64Array(n * 4), suivi = suiveur();', 'const alea = Math.random, brut = new Float64Array(n * 4), suivi = suiveur();'],
];
const moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-champs-quantiques-mutants-'));
let tues = 0;
console.log('\nMUTANTS :');
try {
  for (let i = 0; i < MUTANTS.length; i++) {
    const [nom, de, vers] = MUTANTS[i], k = src.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NON APPLIQUE (motif trouve ${k} fois) -> SURVIVANT`); continue; }
    const f = join(dossier, `mutant-${i + 1}.mjs`);
    writeFileSync(f, src.replace(de, vers).replace("from './tam-moteur.js'", `from '${moteur}'`));
    let r; try { r = suite(await import(pathToFileURL(f).href)); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok);
    if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'TUE' : 'SURVIT'} (${rouges.length} rouges${rouges.length ? ', ex: ' + rouges.slice(0, 2).map((x) => x.nom).join(' | ') : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
assertions++; if (tues !== MUTANTS.length) ech.push({ nom: 'mutants', det: `${tues}/${MUTANTS.length}` });
console.log(`\nMUTANTS : ${tues}/${MUTANTS.length} tues`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.det || '')); process.exit(1); }
console.log(`test-tam-champs-quantiques-20261101 : ${assertions} assertions OK`);
