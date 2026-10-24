/* test-payer-avec-20261024.mjs — « PAY WITH » DANS LA CARTE DRAWS : LE VRAI CODE DE app.html, EXECUTE (payer-avec-harnais-20261024.mjs).
 * Phil 2026-10-24 : payer les jeux en USDC ou en tout jeton de l app qui a une liquidite profonde ; l app swappe en USDC ; les contrats
 *   (USDC seul) ne changent pas ; le wallet du joueur signe tout.
 * La chaine est FACTICE, nourrie par la mesure enregistree (mesures/misables-20261024.json) ; la liste /api/misables est batie par la VRAIE
 * regle du serveur (coterMisableTailles -> ligneMisable -> listeMisables) sur cette chaine : 26 jetons, 20 / 19 / 18 misables a 0,50 / 5 / 10
 * (les chiffres servis du 24/10). Le wallet est FACTICE (un wallet qui groupe : atomic « supported » ; un qui ne groupe pas : 4200).
 * SCENARIOS
 *   SANS_WALLET   « Pay with: USDC » seul + la ligne qui COMPTE les jetons non misables ; aucun selecteur, aucune lecture de solde ;
 *   SANS_JETON    un wallet qui ne tient aucun jeton liste : pas de selecteur (pas de controle mort) ; balanceOf SEULEMENT des jetons listes ;
 *   SELECTEUR     les options : USDC d abord, puis les jetons TENUS par valeur tenue ; libelle « SYM — about Q for 0.50 USDC · E % » ; un
 *                 jeton tenu en trop petite quantite est grise ; a une taille ou un jeton n est pas misable (taille 10 USDC), il est grise
 *                 avec sa raison ; la ligne muette dit les autres totaux du jeton choisi ;
 *   USDC_DEFAUT   USDC (le defaut) sur Roll, Auto-roll x5, Week pass et Spin, wallet qui groupe ET wallet qui ne groupe pas : les requetes
 *                 au wallet sont OCTET POUR OCTET celles de l app d AVANT (2f1af11) ; les appels = ceux du module du jeu ; aucun devis ;
 *   JETON         NVDAc (Roll, Auto-roll x5, Week pass) et ETH (Spin), lot et suite : les appels envoyes = EXACTEMENT planPayerEnJeton (rejoue
 *                 a part sur la meme chaine) puis les appels du jeu de SON module ; approve EXACT du max-in, jamais illimite ; approve 0 ;
 *                 l USDC balaye vers le JOUEUR ; lot = wallet_sendCalls 2.0.0 atomicRequired ; suite = « the USDC lands in your wallet
 *                 first » ; le resume dit les nombres du plan ENVOYE ; tous les messages sur la ligne d etat de la rangee ;
 *   PERIME        la tete avance de 31 blocs apres le devis : refuse, RIEN n est envoye (aucune requete d envoi au wallet) ;
 *   NON_MISABLE   INFYc pour le Week pass (10 USDC) : refuse au clic, sans meme coter ; HSAIc pour l Auto-roll (2,50 -> taille 5) idem ;
 *                 un ecart VIVANT de 3 % sur NVDAc : refuse apres le devis, rien d envoye ;
 *   RPC           cinq repeints : /api/misables lu une fois, les soldes une fois, zero devis ; un clic USDC : zero devis ; un clic NVDAc : un.
 * Chaque scenario est rejoue sur des COPIES MUTEES de app.html (en memoire) et doit rougir.
 * NE PROUVE PAS : un vrai wallet, un vrai noeud (le banc fork le fait), les pixels (mesure au navigateur a part). */
import { strict as assert } from 'node:assert';
import * as MIS from './misables.js';
import * as BR from './blockrolls-plan.js';
import * as Slots from './slots-plan.js';
import { USDC_BASE } from './frais-creation.js';
import { ROUTEUR_AERODROME_CL } from './calldata-aerodrome.js';
import { selecteur } from './keccak.js';
import { lireApp, appDuCommit, chaineFactice, lignesServies, walletFactice, appelsEnvoyes, charger, choisir, tempsRapide, ROLLS, SLOTS } from './payer-avec-harnais-20261024.mjs';

const remettre = tempsRapide();
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const APP = lireApp();
const AVANT = appDuCommit('2f1af11');
vu(typeof AVANT === 'string' && AVANT.includes('async function rollPaye('), 'app.html de 2f1af11 lu (git show) : le chemin USDC se compare a celui d AVANT');
const LIGNES = await lignesServies();
vu(LIGNES.length === 26 && [0, 1, 2].map((i) => LIGNES.filter((l) => l.tailles[i].misable).length).join('/') === '20/19/18', 'la liste rejouee = la liste servie du 24/10 : 26 jetons, 20/19/18 misables');
const L = (s) => LIGNES.find((l) => l.symbole === s);
const NV = L('NVDAc'), ETHL = L('ETH'), INFY = L('INFYc'), HSAI = L('HSAIc'), AAPL = L('AAPLc');
vu(!!(NV && ETHL && INFY && HSAI && AAPL), 'NVDAc, ETH, INFYc, HSAIc, AAPLc dans la liste');
vu(INFY.tailles[0].misable && !INFY.tailles[2].misable && HSAI.tailles[0].misable && !HSAI.tailles[1].misable, 'INFYc misable a 0,50 pas a 10 ; HSAIc misable a 0,50 pas a 5');
const JOUEUR = '0x' + 'a1'.repeat(20);
const SOLDES = () => new Map([[NV.jeton, 6000000n], [MIS.ETH, 10n ** 16n], [AAPL.jeton, 1n], [INFY.jeton, 10n ** 8n], [HSAI.jeton, 10n ** 9n]]);
const ETAT = { roll: 'rollsEtat', auto: 'rollsEtat', pass: 'potEtat', spin: 'slotsEtat' };
const LIGNES_ETAT = new Set(['rollsEtat', 'potEtat', 'slotsEtat', 'jourPassEtat', 'rollsAttente']);
const bas = (x) => String(x || '').toLowerCase();
const SEL_APPROVE = selecteur('approve(address,uint256)'), SEL_MC = selecteur(MIS.SIG.multicall), SEL_EO = selecteur(MIS.SIG.exactOutputSingle), SEL_SW = selecteur(MIS.SIG.sweepTokenWithFee), SEL_REFUND = selecteur(MIS.SIG.refundETH);
const UMAX = (1n << 256n) - 1n;
const mots = (h) => Array.from({ length: Math.floor(h.length / 64) }, (_, i) => BigInt('0x' + h.slice(i * 64, (i + 1) * 64)));
function decoderMulticall(data) {
  const h = data.slice(10), w = (i) => Number(BigInt('0x' + h.slice(i * 64, (i + 1) * 64)));
  const base = w(0) / 32, nEl = w(base), out = [];
  for (let i = 0; i < nEl; i += 1) { const off = w(base + 1 + i) / 32 + base + 1, len = w(off); out.push('0x' + h.slice((off + 1) * 64, (off + 1) * 64 + len * 2)); }
  return out;
}
/* ce que fait le lot envoye : les approves (jeton, spender, montant), le swap (eo, sweep, refund) */
function lireEnvoi(env) {
  const approves = env.filter((c) => c.data.startsWith(SEL_APPROVE)).map((c) => { const m = mots(c.data.slice(10)); return { jeton: c.to, spender: '0x' + m[0].toString(16).padStart(40, '0'), montant: m[1] }; });
  const sw = env.find((c) => c.to === bas(ROUTEUR_AERODROME_CL));
  let eo = null, sweep = null, refund = false;
  if (sw) {
    const parts = sw.data.startsWith(SEL_MC) ? decoderMulticall(sw.data) : [sw.data];
    for (const p of parts) {
      if (p.startsWith(SEL_EO)) { const m = mots(p.slice(10)); eo = { tokenIn: '0x' + m[0].toString(16).padStart(40, '0'), recipient: '0x' + m[3].toString(16).padStart(40, '0'), amountOut: m[5], max: m[6] }; }
      if (p.startsWith(SEL_SW)) { const m = mots(p.slice(10)); sweep = { token: '0x' + m[0].toString(16).padStart(40, '0'), min: m[1], recipient: '0x' + m[2].toString(16).padStart(40, '0'), bips: m[3] }; }
      if (p.startsWith(SEL_REFUND)) refund = true;
    }
  }
  return { approves, sw, eo, sweep, refund };
}
const memes = (a, b) => a.length === b.length && a.every((x, i) => bas(x.to) === bas(b[i].to) && bas(x.data) === bas(b[i].data) && BigInt(x.value || 0) === BigInt(b[i].value || 0));
const planJeu = {
  roll: () => BR.planRoll({ contrat: ROLLS, usdc: USDC_BASE, guess: [1, 2, 3, 1, 2], rollPrice: 500000n }),
  auto: () => BR.planRolls({ contrat: ROLLS, usdc: USDC_BASE, guesses: Array.from({ length: 5 }, () => [2, 1, 0, 3, 1]), rollPrice: 500000n }),
  pass: () => BR.planPass({ contrat: ROLLS, usdc: USDC_BASE, passPrice: 10000000n, pass: null }),
  spin: () => Slots.planSpin({ contrat: SLOTS, usdc: USDC_BASE, spinPrice: 500000n }),
};
const jeuDe = {
  roll: { genre: 'rolls', contrat: ROLLS, guesses: [[1, 2, 3, 1, 2]], rollPrice: 500000n },
  auto: { genre: 'rolls', contrat: ROLLS, guesses: Array.from({ length: 5 }, () => [2, 1, 0, 3, 1]), rollPrice: 500000n },
  pass: { genre: 'pass', contrat: ROLLS, passPrice: 10000000n, pass: null },
  spin: { genre: 'spins', contrat: SLOTS, n: 1, spinPrice: 500000n },
};
const lancer = (api, flux) => (flux === 'roll' ? api.rollPaye() : flux === 'auto' ? api.autoRollLot(JOUEUR) : flux === 'pass' ? api.passPaye() : api.slotsAgir('spin'));
async function jouer(t, { flux, mode = 'lot', choix = null, chaine = {}, rollsCfg, compte = JOUEUR, soldes = SOLDES() }) {
  const ch0 = chaineFactice({ joueur: JOUEUR, soldes, ...chaine });
  const w = walletFactice({ mode, joueur: JOUEUR });
  const ch = charger(t, { compte, rpc: ch0.rpc, eth: w.eth, lignes: LIGNES, rollsCfg });
  if (ch.api.peindrePayerAvec) await ch.api.peindrePayerAvec();
  const choisi = choix ? choisir(ch, choix) : true;
  const e0 = ch.ecran.ecrits.length, a0 = ch0.st.appels.length;
  let jete = null;
  if (flux) { try { await lancer(ch.api, flux); } catch (e) { jete = String(e && e.stack || e); } }
  return { ch, chain: ch0, w, choisi, jete, ecrits: ch.ecran.ecrits.slice(e0), appelsClic: ch0.st.appels.slice(a0), envoyes: appelsEnvoyes(w.requetes) };
}
const devisDans = (appels) => appels.filter((a) => a.methode === 'eth_call' && bas(a.params[0].to) === MIS.QUOTEUR_CL).length;
const envoisWallet = (w) => w.requetes.filter((r) => /wallet_sendCalls|eth_sendTransaction|wallet_getCapabilities/.test(r.method)).length;
/* le plan ATTENDU, rejoue a part : meme chaine (meme etat), meme devis, meme tete — les primitives de misables.js */
async function planAttendu(flux, ligne, chaine = {}) {
  const { rpc } = chaineFactice({ joueur: JOUEUR, soldes: SOLDES(), ...chaine });
  const besoin = MIS.besoinDuJeu(planJeu[flux](), jeuDe[flux].contrat);
  const cand = MIS.CANDIDATS_CL.find((c) => c.jeton === ligne.jeton && c.pool === ligne.pool);
  const devis = await MIS.coterMisable({ rpc, candidat: cand, usdcSortie: MIS.usdcAViser({ besoin }), reference: ligne.referencePool ? { pool: ligne.referencePool } : null });
  const b = await rpc('eth_getBlockByNumber', ['latest', false]);
  return MIS.planPayerEnJeton({ devis, compte: JOUEUR, jeu: jeuDe[flux], blocActuel: Math.max(parseInt(b.number, 16), devis.bloc), maintenant: parseInt(b.timestamp, 16) });
}

const S = {};
S.SANS_WALLET = async (t) => {
  const r = await jouer(t, { compte: null });
  const e = r.ch.ecran.el;
  const soldes = r.chain.st.appels.filter((a) => a.methode === 'eth_getBalance' || (a.methode === 'eth_call' && a.params[0].data.startsWith('0x70a08231') && a.params[0].data.endsWith(JOUEUR.slice(2))));
  const ok = e('payerAvec').hidden === false && e('payerSeul').hidden === false && e('payerSeul').textContent === '' /* texte du HTML : « Pay with: USDC » */
    && e('payerJeton').hidden === true && e('payerLab').hidden === true && e('payerNote').hidden === false
    && e('payerNote').textContent === '6 other tokens are not deep enough to bet.' && soldes.length === 0 && r.ch.fetchs.length === 1;
  const html = /<span class="note" id="payerSeul">Pay with: USDC<\/span>/.test(t);
  return { ok: ok && html, html, note: e('payerNote').textContent, seul: e('payerSeul').hidden, sel: e('payerJeton').hidden, soldes: soldes.length, fetchs: r.ch.fetchs.length };
};
S.SANS_JETON = async (t) => {
  const r = await jouer(t, { soldes: new Map() });
  const e = r.ch.ecran.el;
  const listees = new Set(LIGNES.filter((l) => l.tailles.some((x) => x.misable) && !l.natif).map((l) => l.jeton));
  const bal = r.chain.st.appels.filter((a) => a.methode === 'eth_call' && a.params[0].data.startsWith('0x70a08231') && a.params[0].data.endsWith(JOUEUR.slice(2)));
  const cibles = new Set(bal.map((a) => bas(a.params[0].to)));
  const ethB = r.chain.st.appels.filter((a) => a.methode === 'eth_getBalance').length;
  const ok = e('payerSeul').hidden === false && e('payerJeton').hidden === true && e('payerLab').hidden === true
    && bal.length === listees.size && [...cibles].every((x) => listees.has(x)) && cibles.size === listees.size && ethB === 1 && devisDans(r.chain.st.appels) === 0;
  return { ok, bal: bal.length, listees: listees.size, ethB, horsListe: [...cibles].filter((x) => !listees.has(x)) };
};
S.SELECTEUR = async (t) => {
  const r = await jouer(t, {});
  const e = r.ch.ecran.el, s = e('payerJeton');
  const vals = s.options.map((o) => o.value), txt = (v) => (s.options.find((o) => o.value === v) || {}).textContent, off = (v) => (s.options.find((o) => o.value === v) || {}).disabled;
  const ordre = vals.join() === ['usdc', HSAI.jeton, MIS.ETH, INFY.jeton, NV.jeton, AAPL.jeton].join();
  const lib = txt(NV.jeton) === 'NVDAc — about 0.00236 for 0.50 USDC · 0.05 %' && txt(MIS.ETH) === 'ETH — about 0.000212 for 0.50 USDC · 0.00 %' && txt('usdc') === 'USDC';
  const gris = off(AAPL.jeton) === true && /\(you hold less\)$/.test(txt(AAPL.jeton)) && !off(NV.jeton) && !off(HSAI.jeton) && !off(INFY.jeton);
  const defaut = s.value === 'usdc' && s.hidden === false && e('payerLab').hidden === false && e('payerSeul').hidden === true && devisDans(r.chain.st.appels) === 0;
  const noteAvant = e('payerNote').textContent;
  const c1 = choisir(r.ch, NV.jeton), noteNv = e('payerNote').textContent;
  const c2 = choisir(r.ch, INFY.jeton), noteInfy = e('payerNote').textContent;
  const c3 = choisir(r.ch, AAPL.jeton) === false; /* grise : la personne ne peut pas le choisir */
  const notes = noteAvant === '6 other tokens are not deep enough to bet.'
    && noteNv === 'With NVDAc: Auto-roll ×5 (2.50 USDC) about 0.0118 · Week pass (10.00 USDC) about 0.0473. 6 other tokens are not deep enough to bet.'
    && noteInfy === 'With INFYc: Auto-roll ×5 (2.50 USDC) about 0.196 · Week pass (10.00 USDC) USDC only: price gap over 1%. 6 other tokens are not deep enough to bet.';
  /* a 10 USDC (un Roll a 10 USDC, hypothetique) : HSAIc et INFYc ne sont pas misables — grises, avec leur raison */
  const r10 = await jouer(t, { rollsCfg: { contrat: ROLLS, prixRoll: '10000000', prixPass: '10000000', passRolls: 3 } });
  const s10 = r10.ch.ecran.el('payerJeton'), t10 = (v) => s10.options.find((o) => o.value === v);
  const taille = t10(HSAI.jeton) && t10(HSAI.jeton).disabled && t10(HSAI.jeton).textContent === 'HSAIc — not for 10.00 USDC: price gap over 1%'
    && t10(INFY.jeton) && t10(INFY.jeton).disabled && t10(INFY.jeton).textContent === 'INFYc — not for 10.00 USDC: price gap over 1%' && !t10(MIS.ETH).disabled && !t10(NV.jeton).disabled
    && t10(AAPL.jeton).disabled && /\(you hold less\)$/.test(t10(AAPL.jeton).textContent);
  return { ok: ordre && lib && gris && defaut && c1 && c2 && c3 && notes && taille, ordre, vals, lib, nv: txt(NV.jeton), eth: txt(MIS.ETH), gris, defaut, notes, noteNv, noteInfy, taille, h10: t10(HSAI.jeton) && t10(HSAI.jeton).textContent };
};
S.USDC_DEFAUT = async (t) => {
  if (!AVANT) return { ok: false, pourquoi: 'app d avant non lue' };
  const res = {};
  for (const flux of ['roll', 'auto', 'pass', 'spin']) for (const mode of ['lot', 'suite']) {
    const a = await jouer(t, { flux, mode }), b = await jouer(AVANT, { flux, mode });
    const attendu = planJeu[flux]().appels;
    const memeWallet = JSON.stringify(a.w.requetes) === JSON.stringify(b.w.requetes) && a.w.requetes.length > 0;
    const k = flux + '/' + mode;
    res[k] = { memeWallet, appels: memes(a.envoyes, attendu), devis: devisDans(a.chain.st.appels), caps: a.w.requetes.filter((x) => x.method === 'wallet_getCapabilities').length, jete: a.jete || b.jete,
      selecteur: a.ch.ecran.el('payerJeton').hidden === false && a.ch.ecran.el('payerJeton').value === 'usdc' };
    res[k].ok = memeWallet && res[k].appels && res[k].devis === 0 && res[k].caps === 0 && !res[k].jete && res[k].selecteur;
  }
  return { ok: Object.values(res).every((x) => x.ok), ko: Object.fromEntries(Object.entries(res).filter(([, v]) => !v.ok)) };
};
S.JETON = async (t) => {
  const cas = [['roll', 'lot', NV], ['roll', 'suite', NV], ['auto', 'lot', NV], ['pass', 'suite', NV], ['pass', 'lot', NV], ['spin', 'lot', ETHL], ['spin', 'suite', ETHL]];
  const res = {};
  for (const [flux, mode, ligne] of cas) {
    const chaine = { deriveDevis: 7 };
    const r = await jouer(t, { flux, mode, choix: ligne.jeton, chaine });
    const att = await planAttendu(flux, ligne, chaine);
    const k = flux + '/' + mode + '/' + ligne.symbole;
    const x = { choisi: r.choisi, jete: r.jete, planPret: att.etat === 'PRET' };
    if (att.etat === 'PRET') {
      const env = r.envoyes, rs = att.resume, jeu = planJeu[flux]().appels, lu = lireEnvoi(env);
      x.exact = memes(env, att.appels);
      x.queueJeu = memes(env.slice(-jeu.length), jeu);
      x.via = mode === 'lot' ? env.every((c) => c.via === 'lot' && c.atomicRequired === true && c.version === '2.0.0') && r.w.requetes.filter((q) => q.method === 'wallet_sendCalls').length === 1
        : env.every((c) => c.via === 'tx') && r.w.requetes.filter((q) => q.method === 'wallet_sendCalls').length === 0;
      x.illimite = lu.approves.some((a) => a.montant === UMAX) || (lu.eo && lu.eo.max === UMAX);
      const apJeton = lu.approves.filter((a) => a.jeton !== MIS.USDC);
      x.approveExact = ligne.natif ? apJeton.length === 0 && lu.sw.value === rs.maxEntree : apJeton.length === 2 && apJeton[0].spender === bas(ROUTEUR_AERODROME_CL) && apJeton[0].montant === rs.maxEntree && lu.eo.max === rs.maxEntree;
      x.remiseAZero = ligne.natif ? lu.refund : apJeton.length === 2 && apJeton[1].montant === 0n && env.findIndex((c) => c === lu.sw) < env.findIndex((c) => c.data.startsWith(SEL_APPROVE) && c.to === ligne.jeton && c.data.endsWith('0'.repeat(64)));
      x.joueur = !!lu.sweep && lu.sweep.recipient === JOUEUR && lu.sweep.min === rs.besoinUsdc && lu.eo.recipient === bas(ROUTEUR_AERODROME_CL) && lu.eo.amountOut === rs.usdcSortie;
      const etat = ETAT[flux], textes = r.ecrits.filter((w) => w.id === etat).map((w) => w.texte), autres = r.ecrits.filter((w) => LIGNES_ETAT.has(w.id) && w.id !== etat);
      const dec = ligne.natif ? 18 : 8, maxEnvoye = ligne.natif ? lu.sw.value : apJeton[0] && apJeton[0].montant;
      const resume = 'Pay with ' + ligne.symbole + ': at most ' + r.ch.api.qteJeton(maxEnvoye, dec, 6, true) + ' ' + ligne.symbole + ' in, exactly ' + Slots.usdcPrecis(lu.eo.amountOut) + ' USDC out (0.10% of the swap kept by the app); the game takes ' + Slots.usdcPrecis(lu.sweep.min) + ' USDC. Prizes are paid in USDC.';
      const avant = textes.find((s) => s.startsWith('Pay with '));
      x.resume = !!avant && avant.startsWith(resume) && (mode === 'lot' ? avant.includes(' One signature for all ' + env.length + ' steps, all or nothing…') : avant.includes(' Your wallet asks for ' + env.length + ' signatures in order: the USDC lands in your wallet first, then the game takes it.'));
      x.ligne = textes.length >= 2 && autres.length === 0;
      x.texte = avant; x.attendu = resume;
      x.ok = x.choisi && !x.jete && x.exact && x.queueJeu && x.via && !x.illimite && x.approveExact && x.remiseAZero && x.joueur && x.resume && x.ligne;
    } else x.ok = false;
    res[k] = x;
  }
  return { ok: Object.values(res).every((x) => x.ok), ko: Object.fromEntries(Object.entries(res).filter(([, v]) => !v.ok)) };
};
S.PERIME = async (t) => {
  const res = {};
  for (const flux of ['roll', 'spin']) {
    const ligne = flux === 'spin' ? ETHL : NV;
    const r = await jouer(t, { flux, choix: ligne.jeton, chaine: { apresDevis: MIS.DEVIS_BLOCS_MAX + 1 } });
    const fin = r.ecrits.filter((w) => w.id === ETAT[flux]).map((w) => w.texte).pop() || '';
    res[flux] = { envois: envoisWallet(r.w), fin, ok: r.choisi && !r.jete && envoisWallet(r.w) === 0 && /blocks old \(more than 30\)/.test(fin) && / Nothing was sent\.$/.test(fin) && r.envoyes.length === 0 };
  }
  /* 30 blocs exactement : encore accepte (la borne est > 30) */
  const r30 = await jouer(t, { flux: 'roll', choix: NV.jeton, chaine: { apresDevis: MIS.DEVIS_BLOCS_MAX } });
  res.borne = { ok: r30.envoyes.length > 0 };
  return { ok: Object.values(res).every((x) => x.ok), res };
};
S.NON_MISABLE = async (t) => {
  const res = {};
  const p = await jouer(t, { flux: 'pass', choix: INFY.jeton });
  const fp = p.ecrits.filter((w) => w.id === 'potEtat').map((w) => w.texte).pop() || '';
  res.passInfy = { fin: fp, devis: devisDans(p.appelsClic), ok: p.choisi && fp === 'No pass bought: INFYc cannot pay 10.00 USDC (price gap over 1%). Nothing was sent.' && devisDans(p.appelsClic) === 0 && envoisWallet(p.w) === 0 };
  const a = await jouer(t, { flux: 'auto', choix: HSAI.jeton });
  const fa = a.ecrits.filter((w) => w.id === 'rollsEtat').map((w) => w.texte).pop() || '';
  res.autoHsai = { fin: fa, ok: a.choisi && fa === 'Not rolled: HSAIc cannot pay 2.50 USDC (price gap over 1%). Nothing was sent.' && devisDans(a.appelsClic) === 0 && envoisWallet(a.w) === 0 };
  /* le prix bouge APRES la liste : 3 % de plus a l entree sur la pool NVDAc -> le devis vivant n est plus misable */
  const v = await jouer(t, { flux: 'roll', choix: NV.jeton, chaine: { ecartForce: new Map([[NV.pool, 1.03]]) } });
  const fv = v.ecrits.filter((w) => w.id === 'rollsEtat').map((w) => w.texte).pop() || '';
  res.vivant = { fin: fv, ok: v.choisi && /^Not rolled: not bettable with NVDAc: paying 500000 raw USDC costs 3\.\d\d% over the pool mid price/.test(fv) && / Nothing was sent\.$/.test(fv) && devisDans(v.appelsClic) === 1 && envoisWallet(v.w) === 0 };
  /* le solde a baisse entre le repeint (option ouverte) et le clic : relu au clic, refuse avant tout envoi */
  const s2 = await jouer(t, { flux: null, choix: NV.jeton, soldes: new Map([[NV.jeton, 2000000n]]) });
  s2.chain.st.soldes.set(NV.jeton, 1000n);
  const e0 = s2.ch.ecran.ecrits.length;
  await s2.ch.api.rollPaye();
  const fs = s2.ch.ecran.ecrits.slice(e0).filter((w) => w.id === 'rollsEtat').map((w) => w.texte).pop() || '';
  res.solde = { fin: fs, ok: s2.choisi && /^Not rolled: you hold 0\.00001 NVDAc; the swap may take up to 0\.00238\d*\. Nothing was sent\.$/.test(fs) && envoisWallet(s2.w) === 0 };
  return { ok: Object.values(res).every((x) => x.ok), res };
};
S.RPC = async (t) => {
  const r = await jouer(t, {});
  for (let i = 0; i < 4; i += 1) await r.ch.api.peindrePayerAvec();
  const bal = r.chain.st.appels.filter((a) => a.methode === 'eth_getBalance' || (a.methode === 'eth_call' && a.params[0].data.startsWith('0x70a08231') && a.params[0].data.endsWith(JOUEUR.slice(2)))).length;
  const repeints = { fetchs: r.ch.fetchs.length, bal, devis: devisDans(r.chain.st.appels) };
  const u = await jouer(t, { flux: 'roll' });
  const j = await jouer(t, { flux: 'roll', choix: NV.jeton });
  const ok = repeints.fetchs === 1 && repeints.bal === 20 && repeints.devis === 0 && devisDans(u.appelsClic) === 0 && devisDans(j.appelsClic) === 1;
  return { ok, repeints, usdc: devisDans(u.appelsClic), jeton: devisDans(j.appelsClic) };
};

for (const k of Object.keys(S)) { const r = await S[k](APP); vu(r.ok === true, 'scenario ' + k + (r.ok ? '' : ' ' + JSON.stringify(r, (_, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 2500))); }

/* ---------------------------------------------------------------- les mutants (copies en memoire) */
const MUT = [
  ['JETON', 'approve illimite', '  const appels = pj.plan.appels;\n', "  const appels = pj.plan.appels.map((a, i) => (i === 0 && a.data.startsWith('0x095ea7b3') ? { ...a, data: a.data.slice(0, 74) + 'f'.repeat(64) } : a));\n"],
  ['JETON', 'destinataire qui n est pas le joueur', 'planPayerEnJeton({ devis, compte: c, jeu,', "planPayerEnJeton({ devis, compte: '0x' + 'be'.repeat(20), jeu,"],
  ['JETON', 'resume d un autre devis que celui envoye', "  const phrase = 'Pay with ' + sym + ': at most ' + qteJeton(r.maxEntree, dec, 6, true)",
    "  const r2 = ((await coterMisable({ rpc, candidat, usdcSortie: vise })).montantIn * 10050n + 9999n) / 10000n;\n  const phrase = 'Pay with ' + sym + ': at most ' + qteJeton(r2, dec, 6, true)"],
  ['JETON', 'remise a zero de l allocation retiree', '  const appels = pj.plan.appels;\n', "  const appels = pj.plan.appels.filter((a) => !(a.data.startsWith('0x095ea7b3') && /0{64}$/.test(a.data)));\n"],
  ['JETON', 'suite sans dire que l USDC arrive d abord', ': the USDC lands in your wallet first, then the game takes it.', '.'],
  ['JETON', 'lot jamais demande au wallet qui groupe', "  if (cap && cap.capacite === 'OUI') {", '  if (false) {'],
  /* 2026-10-24 (revue adverse N2) : l envoi du pass en jeton porte la description du pass (descPass) ; l ancre suit la ligne, meme mutant */
  ['JETON', 'le Week pass ecrit dans la ligne du Roll', "      const rj = await envoyerPaiementJeton(pj, c, dit, ' ' + descPass);",
    "      const rj = await envoyerPaiementJeton(pj, c, (x) => { $('#rollsEtat').textContent = x; }, ' ' + descPass);"],
  ['PERIME', 'controle de peremption retire (la tete n est pas relue)', 'blocActuel: Math.max(tete, Number(devis.bloc))', 'blocActuel: Number(devis.bloc)'],
  ['NON_MISABLE', 'taille non misable permise au clic', "  if (!e.ok) return non(sym + ' cannot pay '", "  if (false) return non(sym + ' cannot pay '"],
  ['NON_MISABLE', 'solde non verifie au clic', '  if (solde < r.maxEntree) return non(', '  if (false) return non('],
  ['SELECTEUR', 'option non misable non grisee', '    opts.push({ v: l.jeton, off: !assez,', '    opts.push({ v: l.jeton, off: false,'],
  ['SELECTEUR', 'ordre alphabetique au lieu de la valeur tenue', '  tenues.sort((a, b) => { const va = valeur(a), vb = valeur(b); return va > vb ? -1 : va < vb ? 1 : 0; });', '  tenues.sort((a, b) => String(a.symbole).localeCompare(String(b.symbole)));'],
  ['USDC_DEFAUT', 'chemin USDC du Roll altere (plus de lot)', "      r = await envoyerAppels(plan.appels, c);\n    }\n    if (!r || r.etat !== 'CONFIRME' || !r.hash) { dit(phraseNonConfirme(r, 'Not rolled')); return; }\n    const lus = await recusLogs(r);\n    const rolled = lireRolledTous(lus.logs, contrat)[0] || null;",
    "      r = await envoyerUnParUn(plan.appels, c);\n    }\n    if (!r || r.etat !== 'CONFIRME' || !r.hash) { dit(phraseNonConfirme(r, 'Not rolled')); return; }\n    const lus = await recusLogs(r);\n    const rolled = lireRolledTous(lus.logs, contrat)[0] || null;"],
  ['USDC_DEFAUT', 'le defaut n est plus USDC', "  if (!payer.choix || payer.choix === 'usdc') return null;", "  if (!payer.choix) return null; if (payer.choix === 'usdc') return payerListees()[0] || null;"],
  ['SANS_WALLET', 'sans wallet un selecteur (controle mort)', '  const avecSelect = opts.length > 1;', '  const avecSelect = true;'],
  ['SANS_JETON', 'balanceOf des jetons NON listes', '  const m = new Map(), file = payerListees().slice();', '  const m = new Map(), file = (payer.lignes || []).slice();'],
  ['RPC', 'devis a chaque repeint', '  rendrePayerAvec(moi, payerActions(c));\n}', "  for (const l of payerListees()) { const cc = MISABLES_CANDIDATS.find((x) => x.jeton === l.jeton); if (cc) await coterMisable({ rpc, candidat: cc, usdcSortie: 500000n }).catch(() => null); }\n  rendrePayerAvec(moi, payerActions(c));\n}"],
  ['RPC', '/api/misables a chaque repeint', '  if (Date.now() - payer.essai < PAYER_TTL_MS) return payer.lignes;\n', ''],
];
let tues = 0;
for (const [s, nom, de, vers] of MUT) {
  vu(APP.split(de).length === 2, 'mutant « ' + nom + ' » : ancre unique');
  const copie = APP.replace(de, () => vers);
  vu(copie !== APP, 'mutant « ' + nom + ' » : la copie differe');
  let r; try { r = await S[s](copie); } catch (e) { r = { ok: false, jete: String(e && e.message), syntaxe: e instanceof SyntaxError }; }
  vu(r.syntaxe !== true, 'mutant « ' + nom + ' » : code valide');
  vu(r.ok === false, 'MUTANT « ' + nom + ' » : ' + s + ' ROUGIT');
  tues += 1;
}
remettre();
console.log('ok payer-avec - ' + n + ' assertions, ' + Object.keys(S).length + ' scenarios, ' + tues + '/' + MUT.length + ' mutants tues ; NE PROUVE PAS un vrai wallet, un vrai noeud (banc fork a part), les pixels');
