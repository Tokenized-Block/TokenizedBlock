/* test-slots-app-20261023.mjs — le cablage des SLOTS dans l app et le serveur (lecture de app.html et serveur-web.js ; pas un navigateur).
 * AFFIRME : (1) sans contrat servi rien ne se montre (carte et tuile cachees dans le HTML ET par peindreSlots) ; aucun bouton desactive en dur ;
 *   Spin cache sans wallet, Settle cache sans spin reglable ; (2) chaque chiffre de la carte vient de /api/slots (la fiche) ou d un calcul
 *   (loi exacte, fenetre en blocs) — aucun prix tape ; une lecture ratee dit « not read » ; (3) les spins en attente sont relus sur la chaine
 *   par une fenetre BORNEE (debutFenetreSpins) et rien n est garde dans le navigateur ; (4) Spin = planSpin (approve EXACT), Settle =
 *   planSettleMany des spins reglables RELUS juste avant ; tout passe par envoyerAppels ; (5) les trois faces sont dessinees par logoSvg depuis
 *   les graines du contrat (Slots.graine) ; (6) le serveur sert les 4 fichiers, importe la fiche, rend PAS_OUVERT sans adresse, et ne tape
 *   aucun prix ; (7) etatSpins : un statut non lu donne NON_LU, jamais « reglable ». Chaque verification est rejouee sur une copie MUTEE en
 *   memoire et doit alors rendre faux. NE PROUVE PAS : le rendu (verifie au navigateur), un spin reel. */
import { readFileSync } from 'node:fs';
import * as S from './slots-plan.js';
import { SLOTS_DEPLOIEMENT as D } from './slots-deploiement.js';

let n = 0;
const vu = (c, m) => { if (!c) { console.error('KO ' + m); process.exit(1); } n++; };
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('app.html'), SRV = lire('serveur-web.js');
const entre = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };
const bloc = (t) => entre(t, '/* ══ LES SLOTS (Phil 2026-10-23', '/* ══ EARN (Phil 19:40)');
const carteHtml = (t) => entre(t, '<div class="carte" id="slotsCarte"', '<!-- EARN');

const checks = {
  carteCachee: (t) => /<div class="carte" id="slotsCarte" hidden>/.test(t) && /id="jbSlotsTuile"[^>]*\bhidden>/.test(t) && t.split('id="slotsCarte"').length === 2,
  cacheeSansContrat: (t) => /carte\.hidden = !on; if \(tuile\) tuile\.hidden = !on;/.test(bloc(t)) && /if \(!on\) return null;/.test(bloc(t)),
  aucunBoutonMort: (t) => { const c = carteHtml(t); return c.length > 500 && !/<button[^>]*\bdisabled\b/.test(c) && /<button type="button" class="bouton" id="slotsSpin" hidden>/.test(c) && /id="slotsRegler" hidden>/.test(c); },
  spinCacheSansWallet: (t) => /bS\.hidden = !moi;/.test(bloc(t)),
  settleSeulementReglable: (t) => /bR\.hidden = reglables\.length === 0;/.test(bloc(t)) && /if \(enAttente === null\) \{ bR\.hidden = true;/.test(bloc(t)),
  chiffresServis: (t) => { const b = bloc(t).replace(/\/\*[\s\S]*?\*\//g, ''); return /const prix = BigInt\(j\.prixSpin\), table = j\.prizes\.map/.test(b) && /usdcTexte\(BigInt\(j\.esperanceBrut\)\)/.test(b) && /ev = Slots\.esperance\(table, prix\)/.test(b)
    && !/\b(500000|250000|0\.50|0\.15|1000)\b/.test(b) && /Slots\.secondesFenetre\(2000\)/.test(b) && /Slots\.secondesFenetre\(200\)/.test(b); },
  nonLu: (t) => { const b = bloc(t); return (b.match(/pot === null \? 'not read'/g) || []).length === 2 && /pts === null \? 'not read'/.test(b) && /gagne === null \? 'not read'/.test(b) && /Your pending spins could not be read just now\./.test(b); },
  fenetreBornee: (t) => /de: Slots\.debutFenetreSpins\(tete, j\.bloc\), jusqua: tete/.test(bloc(t)) && !/localStorage|sessionStorage|indexedDB/.test(bloc(t)),
  spinExact: (t) => /plan = Slots\.planSpin\(\{ contrat, usdc: USDC_BASE, spinPrice: BigInt\(j\.prixSpin\) \}\)/.test(bloc(t)),
  /* v2 (R2) : la tete est relue juste avant, seuls les spins reglables A CETTE TETE partent (sans repeindre la carte, test-slots-v2) */
  settleRelu: (t) => { const b = bloc(t); const i = b.indexOf("const tete = parseInt(await rpc('eth_blockNumber', []), 16);"), k = b.indexOf("Slots.etatReglement(x.t, tete) })).filter((x) => x.etat === 'REGLABLE')"), m = b.indexOf('plan = Slots.planSettleMany({ contrat, spinIds: aRegler.map((x) => x.id) });'); return i > 0 && k > i && m > k; },
  envoiUnique: (t) => { const b = bloc(t).replace(/\/\*[\s\S]*?\*\//g, ''); return (b.match(/envoyerAppels\(/g) || []).length === 1 && !/eth_sendTransaction|envoyerDepuisWallet|wallet_sendCalls/.test(b); },
  facesDuContrat: (t) => /faceRevelee\(Slots\.graine\(hashes\[r\], spinId, r\)\)/.test(bloc(t)) && /logoSvg\(paramsLogoDepuisApparence\(f, String\(r \+ 1\)\)\)/.test(bloc(t)) && /Slots\.facesDuSpin\(hashes, spinId\)/.test(bloc(t)),
  importServi: (t) => /^import \* as Slots from '\.\/slots-plan\.js';$/m.test(t),
  bandeauTelephone: (t) => /@media \(max-width:520px\)\{\.jeuBandeau\[data-slots="1"\]\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}\}/.test(t),
};
for (const [k, f] of Object.entries(checks)) vu(f(APP) === true, 'app.html : ' + k);
const mutants = [
  ['carteCachee', '<div class="carte" id="slotsCarte" hidden>', '<div class="carte" id="slotsCarte">'],
  ['cacheeSansContrat', 'carte.hidden = !on; if (tuile) tuile.hidden = !on;', 'carte.hidden = false; if (tuile) tuile.hidden = false;'],
  ['aucunBoutonMort', '<button type="button" class="bouton" id="slotsSpin" hidden>', '<button type="button" class="bouton" id="slotsSpin" disabled>'],
  ['spinCacheSansWallet', 'bS.hidden = !moi;', 'bS.hidden = false;'],
  ['settleSeulementReglable', 'bR.hidden = reglables.length === 0;', 'bR.hidden = false;'],
  ['chiffresServis', "usdcTexte(BigInt(j.esperanceBrut)) + ' USDC — less", "'0.15 USDC — less"],
  ['nonLu', "pot === null ? 'not read' : usdcTexte(pot) + ' USDC') + '. Connect", "usdcTexte(pot || 0n) + ' USDC') + '. Connect"],
  ['fenetreBornee', 'de: Slots.debutFenetreSpins(tete, j.bloc), jusqua: tete', 'de: j.bloc, jusqua: tete'],
  ['spinExact', 'plan = Slots.planSpin({ contrat, usdc: USDC_BASE, spinPrice: BigInt(j.prixSpin) });', 'plan = Slots.planSpins({ contrat, usdc: USDC_BASE, n: 1, spinPrice: 2n ** 255n });'],
  ['settleRelu', "Slots.etatReglement(x.t, tete) })).filter((x) => x.etat === 'REGLABLE')", "{ etat: 'REGLABLE' } }))"],
  ['envoiUnique', 'const r = await envoyerAppels(plan.appels, c);\n    if (!r || r.etat !== \'CONFIRME\') { dit(phraseNonConfirme(r, quoi', 'const r = await envoyerDepuisWallet(plan.appels, c);\n    if (!r || r.etat !== \'CONFIRME\') { dit(phraseNonConfirme(r, quoi'],
  ['facesDuContrat', 'faceRevelee(Slots.graine(hashes[r], spinId, r))', 'faceRevelee(Slots.graine(hashes[0], spinId, r))'],
  ['bandeauTelephone', '@media (max-width:520px){.jeuBandeau[data-slots="1"]{grid-template-columns:repeat(2,minmax(0,1fr))}}', ''],
];
/* un motif unique dans la page est mute dans la page ; un motif partage avec les duels (meme phrase) est mute DANS le bloc des slots seulement */
for (const [k, de, vers] of mutants) {
  const b = bloc(APP), dansPage = APP.split(de).length === 2, dansBloc = b.split(de).length === 2;
  vu(dansPage || dansBloc, 'mutant ' + k + ' : le motif existe une fois (page ou bloc des slots)');
  const mute = dansPage ? APP.replace(de, () => vers) : APP.replace(b, () => b.replace(de, () => vers));
  vu(checks[k](mute) === false, 'MUTANT ' + k + ' : la verification ROUGIT');
}

/* le serveur */
const route = (t) => entre(t, "if (chemin === '/api/slots') {", '/* ══ LES DUELS (2026-10-18)');
const srvChecks = {
  servi: (t) => { const s = (t.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/) || [])[1] || ''; return ['deployer-slots.html', 'slots-deploiement.js', 'slots-config.js', 'slots-plan.js'].every((f) => s.includes("'" + f + "'")); },
  ficheImportee: (t) => /^import \{ SLOTS_DEPLOIEMENT \} from '\.\/slots-deploiement\.js';$/m.test(t),
  pasOuvertSansAdresse: (t) => { const r = route(t); const i = r.indexOf("if (!contratSlots) { rendreS({ ok: false, etat: 'PAS_OUVERT' }); return; }"), j = r.indexOf("etat: 'OUVERT'"); return i > 0 && j > i && /Number\.isSafeInteger\(SLOTS_DEPLOIEMENT\.bloc\)/.test(r); },
  aucunPrixTape: (t) => { const r = route(t); return /prixSpin: String\(sc\.spinPrice\)/.test(r) && /prizes: sc\.prizes\.map\(String\)/.test(r) && !/\b(500000|5000|250000)\b/.test(r) && !/eth_|rpc/.test(r); },
  getSeulement: (t) => /if \(req\.method !== 'GET' && req\.method !== 'HEAD'\) \{ res\.writeHead\(405[^\n]*GET only/.test(route(t)),
};
for (const [k, f] of Object.entries(srvChecks)) vu(f(SRV) === true, 'serveur : ' + k);
const srvMutants = [
  ['servi', "'deployer-slots.html', 'slots-deploiement.js', 'slots-config.js', 'slots-plan.js',", "'deployer-slots.html', 'slots-deploiement.js', 'slots-config.js',"],
  ['pasOuvertSansAdresse', "if (!contratSlots) { rendreS({ ok: false, etat: 'PAS_OUVERT' }); return; }", ''],
  ['aucunPrixTape', 'prixSpin: String(sc.spinPrice)', "prixSpin: '500000'"],
];
for (const [k, de, vers] of srvMutants) {
  vu(SRV.split(de).length === 2, 'mutant serveur ' + k + ' : le motif existe une fois');
  vu(srvChecks[k](SRV.replace(de, () => vers)) === false, 'MUTANT serveur ' + k + ' : la verification ROUGIT');
}
/* la fiche d aujourd hui : rien de deploye -> /api/slots rend PAS_OUVERT -> carte cachee */
vu(D.adresse === null && D.bloc === null, 'fiche : adresse et bloc nuls (pas deploye) -> PAS_OUVERT, aucun bouton Slots');

/* (7) etatSpins, pur */
const spuns = [{ spinId: 1n, targetBlock: 100 }, { spinId: 2n, targetBlock: 100 }, { spinId: 3n, targetBlock: 100 }, { spinId: 4n, targetBlock: 300 }];
const e = S.etatSpins({ spuns, statuts: new Map([['1', 1], ['2', 2], ['3', null], ['4', 1]]), tete: 200 });
vu(e.length === 3 && e[0].id === '1' && e[0].etat === 'REGLABLE' && e[0].blocsRestants === 156 && e[1].id === '3' && e[1].etat === 'NON_LU' && e[2].etat === 'TROP_TOT' && e[2].blocsAvant === 103, 'etatSpins : regle saute, non lu = NON_LU, a venir = TROP_TOT (v2 : jusqu au 3e bloc, cible + 3 - tete)');
vu(S.etatSpins({ spuns: [{ spinId: 1n, targetBlock: 100 }], statuts: new Map([['1', 1]]), tete: 357 })[0].etat === 'PERDU', 'etatSpins : cible + 257 = PERDU');
vu(S.debutFenetreSpins(10000, 0) === 10000 - 256 - 2 - 40 && S.debutFenetreSpins(10000, 9900) === 9900, 'fenetre : tete - 298, jamais avant le deploiement');
const f = S.filtreSpunDe({ contrat: '0x' + 'cc'.repeat(20), joueur: '0x' + 'a1'.repeat(20), de: 9702, jusqua: 10000 });
vu(f.topics[0] === S.TOPIC_SPUN && f.topics[1] === null && f.topics[2] === '0x' + '0'.repeat(24) + 'a1'.repeat(20) && f.fromBlock === '0x25e6' && f.toBlock === '0x2710', 'filtre Spun : le joueur en topic 2, fenetre en hex');
let jete = false; try { S.filtreSpunDe({ contrat: '0x' + 'cc'.repeat(20), joueur: '0x' + 'a1'.repeat(20), de: 10, jusqua: 5 }); } catch (_) { jete = true; }
vu(jete, 'filtre Spun : fenetre inversee refusee');
console.log('ok slots-app - ' + n + ' assertions ; NE PROUVE PAS le rendu ni un spin reel');
