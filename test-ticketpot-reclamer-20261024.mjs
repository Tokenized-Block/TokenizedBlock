/* test-ticketpot-reclamer-20261024.mjs — « CLAIM MY SHARE » : JAMAIS UNE PART DEJA PAYEE, ET TOUTE PART SIGNEE DES 7 DERNIERS JOURS.
 * Revue adverse 2026-10-24 (audit-ticketpot 5 et 6) : (a) une part reclamee gardait sa signature servie : le bouton revenait au rafraichissement
 *   avec un montant deja paye, et planClaim etait appele sans dejaPaye (claim -> AlreadyClaimed, gas perdu) ; (b) l app n offrait que la veille
 *   et la semaine : une part signee d un jour pot d il y a 3 jours n avait plus de bouton, alors que le contrat la paie 7 jours.
 * EXECUTE : app.html peindreReclamerPot + reclamerPot + dejaReclamePot (decoupes, montes par new Function ; fetch, rpc, horloge et
 *   envoyerAppels simules ; appelClaimed / lireBoolMot / planClaim / claimableUntil VRAIS) ; serveur-web.js ticketpotJson (decoupe, execute)
 *   pour la liste servie tp.signes.
 * AFFIRME : claimed() lu true -> pas de bouton ; false -> bouton ; illisible -> pas de bouton ; une part signee de J-3 (servie dans signes) ->
 *   bouton pour J-3 ; J-3 deja reclamee et J-5 pas -> bouton pour J-5 ; hors grace -> rien demande ; au clic, claimed relu true -> plan refuse
 *   (dejaPaye), rien n est envoye ; serveur : signes = les cles avec au moins une signature, dans leur grace, semaine marquee, rien d expire.
 *   claimed(uint32,address) = 0x96638b6c (selecteur lu dans contracts/out apres forge build, compare ici a appelClaimed).
 *   MUTANTS (copies en memoire) : chaque correctif retire -> son scenario ROUGIT.
 * ⛔ NE PROUVE PAS : un claim reel, ni le rendu au navigateur, ni une lecture claimed() sur Base (voir le rapport : lecture faite a part). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from './ticketpot-plan.js';
import { saisonDe } from './tirage-saison.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const CT = '0x' + 'c2'.repeat(20), MOI = '0x' + 'b1'.repeat(20);
const J = 86400, maintenant = Date.UTC(2026, 9, 29, 10) / 1000; /* mercredi 29/10 10:00 */
const jour = (k) => Math.floor(maintenant / J) - k; /* J-k */
const partDe = (d, sem) => ({ day: d, jourId: P.jourIdDeDay(d), wallet: MOI, ticket: '0x' + 'd3'.repeat(20), amount: sem ? '2500000' : '1230000', deadline: P.claimableUntil(d), signature: '0x' + '11'.repeat(65) });

function monter(app, { parts, reclame, rpcCasse = false }) {
  const a0 = app.indexOf('let maPartPot = null;'), a1 = app.indexOf("$('#jourReclamerPot').addEventListener");
  if (a0 < 0 || a1 < a0) throw new Error('decoupe introuvable');
  const el = {}; const $ = (s) => (el[s] = el[s] || { hidden: true, disabled: false, textContent: '', addEventListener() {} });
  const appels = [], envois = [], lus = [];
  const fetch = async (u) => { appels.push(u); const q = new URL(u, 'http://x').searchParams; const k = q.get('day') + (q.get('week') === '1' ? '#S' : '');
    return { json: async () => ({ ok: true, contrat: CT, parts: parts[k] || [] }) }; };
  const rpc = async (m, p) => {
    if (m !== 'eth_call' || rpcCasse) throw new Error('rpc');
    const data = String(p[0].data); lus.push(data);
    const d = Number(BigInt('0x' + data.slice(10, 74)));
    const v = typeof reclame === 'function' ? reclame(d) : !!reclame[d];
    return '0x' + (v ? '1' : '0').padStart(64, '0');
  };
  class D extends Date { static now() { return maintenant * 1000; } }
  const deps = { $, fetch, Date: D, usdcTexte: (x) => String(Number(x) / 1e6), reclamablePot: P.claimableUntil, AbortSignal: { timeout: () => undefined }, rpc,
    appelClaimedTP: P.appelClaimed, lireBoolTP: P.lireBoolMot, planClaimPot: (o) => P.planClaim({ maintenant, ...o }) /* l horloge simulee (le module lit Date.now du processus) */, envoyerAppels: async (x) => { envois.push(x); return { etat: 'CONFIRME', hash: '0x' + 'ab'.repeat(32) }; },
    phraseNonConfirme: () => 'not confirmed', compte: MOI };
  const noms = Object.keys(deps);
  const api = new Function(...noms, app.slice(a0, a1) + '\nreturn { peindreReclamerPot, reclamerPot, part: () => maPartPot };')(...noms.map((k) => deps[k]));
  return { api, el: (s) => $(s), appels, envois, lus };
}
const veille = (d) => ({ jourId: P.jourIdDeDay(d), day: d, ferme: true, reste: '1230000', owner: '0x' + '0a'.repeat(20) });

async function scenarios(app) {
  const R = {};
  const essai = async (nom, f) => { try { R[nom] = await f(); } catch (e) { R[nom] = false; R[nom + ':err'] = String(e && e.message || e); } };
  const d1 = jour(1), d3 = jour(3), d5 = jour(5), d9 = jour(9);
  await essai('R1-deja-reclamee-cachee', async () => {
    const m = monter(app, { parts: { [P.jourIdDeDay(d1)]: [partDe(d1)] }, reclame: { [d1]: true } });
    await m.api.peindreReclamerPot({ contrat: CT, veille: veille(d1) }, MOI);
    return m.el('#jourReclamerPot').hidden === true && m.api.part() === null;
  });
  await essai('R2-temoin-non-reclamee', async () => {
    const m = monter(app, { parts: { [P.jourIdDeDay(d1)]: [partDe(d1)] }, reclame: {} });
    await m.api.peindreReclamerPot({ contrat: CT, veille: veille(d1) }, MOI);
    return m.el('#jourReclamerPot').hidden === false && m.el('#jourReclamerPot').textContent.includes(P.jourIdDeDay(d1));
  });
  await essai('R3-jour-moins-3', async () => {
    const m = monter(app, { parts: { [P.jourIdDeDay(d3)]: [partDe(d3)] }, reclame: {} });
    await m.api.peindreReclamerPot({ contrat: CT, veille: veille(d1), signes: [{ jourId: P.jourIdDeDay(d3), day: d3, semaine: false }] }, MOI);
    return m.el('#jourReclamerPot').hidden === false && m.el('#jourReclamerPot').textContent.includes(P.jourIdDeDay(d3)) && m.api.part().day === d3;
  });
  await essai('R4-saute-la-reclamee', async () => {
    const m = monter(app, { parts: { [P.jourIdDeDay(d3)]: [partDe(d3)], [P.jourIdDeDay(d5) + '#S']: [partDe(d5, true)] }, reclame: { [d3]: true } });
    await m.api.peindreReclamerPot({ contrat: CT, veille: veille(d1), signes: [{ jourId: P.jourIdDeDay(d3), day: d3, semaine: false }, { jourId: P.jourIdDeDay(d5), day: d5, semaine: true }] }, MOI);
    return m.el('#jourReclamerPot').hidden === false && /weekly/.test(m.el('#jourReclamerPot').textContent) && m.el('#jourReclamerPot').textContent.includes(P.jourIdDeDay(d5));
  });
  await essai('R5-hors-grace', async () => {
    const m = monter(app, { parts: { [P.jourIdDeDay(d9)]: [partDe(d9)] }, reclame: {} });
    await m.api.peindreReclamerPot({ contrat: CT, veille: veille(d1), signes: [{ jourId: P.jourIdDeDay(d9), day: d9, semaine: false }] }, MOI);
    return m.el('#jourReclamerPot').hidden === true && !m.appels.some((u) => u.includes(P.jourIdDeDay(d9)));
  });
  await essai('R6-illisible-cache', async () => {
    const m = monter(app, { parts: { [P.jourIdDeDay(d1)]: [partDe(d1)] }, reclame: {}, rpcCasse: true });
    await m.api.peindreReclamerPot({ contrat: CT, veille: veille(d1) }, MOI);
    return m.el('#jourReclamerPot').hidden === true;
  });
  await essai('R7-clic-relit-claimed', async () => {
    let paye = false;
    const m = monter(app, { parts: { [P.jourIdDeDay(d1)]: [partDe(d1)] }, reclame: () => paye });
    await m.api.peindreReclamerPot({ contrat: CT, veille: veille(d1) }, MOI);
    const montre = m.el('#jourReclamerPot').hidden === false;
    paye = true; /* reclamee ailleurs entre la peinture et le clic */
    await m.api.reclamerPot();
    return montre && m.envois.length === 0 && /already received/.test(m.el('#rollsEtat').textContent);
  });
  await essai('R8-clic-temoin-envoie', async () => {
    const m = monter(app, { parts: { [P.jourIdDeDay(d1)]: [partDe(d1)] }, reclame: {} });
    await m.api.peindreReclamerPot({ contrat: CT, veille: veille(d1) }, MOI);
    await m.api.reclamerPot();
    return m.envois.length === 1 && m.lus.every((d) => d.startsWith('0x96638b6c'));
  });
  return R;
}

/* le serveur : tp.signes (ticketpotJson execute) */
function signesServeur(srv, ticketpotSig) {
  const s0 = srv.indexOf('function ticketpotJson()'), s1 = srv.indexOf('/* ══ LES DUELS LUS SUR LA CHAINE');
  class D extends Date { constructor(...x) { if (x.length) super(...x); else super(maintenant * 1000); } static now() { return maintenant * 1000; } }
  const deps = { TICKETPOT_DEPLOIEMENT: { adresse: CT, bloc: 1 }, ticketpotSrv: { etat: null }, saisonDe, jourSemaineReclamable: P.jourSemaineReclamable, revenu: { ticketpotSig },
    dayDeJourIdPot: P.dayDeJourId, reclamablePotSrv: P.claimableUntil, Date: D };
  const noms = Object.keys(deps);
  return new Function(...noms, srv.slice(s0, s1) + '\nreturn ticketpotJson();')(...noms.map((k) => deps[k])).signes;
}
function scenarioServeur(srv) {
  try {
    const sig = { x: { digest: '0x', signature: '0x' } };
    const s = signesServeur(srv, { [P.jourIdDeDay(jour(3))]: sig, [P.jourIdDeDay(jour(4)) + '#S']: sig, [P.jourIdDeDay(jour(9))]: sig, [P.jourIdDeDay(jour(2))]: {} });
    return Array.isArray(s) && s.length === 2 && s[0].jourId === P.jourIdDeDay(jour(3)) && s[0].semaine === false && s[0].day === jour(3)
      && s[1].jourId === P.jourIdDeDay(jour(4)) && s[1].semaine === true;
  } catch (e) { return false; }
}

const APP = lire('app.html'), SRV = lire('serveur-web.js');
ok(P.appelClaimed && P.appelClaimed(CT, 1, MOI).data.startsWith('0x96638b6c'), 'appelClaimed = claimed(uint32,address) 0x96638b6c');
const R = await scenarios(APP);
for (const [k, v] of Object.entries(R)) if (!k.includes(':')) ok(v === true, k + (R[k + ':err'] ? ' (' + R[k + ':err'] + ')' : ''));
ok(scenarioServeur(SRV) === true, 'S1-serveur-signes (cles signees dans la grace, semaine marquee, expire et vide exclus)');
const MUTANTS = [
  { nom: 'claimed jamais lu a la peinture', de: /if \(\(await dejaReclamePot\(r\.contrat, p\.day, moi\)\) !== false\) continue;/, vers: '', rougit: 'R1-deja-reclamee-cachee' },
  { nom: 'illisible traite comme non reclame', de: /if \(\(await dejaReclamePot\(r\.contrat, p\.day, moi\)\) !== false\) continue;/, vers: 'if ((await dejaReclamePot(r.contrat, p.day, moi)) === true) continue;', rougit: 'R6-illisible-cache' },
  { nom: 'tp.signes ignore', de: /for \(const x of \(tp && Array\.isArray\(tp\.signes\) \? tp\.signes : \[\]\)\)/, vers: 'for (const x of [])', rougit: 'R3-jour-moins-3' },
  { nom: 'signes sans borne de grace', de: /\|\| maintenantP > reclamablePot\(x\.day\)\) continue;/, vers: ') continue;', rougit: 'R5-hors-grace' },
  { nom: 'dejaPaye pas passe au clic', de: /dejaPaye: deja === true \}\)/, vers: '})', rougit: 'R7-clic-relit-claimed' },
];
let tues = 0;
for (const m of MUTANTS) {
  if (!m.de.test(APP)) { ok(false, 'MUTANT ' + m.nom + ' : motif absent de app.html'); continue; }
  const Rm = await scenarios(APP.replace(m.de, m.vers));
  const t = Rm[m.rougit] !== true; if (t) tues += 1;
  ok(t, 'MUTANT ' + m.nom + ' -> ' + m.rougit + ' ROUGIT');
}
{ const de = /\.filter\(\(x\) => x\.day !== null && tS <= reclamablePotSrv\(x\.day\)\)/;
  if (!de.test(SRV)) ok(false, 'MUTANT serveur : motif absent');
  else { const t = scenarioServeur(SRV.replace(de, '.filter((x) => x.day !== null)')) !== true; if (t) tues += 1; ok(t, 'MUTANT serveur : signes sans borne de grace -> S1 ROUGIT'); } }
console.log('mutants tues ' + tues + '/' + (MUTANTS.length + 1));
console.log(n + ' assertions, ' + ko + ' KO — NE PROUVE PAS un claim reel ni le rendu');
if (ko) process.exitCode = 1;
