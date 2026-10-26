// test-cerveau-partage-20261026.mjs — game57 #5 : UN cerveau par adresse sur la page, partage par la map, le profil, Brain / le
//   Control panel, la fenetre Brain et Live (Grok Super QA game56, check1-live-unit.png : UNIT ajoute depuis le champ Live disait
//   « no beat yet / not beating on this page » alors que depuis la Map il montrait beat 92).
//   A. cerveaux-page.js : une adresse = UNE instance (creee une fois), un battement par cycle quel que soit le nombre de vues ;
//   B. app.html#liveSourceDe lit CETTE instance (le QA : UNIT bat hors carte, dans le profil — Live le voit) ;
//   C. app.html#battreLive garde l instance partagee en vie pour une tuile Live (aucune seconde instance froide) ;
//   D. les lieux qui creaient chacun leur cerveau (map, profil, Brain) passent par le registre.
// ⛔ EOL-agnostique ; chaque extraction affirme avoir trouve sa fonction.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const P = await import(new URL(process.env.PARTAGE_MODULE || './cerveaux-page.js', import.meta.url).href);
const C = await import(new URL('./cerveau.js', import.meta.url).href);
const L = await import(new URL('./vision-live.js', import.meta.url).href);
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
const FAITS = { vie: 12000, vieAvant: 11000, gm: 1, messages: 0, detenteurs: 1, mort: false, etatVie: 'LUE' };

/* ══ A. LE REGISTRE ══ */
let creations = 0;
const creer = (a) => { creations++; return C.etatInitial(a); };
{
  const R = P.creerCerveauxPage({ creer });
  const e1 = R.etat(UNIT), e2 = R.etat(UNIT.toUpperCase().replace('0X', '0x'));
  ok(e1 && e1 === e2 && creations === 1, 'A: une adresse = une instance, creee une seule fois (casse ignoree)');
  ok(R.etat('pas une adresse') === null, 'A: une adresse illisible n a pas de cerveau');
  /* trois vues battent dans le MEME cycle : un seul pas */
  const a = R.battre(UNIT, FAITS, C.pas, 1, { source: 'carte' });
  const b = R.battre(UNIT, FAITS, C.pas, 1, { source: 'profil' });
  const c = R.battre(UNIT, FAITS, C.pas, 1, { source: 'brain' });
  ok(a.vu.tick === 1 && b.vu === a.vu && c.vu === a.vu && b.deja && c.deja, 'A: trois vues dans un cycle = UN battement');
  R.battre(UNIT, FAITS, C.pas, 2, { source: 'profil' });
  ok(R.lire(UNIT).vu.tick === 2 && R.lire(UNIT).histo.length === 2 && R.lire(UNIT).source === 'profil', 'A: le cycle suivant avance d un seul battement');
  ok(R.etat(UNIT) === R.lire(UNIT).etat && R.etat(UNIT).tick === 2, 'A: l etat rendu est celui qui bat');
  ok(R.lire('0x' + '9'.repeat(40)) === null && creations === 1, 'A: lire ne cree jamais de cerveau');
}

/* ══ B. LIVE LIT L INSTANCE QUI BAT DEJA (le scenario du QA) ══ */
const app = lire('./app.html');
const fonction = (entete) => { const i = app.indexOf(entete); ok(i > 0, 'extraction trouvee : ' + entete); const f = /\n\}/.exec(app.slice(i)); return app.slice(i, i + f.index + 2); };
{
  creations = 0;
  const R = P.creerCerveauxPage({ creer });
  let k = null; for (let i = 1; i <= 92; i++) k = R.battre(UNIT, FAITS, C.pas, i, { source: 'profil', nourritureLue: true });
  ok(k.vu.tick === 92, 'B: UNIT bat dans son profil, beat 92');
  const src = fonction('function liveSourceDe(adr, deja) {');
  /* UNIT hors carte, profil FERME depuis (profilCerveau = null), Brain sur un autre block : seule l instance partagee bat */
  const f = new Function('habitants', 'brainAdr', 'brainHisto', 'brainFaitsVus', 'profilCerveau', 'cerveauxPage', src + '\nreturn liveSourceDe;')(
    [], '0x' + '1'.repeat(40), [], null, null, R);
  const s = f(UNIT, null);
  ok(s && s.vu && s.vu.tick === 92, 'B: Live voit le battement 92 de l instance qui bat deja');
  const live = L.creerLive(); L.ajouterTuile(live, { adr: UNIT, sym: 'UNIT' });
  L.nourrirLive(live, f);
  ok(L.etiquetteTuile(live.tuiles[0]).tick === 92 && L.etiquetteTuile(live.tuiles[0]).humeur !== 'no beat yet', 'B: la tuile UNIT montre beat 92, pas « no beat yet »');
  ok(creations === 1, 'B: aucune seconde instance');
}

/* ══ C. UNE TUILE LIVE GARDE L INSTANCE PARTAGEE EN VIE ══ */
{
  creations = 0;
  const R = P.creerCerveauxPage({ creer });
  for (let i = 1; i <= 5; i++) R.battre(UNIT, FAITS, C.pas, i, { source: 'brain' });
  const srcL = fonction('function liveSourceDe(adr, deja) {');
  const srcB = fonction('function battreLive() {');
  const peints = [];
  const live = L.creerLive(); L.ajouterTuile(live, { adr: UNIT, sym: 'UNIT' });
  const env = { habitants: [], brainAdr: null, brainHisto: [], brainFaitsVus: null, profilCerveau: null, cerveauxPage: R, live,
    liveOuvert: () => true, nourrirLive: L.nourrirLive, peindreTuileLive: (t) => peints.push(t.histo[t.histo.length - 1].tick), liveMesures: new Map(),
    window: {}, cycleBattement: 6, cerveauPas: C.pas, faitsHorsCarte: () => FAITS };
  const noms = Object.keys(env);
  const g = new Function(...noms, srcL + '\n' + srcB + '\nreturn battreLive;')(...noms.map((x) => env[x]));
  g();
  ok(R.lire(UNIT).vu.tick === 6 && peints[0] === 6, 'C: UNIT ne bat nulle part ailleurs — Live fait battre la MEME instance (5 -> 6)');
  ok(creations === 1, 'C: pas de seconde instance froide');
}

/* ══ D. LES TROIS LIEUX QUI CREAIENT LEUR CERVEAU PASSENT PAR LE REGISTRE ══ */
{
  ok(/import \{[^}]*creerCerveauxPage[^}]*\} from '\.\/cerveaux-page\.js';/.test(app), 'D: app.html importe le registre');
  ok(/const cerveauxPage = creerCerveauxPage\(\{ creer: \(a\) => cerveauAvecMemoire\(a\) \}\);/.test(app), 'D: le registre cree depuis la memoire de CE navigateur, une fois');
  const usages = (app.match(/cerveauAvecMemoire\(/g) || []).length;
  ok(usages === 2, 'D: cerveauAvecMemoire n est appele que par le registre (definition + registre), vu ' + usages);
  ok(/cerveau = cerveauxPage\.etat\(c\.jeton\)/.test(app), 'D: la map prend le cerveau partage');
  ok(/profilCerveau = \{ etat: cerveauxPage\.etat\(adr\)/.test(app), 'D: le profil prend le cerveau partage');
  ok(/brainEtat = cerveauxPage\.etat\(adr\)/.test(app), 'D: Brain / Control panel prennent le cerveau partage');
  for (const [nom, motif] of [['map', /const r = cerveauxPage\.battre\(h\.adr, faitsH, cerveauPas, cycleBattement/], ['profil', /const r = cerveauxPage\.battre\(profilCerveau\.adr, fP, cerveauPas, cycleBattement/],
    ['brain', /const r = cerveauxPage\.battre\(brainAdr, fB, cerveauPas, cycleBattement/]]) ok(motif.test(app), 'D: ' + nom + ' bat par le registre (un pas par cycle)');
  ok(/cycleBattement\+\+/.test(fonction('function battre() {')), 'D: chaque battement de page est un cycle');
  ok(lire('./serveur-web.js').includes("'cerveaux-page.js',"), 'D: le module est servi');
}

console.log('test-cerveau-partage-20261026 : ' + n + ' assertions, OK');
