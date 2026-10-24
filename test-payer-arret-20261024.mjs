/* test-payer-arret-20261024.mjs — UN PAIEMENT EN JETON ARRETE EN ROUTE, SUR LE VRAI CODE DE app.html (payer-avec-harnais-20261024.mjs).
 * Revue adverse 2026-10-24 (FAIL) : D1 HAUT — en envoi a la suite (wallet sans wallet_sendCalls atomique), un paiement en jeton arrete
 *   APRES le swap montrait la phrase des rolls USDC « Stopped after 4 steps went through (you declined — nothing was sent)… Settle pending
 *   rolls » : fausse (0,50 USDC dans le wallet, l approbation USDC du jeu ouverte, aucun roll). D2 MOYEN — une approbation laissee ouverte
 *   (reset refuse, swap annule apres la deadline de 180 s) n etait ni dite ni remise a 0. N1 — le devis vivant n etait pas compare a
 *   l estimation listee. N2 — le Week pass en jeton perdait la description du pass et la phrase du pot du jour.
 * La chaine est FACTICE (la mesure enregistree) + un MODELE des allocations (approve pose, swap consomme le devis, le jeu consomme son prix) ;
 *   le wallet est FACTICE, en SUITE (4200 sur getCapabilities / sendCalls) : il REFUSE (4001) l etape k, ou fait ANNULER la tx du swap.
 * SCENARIOS
 *   ETAPES   Roll, Auto-roll x5, Spin, Week pass avec NVDAc (et le Spin avec l ETH) : refus a CHAQUE etape k. La ligne de SA rangee dit
 *            « Stopped at step k+1 of N, <l etape> : you declined it in your wallet. » puis, selon l etape atteinte : rien / l approbation
 *            seule / « The swap went through: X USDC is now in your wallet. Nothing was paid to the game. » (X = la sortie exacte moins le
 *            frais retenu) / une partie des rolls ; jamais « nothing was sent » apres une etape passee, jamais « Settle pending rolls » sans
 *            roll parti. Les approbations dites = celles LUES (allowance) et = la table attendue par etape ; un bouton par approbation
 *            ouverte, + « Finish with USDC » ssi le swap est passe et que le jeu n a rien pris.
 *   ANNULE   le swap revert (deadline) : « it reverted on Base », « Only the approval went through », l allocation jeton -> routeur dite
 *            ouverte avec son montant (le max-in) et son bouton.
 *   RESET    « Reset the approval » : le wallet recoit EXACTEMENT approve(spender, 0) sur ce jeton ; l allocation relue est 0 ; la ligne le dit.
 *   FINIR    « Finish with USDC » : le selecteur revient a USDC et le wallet recoit EXACTEMENT le plan USDC du jeu (approve exact + l appel).
 *   REPEINT  la ligne des slots reecrite avec le meme texte : les boutons reviennent (reposerArret) ; un autre texte : aucun bouton.
 *   LOT      un lot atomique refuse : la phrase d avant (rien de partiel), AUCUNE lecture d allocation.
 *   N1       la liste dit NVDAc 2 % moins cher que le devis vivant : refuse au clic, rien n est envoye ; 0,5 % : passe.
 *   N2       le Week pass en NVDAc : avant la signature, la description du pass (tickets, rolls, pot des rolls) ; apres, la phrase du pot du jour.
 * Chaque scenario est rejoue sur des COPIES MUTEES (app.html et payer-arret.js, en memoire) et doit rougir.
 * NE PROUVE PAS : un vrai wallet, un vrai noeud (banc-payer-avec-fork-20261024 : le Spin en jeton refuse en route, sur un fork), les pixels. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import * as MIS from './misables.js';
import * as BR from './blockrolls-plan.js';
import * as Slots from './slots-plan.js';
import * as PA from './payer-arret.js';
import { USDC_BASE } from './frais-creation.js';
import { ROUTEUR_AERODROME_CL, FRAIS_INTERFACE_BPS_CL } from './calldata-aerodrome.js';
import { selecteur } from './keccak.js';
import { lireApp, chaineFactice, lignesServies, walletFactice, appelsEnvoyes, charger, choisir, tempsRapide, ROLLS, SLOTS } from './payer-avec-harnais-20261024.mjs';

const remettre = tempsRapide();
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const APP = lireApp();
const SRC_PA = readFileSync(new URL('./payer-arret.js', import.meta.url), 'utf8');
vu(PA.SEL_APPROVE === selecteur('approve(address,uint256)') && PA.SEL_ALLOWANCE === selecteur('allowance(address,address)'), 'les selecteurs ecrits en clair = keccak (approve, allowance)');
const LIGNES = await lignesServies();
const L = (s) => LIGNES.find((l) => l.symbole === s);
const NV = L('NVDAc'), ETHL = L('ETH');
vu(!!(NV && ETHL), 'NVDAc et ETH dans la liste rejouee');
const JOUEUR = '0x' + 'a1'.repeat(20);
const bas = (x) => String(x || '').toLowerCase();
const ROUTEUR = bas(ROUTEUR_AERODROME_CL), USDC = bas(USDC_BASE);
const ETAT = { roll: 'rollsEtat', auto: 'rollsEtat', pass: 'potEtat', spin: 'slotsEtat' };
const PRIX = { roll: 500000n, auto: 500000n, pass: 10000000n, spin: 500000n };
const CONTRAT = { roll: ROLLS, auto: ROLLS, pass: ROLLS, spin: SLOTS };
const motA = (a) => bas(a).slice(2).padStart(64, '0');

/* le monde : la chaine factice + les allocations (modele), le wallet en SUITE qui refuse l etape `refus` ou fait annuler l etape `annule` */
function monde({ refus = -1, annule = -1, soldes = null, lignes = LIGNES, mode = 'suite' } = {}) {
  const base = chaineFactice({ soldes: soldes || new Map([[NV.jeton, 6000000n], [MIS.ETH, 10n ** 16n]]), joueur: JOUEUR });
  const allow = new Map(), reverts = new Set(), lectures = [];
  let i = 0, nh = 0, prixJeu = 0n;
  const cle = (j, s) => bas(j) + ':' + bas(s);
  const rpc = async (m, p) => {
    if (m === 'eth_call' && bas(p[0].data).startsWith(PA.SEL_ALLOWANCE)) {
      const d = bas(p[0].data), proprio = '0x' + d.slice(34, 74), spender = '0x' + d.slice(98, 138);
      lectures.push({ jeton: bas(p[0].to), proprio, spender });
      return '0x' + (proprio === JOUEUR ? (allow.get(cle(p[0].to, spender)) || 0n) : 0n).toString(16).padStart(64, '0');
    }
    if (m === 'eth_getTransactionReceipt' && reverts.has(p[0])) return { status: '0x0', logs: [], transactionHash: p[0], gasUsed: '0x1' };
    return base.rpc(m, p);
  };
  const appliquer = (c) => {
    const d = bas(c.data);
    if (d.startsWith(PA.SEL_APPROVE)) { allow.set(cle(c.to, '0x' + d.slice(34, 74)), BigInt('0x' + d.slice(74, 138))); return; }
    if (bas(c.to) === ROUTEUR) {
      /* le swap : le jeton depense = le devis (max-in / 1,005), le reste de l allocation reste OUVERT tant que le reset ne passe pas */
      for (const [k, v] of allow) if (k.endsWith(':' + ROUTEUR) && v > 0n) allow.set(k, v - (v * 10000n) / 10050n);
      return;
    }
    for (const [k, v] of allow) if (k.startsWith(USDC + ':') && k.endsWith(':' + bas(c.to)) && v > 0n) allow.set(k, v - (prixJeu < v ? prixJeu : v));
  };
  const envoyer = async (genre, calls) => {
    const hs = [];
    for (const c of calls) {
      const k = i++;
      if ((Array.isArray(refus) ? refus.includes(k) : k === refus)) { const e = new Error('User rejected the request.'); e.code = 4001; throw e; }
      const h = '0x' + (++nh).toString(16).padStart(64, '0');
      if (k === annule) reverts.add(h); else appliquer(c);
      hs.push(h);
    }
    return hs;
  };
  const w = walletFactice({ mode, joueur: JOUEUR, envoyer });
  return { rpc, w, allow, lectures, st: base.st, fixerPrix: (p) => { prixJeu = p; }, cle };
}
async function jouer(app, flux, o = {}) {
  const m = monde(o);
  m.fixerPrix(PRIX[flux]);
  const ch = charger(app, { compte: JOUEUR, rpc: m.rpc, eth: m.w.eth, lignes: o.lignes || LIGNES, arret: o.arret });
  await ch.api.peindrePayerAvec();
  const ligne = o.ligne || NV;
  const choisi = choisir(ch, ligne.jeton);
  const e0 = ch.ecran.ecrits.length;
  await (flux === 'roll' ? ch.api.rollPaye() : flux === 'auto' ? ch.api.autoRollLot(JOUEUR) : flux === 'pass' ? ch.api.passPaye() : ch.api.slotsAgir('spin'));
  const el = ch.ecran.el(ETAT[flux]);
  const textes = ch.ecran.ecrits.slice(e0).filter((x) => x.id === ETAT[flux]).map((x) => x.texte);
  const autres = ch.ecran.ecrits.slice(e0).filter((x) => x.id !== ETAT[flux] && /Stopped|approval|swap/.test(x.texte)).map((x) => x.id);
  const boutons = [...String(el.innerHTML || '').matchAll(/data-arret="([^"]+)">([^<]+)</g)].map((x) => ({ k: x[1], t: x[2] }));
  return { m, ch, choisi, el, fin: el.textContent, textes, autres, boutons, env: appelsEnvoyes(m.w.requetes) };
}
/* le clic passe par l ecouteur (void agirArret) : on attend que la ligne ait fini (macrotaches ; setTimeout est immediat ici) */
async function attendre(cond) { for (let i = 0; i < 20000 && !cond(); i += 1) await new Promise((o) => setImmediate(o)); return cond(); }
const usdcRecuDe = (besoin) => { const v = MIS.usdcAViser({ besoin }); return v - (v * FRAIS_INTERFACE_BPS_CL) / 10000n; };
const nJeu = { roll: 1, auto: 5, pass: 1, spin: 1 };
const ROLES = (natif, flux) => [...(natif ? ['swap'] : ['approveJeton', 'swap', 'reset']), 'approveJeu', ...Array(nJeu[flux]).fill('jeu')];

/* ce que la ligne DOIT dire a l etape k (table independante du code : les roles du plan, pas sa phrase) */
function attendu(flux, k, natif = false) {
  const roles = ROLES(natif, flux), N = roles.length, iSwap = roles.indexOf('swap'), iJeu = roles.indexOf('approveJeu');
  const swapFait = k > iSwap, jeuFait = Math.max(0, k - iJeu - 1);
  const ouvRouteur = !natif && k >= 1 && k <= 2; /* approve pose (k>=1), reset pas encore passe (k<=2) */
  const ouvJeu = k > iJeu && jeuFait < nJeu[flux];
  return { N, roles, swapFait, jeuFait, ouvRouteur, ouvJeu, finir: swapFait && jeuFait === 0 };
}
const NOM = { approveJeton: /the NVDAc approval for the swap/, swap: /the swap to USDC/, reset: /the reset of the NVDAc approval to 0/, approveJeu: /the USDC approval for the game/ };

const S = {
  /* ETAPES : refus a chaque etape, quatre gestes, NVDAc ; le Spin en ETH */
  async ETAPES(app, arret) {
    const res = [];
    for (const [flux, natif] of [['roll', false], ['auto', false], ['spin', false], ['pass', false], ['spin', true]]) {
      const A0 = attendu(flux, 0, natif);
      for (let k = 0; k < A0.N; k += 1) {
        const A = attendu(flux, k, natif), sym = natif ? 'ETH' : 'NVDAc';
        const r = await jouer(app, flux, { refus: k, ligne: natif ? ETHL : NV, arret });
        const f = r.fin, ok = [];
        const pre = 'Stopped at step ' + (k + 1) + ' of ' + A.N + ', ';
        ok.push(r.choisi && f.startsWith(pre) && f.includes(': you declined it in your wallet.'));
        const role = A.roles[k];
        ok.push(role === 'jeu' ? (flux === 'auto' ? f.startsWith(pre + 'roll ' + (A.jeuFait + 1) + ' of 5:') : f.includes({ roll: 'the roll:', spin: 'the spin:', pass: 'the Week pass purchase:' }[flux])) : NOM[role].source.replace(/NVDAc/g, sym).length > 0 && new RegExp(NOM[role].source.replace(/NVDAc/g, sym)).test(f));
        ok.push(!/nothing was sent/i.test(f) || k === 0);
        ok.push(A.jeuFait > 0 ? /Settle pending rolls/.test(f) : !/Settle pending rolls/.test(f));
        const X = Slots.usdcPrecis(usdcRecuDe(PRIX[flux] * BigInt(nJeu[flux])));
        if (A.swapFait && A.jeuFait === 0) ok.push(f.includes('The swap went through: ' + X + ' USDC is now in your wallet. Nothing was paid to the game.'));
        else if (!A.swapFait) ok.push(f.includes((k === 0 ? 'Nothing went through' : 'Only the approval went through') + ': no ' + sym + ' was swapped and nothing was paid to the game.'));
        else ok.push(f.includes('The swap went through and ' + A.jeuFait + ' of 5 rolls went through'));
        /* les approbations dites = la table attendue ET = le modele lu */
        const ditRouteur = f.includes('your ' + sym + ' approval to the swap router (up to '), ditJeu = f.includes('your USDC approval to the game (up to ');
        ok.push(ditRouteur === A.ouvRouteur && ditJeu === A.ouvJeu);
        const ouvModele = [...r.m.allow.entries()].filter(([, v]) => v > 0n).length;
        ok.push(ouvModele === (A.ouvRouteur ? 1 : 0) + (A.ouvJeu ? 1 : 0));
        if (A.ouvJeu) { const reste = PRIX[flux] * BigInt(nJeu[flux] - A.jeuFait); ok.push(f.includes('your USDC approval to the game (up to ' + Slots.usdcPrecis(reste) + ' USDC)')); }
        if (!A.ouvRouteur && !A.ouvJeu) ok.push(f.includes('No approval is left open.'));
        const nRes = (A.ouvRouteur ? 1 : 0) + (A.ouvJeu ? 1 : 0);
        ok.push(r.boutons.filter((b) => /^r\d$/.test(b.k)).length === nRes && r.boutons.some((b) => b.k === 'f') === A.finir);
        if (nRes === 1) ok.push(r.boutons.find((b) => b.k === 'r0').t === 'Reset the approval');
        ok.push(r.autres.length === 0);
        /* lectures : les paires du plan (approves non nuls), du joueur — jamais deduites */
        ok.push(r.m.lectures.length === (natif ? 1 : 2) && r.m.lectures.every((x) => x.proprio === JOUEUR));
        res.push({ flux, natif, k, ok: ok.every(Boolean), detail: ok.map((x) => (x ? 1 : 0)).join(''), f });
      }
    }
    const bad = res.filter((x) => !x.ok);
    return { ok: bad.length === 0 && res.length === 5 + 9 + 5 + 5 + 3, n: res.length, bad: bad.slice(0, 2) };
  },
  /* ANNULE : le swap revert (deadline passee) */
  async ANNULE(app, arret) {
    const r = await jouer(app, 'roll', { annule: 1, arret });
    const f = r.fin;
    const maxIn = BigInt('0x' + r.env[0].data.slice(74, 138));
    const ok = f.startsWith('Stopped at step 2 of 5, the swap to USDC: it reverted on Base.') && f.includes('Only the approval went through: no NVDAc was swapped and nothing was paid to the game.')
      && f.includes('your NVDAc approval to the swap router (up to ' + r.ch.api.qteJeton(maxIn, 8, 6, true) + ' NVDAc)') && r.boutons.length === 1 && r.boutons[0].t === 'Reset the approval';
    return { ok, f };
  },
  /* RESET : le bouton envoie EXACTEMENT approve(spender, 0) ; la ligne relit et le dit */
  async RESET(app, arret) {
    const r = await jouer(app, 'roll', { refus: 2, arret });
    const avant = r.env.length;
    const el = r.el;
    el.ecouteurs.click({ target: { closest: () => ({ dataset: { arret: 'r0' } }) } });
    await attendre(() => !el.textContent.startsWith('Reset: '));
    const envoi = appelsEnvoyes(r.m.w.requetes).slice(avant);
    const ok1 = envoi.length === 1 && envoi[0].to === bas(NV.jeton) && envoi[0].data === PA.SEL_APPROVE + motA(ROUTEUR) + '0'.repeat(64) && envoi[0].value === 0n;
    const ok2 = r.m.allow.get(r.m.cle(NV.jeton, ROUTEUR)) === 0n;
    const f = el.textContent;
    const ok3 = f.startsWith('Your NVDAc approval was reset. No approval is left open.') && f.includes('You can still finish with USDC.');
    const bs = [...String(el.innerHTML).matchAll(/data-arret="([^"]+)"/g)].map((x) => x[1]);
    /* le reset REFUSE a son tour : la ligne le dit et RELIT (l approbation reste ouverte, son bouton aussi) */
    const q = await jouer(app, 'roll', { refus: [2, 3], arret });
    q.el.ecouteurs.click({ target: { closest: () => ({ dataset: { arret: 'r0' } }) } });
    await attendre(() => !q.el.textContent.startsWith('Reset: '));
    const g = q.el.textContent;
    const ok4 = g.startsWith('Not reset: you declined in your wallet') && g.includes('Still open: your NVDAc approval to the swap router (up to ') && /data-arret="r0"/.test(String(q.el.innerHTML));
    return { ok: ok1 && ok2 && ok3 && ok4 && bs.join() === 'f', f, g, envoi: envoi.length, bs };
  },
  /* FINIR : « Finish with USDC » apres le swap : le plan USDC du Roll, tel que son module le batit */
  async FINIR(app, arret) {
    const r = await jouer(app, 'roll', { refus: 3, arret });
    const avant = appelsEnvoyes(r.m.w.requetes).length;
    r.el.ecouteurs.click({ target: { closest: () => ({ dataset: { arret: 'f' } }) } });
    await attendre(() => /^(Sent|Not rolled|Rolled)/.test(r.el.textContent));
    const envoi = appelsEnvoyes(r.m.w.requetes).slice(avant);
    const p = BR.planRoll({ contrat: ROLLS, usdc: USDC_BASE, guess: [1, 2, 3, 1, 2], rollPrice: 500000n });
    const memes = envoi.length === p.appels.length && envoi.every((c, i) => c.to === bas(p.appels[i].to) && c.data === bas(p.appels[i].data));
    return { ok: memes && r.ch.api.payer.choix === 'usdc' && r.ch.ecran.el('payerJeton').value === 'usdc', n: envoi.length };
  },
  /* REPEINT : la ligne des slots reecrite (meme texte) -> boutons reposes ; un autre texte -> aucun */
  async REPEINT(app, arret) {
    const r = await jouer(app, 'spin', { refus: 4, arret });
    const el = r.el, t = el.textContent, n0 = r.boutons.length;
    el.textContent = t; r.ch.api.reposerArret(el);
    const n1 = (String(el.innerHTML).match(/data-arret=/g) || []).length;
    el.textContent = 'No spin waiting.'; r.ch.api.reposerArret(el);
    const n2 = (String(el.innerHTML).match(/data-arret=/g) || []).length;
    return { ok: n0 === 2 && n1 === 2 && n2 === 0 && r.ch.api.payerArrets.get('slotsEtat').texte === t, n0, n1, n2 };
  },
  /* LOT : un lot atomique refuse -> la phrase d avant, aucune lecture d allocation */
  async LOT(app, arret) {
    const m = monde({ mode: 'lot' });
    const w = walletFactice({ mode: 'lot', joueur: JOUEUR, envoyer: async () => { const e = new Error('User rejected the request.'); e.code = 4001; throw e; } });
    const ch = charger(app, { compte: JOUEUR, rpc: m.rpc, eth: w.eth, lignes: LIGNES, arret });
    await ch.api.peindrePayerAvec(); choisir(ch, NV.jeton);
    await ch.api.rollPaye();
    const f = ch.ecran.el('rollsEtat').textContent;
    return { ok: /^Not rolled: /.test(f) && !/Stopped at step/.test(f) && m.lectures.length === 0, f };
  },
  /* N1 : la liste plus basse que le devis vivant de 2 % -> refuse ; de 0,5 % -> passe */
  async N1(app, arret) {
    const baisser = (bps) => LIGNES.map((l) => (l.jeton !== NV.jeton ? l : { ...l, tailles: l.tailles.map((t) => ({ ...t, montantIn: t.montantIn ? String((BigInt(t.montantIn) * BigInt(10000 - bps)) / 10000n) : t.montantIn })) }));
    const a = await jouer(app, 'roll', { lignes: baisser(200), arret });
    const okA = /^Not rolled: the live NVDAc price is 2\.\d\d% above the listed estimate \(more than 1%\)\./.test(a.fin) && / Nothing was sent\.$/.test(a.fin) && a.env.length === 0;
    const b = await jouer(app, 'roll', { lignes: baisser(50), arret });
    const okB = b.env.length === 5 && !/listed estimate/.test(b.textes.join(' '));
    return { ok: okA && okB, fa: a.fin, nb: b.env.length };
  },
  /* N2 : le Week pass en NVDAc dit le pass avant, et le pot du jour apres */
  async N2(app, arret) {
    const r = await jouer(app, 'pass', { arret });
    const avant = r.textes.find((x) => x.startsWith('Pay with NVDAc')) || '';
    const ok = avant.includes('Week pass 10.00 USDC: your daily ticket for 7 UTC days') && avant.includes('A pass-roll win is paid from the roll pot: it holds')
      && r.fin.includes('Today\'s pass pot goes whole to one buyer') && r.env.length === 5;
    return { ok, avant: avant.slice(0, 80), fin: r.fin.slice(0, 80) };
  },
};

for (const [k, f] of Object.entries(S)) { const r = await f(APP, null); vu(r.ok === true, 'scenario ' + k + ' ' + JSON.stringify(r, (_, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 900)); }

/* ---------------------------------------------------------------- les mutants (copies en memoire) */
const MUT_APP = [
  ['ETAPES', 'le Roll en jeton arrete reprend la phrase des rolls USDC', "      if (r && r.aLaSuite && r.etat !== 'CONFIRME') { await direArretJeton({ pj, r, c, e, jeu: 'roll', refaire: () => rollPaye() }); return; }\n", ''],
  ['ETAPES', 'le Spin en jeton arrete reprend la phrase des rolls USDC', "      if (r && r.aLaSuite && r.etat !== 'CONFIRME') { slotsCfg.dernier = await direArretJeton({", "      if (false) { slotsCfg.dernier = await direArretJeton({"],
  ['ETAPES', 'le Week pass arrete reprend la phrase des rolls USDC', "      if (rj && rj.aLaSuite && rj.etat !== 'CONFIRME') {", '      if (false) {'],
  ['ETAPES', 'l Auto-roll arrete reprend la phrase des rolls USDC', "    if (r && r.aLaSuite && r.etat !== 'CONFIRME') { await direArretJeton({ pj, r, c, e, jeu: 'auto',", "    if (false) { await direArretJeton({ pj, r, c, e, jeu: 'auto',"],
  ['ETAPES', 'approbations jamais lues (deduites a vide)', '  for (const p of paresAVerifier(plan.appels)) {\n    let m = null;', '  for (const p of []) {\n    let m = null;'],
  ['ETAPES', 'le bouton Finish offert meme apres un jeu paye', '    compte: String(c).toLowerCase(), base, pares: paresAVerifier(plan.appels), finir: b.finirEnUsdc ? refaire : null,', '    compte: String(c).toLowerCase(), base, pares: paresAVerifier(plan.appels), finir: refaire,'],
  ['ETAPES', 'la ligne d un autre geste (le Spin ecrit sous le Roll)', "slotsCfg.dernier = await direArretJeton({ pj, r, c, e: etat,", "slotsCfg.dernier = await direArretJeton({ pj, r, c, e: $('#rollsEtat'),"],
  ['RESET', 'remise a zero vers le mauvais spender', '    const ap = appelRemiseAZero(o.jeton, o.spender);', "    const ap = appelRemiseAZero(o.jeton, '0x' + 'ee'.repeat(20));"],
  ['RESET', 'la relecture apres le reset supposee a 0', "m = BigInt(await rpc('eth_call', [{ to: x.to, data: x.data }, 'latest'])); } catch (_) { m = null; } lues.push", "m = 0n; } catch (_) { m = null; } lues.push"],
  ['RESET', 'la ligne dit remise sans le recu', "    const tete = r && r.etat === 'CONFIRME' ? 'Your ' + o.symbole + ' approval was reset.' : phraseNonConfirme(r, 'Not reset');", "    const tete = 'Your ' + o.symbole + ' approval was reset.';"],
  ['FINIR', 'Finish laisse le jeton choisi', "      payer.choix = 'usdc'; const s = $('#payerJeton'); if (s) s.value = 'usdc';", '      const s = null;'],
  ['REPEINT', 'repeint sans reposer les boutons', '  if (a && e.textContent === a.texte) poserBoutonsArret(e, a);', '  if (false) poserBoutonsArret(e, a);'],
  ['REPEINT', 'boutons reposes sous un autre texte', '  if (a && e.textContent === a.texte) poserBoutonsArret(e, a);', '  if (a) poserBoutonsArret(e, a);'],
  ['LOT', 'un lot refuse lu comme une suite', "    if (!(r && r.sendCallsUnsupported)) { payer.soldesA = 0; return r; }", "    if (!(r && r.sendCallsUnsupported)) { payer.soldesA = 0; if (r) r.aLaSuite = true; return r; }"],
  ['N1', 'devis vivant jamais compare a la liste', '    if (vivant > liste * 10100n) return non(', '    if (false) return non('],
  ['N2', 'le pass en jeton sans sa description', "      const rj = await envoyerPaiementJeton(pj, c, dit, ' ' + descPass);", "      const rj = await envoyerPaiementJeton(pj, c, dit, '');"],
  ['N2', 'le pass en jeton sans la phrase du pot du jour', '      dit(passAchete);\n      return;', "      dit('Week pass bought.');\n      return;"],
];
const MUT_PA = [
  ['ETAPES', 'swap dit fait une etape trop tot', '  const swapFait = k > iSwap;', '  const swapFait = k >= iSwap;'],
  ['ETAPES', 'l USDC recu sans le frais retenu', '  return s - (s * f) / 10000n;', '  return s;'],
  ['ETAPES', 'une approbation a 0 dite ouverte', "    if (x.montant === null || x.montant === undefined || !(BigInt(x.montant) > 0n)) continue;", '    if (x.montant === null || x.montant === undefined) continue;'],
  ['ETAPES', 'finir en USDC sans regarder le jeu', "finirEnUsdc: swapFait && jeuFait === 0 && !!JEUX[jeu]", 'finirEnUsdc: swapFait && !!JEUX[jeu]'],
  ['ETAPES', 'les rolls partis jamais renvoyes au regleur', "(jeu === 'spin' ? 'they show here.' : 'they show under “Settle pending rolls”.')", "'they are on Base.'"],
  ['ANNULE', 'un revert dit refus', "  if (e === 'ANNULE_SUR_CHAINE') return 'it reverted on Base';", "  if (e === 'ANNULE_SUR_CHAINE') return 'you declined it in your wallet';"],
];
let tues = 0;
for (const [s, nom, de, vers] of MUT_APP) {
  vu(APP.split(de).length === 2, 'mutant app « ' + nom + ' » : ancre unique');
  const copie = APP.replace(de, () => vers);
  let r; try { r = await S[s](copie, null); } catch (e) { r = { ok: false, jete: String(e && e.message), syntaxe: e instanceof SyntaxError }; }
  vu(r.syntaxe !== true, 'mutant app « ' + nom + ' » : code valide (' + (r.jete || '') + ')');
  vu(r.ok === false, 'MUTANT app « ' + nom + ' » : ' + s + ' ROUGIT');
  tues += 1;
}
for (const [s, nom, de, vers] of MUT_PA) {
  vu(SRC_PA.split(de).length === 2, 'mutant payer-arret « ' + nom + ' » : ancre unique');
  const copie = SRC_PA.replace(de, () => vers);
  const mod = await import('data:text/javascript;base64,' + Buffer.from(copie).toString('base64'));
  let r; try { r = await S[s](APP, mod); } catch (e) { r = { ok: false, jete: String(e && e.message) }; }
  vu(r.ok === false, 'MUTANT payer-arret « ' + nom + ' » : ' + s + ' ROUGIT');
  tues += 1;
}
remettre();
console.log('ok payer-arret - ' + n + ' assertions, ' + Object.keys(S).length + ' scenarios (27 arrets par etape), ' + tues + '/' + (MUT_APP.length + MUT_PA.length) + ' mutants tues ; NE PROUVE PAS un vrai wallet, un vrai noeud (banc fork a part), les pixels');
