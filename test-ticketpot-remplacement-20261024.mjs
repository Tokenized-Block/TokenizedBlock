/* test-ticketpot-remplacement-20261024.mjs - UNE PART DEJA SIGNEE ET SERVIE N EST JAMAIS REMPLACEE PAR UN AUTRE MONTANT.
 * Revue adverse du correctif ticketpot (2026-10-24, defaut 1, medium) : la garde dure du POST /api/ticketpot/signature sautait la part
 *   deja gardee du wallet re-poste (`if (k === cleSig && w === wallet) continue;`) meme quand le nouveau digest DIFFERE. L ancienne
 *   signature a ete servie publiquement (GET /api/ticketpot/parts) et reste valide sur la chaine jusqu a sa deadline : la remplacer
 *   laissait A reclamer l ancien montant ET comptait le nouveau -> pot sur-alloue (PoC de la revue : A 50 000 000 ancien + B 57 142 857
 *   nouveau = 107 142 857 > 100 000 000 ; le dernier a reclamer revertait AmountOverPot).
 * EXECUTE la vraie route /api/ticketpot/parts + /api/ticketpot/signature de serveur-web.js (bloc decoupe + niveauSrv / joursTicketSrv),
 *   montee par new Function avec les VRAIS modules (tirage-saison, niveaux-jeu, ticketpot-parts, ticketpot-plan, signeur) ; seuls la
 *   lecture de chaine (pot ferme 100 USDC, verifier = cle de TEST publique 0xA11CE), l horloge et les caches sont simules.
 * AFFIRME :
 *  R1 la PoC de la revue (cle SEMAINE signee avant le gel puis derivee) : la re-signature de A sur un AUTRE digest est REFUSEE (409, la
 *     part gardee de A reste l ancienne, octet pour octet) ; ce qui est garde + l ancienne part publique de A ne depasse JAMAIS le pot ;
 *  R2 re-poster le MEME digest est idempotent (200, rien ne change) ;
 *  R3 temoin : une cle neuve, A puis B signent (200, 200) -> la garde ne refuse pas tout ;
 *  R4 meme regle en mode JOUR (un ticket credite en retard sur une cle derivee avant le gel).
 *  MUTANT (copie en memoire) : le refus du digest different retire -> R1 ROUGIT.
 * NE PROUVE PAS : une signature du vrai wallet verifier, un claim reel ni la chaine reelle ; le comportement de la page du verifier
 *   (attester-ticketpot.html) devant ce 409 (elle affiche `pourquoi`, non execute ici). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saisonDe, jourDe, JOUR_MS, joursEntre, entreesPeriode, SEUIL_VOLUME_JOUR_USD, ticketsJour } from './tirage-saison.js';
import { joursTicketParWallet, niveauWallet, bonusNiveauxSemaine } from './niveaux-jeu.js';
import { partsDuJour as partsTicketPot, verifierSignaturePart } from './ticketpot-parts.js';
import { dayDeJourId as dayDeJourIdPot } from './ticketpot-plan.js';
import { signerDigest, adresseDe } from './signeur-secp256k1.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };

const CLE = '0x' + (0xA11CE).toString(16).padStart(64, '0'); /* cle de TEST publique des bancs du depot */
const VERIF = adresseDe(CLE).toLowerCase();
const CT = '0xf98621bf4313e47af35b3344bdda112a32391df1';
const A = '0x' + 'a1'.repeat(20), B = '0x' + 'b2'.repeat(20), C = '0x' + 'c3'.repeat(20);
const POT = 100000000n;
const DIM = 'J2026-10-25', MER = 'J2026-10-21';
const T_LUNDI = Date.UTC(2026, 9, 26, 10), T_MERCREDI = Date.UTC(2026, 9, 28, 12);

function monter(srcSrv, etat, horloge) {
  const bloc = srcSrv.slice(srcSrv.indexOf("if (chemin === '/api/ticketpot/parts' || chemin === '/api/ticketpot/signature') {"), srcSrv.indexOf("if (chemin === '/api/jeu/niveau') {"));
  const niv = srcSrv.slice(srcSrv.indexOf('const joursTicketCache = '), srcSrv.indexOf('setInterval(() => {', srcSrv.indexOf('function niveauSrv(')));
  if (bloc.length < 500 || niv.length < 200) throw new Error('decoupe introuvable');
  class D extends Date { constructor(...a) { if (a.length) super(...a); else super(horloge.t); } static now() { return horloge.t; } }
  const passe = { obtenir: (k, f) => Promise.resolve().then(f), invalider() {} };
  const deps = {
    revenu: etat, Date: D, TICKETPOT_DEPLOIEMENT: { adresse: CT }, dayDeJourIdPot, saisonDe, jourDe, JOUR_MS, joursEntre, entreesPeriode, SEUIL_VOLUME_JOUR_USD,
    bonusNiveauxSemaine, joursTicketParWallet, niveauWallet, ticketsJour, partsTicketPot, verifierSignaturePart,
    jourChaineTP: passe, partsCacheTP: passe, rpcServeur: null,
    lireJourTicketPot: async () => ({ ferme: true, enPause: false, potAtClose: POT, reste: POT, verifier: VERIF }),
    couvertureParts: () => ({ complete: true }), BLOCKROLLS_DEPLOIEMENT: { adresse: null }, horodatageBloc: async () => null, BLOCKSKINS_SRV: null,
  };
  const noms = Object.keys(deps);
  const corps = 'let revenuSale = false;\n' + niv + '\nreturn async function route(chemin, req, res) {\n' + bloc + '\n};';
  return new Function(...noms, corps)(...noms.map((k) => deps[k]));
}
function appeler(route, method, url, corps) {
  return new Promise((fin) => {
    const ecoute = {};
    const req = { method, url, on: (ev, f) => { ecoute[ev] = f; }, destroy() {} };
    const res = { code: 0, writeHead(c) { this.code = c; }, end(b) { let j = null; try { j = JSON.parse(b); } catch (_) { j = null; } fin({ code: this.code, corps: j }); } };
    void route(new URL(url, 'http://x').pathname, req, res);
    if (method === 'POST') { ecoute.data(JSON.stringify(corps)); ecoute.end(); }
  });
}
const parts = async (route, jourId, sem) => (await appeler(route, 'GET', '/api/ticketpot/parts?day=' + jourId + (sem ? '&week=1' : ''))).corps;
async function signer(route, jourId, sem, wallet, partsLues) {
  const p = (partsLues || (await parts(route, jourId, sem))).parts.find((x) => x.wallet === wallet);
  if (!p) return { code: 0, corps: { ok: false, pourquoi: 'pas de part' } };
  return appeler(route, 'POST', '/api/ticketpot/signature', { day: jourId, wallet, signature: signerDigest(CLE, p.digest), week: !!sem });
}
function etatBase() {
  const jours = {};
  for (const j of ['J2026-10-19', 'J2026-10-20', MER]) jours[j] = { [A]: { usd: 20, hashes: ['0x' + '1'.repeat(64)] }, [B]: { usd: 20, hashes: ['0x' + '2'.repeat(64)] } };
  return { jours, passes: {}, xpEtat: { xp: { [B]: { roll: 20 } }, vus: {} }, depuis: '2026-10-16T00:00:00.000Z' };
}
const gardeTotal = (stock) => Object.values(stock || {}).reduce((s, x) => s + BigInt(x.amount), 0n);
const sigDe = (p) => ({ digest: p.digest, signature: signerDigest(CLE, p.digest), amount: p.amount, deadline: p.deadline, ticket: p.ticket, recue: '2026-10-25T23:00:00.000Z' });

async function scenarios(src) {
  const R = {};
  const essai = async (nom, f) => { try { R[nom] = await f(); } catch (e) { R[nom] = false; R[nom + ':err'] = String(e && e.message || e); } };
  /* R1 : la PoC de la revue, mot pour mot dans son etat (cle semaine signee AVANT le gel, puis derive : B franchit L3) */
  await essai('R1-poc-revue', async () => {
    const h = { t: T_LUNDI }, e = etatBase(), route = monter(src, e, h);
    const t1 = await parts(route, DIM, true);
    const pa1 = t1.parts.find((p) => p.wallet === A);
    e.ticketpotSig = { [DIM + '#S']: { [A]: sigDe(pa1) } };
    delete e.ticketpotGel;
    const ancienne = { ...e.ticketpotSig[DIM + '#S'][A] };
    e.xpEtat.xp[B].roll = 21; h.t = T_MERCREDI;
    const t2 = await parts(route, DIM, true);
    const pa2 = t2.parts.find((p) => p.wallet === A);
    const derive = pa2.digest !== pa1.digest; /* le scenario est bien celui de la revue : la table a derive */
    const sA = await signer(route, DIM, true, A, t2);
    const sB = await signer(route, DIM, true, B, t2);
    const stock = e.ticketpotSig[DIM + '#S'];
    const gardeA = stock[A];
    const pire = BigInt(ancienne.amount) + Object.entries(stock).filter(([w]) => w !== A).reduce((s, [, x]) => s + BigInt(x.amount), 0n);
    R['R1:detail'] = 'derive ' + derive + ' | A ' + sA.code + ' ' + (sA.corps && sA.corps.pourquoi || '') + ' | B ' + sB.code + ' | garde ' + gardeTotal(stock) + ' | ancienne A + autres ' + pire + ' / ' + POT;
    return derive && sA.code === 409 && sA.corps.ok === false && sA.corps.etat === 'REFUSE' && /already signed/.test(sA.corps.pourquoi)
      && gardeA.digest === ancienne.digest && gardeA.amount === ancienne.amount && gardeA.signature === ancienne.signature
      && pire <= POT && gardeTotal(stock) <= POT;
  });
  /* R2 : le MEME digest re-poste = idempotent */
  await essai('R2-meme-digest-idempotent', async () => {
    const h = { t: T_LUNDI }, e = etatBase(), route = monter(src, e, h);
    const t1 = await parts(route, DIM, true);
    const a1 = await signer(route, DIM, true, A, t1);
    const avant = { ...e.ticketpotSig[DIM + '#S'][A] };
    const a2 = await signer(route, DIM, true, A, t1);
    const apres = e.ticketpotSig[DIM + '#S'][A];
    return a1.code === 200 && a2.code === 200 && a2.corps.ok === true && apres.digest === avant.digest && apres.amount === avant.amount && gardeTotal(e.ticketpotSig[DIM + '#S']) === BigInt(avant.amount);
  });
  /* R3 : temoin, une cle neuve se signe entierement */
  await essai('R3-temoin-cle-neuve', async () => {
    const h = { t: T_LUNDI }, e = etatBase(), route = monter(src, e, h);
    const t1 = await parts(route, DIM, true);
    const a = await signer(route, DIM, true, A, t1), b = await signer(route, DIM, true, B, t1);
    return a.code === 200 && b.code === 200 && gardeTotal(e.ticketpotSig[DIM + '#S']) === POT;
  });
  /* R4 : mode JOUR, cle signee avant le gel puis un ticket credite en retard (C) : la part de A change de digest -> refusee */
  await essai('R4-jour-derive', async () => {
    const h = { t: Date.UTC(2026, 9, 22, 9) }, e = etatBase(), route = monter(src, e, h);
    const t1 = await parts(route, MER, false);
    const pa1 = t1.parts.find((p) => p.wallet === A);
    e.ticketpotSig = { [MER]: { [A]: sigDe(pa1) } };
    e.jours[MER][C] = { usd: 30, hashes: ['0x' + '4'.repeat(64)] };
    /* l ancienne signature ne tient plus sur la table courante : pas de gel paresseux, la table derive (3 tickets) */
    const t2 = await parts(route, MER, false);
    const pa2 = t2.parts.find((p) => p.wallet === A);
    const sA = await signer(route, MER, false, A, t2);
    const gardeA = e.ticketpotSig[MER][A];
    return pa2.digest !== pa1.digest && sA.code === 409 && gardeA.digest === pa1.digest && gardeA.amount === pa1.amount;
  });
  return R;
}

const SRV = lire('serveur-web.js');
const R = await scenarios(SRV);
for (const [k, v] of Object.entries(R)) if (!k.includes(':')) ok(v === true, k + (R[k + ':err'] ? ' (' + R[k + ':err'] + ')' : ''));
console.log('    R1 : ' + R['R1:detail']);
const MUTANTS = [
  { nom: 'refus du digest different retire', de: /if \(dejaSig && String\(dejaSig\.digest \|\| ''\)\.toLowerCase\(\) !== String\(p\.digest\)\.toLowerCase\(\)\)/, vers: 'if (false)', rougit: 'R1-poc-revue' },
  { nom: 'refus du digest different retire (mode jour)', de: /if \(dejaSig && String\(dejaSig\.digest \|\| ''\)\.toLowerCase\(\) !== String\(p\.digest\)\.toLowerCase\(\)\)/, vers: 'if (false)', rougit: 'R4-jour-derive' },
  { nom: 'refus de TOUT re-post (meme digest compris)', de: /if \(dejaSig && String\(dejaSig\.digest \|\| ''\)\.toLowerCase\(\) !== String\(p\.digest\)\.toLowerCase\(\)\)/, vers: 'if (dejaSig)', rougit: 'R2-meme-digest-idempotent' },
];
let tues = 0;
for (const m of MUTANTS) {
  if (!m.de.test(SRV)) { ok(false, 'MUTANT ' + m.nom + ' : motif absent de la source'); continue; }
  const Rm = await scenarios(SRV.replace(m.de, m.vers));
  const t = Rm[m.rougit] !== true; if (t) tues += 1;
  ok(t, 'MUTANT ' + m.nom + ' -> ' + m.rougit + ' ROUGIT');
}
console.log('mutants tues ' + tues + '/' + MUTANTS.length);
console.log(n + ' assertions, ' + ko + ' KO - NE PROUVE PAS une signature du vrai verifier, un claim reel, ni la chaine reelle');
if (ko) process.exitCode = 1;
