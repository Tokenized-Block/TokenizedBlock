/* test-ticketpot-unit-20261027.mjs — LE SECOND TicketPot (paie en UNIT) : fiche notee, serveur, attestations, app.
 * EXECUTE (decoupes de la vraie source, montees par new Function, avec les VRAIS modules ticketpot-parts / ticketpot-plan / signeur /
 *   tirage-saison / niveaux-jeu) :
 *  [F] ticketpot-unit-deploiement.js : adresse 0x4afbcb85…cb4f, bloc 53 171 096, token du constructeur = UNIT (valeurs copiees de la demande
 *      et du recu relu par contracts/noter-deploiement-ticketpot.mjs, jamais retapees de memoire) ;
 *  [S] serveur-web.js lireTicketPotSrv(POT_TP_UNIT) lit le contrat UNIT, ticketpotJsonDe(POT_TP_UNIT) sert { contrat UNIT, jeton UNIT,
 *      decimales 18 } ; le pot USDC garde le sien ;
 *  [R] la route /api/ticketpot-unit/parts : contrat UNIT, digest EIP-712 = domaine du pot UNIT (verifyingContract UNIT), PAS celui du pot USDC ;
 *      part = floor(potAtClose / n) en UNIT brut ; memes tickets que le pot USDC ; POST /api/ticketpot-unit/signature garde sous
 *      revenu.ticketpotSigUnit (jamais ticketpotSig) ; une signature du digest USDC est refusee sur le pot UNIT ;
 *  [A] app.html : la part UNIT s affiche a 18 decimales (« 2.3333 UNIT »), une reponse d un AUTRE contrat est ignoree, le claim part vers le
 *      contrat UNIT (planClaim, signe par le wallet du holder) ; montantTexte tronque, illisible -> '—'.
 *  MUTANTS (sur des COPIES en memoire de la source) : chacun doit faire ROUGIR au moins un scenario.
 * ⛔ NE PROUVE PAS : un claim reel (UNIT est un B20 : il ne s execute que sur le noeud Base, pas sur un fork), un fund reel, la signature du
 *   vrai wallet verifier, ni le rendu dans un navigateur. Le premier vrai claim est la seule preuve de bout en bout. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saisonDe, jourDe, JOUR_MS, joursEntre, entreesPeriode, SEUIL_VOLUME_JOUR_USD, ticketsJour } from './tirage-saison.js';
import { joursTicketParWallet, niveauWallet, bonusNiveauxSemaine } from './niveaux-jeu.js';
import { partsDuJour as partsTicketPot, verifierSignaturePart } from './ticketpot-parts.js';
import * as P from './ticketpot-plan.js';
import { signerDigest, adresseDe } from './signeur-secp256k1.js';
import { TICKETPOT_DEPLOIEMENT as FICHE_USDC } from './ticketpot-deploiement.js';
import { TICKETPOT_DEPLOIEMENT as FICHE_UNIT } from './ticketpot-unit-deploiement.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const POT_UNIT = '0x4afbcb853fd71432351c75f6add0ee6307edcb4f', UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
const POT_USDC = '0xf98621bf4313e47af35b3344bdda112a32391df1';
const CLE = '0x' + (0xA11CE).toString(16).padStart(64, '0'); /* cle de TEST publique des bancs du depot */
const VERIF = adresseDe(CLE).toLowerCase();
const A = '0x' + 'a1'.repeat(20), B = '0x' + 'b2'.repeat(20), C = '0x' + 'c3'.repeat(20);
const POT = 7n * 10n ** 18n; /* 7 UNIT pour 3 tickets : 2.333… UNIT chacun */
const MER = 'J2026-10-21', T_JEUDI = Date.UTC(2026, 9, 23, 12);
const etatBase = () => ({ jours: { [MER]: { [A]: { usd: 20, hashes: ['0x' + '1'.repeat(64)] }, [B]: { usd: 20, hashes: ['0x' + '2'.repeat(64)] }, [C]: { usd: 30, hashes: ['0x' + '3'.repeat(64)] } } },
  passes: {}, xpEtat: { xp: {}, vus: {} }, depuis: '2026-10-16T00:00:00.000Z' });

/* [S] le module serveur des pots, decoupe et monte */
function monterSrv(src, appels) {
  const a = src.indexOf('const ticketpotSrv = {'), b = src.indexOf('/* ══ LES DUELS LUS SUR LA CHAINE');
  if (a < 0 || b < a) throw new Error('decoupe serveur introuvable');
  class D extends Date { constructor(...x) { if (x.length) super(...x); else super(T_JEUDI); } static now() { return T_JEUDI; } }
  const deps = {
    TICKETPOT_DEPLOIEMENT: FICHE_USDC, TICKETPOT_UNIT_DEPLOIEMENT: FICHE_UNIT, cacheTemporise: () => ({ obtenir: (k, f) => Promise.resolve().then(f), invalider() {} }),
    jourDe, JOUR_MS, dayDeJourIdPot: P.dayDeJourId, saisonDe, jourSemaineReclamable: P.jourSemaineReclamable, jourIdDeDayPot: P.jourIdDeDay, reclamablePotSrv: P.claimableUntil,
    lireJourTicketPot: async (io) => { appels.push(String(io.contrat).toLowerCase()); return { verifier: VERIF, chaine: 8453, enPause: false, ferme: true, potAtClose: POT, reste: POT }; },
    rpcServeur: async () => '0x' + '0'.repeat(24) + VERIF.slice(2), selecteurSrv: () => '0x8da5cb5b', revenu: { ticketpotSig: {}, ticketpotSigUnit: {} },
    Date: D, setTimeout: () => ({ unref() {} }), setInterval: () => ({ unref() {} }),
  };
  const noms = Object.keys(deps);
  return new Function(...noms, src.slice(a, b) + '\nreturn { lire: lireTicketPotSrv, json: ticketpotJson, jsonDe: ticketpotJsonDe, POT_TP_UNIT, POT_TP_USDC, partsCacheTPUnit, jourChaineTPUnit };')(...noms.map((k) => deps[k]));
}
/* [R] la route, decoupee (comme test-ticketpot-gel), avec le POT_TP_UNIT de la source montee */
function monterRoute(src, etat, S) {
  const bloc = src.slice(src.indexOf("if (chemin === '/api/ticketpot/parts' || chemin === '/api/ticketpot/signature') {"), src.indexOf("if (chemin === '/api/jeu/niveau') {"));
  const niv = src.slice(src.indexOf('const joursTicketCache = '), src.indexOf('setInterval(() => {', src.indexOf('function niveauSrv(')));
  if (bloc.length < 500 || niv.length < 200) throw new Error('decoupe route introuvable');
  class D extends Date { constructor(...a) { if (a.length) super(...a); else super(T_JEUDI); } static now() { return T_JEUDI; } }
  const passe = { obtenir: (k, f) => Promise.resolve().then(f), invalider() {} };
  const deps = {
    revenu: etat, Date: D, TICKETPOT_DEPLOIEMENT: FICHE_USDC, POT_TP_UNIT: S.POT_TP_UNIT, dayDeJourIdPot: P.dayDeJourId, saisonDe, jourDe, JOUR_MS, joursEntre, entreesPeriode, SEUIL_VOLUME_JOUR_USD,
    bonusNiveauxSemaine, joursTicketParWallet, niveauWallet, ticketsJour, partsTicketPot, verifierSignaturePart,
    jourChaineTP: passe, partsCacheTP: passe, jourChaineTPUnit: passe, partsCacheTPUnit: passe, rpcServeur: null,
    lireJourTicketPot: async () => ({ ferme: true, enPause: false, potAtClose: POT, reste: POT, verifier: VERIF }),
    couvertureParts: () => ({ complete: true }), BLOCKROLLS_DEPLOIEMENT: { adresse: null }, horodatageBloc: async () => null, BLOCKSKINS_SRV: null,
  };
  const noms = Object.keys(deps);
  return new Function(...noms, 'let revenuSale = false;\n' + niv + '\nreturn async function route(chemin, req, res) {\n' + bloc + '\n};')(...noms.map((k) => deps[k]));
}
/* comme le serveur : /api/ticketpot-unit/* est servi par la route /api/ticketpot/* (chemin normalise), req.url garde le chemin d origine */
function appeler(route, method, url, corps) {
  return new Promise((fin) => {
    const ecoute = {};
    const req = { method, url, on: (ev, f) => { ecoute[ev] = f; }, destroy() {} };
    const res = { code: 0, writeHead(c) { this.code = c; }, end(b) { let j = null; try { j = JSON.parse(b); } catch (_) { j = null; } fin({ code: this.code, corps: j }); } };
    void route(new URL(url, 'http://x').pathname.replace('/api/ticketpot-unit/', '/api/ticketpot/'), req, res);
    if (method === 'POST') { ecoute.data(JSON.stringify(corps)); ecoute.end(); }
  });
}
/* [A] le pot UNIT de l app, decoupe et monte */
function monterApp(app, rep) {
  const a = app.indexOf('/* ══ LE POT UNIT (2026-10-27'), b = app.indexOf("$('#jourReclamerPotUnit').addEventListener");
  if (a < 0 || b < a) throw new Error('decoupe app introuvable');
  const el = {}; const $ = (s) => (el[s] = el[s] || { hidden: true, textContent: '', disabled: false });
  const vu = { claims: [], fetchs: [] };
  const deps = { $, montantPotTexte: P.montantTexte, reclamablePot: P.claimableUntil, semaineReclamableDe: () => null,
    fetch: async (u) => { vu.fetchs.push(u); return { json: async () => rep(u) }; }, AbortSignal: { timeout: () => null },
    dejaReclamePot: async () => false, planClaimPot: (x) => { vu.claims.push(x); return { etat: 'PRET', appels: [{ to: x.contrat }] }; },
    envoyerAppels: async () => ({ etat: 'CONFIRME', hash: '0x' + 'ab'.repeat(32) }), phraseNonConfirme: () => 'no' };
  const noms = Object.keys(deps);
  const api = new Function(...noms, 'let compte = ' + JSON.stringify(A) + ';\n' + app.slice(a, b) + '\nreturn { peindrePotUnit, reclamerPotUnit };')(...noms.map((k) => deps[k]));
  return { api, el, vu };
}

async function scenarios(SRC) {
  const R = {};
  const essai = async (nom, f) => { try { R[nom] = !!(await f()); } catch (e) { R[nom] = false; R[nom + ':err'] = String((e && e.message) || e); } };
  await essai('F-fiche-notee', () => FICHE_UNIT.adresse === POT_UNIT && FICHE_UNIT.bloc === 53171096 && FICHE_UNIT.constructeur.usdc === UNIT && FICHE_UNIT.adresse !== FICHE_USDC.adresse);
  let S = null; const lus = [];
  await essai('S-lecture-et-json', async () => {
    S = monterSrv(SRC.SRV, lus);
    await S.lire(S.POT_TP_UNIT);
    const j = S.jsonDe(S.POT_TP_UNIT), ju = S.json();
    return lus.length > 0 && lus.every((c) => c === POT_UNIT) && j && j.contrat === POT_UNIT && j.jeton === 'UNIT' && j.decimales === 18 && j.bloc === 53171096
      && j.veille && j.veille.potAtClose === POT.toString() && ju && ju.contrat === POT_USDC && ju.jeton === 'USDC' && ju.decimales === 6
      && S.POT_TP_UNIT.cleSig === 'ticketpotSigUnit' && S.POT_TP_UNIT.decimales === 18;
  });
  const dU = P.domaineSeparateur(8453, POT_UNIT), dC = P.domaineSeparateur(8453, POT_USDC);
  await essai('R-parts-domaine-unit', async () => {
    const route = monterRoute(SRC.SRV, etatBase(), S);
    const r = (await appeler(route, 'GET', '/api/ticketpot-unit/parts?day=' + MER)).corps;
    const rc = (await appeler(route, 'GET', '/api/ticketpot/parts?day=' + MER)).corps;
    if (!r || !r.ok || r.contrat !== POT_UNIT || r.jeton !== 'UNIT' || r.decimales !== 18 || r.parts.length !== 3) return false;
    const part = POT / 3n;
    return dU !== dC && r.parts.every((p) => p.amount === part.toString() && p.donnees.domain.verifyingContract === POT_UNIT
      && p.digest === P.digestClaim(P.donneesClaim({ chainId: 8453, contrat: POT_UNIT, day: p.day, wallet: p.wallet, ticket: p.ticket, amount: p.amount, deadline: p.deadline }))
      && p.digest !== P.digestClaim(P.donneesClaim({ chainId: 8453, contrat: POT_USDC, day: p.day, wallet: p.wallet, ticket: p.ticket, amount: p.amount, deadline: p.deadline })))
      && rc && rc.ok && rc.contrat === POT_USDC && JSON.stringify(rc.parts.map((p) => p.wallet)) === JSON.stringify(r.parts.map((p) => p.wallet));
  });
  await essai('R-signature-gardee-sous-unit', async () => {
    const e = etatBase(), route = monterRoute(SRC.SRV, e, S);
    const r = (await appeler(route, 'GET', '/api/ticketpot-unit/parts?day=' + MER)).corps, p = r.parts.find((x) => x.wallet === A);
    /* la signature du digest du pot USDC (meme part) : refusee sur le pot UNIT */
    const dUsdc = P.digestClaim(P.donneesClaim({ chainId: 8453, contrat: POT_USDC, day: p.day, wallet: A, ticket: p.ticket, amount: p.amount, deadline: p.deadline }));
    const mauvais = await appeler(route, 'POST', '/api/ticketpot-unit/signature', { day: MER, wallet: A, signature: signerDigest(CLE, dUsdc) });
    const bon = await appeler(route, 'POST', '/api/ticketpot-unit/signature', { day: MER, wallet: A, signature: signerDigest(CLE, p.digest) });
    const relu = (await appeler(route, 'GET', '/api/ticketpot-unit/parts?day=' + MER)).corps.parts.find((x) => x.wallet === A);
    const usdc = (await appeler(route, 'GET', '/api/ticketpot/parts?day=' + MER)).corps.parts.find((x) => x.wallet === A);
    return mauvais.code === 400 && bon.code === 200 && e.ticketpotSigUnit && e.ticketpotSigUnit[MER] && e.ticketpotSigUnit[MER][A]
      && !(e.ticketpotSig && e.ticketpotSig[MER]) && relu.signature && usdc.signature === null && e.ticketpotGelUnit && e.ticketpotGelUnit[MER] && !(e.ticketpotGel && e.ticketpotGel[MER]);
  });
  await essai('A-montant-18-decimales-et-claim', async () => {
    const dayM = P.dayDeJourId(MER);
    const tpU = { contrat: POT_UNIT, jeton: 'UNIT', decimales: 18, veille: { jourId: MER, day: dayM, ferme: true, potAtClose: POT.toString(), reste: POT.toString() }, signes: [] };
    const part = { day: dayM, jourId: MER, wallet: A, ticket: '0x' + 'dd'.repeat(20), amount: (POT / 3n).toString(), deadline: P.claimableUntil(dayM), signature: '0x' + '11'.repeat(65) };
    const { api, el, vu } = monterApp(SRC.APP, (u) => ({ ok: true, jeton: 'UNIT', contrat: POT_UNIT, parts: /week=1/.test(u) ? [] : [part] }));
    api.peindrePotUnit({ ticketpotUnit: tpU }, A);
    await new Promise((r) => setTimeout(r, 20));
    const b = el['#jourReclamerPotUnit'];
    if (!b || b.hidden || b.textContent !== 'Claim my UNIT share · 2.3333 UNIT (' + MER + ')' || !vu.fetchs.every((u) => u.startsWith('/api/ticketpot-unit/parts?'))) return false;
    if (el['#potJourUnit'].hidden !== false || !/Pot of 2026-10-21: 7\.0000 UNIT left to claim\./.test(el['#potJourUnit'].textContent)) return false;
    await api.reclamerPotUnit();
    return vu.claims.length === 1 && vu.claims[0].contrat === POT_UNIT && vu.claims[0].wallet === A && vu.claims[0].amount === part.amount;
  });
  await essai('A-autre-contrat-ignore', async () => {
    const dayM = P.dayDeJourId(MER);
    const tpU = { contrat: POT_UNIT, jeton: 'UNIT', veille: { jourId: MER, day: dayM, ferme: true, potAtClose: '1', reste: '1' }, signes: [] };
    const part = { day: dayM, jourId: MER, wallet: A, ticket: '0x' + 'dd'.repeat(20), amount: '5', deadline: P.claimableUntil(dayM), signature: '0x' + '11'.repeat(65) };
    const { api, el } = monterApp(SRC.APP, () => ({ ok: true, jeton: 'USDC', contrat: POT_USDC, parts: [part] }));
    api.peindrePotUnit({ ticketpotUnit: tpU }, A);
    await new Promise((r) => setTimeout(r, 20));
    return el['#jourReclamerPotUnit'].hidden === true;
  });
  await essai('A-montantTexte', () => P.montantTexte(1234567890123456789n, 18) === '1.2345' && P.montantTexte('2500000', 6) === '2.5000' && P.montantTexte('x', 18) === '—' && P.montantTexte(5n, 18) === '0.0000');
  return R;
}

const SRC = { SRV: lire('serveur-web.js'), APP: lire('app.html') };
let n = 0, ko = 0;
const R = await scenarios(SRC);
for (const [k, v] of Object.entries(R)) { if (k.endsWith(':err')) continue; n += 1; if (v) console.log('ok  ' + k); else { ko += 1; console.log('KO  ' + k + (R[k + ':err'] ? ' (' + R[k + ':err'] + ')' : '')); } }
/* MUTANTS : sur des COPIES en memoire ; chacun doit faire rougir au moins un scenario */
const remplacer = (s, a, b) => { if (!s.includes(a)) throw new Error('mutant sans cible : ' + a.slice(0, 60)); return s.split(a).join(b); };
const MUTANTS = [
  ['domaine du pot USDC pour une part UNIT', 'SRV', 'const contratTP = uniteTP ? POT_TP_UNIT.fiche.adresse : TICKETPOT_DEPLOIEMENT.adresse;', 'const contratTP = TICKETPOT_DEPLOIEMENT.adresse;'],
  ['6 decimales pour UNIT dans l app', 'APP', 'const DEC_UNIT_POT = 18;', 'const DEC_UNIT_POT = 6;'],
  ['6 decimales pour UNIT servies par le serveur', 'SRV', "cleSig: 'ticketpotSigUnit', jeton: 'UNIT', decimales: 18", "cleSig: 'ticketpotSigUnit', jeton: 'UNIT', decimales: 6"],
  ['mauvaise adresse de pot (fiche USDC sous le pot UNIT)', 'SRV', "fiche: typeof TICKETPOT_UNIT_DEPLOIEMENT === 'object' ? TICKETPOT_UNIT_DEPLOIEMENT :", "fiche: typeof TICKETPOT_UNIT_DEPLOIEMENT === 'object' ? TICKETPOT_DEPLOIEMENT :"],
  ['signatures UNIT gardees avec celles du pot USDC', 'SRV', "const cleSigTP = uniteTP ? 'ticketpotSigUnit' : 'ticketpotSig'", "const cleSigTP = uniteTP ? 'ticketpotSig' : 'ticketpotSig'"],
  ['app : part d un autre contrat acceptee', 'APP', " || r.jeton !== 'UNIT' || String(r.contrat).toLowerCase() !== contratU) continue;", ') continue;'],
  ['app : lit les parts du pot USDC', 'APP', "fetch('/api/ticketpot-unit/parts?day='", "fetch('/api/ticketpot/parts?day='"],
  ['app : claim vers le contrat servi au lieu du pot UNIT', 'APP', 'maPartPotUnit = { ...p, contrat: contratU };', 'maPartPotUnit = { ...p, contrat: ' + JSON.stringify(POT_USDC) + ' };'],
];
let tues = 0;
for (const [nom, cle, a, b] of MUTANTS) {
  const copie = { ...SRC, [cle]: remplacer(SRC[cle], a, b) };
  const Rm = await scenarios(copie);
  const rouges = Object.entries(Rm).filter(([k, v]) => !k.endsWith(':err') && !v).map(([k]) => k);
  n += 1;
  if (rouges.length) { tues += 1; console.log('ok  mutant tue : ' + nom + ' -> ' + rouges.join(', ')); } else { ko += 1; console.log('KO  mutant VIVANT : ' + nom); }
}
console.log(n + ' assertions, ' + ko + ' KO, mutants ' + tues + '/' + MUTANTS.length + ' tues - NE PROUVE PAS un claim ni un fund reels (UNIT = B20, Base seulement), ni la signature du vrai verifier, ni le rendu navigateur');
process.exit(ko ? 1 : 0);
