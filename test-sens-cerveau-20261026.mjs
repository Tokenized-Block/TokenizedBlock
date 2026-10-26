// test-sens-cerveau-20261026.mjs — LES ENTREES, SORTIES ET INTERNES DU CERVEAU QU ON NE VOYAIT PAS, MONTRES SANS RIEN INVENTER.
//
// Ce que ce banc exige (Phil, 2026-10-26 : « capter les autres entrees, sorties et internes du brain ») :
//   A. le cerveau v1 (tblock-fly-brain/3) est INCHANGE : 176 cas x 40 pas = 0xed4344f6… au bit pres, apres que `pas()` lit
//      ses constantes dans `INTERNES` au lieu de les ecrire en dur ;
//   B. `part` et `scelle` sont des entrees MORTES : acceptees par courant(), gravees dans `vu.entree`, lues par AUCUN neurone
//      (memes potentiels, memes traces, memes tirs, memes sorties avec et sans) — et l ecran le dit ;
//   C. `interne()` = l etat reel : chaque potentiel et chaque trace sont ceux de `etat` (Object.is), la regle des ailes rejoue
//      `gauche_hz` / `droite_hz` avec des constantes ecrites ICI (independantes de INTERNES) ;
//   D. la lueur de « Inside » = potentiel / seuil du DERNIER battement, et rien sur un battement dont l etat n est pas tenu ;
//   E. une entree n est « lue » que si l app l a REELLEMENT passee : un absent n est jamais un zero ; l app ne nourrit ni
//      `part` ni `scelle` ;
//   F. le cablage dans app.html.
// Mutants : CERVEAU_MODULE=<copie> / VISION_MODULE=<copie> (chemins relatifs a ce fichier).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

const C = await import(new URL(process.env.CERVEAU_MODULE || './cerveau.js', import.meta.url).href);
const V = await import(new URL(process.env.VISION_MODULE || './vision-cerveau.js', import.meta.url).href);
const { etatInitial, pas, empreinte, forces, PARAMETRES, NEURONES, CAPTEURS } = C;
const { champ, interne, cadreInterieur, ENTREES, TEXTE_SANS_NEURONE, PRES_DU_SEUIL } = V;

const ADR = '0xb2000000000000000000007afa7ed748b0874f27'; /* UNIT, blockrolls-plan.js:42 */
const FAITS = { vie: 12000, vieAvant: 11000, gm: 2, messages: 0, detenteurs: 1, mort: false, etatVie: 'LUE', gmAvant: 2, messagesAvant: 0,
  detenteursAvant: 1, achats: 1, ventes: 0, achatsAvant: 1, ventesAvant: 0, role: 'SENTINELLE', bloc: 53106615 };
const adrs = [];
for (let i = 0; i < 16; i++) adrs.push('0x' + empreinte('vision-golden-' + i).slice(2, 42));
const CAS = [
  {},
  { vie: 12000, etatVie: 'LUE' },
  { vie: 12000, vieAvant: 15000, etatVie: 'LUE' },
  { vie: 18000, vieAvant: 15000, etatVie: 'LUE', role: 'MOMENTUM' },
  { vie: 900, etatVie: 'LUE', achats: 3, achatsAvant: 1, ventes: 0, ventesAvant: 0, role: 'SENTINELLE' },
  { vie: 900, etatVie: 'LUE', achats: 1, achatsAvant: 1, ventes: 4, ventesAvant: 0, role: 'CHASSEUR' },
  { gm: 4, messages: 1, detenteurs: 2, gmAvant: 1, messagesAvant: 0, detenteursAvant: 1, etatVie: 'NON_TROUVEE', role: 'ACCUEIL' },
  { etatVie: 'NON_LUE' },
  { vie: 5e6, etatVie: 'LUE', mort: true },
  { reveil: true, etatVie: 'NON_TROUVEE' },
  { vie: 4e4, etatVie: 'LUE', bloc: 12345678, gm: 9, detenteurs: 7 },
];

/* ══ A. v1 INCHANGE ══ (meme protocole que test-vision-cerveau-20261026.mjs §A) */
{
  const tout = [];
  for (const a of adrs) for (const f of CAS) {
    let e = etatInitial(a); const vus = [];
    for (let t = 0; t < 40; t++) { const r = pas(e, f); e = r.etat; vus.push(r.vu); }
    tout.push(empreinte(JSON.stringify([vus, e.potentiels, e.memoire])));
  }
  ok(tout.length === 176, 'A: 176 cas');
  eq(empreinte(JSON.stringify(tout)), '0xed4344f6bcf96238c7b3a92df43f5c5940322f308a075eb46c7c9801130997fc', 'A: v1 au bit pres');
  ok(C.VERSION_CERVEAU === 'tblock-fly-brain/3', 'A: la version gravee ne bouge pas');
  ok(!('gainLien' in PARAMETRES), 'A: INTERNES ne s ajoute pas a ce que Create grave (PARAMETRES)');
}

/* ══ B. part ET scelle : LUS PAR AUCUN NEURONE ══ */
{
  let entreeDiffere = 0;
  for (const a of adrs.slice(0, 8)) for (const f of CAS) {
    let e1 = etatInitial(a), e2 = etatInitial(a);
    for (let t = 0; t < 30; t++) {
      const r1 = pas(e1, f), r2 = pas(e2, { ...f, part: 1, scelle: true });
      const { entree: x1, ...v1 } = r1.vu; const { entree: x2, ...v2 } = r2.vu;
      assert.deepEqual(v2, v1); assert.deepEqual(r2.etat.potentiels, r1.etat.potentiels); assert.deepEqual(r2.etat.memoire, r1.etat.memoire);
      if (x1 !== x2) entreeDiffere++;
      e1 = r1.etat; e2 = r2.etat;
    }
  }
  ok(true, 'B: 88 cas x 30 pas : part=1 + scelle=true ne changent ni un potentiel, ni une trace, ni un tir, ni une sortie');
  ok(entreeDiffere === 88 * 30, 'B: ... mais ils sont graves dans l empreinte d entree (' + entreeDiffere + ' pas)');
  ok(JSON.stringify(forces({ ...FAITS, part: 1, scelle: true }).termes) === JSON.stringify(forces(FAITS).termes), 'B: forces() ne les lit pas');
  for (const k of ['part', 'scelle']) {
    const d = ENTREES.find((x) => x.cle === k);
    ok(d && d.source === null && d.aucunNeurone === true, 'B: ' + k + ' : aucune source, aucun neurone');
    const e = champ({ adr: ADR, faits: { ...FAITS, [k]: k === 'part' ? 1 : true }, nourritureLue: true }).entrees.find((x) => x.cle === k);
    ok(e.lu === false && e.texte === TEXTE_SANS_NEURONE && /no neuron reads it/.test(e.texte), 'B: l ecran dit ' + k + ' « no neuron reads it », meme s il etait passe');
  }
}

/* ══ C. interne() = L ETAT REEL ══ */
let e = etatInitial(ADR); const histo = [];
for (let t = 0; t < 30; t++) { const r = pas(e, FAITS); e = r.etat; histo.push(r.vu); }
{
  ok(interne(null) === null && interne({}) === null && interne({ ...e, potentiels: [1, 2] }) === null, 'C: un etat illisible -> null');
  const x = interne(e);
  ok(x.tick === e.tick && x.tick === 30, 'C: le tick est celui de l etat');
  let memes = 0;
  for (let i = 0; i < NEURONES; i++) {
    const k = x.neurones[i];
    if (Object.is(k.potentiel, e.potentiels[i]) && Object.is(k.trace, e.memoire[i])
      && Object.is(k.lueur, Math.max(0, Math.min(1, e.potentiels[i] / 1)))
      && k.retenu === (e.potentiels[i] < 0) && k.capteur === (i < 16)
      && Object.is(k.amorce, e.memoire[i] * 0.2)) memes++;
  }
  ok(memes === 128, 'C: 128/128 neurones : potentiel, trace, lueur, amorce = l etat de pas() au bit pres (' + memes + ')');
  ok(x.spikes === e.spikes && x.spikesAvant === e.dernierSpikes && x.spikesAvant === histo[28].spikes, 'C: tirs et tirs du battement d avant = etat');
  ok(x.resume.pres === e.potentiels.filter((p) => p >= 0.8).length && PRES_DU_SEUIL === 0.8, 'C: « pres de tirer » compte l etat');
  ok(x.resume.retenus === e.potentiels.filter((p) => p < 0).length, 'C: « retenus » compte l etat');
  const tri = e.memoire.map((m, i) => [m, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])[0];
  ok(x.resume.traceMax.n === tri[1] && Object.is(x.resume.traceMax.trace, tri[0]), 'C: la plus forte trace est celle de l etat');
  ok(x.regles.seuil === 1 && x.regles.fuite === 0.82 && x.regles.refractaire === null, 'C: les regles sont celles du module, sans periode refractaire inventee');
  /* la regle des ailes, rejouee avec des constantes ecrites ICI (12 Hz, 4 Hz/tir, 18 Hz x taille, modulo 3) */
  const taille = forces(FAITS).f.taille;
  for (const [t, vu] of histo.entries()) {
    const g = vu.indices.filter((i) => (i + e.c.aileG) % 3 === 0).length, d = vu.indices.filter((i) => (i + e.c.aileD) % 3 === 0).length;
    assert.equal(vu.gauche_hz, Math.round((12 + g * 4 + taille * 18) * 100) / 100, 'aile G au pas ' + t);
    assert.equal(vu.droite_hz, Math.round((12 + d * 4 + taille * 18) * 100) / 100, 'aile D au pas ' + t);
  }
  ok(true, 'C: 30 pas : gauche_hz / droite_hz = la regle des ailes rejouee independamment');
  const ailes = x.neurones.map((k) => k.aile);
  ok(ailes.every((a, i) => a === (((i + e.c.aileG) % 3 === 0) && ((i + e.c.aileD) % 3 === 0) ? 'both' : (i + e.c.aileG) % 3 === 0 ? 'left' : (i + e.c.aileD) % 3 === 0 ? 'right' : 'neither')),
    'C: l aile de chaque neurone suit la regle ecrite');
  const xm = interne(etatInitial(ADR));
  ok(xm.neurones.every((k) => k.potentiel === 0 && k.trace === 0) && xm.spikesAvant === 0, 'C: un cerveau neuf est a zero, pas « a moitie vivant »');
}

/* ══ D. LA LUEUR DE « INSIDE » ══ */
{
  const c = champ({ adr: ADR, faits: FAITS, vu: histo[29], nourritureLue: true });
  const k = cadreInterieur({ c, faits: FAITS, histo, i: 29, capMap: 0.1, etat: e });
  const x = interne(e);
  ok(k.lueurTick === 30, 'D: la lueur porte le tick de l etat');
  const tous = [...k.capteurs, ...k.neurones];
  ok(tous.length === 128 && tous.every((o) => Object.is(o.lueur, x.neurones[o.n].lueur) && o.retenu === x.neurones[o.n].retenu),
    'D: 128/128 lueurs = potentiel / seuil de l etat');
  const sans = cadreInterieur({ c, faits: FAITS, histo, i: 29, capMap: 0.1 });
  const ancien = cadreInterieur({ c, faits: FAITS, histo, i: 12, capMap: 0.1, etat: e });
  ok(!('lueurTick' in sans) && sans.capteurs.every((o) => !('lueur' in o)), 'D: sans etat, aucune lueur');
  ok(!('lueurTick' in ancien) && ancien.empreinte === cadreInterieur({ c, faits: FAITS, histo, i: 12, capMap: 0.1 }).empreinte,
    'D: un battement plus ancien n a pas son etat : aucune lueur, cadre identique a celui d avant');
  const autre = etatInitial('0x' + empreinte('autre').slice(2, 42));
  ok(!('lueurTick' in cadreInterieur({ c, faits: FAITS, histo, i: 29, capMap: 0.1, etat: autre })), 'D: un etat d un autre tick ne s allume pas');
  ok(sans.empreinte !== k.empreinte, 'D: la lueur entre dans l empreinte du cadre quand elle est montree');
}

/* ══ E. UNE ENTREE LUE EST UNE ENTREE PASSEE ══ */
{
  for (const d of ENTREES) {
    if (d.source === null || d.cle === 'reveil') continue;
    const { [d.cle]: _x, ...f } = FAITS;
    const ent = champ({ adr: ADR, faits: f, nourritureLue: true }).entrees.find((x) => x.cle === d.cle);
    ok(ent.lu === false && ent.texte === 'not read' && ent.brut === null, 'E: ' + d.cle + ' absent des faits -> « not read », jamais une valeur');
  }
  const app = readFileSync(new URL(process.env.APP_HTML || './app.html', import.meta.url), 'utf8');
  const i0 = app.indexOf('function entreesCerveau(');
  const reste = app.slice(i0);
  const corps = reste.slice(0, reste.search(/\r?\n\}\r?\n/));
  ok(i0 > 0 && corps.length > 500 && corps.length < 6000, 'E: entreesCerveau trouve (' + corps.length + ' octets)');
  ok(!/\bpart\s*:|\bscelle\s*:/.test(corps), 'E: l app ne nourrit ni part ni scelle (sinon ENTREES et cet ecran doivent changer)');
}

/* ══ F. LE CABLAGE DANS APP.HTML ══ */
{
  const app = readFileSync(new URL(process.env.APP_HTML || './app.html', import.meta.url), 'utf8');
  ok(/etat: profilCerveau\.etat \|\| null/.test(app), 'F: fiche — l etat montre est celui du cerveau de la fiche');
  ok(/etat: brainEtat && brainEtat\.c && brainEtat\.c\.adresse === adr \? brainEtat : null/.test(app), 'F: Brain — l etat n est montre que s il est celui de CE block');
  /* game57 #4: the 3D window keeps the target's state (vision.targetState) for "Why" and Take control; Live tiles go through cadreTuile */
  ok(/vision\.targetState = cible\.etat \|\| null/.test(app), 'F: Inside receives this state');
  const i0 = app.indexOf('function peindreInterneVision(');
  const bloc = app.slice(i0, app.indexOf('function peindreVision()', i0)).replace(/\/\*[\s\S]*?\*\//g, '');
  ok(bloc.length > 800 && bloc.length < 6000, 'F: panneau trouve (' + bloc.length + ' octets)');
  ok(i0 > 0 && /interneVision\(cible\.etat\)/.test(bloc), 'F: le panneau lit interne(etat)');
  ok(!/potentiels\s*\[|\.memoire\s*\[|fetch\s*\(|localStorage|sendTransaction|wallet_/.test(bloc), 'F: le panneau ne relit pas l etat a sa facon, ni reseau, ni stockage, ni signature');
  ok(/id="bvInterne"/.test(app) && /id="bvInterneBloc"/.test(app), 'F: le panneau existe');
  ok(/typeof n\.lueur === 'number'[\s\S]{0,200}n\.lueur \* 0\.7/.test(app), 'F: le halo est dessine depuis n.lueur, rien d autre');
}

console.log('test-sens-cerveau-20261026 : ' + n + ' assertions, OK');
