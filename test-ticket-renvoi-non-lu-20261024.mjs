/* test-ticket-renvoi-non-lu-20261024.mjs - UN TICKET DU JOUR NON LU SE RENVOIE VRAIMENT : LE RENVOI LE CREDITE, UNE FOIS, ET LE FRAIS N EST
 *   PAS RECOMPTE.
 * Revue adverse du correctif ticketpot (2026-10-24, defaut 2, low-medium) : pour un hash dont NOTRE frais est arrive (verifierFrais ok),
 *   une seule lecture ratee du bloc (eth_getBlockByNumber) faisait repondre crediterVolumeJour NON_LU « send it again in a moment » ; mais
 *   le hash etait quand meme marque dans revenu.vus et le renvoi recevait {deja:true} : le ticket du jour etait perdu pour toujours et la
 *   phrase etait fausse. Le chemin n existait pas avant le jour du bloc (aucune lecture de bloc sur ce chemin).
 * EXECUTE la vraie route POST /api/paye de serveur-web.js + crediterVolumeJour + jourDuRecu + horodatageBloc (decoupes, montes par
 *   new Function) avec les vrais crediter / jourDe / joursPass / saisonDe ; simules : la chaine (tx, recu, bloc lisible ou non),
 *   verifierFrais (frais arrive), volumeVerifie (le recu est juge valide), le prix (20 $ le trade), compterRevenu (compte ses appels),
 *   l horloge.
 * AFFIRME :
 *  N1 swap_action, frais verifie, bloc ILLISIBLE au 1er envoi -> 202 (2e tour, defaut 2 : avec 200 l app ne renvoyait jamais), ticket
 *     NON_LU « send it again », rien de credite ; le renvoi (bloc
 *     lisible) -> ticket CREDITE au jour du BLOC, 20 $ une fois ; le frais compte UNE fois (compterRevenu 2 appels, pas 4) ; un 3e envoi
 *     -> {deja:true} sans rien de plus ; l attente est videe ;
 *  N2 hook_block, meme chose ; le renvoi garde la ligne du 1er envoi (l=skin_mint au renvoi ne change rien) ;
 *  N3 une exception dans crediterVolumeJour (prix illisible) -> la reponse dit NON_LU et le renvoi credite ;
 *  N4 temoin : bloc lisible au 1er envoi -> credite tout de suite, le renvoi -> {deja:true}, rien en attente ;
 *  N5 un renvoi apres plus de 48 h -> TROP_VIEUX (dit), rien de credite, l attente est videe.
 *  MUTANTS (copies en memoire) : attente jamais posee -> N1 ROUGIT ; renvoi par le chemin complet (frais recompte) -> N1 ROUGIT ;
 *  attente jamais videe -> N1 ROUGIT ; exception muette -> N3 ROUGIT.
 * NE PROUVE PAS : un recu reel de Base, ni ce que l app fait de la reponse 202 / ticket (voir test-ticketpot-fix3-app-20261024.mjs). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crediter, jourDe, joursPass, saisonDe } from './tirage-saison.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SRV = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const PAYEUR = '0x' + 'd4'.repeat(20);
const H = (k) => '0x' + k.toString(16).padStart(64, '0');

function monter(src, etat, horloge, chaine, compte) {
  const r0 = src.indexOf("if (chemin === '/api/paye' && req.method === 'POST') {"), r1 = src.lastIndexOf('/*', src.indexOf('REGISTRE DES CREATEURS (2026-10-17'));
  const c0 = src.indexOf('const AGE_MAX_TICKET_MS'), c1 = src.indexOf('async function valeurFraisUsd(');
  const h0 = src.indexOf('async function horodatageBloc(n) {'), h1 = src.indexOf('let rollsScanEnVol');
  if (r0 < 0 || r1 < r0 || c0 < 0 || c1 < c0 || h0 < 0 || h1 < h0) throw new Error('decoupe introuvable');
  class D extends Date { constructor(...x) { if (x.length) super(...x); else super(horloge.t); } static now() { return horloge.t; } }
  const rpc = async (meth, p) => {
    if (meth === 'eth_getTransactionByHash') return { hash: p[0], from: PAYEUR };
    if (meth === 'eth_getTransactionReceipt') return chaine.recus[p[0]] || null;
    if (meth === 'eth_getBlockByNumber') { const ts = chaine.blocs[parseInt(p[0], 16)]; return ts === undefined ? null : { timestamp: '0x' + ts.toString(16) }; }
    throw new Error('rpc ' + meth);
  };
  const deps = {
    revenu: etat, Date: D, LIGNES_FRAIS: ['hook_block', 'swap_action', 'skin_mint'], payesEnCours: new Set(), rpcActivite: rpc, rpcServeur: rpc,
    walletsInternes: () => new Set(), COMPTE_SONDE: '0x00000000000000000000000000000000c0ffee77', process: { env: {} },
    verifierFrais: () => ({ ok: true, externe: true, payeur: PAYEUR, recus: [] }), devisesComptees: () => [], POOLS_ACTIONS_AERODROME: new Map(),
    volumeVerifie: () => ({ ok: true, payeur: PAYEUR, unitWei: (10n ** 18n).toString(), actions: [] }), V4_ADRESSES: { 8453: { poolm: '0x' + '0'.repeat(40) } }, POOLS_UNIT_TB: new Set(), JETONS_ACTIONS: new Set(),
    prixUsdPourPlan: async () => { if (chaine.prixEnPanne) { chaine.prixEnPanne -= 1; throw new Error('prix illisible'); } return 20; }, valeurFraisUsd: async () => 0, crediter, jourDe, joursPass, saisonDe,
    passSkinVerifie: () => ({ ok: false }), BLOCKSKINS_SRV: '0x' + 'c0'.repeat(20), USDC_BASE: '0x' + 'aa'.repeat(20), FEE_WALLET: '0x' + 'fe'.repeat(20), SKIN_MINT_USDC_SRV: 1000000n,
    compterRevenu: (x) => { compte.n += 1; return x; }, createurDuBlock: async () => null, ligneRegistre: () => ({}), horodatagesBlocsRolls: new Map(), console: { log() {} },
  };
  const noms = Object.keys(deps);
  const corps = 'let revenuSale = false;\n' + src.slice(h0, h1) + '\n' + src.slice(c0, c1) + '\nreturn async function route(chemin, req, res) {\n' + src.slice(r0, r1) + '\n};';
  return new Function(...noms, corps)(...noms.map((k) => deps[k]));
}
function poster(route, h, ligne) {
  return new Promise((fin) => {
    const res = { code: 0, writeHead(c) { this.code = c; }, end(b) { fin({ code: this.code, corps: JSON.parse(b) }); } };
    void route('/api/paye', { method: 'POST', url: '/api/paye?h=' + h + '&l=' + ligne }, res);
  });
}
const sec = (ms) => Math.floor(ms / 1000);
const etatVide = () => ({ vus: {}, parJour: {}, tentatives: {}, externe: {}, interne: {}, registre: {} });
const usdDe = (etat, jourId) => (((etat.jours || {})[jourId] || {})[PAYEUR] || {}).usd || 0;
const BLOC_MS = Date.UTC(2026, 9, 24, 10), JB = 'J2026-10-24';

/* un hash, envoye puis renvoye : `lisibleAu` = le numero de l envoi (1, 2, ...) a partir duquel le bloc se lit */
async function sequence(src, { ligne = 'swap_action', lisibleAu = 2, envois = 3, posteMs = [Date.UTC(2026, 9, 24, 11), Date.UTC(2026, 9, 24, 11, 1), Date.UTC(2026, 9, 24, 11, 2)], lignes = null, prixEnPanne = 0 }) {
  const h = H(7), etat = etatVide(), compte = { n: 0 }, horloge = { t: posteMs[0] };
  const chaine = { recus: { [h]: { blockNumber: '0x1f4', status: '0x1' } }, blocs: {}, prixEnPanne };
  const route = monter(src, etat, horloge, chaine, compte);
  const reps = [];
  for (let k = 1; k <= envois; k++) {
    horloge.t = posteMs[k - 1];
    if (k >= lisibleAu) chaine.blocs[500] = sec(BLOC_MS);
    reps.push(await poster(route, h, lignes ? lignes[k - 1] : ligne));
    reps[k - 1].usd = usdDe(etat, JB);
  }
  return { etat, reps, compte, h };
}

async function scenarios(src) {
  const R = {};
  const essai = async (nom, f) => { try { R[nom] = await f(); } catch (e) { R[nom] = false; R[nom + ':err'] = String(e && e.message || e); } };
  await essai('N1-renvoi-credite-une-fois', async () => {
    const { etat, reps, compte, h } = await sequence(src, {});
    const [r1, r2, r3] = reps;
    R['N1:detail'] = reps.map((r) => r.code + ' ' + JSON.stringify(r.corps.ticket || null) + ' deja=' + !!r.corps.deja + ' usd=' + r.usd).join(' | ') + ' | compterRevenu ' + compte.n;
    return r1.code === 202 && r1.corps.ok === true && r1.corps.ticket && r1.corps.ticket.etat === 'NON_LU' && /send it again/.test(r1.corps.ticket.pourquoi) && r1.usd === 0
      && r2.corps.ticket && r2.corps.ticket.etat === 'CREDITE' && r2.corps.ticket.jourId === JB && r2.usd === 20
      && r3.code === 200 && r3.corps.deja === true && !r3.corps.ticket && r3.usd === 20
      && compte.n === 2 && !!etat.vus[h] && !((etat.ticketsEnAttente || {})[h]);
  });
  await essai('N2-hook-block-ligne-gardee', async () => {
    const { etat, reps, compte } = await sequence(src, { ligne: 'hook_block', lignes: ['hook_block', 'skin_mint', 'skin_mint'] });
    return reps[0].corps.ticket && reps[0].corps.ticket.etat === 'NON_LU' && reps[1].corps.ticket && reps[1].corps.ticket.etat === 'CREDITE' && usdDe(etat, JB) === 20 && compte.n === 2;
  });
  await essai('N3-exception-dite-et-renvoi', async () => {
    const { reps, compte } = await sequence(src, { lisibleAu: 1, prixEnPanne: 1 });
    return reps[0].corps.ticket && reps[0].corps.ticket.etat === 'NON_LU' && reps[0].usd === 0 && reps[1].corps.ticket && reps[1].corps.ticket.etat === 'CREDITE' && reps[1].usd === 20 && compte.n === 2;
  });
  await essai('N4-temoin-lisible-tout-de-suite', async () => {
    const { etat, reps, compte, h } = await sequence(src, { lisibleAu: 1, envois: 2 });
    return reps[0].corps.ticket && reps[0].corps.ticket.etat === 'CREDITE' && reps[0].usd === 20 && reps[1].corps.deja === true && !reps[1].corps.ticket && reps[1].usd === 20
      && compte.n === 2 && !((etat.ticketsEnAttente || {})[h]);
  });
  await essai('N5-renvoi-apres-48h', async () => {
    const { etat, reps, h } = await sequence(src, { envois: 2, posteMs: [Date.UTC(2026, 9, 24, 11), Date.UTC(2026, 9, 26, 10, 1)] });
    return reps[1].corps.ticket && reps[1].corps.ticket.etat === 'TROP_VIEUX' && reps[1].usd === 0 && !((etat.ticketsEnAttente || {})[h]);
  });
  return R;
}

const R = await scenarios(SRV);
for (const [k, v] of Object.entries(R)) if (!k.includes(':')) ok(v === true, k + (R[k + ':err'] ? ' (' + R[k + ':err'] + ')' : ''));
console.log('    N1 : ' + R['N1:detail']);
const MUTANTS = [
  { nom: 'attente jamais posee', de: /if \(ticketTP && ticketTP\.etat === 'NON_LU'\) \{/, vers: 'if (false) {', rougit: 'N1-renvoi-credite-une-fois' },
  { nom: 'renvoi par le chemin complet (frais recompte)', de: /if \(revenu\.vus\[h\] && enAttenteTicket\) \{/, vers: 'if (false) {', rougit: 'N1-renvoi-credite-une-fois' },
  { nom: 'attente jamais videe', de: /if \(!tk \|\| tk\.etat !== 'NON_LU'\) \{ delete revenu\.ticketsEnAttente\[h\]; revenuSale = true; \}/, vers: '', rougit: 'N1-renvoi-credite-une-fois' },
  { nom: 'exception muette', de: /if \(ligne === 'hook_block' \|\| ligne === 'swap_action'\) ticketTP = \{ ok: false, etat: 'NON_LU'/, vers: 'if (false) ticketTP = { ok: false, etat: \'NON_LU\'', rougit: 'N3-exception-dite-et-renvoi' },
];
let tues = 0;
for (const m of MUTANTS) {
  if (!m.de.test(SRV)) { ok(false, 'MUTANT ' + m.nom + ' : motif absent de la source'); continue; }
  const Rm = await scenarios(SRV.replace(m.de, m.vers));
  const t = Rm[m.rougit] !== true; if (t) tues += 1;
  ok(t, 'MUTANT ' + m.nom + ' -> ' + m.rougit + ' ROUGIT');
}
console.log('mutants tues ' + tues + '/' + MUTANTS.length);
console.log(n + ' assertions, ' + ko + ' KO - NE PROUVE PAS un recu reel de Base, ni ce que l app fait de la reponse');
if (ko) process.exitCode = 1;
