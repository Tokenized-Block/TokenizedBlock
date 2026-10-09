/* banc-wallet-simule-fork-20261004.mjs — LE PARCOURS DU PANNEAU, SANS NAVIGATEUR : le serveur de CE dossier en mode essai, ses
 *   plans demandes comme le panneau les demande, signes par le WALLET SIMULE, executes sur un fork — juges sur les SOLDES.
 *
 * POURQUOI (2026-10-04). Le test « wallet connecte » (TEST-WALLET-PANNEAU-20261004.md) attend un vrai wallet. Les bancs fork
 *   d avant appellent `planRail` EN DIRECT et envoient par `eth_sendTransaction` brut : ils prouvent les routes, pas la chaine
 *   serveur HTTP -> plan -> envoi.js -> fournisseur EIP-1193. Ce banc prend la chaine entiere, a une piece pres (l ecran).
 * CE QU IL FAIT :
 *   1. demarre serveur-web.js de ce dossier sur un port libre, `TB_RPC_TEST` = le fork, fetch garde (rien ne sort de la machine) ;
 *   2. cree un compte neuf, le finance sur le fork (ETH pose, USDC pris a une pool du fork), tout entre evm_snapshot et evm_revert ;
 *   3. pour chaque scenario, fait ce que `bcProposerSwap` / `bcSigner` font dans app.html : solde relu, GET /api/rails/plan
 *      (memes parametres), approbations puis re-plan, chaque appel envoye par `envoyerDepuisWallet` (envoi.js, le vrai) avec le
 *      wallet simule (wallet-simule.js, le meme fichier que la page) ;
 *   4. juge sur les soldes lus avant/apres : le compte recoit, au moins le minimum annonce ; le wallet des frais recoit.
 *   Scenarios : acheter une action avec de l USDC · la revendre contre de l ETH · payer le block de la sonde (BLOCK_SONDE) avec
 *   une action a pool v4 · echanger de l ETH contre de l USDC · un message paye de 0,10 USDC.
 *   Temoins : un refus dans le wallet ne bouge rien ; un simple transfert, passe par le MEME juge, est juge SANS frais (le juge
 *   sait dire non) ; le serveur n a joint que le fork et lui-meme.
 * UN KO : un plan PRET dont un appel n est pas confirme ; un echange execute qui ne livre rien, livre moins que le minimum
 *   annonce, ou ne paie rien au wallet des frais ; ce que le wallet a recu differe de ce que le plan annoncait.
 * ⛔ CE QUE CE BANC NE PROUVE PAS : l ecran (aucun navigateur ici — voir ESSAI-WALLET-SIMULE-20261004.md) ; un vrai wallet (ses
 *   ecrans, ses alertes, son estimation de gaz) ; un smart wallet (le wallet simule est un compte classique) ; la vraie chaine
 *   (un fork au bloc affiche, impersonation, USDC d essai pris a une pool) ; le prix de demain.
 * ⛔ UN SEUL BANC FORK A LA FOIS. Le planificateur du serveur accorde 4 plans par minute et par adresse : le banc attend la
 *   minute suivante quand il est refuse (429), comme le panneau le demande a la personne — il le compte et le dit.
 * Usage : base-anvil --fork-url <rpc Base> --port 8549, puis node banc-wallet-simule-fork-20261004.mjs [http://127.0.0.1:8549] */
import fs from 'node:fs';
import { creerWalletSimule } from './wallet-simule.js';
import { envoyerDepuisWallet } from './envoi.js';
import * as MSG from './messagerie-blocks.js';
import { ACTIONS_COINBASE } from './paires.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { RPC_ESSAI_DEFAUT } from './mode-essai.js';
import { lecteurFork, ouvrirFork, compteNeuf, financer, demarrerServeur, solde, pause, ETH, USDC, FRAIS } from './outils-essai-fork.mjs';

const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : RPC_ESSAI_DEFAUT;
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; console.log((c ? 'ok  ' : 'KO  ') + m); if (!c) ko += 1; return !!c; };
const rpc = lecteurFork(URL_FORK);
const symboles = new Map([[ETH, 'ETH'], [USDC, 'USDC']]);
const sym = (a) => symboles.get(a) || String(a).slice(0, 10) + '…';
const action = (s) => { const a = ACTIONS_COINBASE.find((x) => x.symbole === s); return a ? String(a.adr).toLowerCase() : null; };
/* les adresses se LISENT dans le depot : le registre des actions, et la constante de la sonde du serveur */
const ACTION_AERO = action('NVDAc'), ACTION_V4 = action('LLYc');
const BLOCK = (fs.readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').match(/const BLOCK_SONDE = '(0x[0-9a-f]{40})';/) || [])[1];
if (!ok(!!ACTION_AERO && POOLS_ACTIONS_AERODROME.has(ACTION_AERO), 'NVDAc se lit dans paires.js et a une pool Aerodrome en table')
  || !ok(!!ACTION_V4 && !POOLS_ACTIONS_AERODROME.has(ACTION_V4), 'LLYc se lit dans paires.js et n est PAS dans la table Aerodrome (pool v4)')
  || !ok(/^0x[0-9a-f]{40}$/.test(String(BLOCK)), 'BLOCK_SONDE se lit dans serveur-web.js')) process.exit(1);
symboles.set(ACTION_AERO, 'NVDAc'); symboles.set(ACTION_V4, 'LLYc'); symboles.set(BLOCK, 'IB022');

let serveur = null, session = null, compte = null, wallet = null;
const mesures = { plans: 0, attentes429: 0, signatures: 0, lignes: [] };

/** GET /api/rails/plan, les parametres du panneau (app.html, bcProposerSwap). Un 429 : on attend la minute suivante, 3 fois au plus. */
async function planPanneau(de, vers, montant) {
  const q = '/api/rails/plan?de=' + (de === ETH ? 'ETH' : de) + '&vers=' + (vers === ETH ? 'ETH' : vers) + '&montant=' + montant + '&compte=' + compte;
  for (let essai = 0; ; essai += 1) {
    const t = Date.now();
    const r = await fetch(serveur.url + q, { signal: AbortSignal.timeout(120000) });
    if (r.status === 429 && essai < 3) {
      mesures.attentes429 += 1;
      const reste = 60000 - (Date.now() % 60000) + 1500;
      console.log('    (planificateur occupe — 4 plans par minute : attente de ' + Math.round(reste / 1000) + ' s)');
      await pause(reste);
      continue;
    }
    mesures.plans += 1;
    const p = r.status === 429 ? { etat: 'NON_MESURE', pourquoi: 'the planner is busy', aSigner: [] } : await r.json();
    p.ms = Date.now() - t;
    return p;
  }
}
/** Signe une suite d appels comme `bcSigner` : un par un, par envoi.js, s arrete au premier non confirme. Rend le gaz paye. */
async function signer(appels) {
  let gaz = 0n; const hashes = [];
  for (const c of appels) {
    const r = await envoyerDepuisWallet({ eth: wallet, rpc, chaineAttendue: 8453, compte, to: c.to, data: c.data || '0x', value: c.value || '0x0' });
    mesures.signatures += 1;
    if (r.hash) { const recu = await rpc('eth_getTransactionReceipt', [r.hash]); if (recu) gaz += BigInt(recu.gasUsed) * BigInt(recu.effectiveGasPrice || '0x0'); hashes.push(r.hash); }
    if (r.etat !== 'CONFIRME') return { ok: false, etat: r.etat, pourquoi: r.pourquoi, gaz, hashes };
  }
  return { ok: true, gaz, hashes };
}
const lireSoldes = async (jetons) => { const s = { c: {}, f: {} }; for (const j of jetons) { s.c[j] = await solde(rpc, j, compte); s.f[j] = await solde(rpc, j, FRAIS); } return s; };
/** Le juge : les variations de soldes du compte (gaz retire) et du wallet des frais, sur les jetons suivis. */
async function juger(jetons, avant, gaz, de, vers) {
  const apres = await lireSoldes(jetons);
  const d = { c: {}, f: {} };
  for (const j of jetons) { d.c[j] = apres.c[j] - avant.c[j]; d.f[j] = apres.f[j] - avant.f[j]; }
  d.c[ETH] = (d.c[ETH] || 0n) + gaz; /* le gaz n est pas le prix de l echange */
  const frais = jetons.filter((j) => d.f[j] > 0n).map((j) => ({ jeton: j, montant: d.f[j] }));
  const paye = de ? -d.c[de] : null, recu = vers ? d.c[vers] : null;
  let bps = null;
  for (const f of frais) {
    const base = f.jeton === de ? paye : (f.jeton === vers ? recu + f.montant : null);
    if (base && base > 0n) bps = Number(f.montant * 100000n / base) / 10;
  }
  return { d, frais, paye, recu, bps };
}
const direFrais = (v) => (v.frais.length ? v.frais.map((f) => f.montant + ' ' + sym(f.jeton)).join(' + ') + (v.bps !== null ? ' = ' + v.bps + ' bps' : '') : 'RIEN');

/** Un echange, de bout en bout, comme le panneau : solde relu, plan, approbations + re-plan, signature, jugement. */
async function echange(nom, de, vers, montant, { refuserUneFois = false } = {}) {
  console.log('\n— ' + nom + ' : ' + montant + ' ' + sym(de) + ' -> ' + sym(vers));
  const jetons = [...new Set([ETH, USDC, de, vers])];
  const detenu = await solde(rpc, de, compte);
  if (!ok(detenu >= montant, nom + ' : le compte detient de quoi payer (' + detenu + ' ' + sym(de) + ')')) return null;
  const avant = await lireSoldes(jetons);
  const journalAvant = wallet.journal.length;
  let gaz = 0n, p = null, tours = 0;
  const debut = Date.now();
  for (;;) {
    p = await planPanneau(de, vers, montant);
    console.log('    plan ' + p.etat + ' · route ' + p.route + ' · via ' + (p.via || '?') + ' · ' + (p.aSigner || []).length + ' appel(s) · ' + p.ms + ' ms' + (p.depuisCache ? ' (cache)' : '') + (p.pourquoi ? ' · ' + String(p.pourquoi).slice(0, 140) : ''));
    if (p.etat !== 'APPROBATIONS' || tours >= 3) break;
    tours += 1;
    const s = await signer(p.aSigner);
    gaz += s.gaz;
    if (!ok(s.ok, nom + ' : les ' + p.aSigner.length + ' approbation(s) sont confirmees' + (s.ok ? '' : ' — ' + s.etat + ' : ' + s.pourquoi))) return null;
  }
  if (!ok(p.etat === 'PRET', nom + ' : le planificateur rend un plan PRET' + (p.etat === 'PRET' ? '' : ' — ' + p.etat + ' : ' + p.pourquoi))) return null;
  if (refuserUneFois) {
    /* temoin : la personne refuse dans son wallet (TEST-WALLET-PANNEAU §C.12). Rien ne doit bouger, et l etat doit le dire. */
    const nonceAvant = await rpc('eth_getTransactionCount', [compte, 'latest']);
    wallet.refuserLaProchaine();
    const c = p.aSigner[0];
    const r = await envoyerDepuisWallet({ eth: wallet, rpc, chaineAttendue: 8453, compte, to: c.to, data: c.data || '0x', value: c.value || '0x0' });
    const apresRefus = await lireSoldes(jetons);
    ok(r.etat === 'REFUSE_PAR_UTILISATEUR', 'temoin refus : envoi.js rend REFUSE_PAR_UTILISATEUR (obtenu ' + r.etat + ')');
    ok(await rpc('eth_getTransactionCount', [compte, 'latest']) === nonceAvant && jetons.every((j) => apresRefus.c[j] === avant.c[j] && apresRefus.f[j] === avant.f[j]),
      'temoin refus : aucune transaction n est partie (nonce inchange), aucun solde n a bouge');
    p = await planPanneau(de, vers, montant); /* « Start again » du panneau : il redemande le plan */
    if (!ok(p.etat === 'PRET', nom + ' : le plan redemande apres le refus est PRET')) return null;
  }
  const marque = wallet.journal.length;
  const s = await signer(p.aSigner);
  gaz += s.gaz;
  if (!ok(s.ok, nom + ' : les ' + p.aSigner.length + ' appel(s) du plan PRET sont confirmes' + (s.ok ? '' : ' — ' + s.etat + ' : ' + s.pourquoi))) return null;
  /* ce que le wallet a recu = ce que le plan annoncait (destinataire, valeur, taille des donnees), dans l ordre */
  const partis = wallet.journal.slice(marque).filter((l) => l.methode === 'eth_sendTransaction' && l.issue === 'sent');
  ok(partis.length === p.aSigner.length && p.aSigner.every((c, i) => partis[i].vers === String(c.to).toLowerCase() && BigInt(partis[i].valeur) === BigInt(c.value || '0x0')
    && partis[i].octets === (String(c.data || '0x').length - 2) / 2), nom + ' : le wallet a recu exactement les appels du plan (destinataire, valeur, donnees), dans l ordre');
  const v = await juger(jetons, avant, gaz, de, vers);
  ok(v.paye === montant, nom + ' : le compte a paye exactement ' + montant + ' ' + sym(de) + ' (mesure ' + v.paye + ')');
  ok(v.recu > 0n, nom + ' : le compte recoit ' + v.recu + ' ' + sym(vers));
  const min = p.resume && p.resume.recoitAuMoins !== undefined && p.resume.recoitAuMoins !== null ? BigInt(p.resume.recoitAuMoins) : null;
  if (min !== null) ok(v.recu >= min, nom + ' : recu ' + v.recu + ' >= minimum annonce ' + min);
  else console.log('    (le plan n annonce pas de minimum recu : rien a comparer)');
  ok(v.frais.length > 0, nom + ' : le wallet des frais recoit ' + direFrais(v));
  const rs = p.resume || {};
  mesures.lignes.push({ nom, route: p.route, via: p.via, pool: p.pool || null, signatures: wallet.journal.length - journalAvant, recu: v.recu + ' ' + sym(vers), frais: direFrais(v),
    annonce: 'fraisBps ' + (rs.fraisBps === undefined ? 'absent' : rs.fraisBps) + (rs.fraisParHook === true ? ', marche ' + rs.fraisMarcheBps + ' bps (hook)' : ''), s: Math.round((Date.now() - debut) / 1000) });
  return v;
}

try {
  session = await ouvrirFork(rpc);
  console.log('fork ' + rpc.url + ' · ' + session.client + ' · bloc ' + session.tete + ' · instantane ' + session.instantane + ' · wallet des frais ' + FRAIS);
  const fraisDepart = { eth: await solde(rpc, ETH, FRAIS), usdc: await solde(rpc, USDC, FRAIS) };
  compte = compteNeuf();
  const fonds = await financer(rpc, compte, { ethWei: 10n ** 18n, usdc: 20n * 10n ** 6n, saufAction: ACTION_AERO });
  console.log('compte d essai ' + compte + ' · ' + fonds.eth + ' wei · ' + fonds.usdc + ' unites d USDC (prises a une pool du fork)');
  serveur = await demarrerServeur({ rpcEssai: rpc.url });
  ok(serveur.sante.essai && serveur.sante.essai.rpc === rpc.url, 'le serveur de ce dossier tourne en mode essai sur le fork (port ' + serveur.port + ', build ' + serveur.sante.build + ')');
  wallet = creerWalletSimule({ rpcUrl: rpc.url, compte });
  const comptes = await wallet.request({ method: 'eth_requestAccounts' });
  ok(comptes[0] === compte && await wallet.request({ method: 'eth_chainId' }) === '0x2105', 'le wallet simule est connecte : ce compte, chaine 0x2105');

  /* 1. acheter une action avec de l USDC (TEST-WALLET-PANNEAU §D.13 : « buy NVDAc with 2 USDC ») */
  const a1 = await echange('1 acheter NVDAc avec USDC', USDC, ACTION_AERO, 2n * 10n ** 6n);
  /* 2. la revendre contre de l ETH */
  const tenu = await solde(rpc, ACTION_AERO, compte);
  if (a1 && tenu > 0n) await echange('2 vendre NVDAc contre ETH', ACTION_AERO, ETH, tenu);
  else ok(false, '2 vendre NVDAc contre ETH : NON ESSAYE (aucune NVDAc recue a l etape 1)');
  /* 3. payer le block de la sonde avec une action a pool v4 : il faut d abord la detenir */
  const a3 = await echange('3a acheter LLYc (pool v4) avec USDC', USDC, ACTION_V4, 5n * 10n ** 6n);
  const tenuV4 = await solde(rpc, ACTION_V4, compte);
  if (a3 && tenuV4 > 0n) await echange('3b payer IB022 (BLOCK_SONDE) avec LLYc', ACTION_V4, BLOCK, tenuV4);
  else ok(false, '3b payer IB022 avec LLYc : NON ESSAYE (aucune LLYc recue a l etape 3a)');
  /* 4. ETH contre USDC, avec un refus d abord */
  await echange('4 echanger ETH contre USDC', ETH, USDC, 10n ** 15n, { refuserUneFois: true });

  /* 5. un message paye de 0,10 USDC : le plan est bati par la PAGE (messagerie-blocks.js), comme dans app.html */
  console.log('\n— 5 message paye (0,10 USDC)');
  const tenuBlock = await solde(rpc, BLOCK, compte);
  if (ok(tenuBlock > 0n, '5 message : le compte detient le block au nom duquel il parle (IB022 : ' + tenuBlock + ')')) {
    const texte = 'gm from the simulated wallet';
    const p = await MSG.planMessagePaye({ rpc, compte, de: BLOCK, a: ACTION_AERO, texte, detientDe: true, devise: 'USDC' });
    if (ok(p.etat === 'PRET' && p.frais === MSG.FRAIS_MESSAGE_USDC && String(p.tx.to).toLowerCase() === USDC, '5 message : plan PRET, un transfert USDC de ' + MSG.prixMessageLisible('USDC') + (p.etat === 'PRET' ? '' : ' — ' + p.etat + ' : ' + p.pourquoi))) {
      const avant = await lireSoldes([ETH, USDC]);
      const s = await signer([p.tx]);
      if (ok(s.ok, '5 message : la transaction est confirmee' + (s.ok ? '' : ' — ' + s.etat + ' : ' + s.pourquoi))) {
        const v = await juger([ETH, USDC], avant, s.gaz, USDC, null);
        ok(v.paye === 100000n && v.d.f[USDC] === 100000n, '5 message : le compte perd EXACTEMENT 100 000 unites (0,10 USDC), le wallet des frais en recoit autant (' + v.paye + ' / ' + v.d.f[USDC] + ')');
        const tx = await rpc('eth_getTransactionByHash', [s.hashes[0]]);
        const m = MSG.messageDepuisTransfert({ from: compte, to: FRAIS, value: v.d.f[USDC], tx: s.hashes[0] }, tx, 'USDC');
        ok(m.etat === 'MESSAGE' && m.texte === texte && m.de === BLOCK && m.a === ACTION_AERO && String(tx.from).toLowerCase() === compte, '5 message : il se RELIT depuis la transaction (texte, « de », « a », signataire = tx.from)');
        mesures.lignes.push({ nom: '5 message paye', route: 'USDC.transfer + memo', via: 'planMessagePaye', pool: null, signatures: 1, recu: '—', frais: v.d.f[USDC] + ' USDC', annonce: MSG.prixMessageLisible('USDC'), s: 0 });
      }
    }
  }

  /* temoin du JUGE : un simple transfert d ETH, par le meme wallet et le meme juge, ne paie aucun frais — le juge sait le dire */
  console.log('\n— temoin : un transfert simple, juge par le meme juge');
  {
    const tiers = compteNeuf('7e50');
    const avant = await lireSoldes([ETH, USDC]);
    const s = await signer([{ to: tiers, data: '0x', value: '0x' + (10n ** 14n).toString(16) }]);
    const v = await juger([ETH, USDC], avant, s.gaz, ETH, null);
    ok(s.ok && v.paye === 10n ** 14n && v.frais.length === 0, 'temoin : un transfert de 0,0001 ETH est juge SANS frais (' + direFrais(v) + ') — un echange sans frais serait donc vu');
  }

  /* ce que le serveur a joint pendant tout le banc */
  const o = serveur.origines();
  ok(o.joints.length > 0 && o.joints.every((x) => x === rpc.url || x === serveur.url), 'le serveur n a joint que le fork et lui-meme (' + o.joints.join(', ') + ')');
  console.log('    origines que le serveur a voulu joindre et que la garde a bloquees : ' + (o.bloques.join(', ') || 'aucune'));
  ok(!o.bloques.some((x) => /base\.org|publicnode|drpc|1rpc/.test(x)), 'le serveur n a tente aucun noeud public de Base');
  ok((await solde(rpc, ETH, FRAIS)) > fraisDepart.eth || (await solde(rpc, USDC, FRAIS)) > fraisDepart.usdc, 'sur tout le banc, le wallet des frais a gagne de l ETH ou de l USDC (soldes lus)');
} catch (e) {
  ok(false, 'le banc a leve : ' + String((e && e.stack) || e).slice(0, 400));
} finally {
  if (serveur) { const code = await serveur.arreter(); console.log('\nserveur arrete (' + code + ')'); }
  if (session) {
    try { if (compte) await rpc('anvil_stopImpersonatingAccount', [compte]); } catch (_) { /* le fork ne l impersonnait plus */ }
    const rendu = await session.rendre();
    const tete = parseInt(await rpc('eth_blockNumber', []), 16);
    ok(rendu === true && tete === session.tete, 'le fork est rendu a son etat d avant le banc (evm_revert ' + rendu + ', bloc ' + tete + ')');
  }
}
console.log('\nRESUME');
for (const l of mesures.lignes) console.log('  ' + l.nom.padEnd(40) + ' ' + String(l.route).padEnd(14) + ' via ' + String(l.via).padEnd(24) + ' recu ' + l.recu + ' · frais ' + l.frais + ' · annonce ' + l.annonce + ' · ' + l.signatures + ' demande(s) au wallet · ' + l.s + ' s');
console.log(mesures.plans + ' plan(s) demande(s) au serveur · ' + mesures.attentes429 + ' attente(s) de budget (429) · ' + mesures.signatures + ' envoi(s) par le wallet simule');
console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
