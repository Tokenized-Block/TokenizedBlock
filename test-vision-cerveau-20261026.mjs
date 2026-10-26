// test-vision-cerveau-20261026.mjs — « WHAT ITS BRAIN SEES » NE MONTRE QUE CE QUE LE CERVEAU A RECU, ET SON REJEU EST DETERMINISTE.
//
// Ce que ce banc exige (Phil, 2026-10-26 : un pop-up qui montre ce que le brain voit, et une simulation pour etre dedans) :
//   A. le refactor `forces()` de cerveau.js ne change RIEN : 176 cas x 40 pas = l empreinte mesuree AVANT le refactor (162b383) ;
//   B. `champ()` ne rend que des donnees tenues : sans faits, tout est « not read » ; un absent n est jamais un zero ; une
//      nourriture non lue n est pas « lue » ; un voisin sans humeur n est pas « calm » ; part / scelle sont dits « not fed » ;
//   C. `simuler()` est deterministe (meme graine + memes faits + memes edits = meme empreinte), son rejeu « as read » est
//      EXACTEMENT celui de interactions-cerveaux#rejouer (chemin independant), un edit nul ne change rien, un changement de
//      vie sans marche est refuse, un echange edite ne dure qu UN battement ;
//   D. le cablage dans app.html : chaque faits montre est l objet passe a `pas()`, et le bloc de l ecran ne touche ni au
//      reseau, ni a une signature, ni au stockage.
// Mutants : VISION_MODULE=<copie> ou CERVEAU_MODULE=<copie> (chemins relatifs a ce fichier) font tourner ce banc sur une copie.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

const V = await import(new URL(process.env.VISION_MODULE || './vision-cerveau.js', import.meta.url).href);
const C = await import(new URL(process.env.CERVEAU_MODULE || './cerveau.js', import.meta.url).href);
const { rejouer } = await import(new URL('./interactions-cerveaux.js', import.meta.url).href);
const { champ, simuler, faitsEdites, ENTREES, BATTEMENTS_SIM } = V;
const { etatInitial, pas, empreinte, forces } = C;

/* ══ A. LE REFACTOR EST BIT POUR BIT ══ */
{
  const adrs = [];
  for (let i = 0; i < 16; i++) adrs.push('0x' + empreinte('vision-golden-' + i).slice(2, 42));
  const cas = [
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
  const tout = [];
  for (const a of adrs) for (const f of cas) {
    let e = etatInitial(a); const vus = [];
    for (let t = 0; t < 40; t++) { const r = pas(e, f); e = r.etat; vus.push(r.vu); }
    tout.push(empreinte(JSON.stringify([vus, e.potentiels, e.memoire])));
  }
  ok(tout.length === 176, 'A: 176 cas rejoues');
  /* empreinte mesuree sur cerveau.js de 162b383, AVANT forces() (scratchpad golden-cerveau.mjs, deux executions identiques) */
  eq(empreinte(JSON.stringify(tout)), '0xed4344f6bcf96238c7b3a92df43f5c5940322f308a075eb46c7c9801130997fc', 'A: pas() inchange au bit pres');
  const mort = forces({ vie: 10, etatVie: 'LUE', mort: true });
  ok(mort.termes === null, 'A: un block mort ne recoit AUCUN terme (null, pas des zeros)');
}

const ADR = '0xb2000000000000000000007afa7ed748b0874f27'; /* UNIT, blockrolls-plan.js:42 */
const FAITS = { vie: 12000, vieAvant: 11000, gm: 2, messages: 0, detenteurs: 1, mort: false, etatVie: 'LUE', gmAvant: 2, messagesAvant: 0,
  detenteursAvant: 1, achats: 1, ventes: 0, achatsAvant: 1, ventesAvant: 0, role: 'SENTINELLE', bloc: 53106615 };

/* ══ B. CHAMP : RIEN QUE CE QUI A ETE TENU ══ */
{
  ok(champ({ adr: 'pas une adresse' }) === null, 'B: adresse illisible -> null');
  const vide = champ({ adr: ADR });
  ok(vide.entrees.length === ENTREES.length && vide.entrees.every((e) => e.lu === false), 'B: sans faits, aucune entree n est dite lue');
  ok(vide.entrees.every((e) => e.texte === 'not read' || e.texte === V.TEXTE_SANS_NEURONE), 'B: sans faits, chaque entree dit not read / not fed (part, scelle : lus par aucun neurone)');
  ok(vide.sensations === null && vide.sortie === null && vide.aBattu === false, 'B: sans battement, ni sensations ni sortie');
  ok(!JSON.stringify(vide.entrees.map((e) => e.texte)).match(/\d/), 'B: sans faits, aucun chiffre n apparait dans les entrees');

  const c = champ({ adr: ADR, faits: FAITS, vu: null, nourritureLue: true });
  for (const e of c.entrees) {
    if (!e.lu) continue;
    ok(e.brut === FAITS[e.cle] || (e.cle === 'reveil' && e.brut === false && !('reveil' in FAITS)),
      'B: entree ' + e.cle + ' lue = exactement le fait passe a pas() (' + JSON.stringify(e.brut) + ')');
  }
  ok(c.entrees.find((e) => e.cle === 'role').texte === 'Sentinel', 'B: le role s affiche par son titre anglais, pas sa cle interne');
  ok(c.entrees.filter((e) => e.source === null).map((e) => e.cle).join() === 'part,scelle', 'B: part et scelle sont dits non fournis');

  const sansVie = champ({ adr: ADR, faits: { ...FAITS, vie: null, vieAvant: null }, nourritureLue: true });
  const v = sansVie.entrees.find((e) => e.cle === 'vie');
  ok(v.lu === false && v.texte === 'not read', 'B: une vie absente est « not read », jamais 0');

  const nonLue = champ({ adr: ADR, faits: { ...FAITS, gm: 0, messages: 0, detenteurs: 0 }, nourritureLue: false });
  for (const k of ['gm', 'messages', 'detenteurs', 'mort']) {
    const e = nonLue.entrees.find((x) => x.cle === k);
    ok(e.lu === false && e.parDefaut === true && /default: food not read/.test(e.texte), 'B: ' + k + ' par defaut n est pas dit lu');
  }
  const nonProuvee = champ({ adr: ADR, faits: FAITS, nourritureLue: null });
  ok(nonProuvee.entrees.find((x) => x.cle === 'gm').lu === false, 'B: lecture de nourriture non prouvee (null) = pas lue');

  /* les forces viennent de cerveau.js#forces, a l arrondi pres */
  const f = forces(FAITS).termes;
  for (const t of c.sensations.termes) ok(Math.abs(t.valeur - f[t.cle]) < 1e-4, 'B: terme ' + t.cle + ' = forces() de cerveau.js');

  const ctx = champ({ adr: ADR, faits: FAITS, voisins: [{ adr: '0x' + '1'.repeat(40), sym: 'AAA', phase: null, distance: 12.4, angle: 1 },
    { adr: 'mauvaise', sym: 'X', phase: 'CALME' }, { adr: '0x' + '2'.repeat(40), sym: 'BBB', phase: 'EXCITE', distance: 30, angle: 0 }],
    marche: { dex: 'aero', prixUsd: 1.2 }, echange: { type: 'AUTRE' } });
  ok(ctx.contexte.voisins.length === 2, 'B: un voisin a l adresse illisible est ecarte');
  ok(ctx.contexte.voisins[0].phase === null && ctx.contexte.voisins[0].humeur === 'not judged yet', 'B: un voisin sans humeur n est pas « calm »');
  ok(ctx.contexte.voisins[1].humeur === 'excited', 'B: un voisin avec humeur garde la sienne');
  const nl = champ({ adr: ADR, faits: FAITS, voisins: [{ adr: '0x' + '3'.repeat(40), sym: 'CCC', phase: 'NON_LU', distance: 5, angle: 0 }] });
  ok(nl.contexte.voisins[0].humeur === 'mood not judged', 'B: un voisin dont la lecture a echoue n est pas dit « calm »');
  ok(ctx.contexte.marche.liquiditeUsd === null && ctx.contexte.marche.fdvUsd === null && ctx.contexte.marche.volume24hUsd === null,
    'B: un champ d index absent reste null');
  ok(ctx.contexte.echange === null, 'B: un echange qui n est ni achat ni vente n est pas montre');
  ok(ctx.contexte.nonLus.some((x) => /neighbours/.test(x)), 'B: le champ dit que ses voisins ne sont pas lus par ses neurones');
  const tx = '0x' + 'ab'.repeat(32);
  const ech = champ({ adr: ADR, faits: FAITS, echange: { type: 'VENTE', quantite: '5', devise: 'USDC', tx } }).contexte.echange;
  ok(ech.type === 'sell' && ech.tx === tx, 'B: un echange verifie est rendu tel quel');
}

/* ══ C. SIMULER : DETERMINISTE, LE MEME CERVEAU ══ */
{
  ok(simuler('x', FAITS) === null && simuler(ADR, null) === null, 'C: entrees illisibles -> null');
  const edits = { achats: 3, vieDeltaPct: -20, detenteurs: 2 };
  const s1 = simuler(ADR, FAITS, edits);
  const s2 = simuler(ADR, JSON.parse(JSON.stringify(FAITS)), { ...edits });
  ok(s1.n === BATTEMENTS_SIM && s1.lu.pas.length === BATTEMENTS_SIM, 'C: 24 battements');
  ok(s1.lu.empreinte === s2.lu.empreinte && s1.siEtAlors.empreinte === s2.siEtAlors.empreinte, 'C: meme graine + memes faits = meme empreinte');
  eq(s1, s2, 'C: le rejeu entier est identique');
  ok(/^0x[0-9a-f]{64}$/.test(s1.lu.empreinte), 'C: empreinte keccak de 32 octets');
  ok(s1.siEtAlors.empreinte !== s1.lu.empreinte && s1.premierEcart !== null, 'C: un edit reel change le rejeu');

  const r = rejouer(ADR, FAITS, BATTEMENTS_SIM);
  eq(s1.lu.pas.map((p) => p.indices), r.traces, 'C: « as read » = interactions-cerveaux#rejouer, neurone pour neurone');
  ok(s1.lu.finale === r.phase, 'C: meme phase finale que rejouer()');

  const nul = simuler(ADR, FAITS, {});
  ok(nul.siEtAlors.empreinte !== nul.lu.empreinte ? false : nul.premierEcart === null, 'C: aucun edit = aucun ecart');

  const autres = new Set();
  for (let i = 0; i < 8; i++) autres.add(simuler('0x' + empreinte('autre-' + i).slice(2, 42), FAITS, edits).lu.empreinte);
  ok(autres.size === 8, 'C: huit adresses, huit cerveaux differents pour les memes faits');

  const sansMarche = { gm: 1, etatVie: 'NON_TROUVEE' };
  const sm = simuler(ADR, sansMarche, { vieDeltaPct: 50 });
  ok(sm.refus.length === 1 && /needs a market/.test(sm.refus[0]), 'C: changer la vie d un block sans marche est refuse');
  ok(sm.siEtAlors.empreinte === sm.lu.empreinte, 'C: un edit refuse ne change rien');

  /* un echange edite ne dure qu UN battement (front montant de l app) : au battement 0 seulement */
  const fe = faitsEdites(FAITS, { achats: 2 }, { echangeAuBattement: true }).faits;
  const fs = faitsEdites(FAITS, { achats: 2 }, { echangeAuBattement: false }).faits;
  ok(fe.achats === FAITS.achats + 2 && fe.achatsAvant === FAITS.achatsAvant, 'C: au battement de l echange, 2 achats nouveaux');
  ok(fs.achats === FAITS.achats && fs.achatsAvant === FAITS.achatsAvant, 'C: hors de ce battement, aucun achat invente');
  let e = etatInitial(ADR); const manuels = [];
  for (let i = 0; i < BATTEMENTS_SIM; i++) { const x = pas(e, i === 1 ? fe : fs); e = x.etat; manuels.push(x.vu.indices); }
  eq(simuler(ADR, FAITS, { achats: 2 }, BATTEMENTS_SIM, 1).siEtAlors.pas.map((p) => p.indices), manuels, 'C: what-if = pas() deroule a la main');
  const fv = faitsEdites(FAITS, { vieDeltaPct: 10 }).faits;
  ok(fv.vieAvant === FAITS.vie && Math.abs(fv.vie - FAITS.vie * 1.1) < 1e-9, 'C: +10 % de vie part de la vie lue');
  ok(faitsEdites(FAITS, { achats: 999 }, { echangeAuBattement: true }).faits.achats === FAITS.achats + 10, 'C: les edits sont bornes');

  const src = readFileSync(new URL(process.env.VISION_MODULE || './vision-cerveau.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok(!/Math\.random|Date\.now|new Date|performance\.now|fetch\s*\(|localStorage|document\.|window\./.test(src), 'C: vision-cerveau.js est pur (ni horloge, ni hasard, ni reseau, ni DOM)');
}

/* ══ D. LE CABLAGE DANS APP.HTML ══ */
{
  const app = readFileSync(new URL(process.env.APP_HTML || './app.html', import.meta.url), 'utf8');
  /* game57 #5 : les trois vues font battre L instance partagee (cerveaux-page.js#battre, qui appelle pas() avec ces faits) ;
   *   deja battue dans le cycle, les faits gardes sont ceux que l instance a REELLEMENT recus (lire().faits) */
  ok(/const r = cerveauxPage\.battre\(h\.adr, faitsH, cerveauPas, cycleBattement[^\n]*\n[\s\S]{0,300}h\.faitsVus = faitsH;/.test(app), 'D: map — les faits gardes sont ceux passes a pas()');
  ok(/const r = cerveauxPage\.battre\(profilCerveau\.adr, fP, cerveauPas, cycleBattement[\s\S]{0,500}profilCerveau\.faits = r\.deja \? \(cerveauxPage\.lire\(profilCerveau\.adr\) \|\| \{\}\)\.faits \|\| fP : fP;/.test(app), 'D: fiche — idem');
  ok(/const r = cerveauxPage\.battre\(brainAdr, fB, cerveauPas, cycleBattement[\s\S]{0,700}brainFaitsVus = dj \? \{ adr: dj\.adr, faits: dj\.faits[^}]*\} : \{ adr: [^}]*faits: fB/.test(app), 'D: onglet Brain — idem');
  const debut = app.indexOf('/* ══ BRAIN VISION (2026-10-26)');
  const fin = app.indexOf('function dessinerRasterSur(c, histoTout)');
  ok(debut > 0 && fin > debut, 'D: le bloc de l ecran est trouve');
  const bloc = app.slice(debut, fin).replace(/\/\*[\s\S]*?\*\//g, '');
  ok(bloc.length > 3000, 'D: le bloc n est pas vide (' + bloc.length + ' octets)');
  ok(!/fetch\s*\(|\brpc\s*\(|getLogs|eth_|sendTransaction|wallet_|bcSigner|localStorage\.setItem|lireJson\s*\(/.test(bloc),
    'D: l ecran ne lit pas le reseau, ne signe rien, n ecrit aucun stockage');
  ok(/id="bVision"/.test(app) && /id="pcVision"/.test(app) && /<dialog class="bvPop" id="bvPop"/.test(app), 'D: deux boutons et le pop-up existent');
}

console.log('test-vision-cerveau-20261026 : ' + n + ' assertions, OK');
