/* test-ticket-montant-visible-sans-wallet-20261026.mjs — BUY (MARKET) : SANS WALLET, LE MONTANT RESTE A L ECRAN.
 *
 * Mesure navigateur (game56, Chrome headless 390x844, sans wallet, panneau sur UNIT, vue Trade) : on tape 5, on presse « Review the
 *   buy » -> le panneau bascule sur le Chat, la carte « Connect your wallet first. » prend la place, et le champ du montant n est plus
 *   visible (0x0 px) — et il est vide en revenant (le ticket le vidait comme apres un envoi reussi).
 * Attendu : sans wallet, Review NE QUITTE PAS le ticket : le montant reste tape et visible, la phrase « Connect your wallet first »
 *   et un bouton « Connect wallet » s affichent DANS le ticket, sous le champ. Une fois connecte, la revue repart avec ce montant.
 *   Avec un wallet : rien ne change (la commande part au Chat, comme avant).
 * ⛔ EXECUTE le vrai code d app.html (tranche « le ticket de l onglet Trade » -> « LE SWAP DU WALLET ») avec un faux DOM ; les
 *   extractions levent si elles ne trouvent rien. PORTABLE LF/CRLF : rejoue aussi sur une copie CRLF d app.html.
 * ⛔ BORNE : ne prouve pas les pixels (mesure navigateur a part) ni un vrai wallet. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const APP = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0, ko = 0;
const ok = (c, m, vu) => { n += 1; if (c) console.log('  ok  ' + m); else { ko += 1; console.log('  KO  ' + m + (vu === undefined ? '' : '\n        vu : ' + vu)); } };
const W1 = '0x' + '11'.repeat(20);
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27';

class El {
  constructor(id) { this.id = id; this.value = ''; this.textContent = ''; this.className = ''; this.hidden = false; this.disabled = false; this.dataset = {}; this.ecoute = {}; this.attrs = {}; }
  addEventListener(t, f) { (this.ecoute[t] = this.ecoute[t] || []).push(f); }
  async emettre(t) { for (const f of this.ecoute[t] || []) await f({ target: this, preventDefault() {} }); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  focus() {}
}

function tranche(src) {
  const i = src.indexOf('/* ── le ticket de l onglet Trade ── */'), f = src.indexOf('/* ── LE SWAP DU WALLET', i);
  if (i < 0 || f < 0 || f - i < 300) throw new Error('tranche du ticket introuvable dans app.html');
  if (!/\$\('#bcTicket'\)\.addEventListener\('submit'/.test(src.slice(i, f))) throw new Error('ecouteur submit du ticket introuvable dans la tranche');
  return src.slice(i, f);
}

/** un monde : le ticket de `src`, un faux DOM, `compte` au depart, un connecter() qui reussit ou non */
function monde(src, { compte = null, connexionReussie = true } = {}) {
  const els = {};
  for (const id of ['bcTicket', 'bcMontant', 'bcDevise', 'bcTicketNote', 'bcTicketConnect', 'bc-trade']) els['#' + id] = new El(id);
  els['#bcDevise'].value = 'USDC';
  els['#bcTicketConnect'].hidden = true; /* comme dans le HTML livre */
  els['#bcTicket'].requestSubmit = () => els['#bcTicket'].emettre('submit');
  const etat = { executes: [], vues: [], connexions: 0 };
  const ctx = {
    console, String, Number, RegExp, Promise, JSON,
    $: (s) => els[s] || null,
    document: { querySelectorAll: () => [] },
    bc: { cote: 'buy' }, brainAdr: UNIT, compte,
    bcAvancerTicket: () => 1, bcRepeindre: () => {}, bcTicketDeviseChangee: () => {},
    bcIntentionTicket: (d, m) => ({ d, m }), bcGardeTicket: () => () => null,
    bcVue: (v) => etat.vues.push(v),
    texteRefusConnexion: (t) => 'REFUS: ' + t,
    connecter: async () => { etat.connexions += 1; if (connexionReussie) ctx.compte = W1; },
    bcExecuterTexte: async (texte) => { etat.executes.push(texte); ctx.bcVue('chat'); return true; },
  };
  vm.createContext(ctx);
  vm.runInContext(tranche(src), ctx);
  if (!(els['#bcTicket'].ecoute.submit || []).length) throw new Error('aucun ecouteur submit pose par la tranche');
  return { ctx, els, etat, taper: (v) => { els['#bcMontant'].value = v; }, review: () => els['#bcTicket'].emettre('submit') };
}

async function verifier(src, quoi) {
  console.log('— ' + quoi);
  /* le HTML : un bouton de connexion DANS le ticket, sous le champ, cache au depart */
  const iF = src.indexOf('id="bcTicket"'), fF = src.indexOf('</form>', iF);
  const form = iF > 0 && fF > iF ? src.slice(iF, fF) : '';
  ok(form.length > 200, 'formulaire #bcTicket trouve');
  const iM = form.indexOf('id="bcMontant"'), iC = form.indexOf('id="bcTicketConnect"');
  ok(iM > 0 && iC > iM, 'un bouton #bcTicketConnect est DANS le ticket, apres le champ du montant');
  ok(iC > 0 && /<button[^>]*id="bcTicketConnect"[^>]*\shidden[\s>]/.test(form), '#bcTicketConnect est cache au depart');

  /* A. sans wallet : Review ne quitte pas le ticket, le montant reste, la phrase et le bouton sont dans le ticket */
  let w = monde(src);
  w.taper('5'); await w.review();
  ok(w.etat.executes.length === 0, 'A sans wallet : aucune carte au Chat', JSON.stringify(w.etat.executes));
  ok(!w.etat.vues.includes('chat'), 'A sans wallet : le panneau reste sur le ticket', JSON.stringify(w.etat.vues));
  ok(w.els['#bcMontant'].value === '5', 'A sans wallet : le montant tape reste dans le champ', JSON.stringify(w.els['#bcMontant'].value));
  ok(/Connect your wallet first/.test(w.els['#bcTicketNote'].textContent), 'A sans wallet : « Connect your wallet first » dans le ticket', w.els['#bcTicketNote'].textContent);
  ok(w.els['#bcTicketConnect'].hidden === false, 'A sans wallet : le bouton Connect wallet est montre dans le ticket');
  ok(!/0xa6cf/i.test(w.els['#bcTicketNote'].textContent), 'A aucune adresse du wallet de frais dans la note');

  /* B. Connect reussi : la revue repart avec CE montant, le bouton disparait */
  const avant = w.etat.executes.length;
  await w.els['#bcTicketConnect'].emettre('click');
  ok(w.etat.connexions === 1, 'B le bouton appelle connecter()');
  ok(w.etat.executes.length === avant + 1 && w.etat.executes[avant] === 'buy this with 5 USDC', 'B connecte : la revue repart avec le montant tape', JSON.stringify(w.etat.executes));
  ok(w.els['#bcTicketConnect'].hidden === true, 'B connecte : le bouton est cache');

  /* C. Connect rate : le montant reste, la raison est dite, rien ne part */
  w = monde(src, { connexionReussie: false });
  w.taper('5'); await w.review(); await w.els['#bcTicketConnect'].emettre('click');
  ok(w.etat.executes.length === 0 && w.els['#bcMontant'].value === '5', 'C connexion ratee : rien ne part, le montant reste');
  ok(/^REFUS: /.test(w.els['#bcTicketNote'].textContent), 'C connexion ratee : la phrase de refus de connexion de l app', w.els['#bcTicketNote'].textContent);

  /* D. avec un wallet : comme avant */
  w = monde(src, { compte: W1 });
  w.taper('5'); await w.review();
  ok(w.etat.executes.length === 1 && w.etat.executes[0] === 'buy this with 5 USDC', 'D avec wallet : la commande part comme avant', JSON.stringify(w.etat.executes));
}

await verifier(APP, 'app.html tel qu il est sur le disque');
await verifier(APP.replace(/\r?\n/g, '\r\n'), 'app.html en CRLF (checkout Windows)');
console.log((ko ? 'KO' : 'OK') + ' — ' + (n - ko) + '/' + n + ' ; NE PROUVE PAS les pixels (capture navigateur a part)');
process.exit(ko ? 1 : 0);
