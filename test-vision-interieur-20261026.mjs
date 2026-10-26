// test-vision-interieur-20261026.mjs — « INSIDE ITS BRAIN » : LA VUE A LA PREMIERE PERSONNE NE MONTRE QUE CE QUE LE CERVEAU A RECU OU DECIDE.
//
// Ce que ce banc exige (Phil, 2026-10-26 : « etre dans le brain », vue depuis le block, et une facon de lui parler) :
//   A. un cadre ne vient QUE de donnees tenues : neurones allumes = `vu.indices` du battement, rien de plus ; une source n est lue
//      que si champ() la dit lue ; une impulsion n arrive que si le battement enregistre la porte ; un voisin n est jamais lu ;
//      ce qu une source apporte = forces() de cerveau.js avec et sans elle ;
//   B. rejeu deterministe : memes battements + memes faits = meme empreinte de cadre ; le mouvement reduit change `anime`, pas le contenu ;
//   C. « talk to it » : le cablage est celui de connectome(adresse), l effet est celui de pas() deroule a la main, un refus se dit ;
//   D. app.html : les deux vues restent (Inside / Outside), le chemin prefers-reduced-motion existe, l ecran ne touche pas au reseau.
// Mutants : VISION_MODULE=<copie> (chemin relatif a ce fichier) fait tourner ce banc sur une copie.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

const V = await import(new URL(process.env.VISION_MODULE || './vision-cerveau.js', import.meta.url).href);
const C = await import(new URL('./cerveau.js', import.meta.url).href);
const { champ, cadreInterieur, parler, cablageCapteurs, ENTREES, SOURCES_INTERIEUR, PAROLES } = V;
const { etatInitial, pas, forces, connectome, empreinte, CAPTEURS, NEURONES } = C;

const ADR = '0xb2000000000000000000007afa7ed748b0874f27'; /* UNIT, blockrolls-plan.js:42 */
const FAITS = { vie: 12000, vieAvant: 11000, gm: 3, messages: 1, detenteurs: 1, mort: false, etatVie: 'LUE', gmAvant: 2, messagesAvant: 0,
  detenteursAvant: 1, achats: 2, ventes: 0, achatsAvant: 1, ventesAvant: 0, role: 'SENTINELLE', bloc: 53106615 };
const derouler = (adr, faitsDuPas, k) => { let e = etatInitial(adr); const h = []; for (let i = 0; i < k; i++) { const r = pas(e, faitsDuPas(i)); e = r.etat; h.push(r.vu); } return h; };
/* des battements VARIES : le compteur de buys monte un battement sur trois, la vie bouge — comme une page vivante */
const varie = (i) => ({ ...FAITS, achats: 1 + Math.floor((i + 1) / 3), achatsAvant: 1 + Math.floor(i / 3), vie: 12000 + (i % 5) * 300, vieAvant: 12000 + ((i + 4) % 5) * 300 });
const HISTO = derouler(ADR, varie, 30);
const VOISINS = [{ adr: '0x' + '1'.repeat(40), sym: 'AAA', phase: 'CALME', distance: 10, angle: 0.3 },
  { adr: '0x' + '2'.repeat(40), sym: 'BBB', phase: null, distance: 40, angle: 3.0 }, { adr: '0x' + '3'.repeat(40), sym: 'CCC', phase: 'EXCITE', distance: 25, angle: -1.4 }];
const champDe = (faits, nl = true) => champ({ adr: ADR, faits, vu: HISTO[HISTO.length - 1], voisins: VOISINS, nourritureLue: nl });
const total = (f) => { const t = forces(f).termes; return t === null ? null : t.reveil + t.base + t.delta + t.nourriture + t.nouveau; };

/* ══ A. RIEN QUE CE QUI A ETE RECU OU DECIDE ══ */
{
  const c = champDe(FAITS);
  let arrivees = 0;
  for (let i = 0; i < HISTO.length; i++) {
    const k = cadreInterieur({ c, faits: FAITS, histo: HISTO, i, capMap: 0.1 });
    const vrais = [...HISTO[i].indices].sort((a, b) => a - b);
    eq(k.allumes, vrais, 'A: battement ' + i + ' — neurones allumes = vu.indices, exactement');
    const on = [...k.capteurs, ...k.neurones].filter((x) => x.on).map((x) => x.n).sort((a, b) => a - b);
    eq(on, vrais, 'A: battement ' + i + ' — chaque point allume est un indice de ce battement');
    ok(k.capteurs.length === CAPTEURS && k.neurones.length === NEURONES - CAPTEURS
      && new Set([...k.capteurs, ...k.neurones].map((x) => x.n)).size === NEURONES, 'A: 16 capteurs + 112 neurones, chacun une fois');
    ok(k.tick === HISTO[i].tick && k.phase === HISTO[i].phase && k.virage === HISTO[i].virage && k.vitesse === HISTO[i].vitesse, 'A: tick, humeur, virage, vitesse = le battement');
    for (const s of k.sources) {
      const nv = HISTO[i].nouveaux[s.cle];
      if (s.arrive) { arrivees++; ok(s.lu && nv > 0 && s.arrive === nv, 'A: une impulsion ' + s.cle + ' = vu.nouveaux de ce battement'); }
      else ok(!(s.lu && s.cle !== 'vie' && s.cle !== 'reveil' && nv > 0), 'A: un nouveau enregistre (' + s.cle + ') n est pas tu');
    }
    /* le sol : la somme EXACTE des virages et vitesses enregistres */
    let cap = 0, d = 0; for (let j = 0; j <= i; j++) { cap += HISTO[j].virage * 0.7; d += HISTO[j].vitesse; }
    ok(Math.abs(k.sol.rotation - (-cap * 180) / Math.PI) < 0.01, 'A: battement ' + i + ' — le sol tourne de son cap enregistre');
    ok(Math.abs(k.sol.decalage - ((d * 40) % 40)) < 0.01, 'A: battement ' + i + ' — le sol defile de sa vitesse enregistree');
  }
  ok(arrivees >= 5, 'A: le banc voit des impulsions reelles arriver (' + arrivees + ') — il ne teste pas que le silence');

  const k = cadreInterieur({ c, faits: FAITS, histo: HISTO, i: 10, capMap: 0.1 });
  eq(k.sources.map((s) => s.cle), SOURCES_INTERIEUR.map((s) => s.cle), 'A: les sources sont exactement la liste declaree');
  ok(k.sources.every((s) => ENTREES.some((e) => e.cle === s.cle)), 'A: chaque source est une entree que courant() lit');
  for (const s of k.sources) {
    const e = c.entrees.find((x) => x.cle === s.cle);
    ok(s.lu === e.lu && s.source === e.source, 'A: source ' + s.cle + ' lue ssi champ() la dit lue, avec sa source');
    ok(!s.signal || (s.lu && s.apport !== 0), 'A: un signal ' + s.cle + ' n existe que lu et non nul');
  }
  ok(Math.abs(k.sources[0].apport - (total(FAITS) - total({ ...FAITS, vie: null, vieAvant: null }))) < 1e-4, 'A: la vie apporte forces(avec) − forces(sans)');
  ok(Math.abs(k.sources[1].apport - (total(FAITS) - total({ ...FAITS, gm: 0, gmAvant: 0 }))) < 1e-4, 'A: les transferts apportent forces(avec) − forces(sans)');
  ok(k.sources.find((s) => s.cle === 'ventes').signal === false, 'A: zero vente nouvelle = aucun signal de vente');

  /* sans faits : rien n est dit lu, rien n arrive */
  const vide = cadreInterieur({ c: champ({ adr: ADR }), faits: null, histo: HISTO, i: 5, capMap: 0.1 });
  ok(vide.sources.every((s) => !s.lu && !s.signal && !s.arrive && s.apport === null && s.texte === 'not read'), 'A: sans faits, chaque source est « not read », sans signal');
  /* nourriture non lue : ses compteurs ne sont pas des signaux */
  const nl = cadreInterieur({ c: champDe(FAITS, false), faits: FAITS, histo: HISTO, i: 5, capMap: 0.1 });
  for (const cle of ['gm', 'messages', 'detenteurs']) {
    const s = nl.sources.find((x) => x.cle === cle);
    ok(!s.lu && !s.signal && !s.arrive && s.texte === 'not read yet', 'A: ' + cle + ' par defaut (nourriture non lue) ne porte aucun signal');
  }
  /* sans vie : pas de « rising / falling » invente */
  const sv = cadreInterieur({ c: champDe({ ...FAITS, vie: null, vieAvant: null }), faits: { ...FAITS, vie: null, vieAvant: null }, histo: HISTO, i: 5, capMap: 0.1 });
  ok(sv.sources[0].lu === false && sv.sources[0].sens === null && !sv.sources[0].signal, 'A: une vie non lue ne monte ni ne descend');
  /* mort : aucun courant */
  const fm = { ...FAITS, mort: true };
  const km = cadreInterieur({ c: champDe(fm), faits: fm, histo: HISTO, i: 5, capMap: 0.1 });
  ok(km.mort === true && km.sources.every((s) => !s.signal && !s.arrive), 'A: un block mort ne recoit aucun signal');
  /* voisins : jamais lus ; sans cap, aucune direction */
  ok(k.voisins.length === 3 && k.voisins.every((v) => v.lu === false && v.note === 'not read by its neurons'), 'A: chaque voisin est « not read by its neurons »');
  ok(k.voisins[0].ou === 'ahead' && k.voisins[1].ou === 'behind' && k.voisins[2].ou === 'left', 'A: les voisins sont places par leur direction reelle (devant, derriere, a gauche)');
  ok(!k.sources.some((s) => VOISINS.some((v) => v.adr === s.cle)), 'A: aucun voisin n est une source');
  const sansCap = cadreInterieur({ c, faits: FAITS, histo: HISTO, i: 5, capMap: null });
  ok(sansCap.voisins.every((v) => v.ou === 'unknown' && v.rel === null), 'A: sans cap lu, aucune direction n est inventee');
  /* pas de battement : rien n est allume */
  const sb = cadreInterieur({ c, faits: FAITS, histo: [], i: -1, capMap: 0.1 });
  ok(sb.allumes.length === 0 && sb.tick === null && sb.capteurs.every((x) => !x.on) && sb.sources.every((s) => !s.arrive), 'A: sans battement, aucun neurone allume');
  ok(cadreInterieur({ c: null }) === null, 'A: sans champ, pas de cadre');
}

/* ══ B. DETERMINISTE ══ */
{
  const c = champDe(FAITS);
  const a = cadreInterieur({ c, faits: FAITS, histo: HISTO, i: 12, capMap: 0.1 });
  const b = cadreInterieur({ c: JSON.parse(JSON.stringify(c)), faits: JSON.parse(JSON.stringify(FAITS)), histo: JSON.parse(JSON.stringify(HISTO)), i: 12, capMap: 0.1 });
  ok(/^0x[0-9a-f]{64}$/.test(a.empreinte), 'B: empreinte keccak de 32 octets');
  eq(a, b, 'B: memes battements + memes faits = meme cadre, champ pour champ');
  /* rejeu independant : les memes battements regeneres depuis la graine donnent la meme empreinte */
  const H2 = derouler(ADR, varie, 30);
  ok(cadreInterieur({ c, faits: FAITS, histo: H2, i: 12, capMap: 0.1 }).empreinte === a.empreinte, 'B: battements rejoues depuis la graine = meme empreinte');
  const empreintes = new Set(); for (let i = 0; i < HISTO.length; i++) empreintes.add(cadreInterieur({ c, faits: FAITS, histo: HISTO, i, capMap: 0.1 }).empreinte);
  ok(empreintes.size === HISTO.length, 'B: chaque battement a son propre cadre (' + empreintes.size + ')');
  const r = cadreInterieur({ c, faits: FAITS, histo: HISTO, i: 12, capMap: 0.1, reduit: true });
  ok(a.anime === true && r.anime === false, 'B: mouvement reduit = aucun mouvement');
  ok(r.empreinte === a.empreinte, 'B: le mouvement reduit ne change pas le contenu du cadre');
  const autre = '0x' + empreinte('autre-inside').slice(2, 42);
  const Ha = derouler(autre, varie, 30);
  ok(cadreInterieur({ c: champ({ adr: autre, faits: FAITS, vu: Ha[29], nourritureLue: true }), faits: FAITS, histo: Ha, i: 12, capMap: 0.1 }).empreinte !== a.empreinte,
    'B: un autre block, un autre cadre');
  eq(parler(ADR, FAITS, 'achats'), parler(ADR, JSON.parse(JSON.stringify(FAITS)), 'achats'), 'B: parler() est deterministe');
}

/* ══ C. « TALK TO IT » : LE VRAI CABLAGE, LE VRAI REJEU ══ */
{
  ok(parler(ADR, FAITS, 'inconnu') === null && parler('x', FAITS, 'achats') === null && parler(ADR, null, 'achats') === null, 'C: entree inconnue -> null');
  const co = connectome(ADR);
  const attendu = new Map();
  for (let s = 0; s < CAPTEURS; s++) for (const l of co.liens[s]) attendu.set(l.vers, Math.round(((attendu.get(l.vers) || 0) + l.poids) * 100) / 100);
  const w = cablageCapteurs(ADR);
  eq(w.cibles, [...attendu.entries()].map(([vers, poids]) => ({ vers, poids })).sort((a, b) => a.vers - b.vers), 'C: le cablage = les liens sortants des 16 capteurs dans connectome()');
  ok(w.cablage === co.empreinte && w.liens === 128, 'C: 16 capteurs x 8 liens, empreinte du cablage');
  /* ⛔ DEUX BLOCKS : FAITS sature ses 16 capteurs a chaque battement (rien ne change, et c est la vraie reponse) ; CALME est un
   *    petit marche sans activite, ou une entree de plus fait vraiment tirer des neurones. Sans CALME, ce banc ne comparerait
   *    que des listes vides et passerait sur un parler() qui ne calcule rien. */
  const CALME = { vie: 50, vieAvant: 50, etatVie: 'LUE', gm: 0, gmAvant: 0, messages: 0, messagesAvant: 0, detenteurs: 0, detenteursAvant: 0,
    achats: 0, achatsAvant: 0, ventes: 0, ventesAvant: 0 };
  let nonVides = 0, vides = 0;
  for (const F of [FAITS, CALME]) for (const cle of Object.keys(PAROLES)) {
    const p = parler(ADR, F, cle, 1);
    /* l effet, deroule A LA MAIN avec pas() : sans et avec l entree */
    const ed = cle === 'vieDeltaPct' ? { ...F, vieAvant: F.vie, vie: F.vie * 1.1 } : null;
    const garde = (k) => ({ ...F, [k]: F[k] + 1, [k + 'Avant']: F[k + 'Avant'] });
    const avecDe = (i) => (cle === 'vieDeltaPct' ? ed : cle === 'achats' || cle === 'ventes' ? (i === 1 ? garde(cle) : F) : garde(cle));
    const sans = derouler(ADR, () => F, 3), avec = derouler(ADR, avecDe, 3);
    const arr = cle === 'achats' || cle === 'ventes' ? 1 : 0;
    const diff = (k) => ({ plus: avec[k].indices.filter((x) => !sans[k].indices.includes(x)).sort((a, b) => a - b), moins: sans[k].indices.filter((x) => !avec[k].indices.includes(x)).sort((a, b) => a - b) });
    eq([p.arrivee.allumes, p.arrivee.eteints], [diff(arr).plus, diff(arr).moins], 'C: ' + cle + ' — battement d arrivee = pas() deroule a la main');
    eq([p.suivant.allumes, p.suivant.eteints], [diff(arr + 1).plus, diff(arr + 1).moins], 'C: ' + cle + ' — battement suivant = pas() deroule a la main');
    ok(p.arrivee.phaseAvec === avec[arr].phase && p.arrivee.phaseSans === sans[arr].phase, 'C: ' + cle + ' — humeurs avec / sans = pas()');
    if (p.arrivee.allumes.length + p.arrivee.eteints.length + p.suivant.allumes.length + p.suivant.eteints.length) nonVides++; else vides++;
  }
  ok(nonVides >= 4 && vides >= 1, 'C: le banc voit des reponses reelles (' + nonVides + ') ET des « no neuron changed » (' + vides + ')');
  const sm = parler(ADR, { gm: 1, etatVie: 'NON_TROUVEE' }, 'vieDeltaPct');
  ok(sm.refus.length === 1 && sm.arrivee.allumes.length === 0 && sm.arrivee.eteints.length === 0, 'C: une vie sans marche est refusee, et rien ne change');
  const mort = parler(ADR, { ...FAITS, mort: true }, 'achats');
  ok(mort.arrivee.allumes.length === 0 && mort.suivant.allumes.length === 0, 'C: un block mort ne repond rien');
  const src = readFileSync(new URL(process.env.VISION_MODULE || './vision-cerveau.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok(!/Math\.random|Date\.now|new Date|performance\.now|fetch\s*\(|localStorage|document\.|window\./.test(src), 'C: vision-cerveau.js reste pur');
}

/* ══ D. APP.HTML : DEUX VUES, MOUVEMENT REDUIT, AUCUN RESEAU ══ */
{
  const app = readFileSync(new URL(process.env.APP_HTML || './app.html', import.meta.url), 'utf8');
  ok(/id="bvVueDedans"[^>]*>Inside</.test(app) && /id="bvVueDehors"[^>]*>Outside</.test(app), 'D: le bouton Inside / Outside existe');
  const debut = app.indexOf('/* ══ BRAIN VISION (2026-10-26)');
  const fin = app.indexOf('function dessinerRasterSur(c, histoTout)');
  const bloc = app.slice(debut, fin).replace(/\/\*[\s\S]*?\*\//g, '');
  ok(debut > 0 && fin > debut && bloc.length > 5000, 'D: le bloc de l ecran est trouve');
  /* game57 #4 (« View inside the brain ») : le schema plat Inside / Outside de la fenetre est REMPLACE par la scene 3D (bvPaint3D) ;
   *   peindreInterieur reste le dessin des tuiles Live. test-vision-inside-20261026.mjs couvre la scene. */
  ok(/function bvPaint3D\(t\)/.test(bloc) && !/function peindreChampVision\(/.test(bloc), 'D: Inside / Outside sont la scene 3D, le schema plat est retire');
  ok(/reduit: bvReduit\(\)/.test(bloc) && /if \(bvReduit\(\)\) vision\.jouer = false;/.test(bloc), 'D: prefers-reduced-motion — cadre fixe, lecture en pause');
  ok(/@media \(prefers-reduced-motion:no-preference\)\{\s*#bvChamp \.bviGlisse\{animation/.test(app), 'D: les animations Inside ne vivent que sans mouvement reduit');
  ok(/k\.anime \? bvSvg\('g', \{ class: 'bviSol bviGlisse'/.test(bloc) && /if \(s\.arrive && k\.anime\)/.test(bloc), 'D: aucun mouvement quand le cadre n est pas anime');
  ok(!/fetch\s*\(|\brpc\s*\(|getLogs|eth_|sendTransaction|wallet_|bcSigner|localStorage\.setItem|lireJson\s*\(/.test(bloc), 'D: ni reseau, ni signature, ni stockage');
  /* le dessin ne fabrique pas de neurone : il ne parcourt que ceux du cadre, et « talk » ne fait que marquer */
  const pi = bloc.slice(bloc.indexOf('function peindreInterieur'), bloc.indexOf('function peindreParleVision'));
  ok(/for \(const n of k\.neurones\)/.test(pi) && /for \(const n of k\.capteurs\)/.test(pi) && !/Math\.random/.test(pi), 'D: le dessin ne parcourt que les neurones du cadre');
  ok((pi.match(/class: 'bvN/g) || []).length === 2, 'D: exactement deux sortes de points-neurones (capteurs, autres)');
}

console.log('test-vision-interieur-20261026 : ' + n + ' assertions, OK');
