/* naissance-api.js — LA NAISSANCE D UN BLOCK, PLANIFIEE POUR UN AGENT : les appels NON SIGNES d une naissance entiere.
 *
 * ⛔⛔ POURQUOI (Phil, 2026-10-04 : « que les prochains naissent depuis notre MCP — il s en cree beaucoup et on ne gagne rien ») :
 *   un agent qui veut creer un block n avait que la factory brute (gratuite, sans marche, sans nous) ou notre ecran (un humain).
 *   Ce module rend a un agent le MEME chemin que l ecran Create : createPaid sur le CreateRouter, puis l inscription sur le hook
 *   de naissance, puis l ouverture du marche. Le wallet de l AGENT signe ; ce serveur ne signe rien, ne tient rien.
 * ⛔ CE QU IL NE PEUT PAS : forcer une naissance faite ailleurs a passer par nous. La factory B20 est libre ; on ne capte que
 *   les agents qui CHOISISSENT ce chemin. Dit ici pour que personne n ecrive le contraire.
 * ⛔⛔ REGLE ABSOLUE — 0,001 ETH DE FRAIS PAR NAISSANCE, ni plus ni moins : creation (createPaid) + inscription = FRAIS_OUVERTURE_WEI.
 *   Le plan est REFUSE si cette somme ne tombe pas juste. Le minimum du createur (hook 7030) et l apport de la pool ne sont PAS
 *   des frais : ils sont listes a part dans `cout`, et l agent les voit avant de signer.
 * ⛔ LE HOOK DICTE : hookCourant lit le code du hook ; completerInscriptionPayee lit fraisVie / fraisCreation et fait prouver le
 *   sel par le hook. Rien de tout cela n est suppose ici.
 * ⛔ SIMULE AVANT D ETRE RENDU : la sequence entiere (createPaid compris) passe par eth_simulateV1 depuis le compte. PRET = chaque
 *   appel en 0x1. Un compte sans fonds donne REFUSE ; pour une paire ETH on rejoue alors avec un solde suppose, pour DIRE si le
 *   plan est sain et qu il ne manque que les fonds.
 * ⛔ BORNES : la simulation n est pas l execution (prix, solde et nonce peuvent bouger avant l envoi) ; les appels sont a envoyer
 *   DANS L ORDRE, idealement en un lot (wallet_sendCalls) — s ils partent un par un et que la suite echoue, le block existe sans
 *   marche et se termine plus tard pour 0,0003 ETH. Preuve d execution : banc-naissance-7030-fork-20261003.mjs (fork, vrai hook). */
import { encodeCreatePaid, paramsAsset, encodeUpdateContractURI } from './encodeur.js';
import { selDeCreatePaid, adresseNeeDuRouteur } from './index-routeur.js';
import { apparenceDepuisAdresse } from './apparence.js';
import { logoSvg, paramsLogoDepuisApparence } from './logo.js';
import { hookCourant, estHook7030, estHookDeNaissance, SUPPLY_FIXE, DECIMALES_FIXES, OPTIONS_LANCEMENT } from './tokenomics.js';
import { pairesProposees, minimumCautionCreateur, hookDeLancementPour } from './paires.js';
import { plancher7030 } from './hook-7030-descripteur.js';
import { planLancement, mintLancementRecevable, simulerSequenceLancement, PERMIT2 } from './lancer-pool.js';
import { completerInscriptionPayee, estEtapeInscription } from './lancer-pool-v2.js';
import { rpcAvecBlockPrevu } from './groupe-wallet.js';
import { CREATE_ROUTER, FRAIS_OUVERTURE_WEI, CREATE_FEE_WEI_FLOOR, FEE_WALLET, USDC_BASE } from './frais-creation.js';

const ETH = '0x0000000000000000000000000000000000000000';
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (a) => String(a || '').toLowerCase();
const octets = (s) => new TextEncoder().encode(String(s)).length;
/** La valeur de depart par defaut de l ecran Create : 10 ETH de valorisation (app.html VALO_DEFAUT_ETH). */
export const VALO_DEFAUT_ETH = 10;
/** Plafond de l URI gravee, celui de l ecran (app.html uriCreation). */
export const URI_MAX_OCTETS = 24000;
export const BORNE_NAISSANCE = 'unsigned calls, simulated at the block read — not an execution: price, balance and nonce can move before you send. '
  + 'Send them in order, ideally as one wallet batch. Nothing is signed or held by this server.';

const versJson = (v) => {
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(versJson);
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = versJson(x); return o; }
  return v;
};
const refus = (pourquoi, extra = {}) => versJson({ ok: false, etat: 'REFUSE', pourquoi, aSigner: [], ...extra, borne: BORNE_NAISSANCE });
const nonMesure = (pourquoi, extra = {}) => versJson({ ok: false, etat: 'NON_MESURE', pourquoi, aSigner: [], ...extra, borne: BORNE_NAISSANCE });

/** Les devises contre lesquelles un block peut naitre ici, telles que l ecran les propose (ETH + STABLE / MAJEUR / ACTION).
 *  ⛔⛔ 2026-10-09 : ET SEULEMENT CELLES QU UN HOOK DE LANCEMENT ADMET — la regle de l ecran (estPaireLancable). Avant, ce filtre
 *   ne regardait que le TYPE : le jour ou une action entre au registre sans etre dans la liste figee du hook (ARMc, SKHYc, WRDc,
 *   ajoutees ce jour), le MCP l aurait offerte comme paire de naissance, et la naissance aurait ete refusee par le hook. */
export function pairesDeNaissance(chaine = 8453) {
  const liste = pairesProposees(chaine).filter((p) => (['STABLE', 'MAJEUR', 'ACTION'].includes(p.type) || bas(p.adr) === ETH)
    && !!hookDeLancementPour(p.adr, chaine, OPTIONS_LANCEMENT));
  const sans = liste.filter((p) => bas(p.adr) !== ETH);
  return [{ adr: ETH, symbole: 'ETH', type: 'NATIF' }, ...sans.map((p) => ({ adr: bas(p.adr), symbole: p.symbole, type: p.type }))];
}

/** L URI gravee avec le block — la MEME forme que l ecran (uriCreation) : la face est ce que le hook relit (son marqueur). */
export function uriNaissance({ nom, symbole, adresse, paire }) {
  const face = apparenceDepuisAdresse(adresse);
  const svg = logoSvg(paramsLogoDepuisApparence(face, symbole));
  const meta = {
    name: nom, symbol: symbole, supply: SUPPLY_FIXE.toString(), sealed: true, face, flyBrain: true,
    image: 'https://tokenizedblock.space/face/' + bas(adresse) + '.png',
    image_data: 'data:image/svg+xml,' + encodeURIComponent(svg),
    pair: paire && bas(paire.adr) !== ETH ? { address: paire.adr, symbol: paire.symbole, kind: paire.type, verified: true } : null,
  };
  return 'data:application/json,' + encodeURIComponent(JSON.stringify(meta));
}

/**
 * @param {{ nom:string, symbole:string, paire?:string, compte:string, sel?:string }} q
 *   paire = 'ETH' (defaut) ou l adresse d une devise proposee ; sel = texte libre qui fixe l adresse (genere si absent).
 * @param {{ rpc:Function, prixUsd:(adr:string|null)=>Promise<number|null>, selAleatoire?:()=>string, chaine?:number,
 *           soldeSuppose?:bigint|null }} deps   prixUsd(null) = le prix de l ETH ; soldeSuppose = solde ETH suppose pour la
 *   simulation (sonde de sante : dit si le plan est sain, sans wallet finance).
 */
export async function planNaissance(q, deps) {
  const rpc = deps && deps.rpc, prixUsd = deps && deps.prixUsd;
  const chaine = Number((deps && deps.chaine) || 8453);
  if (typeof rpc !== 'function' || typeof prixUsd !== 'function') return nonMesure('no chain reader on this server');
  if (chaine !== 8453) return refus('blocks are born on Base mainnet only');
  const nom = String((q && q.nom) || '').trim(), symbole = String((q && q.symbole) || '').trim().toUpperCase();
  const compte = bas(q && q.compte);
  if (!nom) return refus('a block needs a name');
  if (!symbole) return refus('a block needs a symbol');
  if (octets(nom) > 32) return refus('the name is over 32 bytes (accents and emoji count more)');
  if (octets(symbole) > 32) return refus('the symbol is over 32 bytes');
  if (!ADR.test(compte)) return refus('compte (the wallet that will sign and receive the supply) must be a whole address');
  if (compte === bas(FEE_WALLET)) return refus('the fee wallet cannot be the creator');
  const paireDemandee = String((q && q.paire) || 'ETH').trim();
  const adrPaire = /^eth$/i.test(paireDemandee) ? ETH : bas(paireDemandee);
  if (!ADR.test(adrPaire)) return refus('paire must be ETH or the whole address of a currency offered at creation');
  const paire = pairesDeNaissance(chaine).find((p) => p.adr === adrPaire);
  if (!paire) return refus('this currency is not offered at creation — ask for the list of pairs');
  const selTexte = String((q && q.sel) || '').trim() || (deps && typeof deps.selAleatoire === 'function' ? deps.selAleatoire() : '');
  if (!selTexte) return refus('a salt is required: it is what fixes the block address');
  if (octets(selTexte) > 64) return refus('the salt is over 64 bytes');
  const devise = adrPaire === ETH ? null : adrPaire;

  try {
    /* ── l adresse : le sel fixe tout. On encode une 1re fois pour LIRE le sel (mot de hash), d ou l adresse, d ou la face. ── */
    const params = paramsAsset({ nom, symbole, admin: compte, decimales: DECIMALES_FIXES });
    const sel = selDeCreatePaid(encodeCreatePaid({ variant: 0, saltTexte: selTexte, params, initCalls: [], creator: compte }));
    const adresse = adresseNeeDuRouteur(sel);
    const uri = uriNaissance({ nom, symbole, adresse, paire });
    if (octets(uri) > URI_MAX_OCTETS) return refus('the engraved metadata is too big — shorten the name or the symbol');
    const dataCreate = encodeCreatePaid({ variant: 0, saltTexte: selTexte, params, initCalls: [encodeUpdateContractURI(uri)], creator: compte });
    if (selDeCreatePaid(dataCreate) !== sel) return nonMesure('the salt did not encode the same way twice');
    const valeurCreate = FRAIS_OUVERTURE_WEI - CREATE_FEE_WEI_FLOOR;
    const appelCreate = { to: CREATE_ROUTER, data: dataCreate, value: '0x' + valeurCreate.toString(16), nom: 'Create the block (createPaid)', role: 'create' };

    /* ── le hook de naissance, LU ── */
    const hook = await hookCourant({ rpc, mainnet: true, avecDevise: !!devise, devise });
    /* ⛔ MEME GARDE QUE L ECRAN (estHookDeNaissance) : quand le noeud se tait, hookCourant rend `undefined` si le 7030 s applique
     *   (2026-10-10 : il ne retombe plus sur le V8), sinon un ANCIEN hook sans le lire (raccourci mainnet) — ce n est pas un hook
     *   de naissance, c est une lecture ratee. On le dit tel quel, et on dit de redemander : rien n est planifie apres. */
    if (!hook || /^0x0{40}$/i.test(String(hook)) || !estHookDeNaissance(hook)) return nonMesure('the birth hook could not be read on chain — try again in a moment; nothing to sign');

    /* ── le minimum du createur (hook 7030) : max(1 $ du jour, plancher du contrat), la regle de l ecran ── */
    let caution = null, prixEth = null;
    if (estHook7030(hook)) {
      let prix, dec = 18;
      if (devise) {
        prix = bas(devise) === bas(USDC_BASE) ? 1 : await prixUsd(devise);
        dec = Number(BigInt(await rpc('eth_call', [{ to: devise, data: '0x313ce567' }, 'latest'])));
      } else { prixEth = await prixUsd(null); prix = prixEth; }
      const minimumApp = minimumCautionCreateur({ prixUsd: prix, decimales: dec });
      if (minimumApp === null || minimumApp === undefined) return nonMesure('the price of ' + paire.symbole + ' could not be read, so the creator minimum could not be worked out — nothing to sign');
      const plancher = plancher7030(devise || ETH);
      const minimum = plancher !== null && plancher > BigInt(minimumApp) ? plancher : BigInt(minimumApp);
      caution = { minimum, devise: devise || ETH, minimumApp: BigInt(minimumApp), plancherHook: plancher, decimales: dec };
    }

    /* ── la valeur de depart : celle de l ecran (10 ETH, convertis dans la devise) ── */
    let valo = VALO_DEFAUT_ETH;
    if (devise) {
      if (prixEth === null) prixEth = await prixUsd(null);
      const p = bas(devise) === bas(USDC_BASE) ? 1 : await prixUsd(devise);
      if (!(prixEth > 0) || !(p > 0)) return nonMesure('the starting price of this pair could not be read — nothing to sign');
      valo = Number((VALO_DEFAUT_ETH * prixEth / p).toPrecision(3));
    }

    /* ── le plan de l ecran, lu comme si le block existait deja (rpcAvecBlockPrevu), puis l inscription dictee par le hook ── */
    const rpcPrevu = rpcAvecBlockPrevu(rpc, { jeton: adresse, compte, supply: SUPPLY_FIXE, dec: DECIMALES_FIXES, solde: SUPPLY_FIXE, permit2: PERMIT2 });
    let plan = await planLancement({ rpc: rpcPrevu, chaine, jeton: adresse, compte, valorisationEth: valo, partPourMille: 999, hooks: hook,
      ...(devise ? { devise } : { quoteEthWei: CREATE_FEE_WEI_FLOOR, soldePresume: SUPPLY_FIXE }) });
    if (!plan || (plan.etat !== 'PRET' && plan.etat !== 'APPROBATIONS')) {
      return (plan && plan.etat === 'REFUSE' ? refus : nonMesure)('the market plan could not be built: ' + ((plan && plan.pourquoi) || 'no answer'));
    }
    plan = await completerInscriptionPayee({ rpc: rpcPrevu, plan, compte, fraisWei: FRAIS_OUVERTURE_WEI - valeurCreate, hook, caution, sel });
    if (!plan || !plan.tx || (plan.etat !== 'PRET' && plan.etat !== 'APPROBATIONS')) {
      return (plan && plan.etat === 'REFUSE' ? refus : nonMesure)('the birth could not be planned: ' + ((plan && plan.pourquoi) || 'no answer'));
    }
    if (!mintLancementRecevable(plan)) return refus('the market could not open after the fee — nothing to sign');

    /* ── ⛔⛔ LA REGLE ABSOLUE : 0,001 ETH de frais, exactement. On la VERIFIE sur les appels construits, pas sur une intention. ── */
    const ins = (plan.etapes || []).find((x) => estEtapeInscription(x.data));
    if (!ins) return nonMesure('the birth step is missing from the plan');
    const cautionEthWei = BigInt(ins.cautionWei || 0n);
    const inscriptionWei = BigInt(ins.value || '0x0') - cautionEthWei;
    const fraisTotal = valeurCreate + inscriptionWei;
    if (fraisTotal !== FRAIS_OUVERTURE_WEI) {
      return refus('the birth fee does not add up to 0.001 ETH (' + fraisTotal + ' wei) — nothing to sign', { fraisCalcule: fraisTotal });
    }
    const apportEthWei = BigInt(plan.tx.value || '0x0');
    const aSigner = [appelCreate,
      ...(plan.etapes || []).map((x) => ({ to: x.to, data: x.data, value: x.value || '0x0', nom: x.nom, role: estEtapeInscription(x.data) ? 'birth' : 'approve' })),
      { to: plan.tx.to, data: plan.tx.data, value: plan.tx.value || '0x0', nom: 'Open its market (liquidity locked forever)', role: 'open' }];
    const totalEthWei = aSigner.reduce((a, c) => a + BigInt(c.value || '0x0'), 0n);
    const cout = {
      fraisEthWei: fraisTotal, creationWei: valeurCreate, inscriptionWei,
      minimumCreateur: caution ? { devise: caution.devise, symbole: paire.symbole, montant: caution.minimum, decimales: caution.decimales,
        note: 'not a fee: a deposit that stays the creator’s, held by the market contract; it earns 0.03% of each trade; taking it back takes a request and then 7 days' } : null,
      apportEthWei, totalEthWei,
      note: 'totalEthWei = fee 0.001 ETH + creator minimum when it is in ETH + the ETH seeded into the pool; gas is on top',
    };
    const block = { adresse, sel, selTexte, nom, symbole, paire: { adresse: adrPaire, symbole: paire.symbole }, hook: bas(hook) };

    /* ── la simulation de la sequence ENTIERE, depuis le compte ── */
    const appelsSim = aSigner.map((c) => ({ to: c.to, data: c.data, value: c.value }));
    const supposer = deps && typeof deps.soldeSuppose === 'bigint' ? { [compte]: { balance: '0x' + deps.soldeSuppose.toString(16) } } : null;
    let sim = await simulerSequenceLancement({ rpc, compte, appels: appelsSim, surcharges: supposer });
    let fondsManquants = false;
    /* ⛔ MESURE (mainnet, wallet a 0 wei) : le noeud ne rend pas un appel en 0x0, il REFUSE la requete (« insufficient funds for
     *   gas * price + value ») — donc NON_MESURE cote simulateur. Les deux formes veulent dire la meme chose ici. */
    const sansFonds = sim.etat === 'REFUSE' || (sim.etat === 'NON_MESURE' && /insufficient funds/i.test(String(sim.pourquoi)));
    if (sansFonds && !supposer) {
      /* le plan est-il sain, a fonds supposes ? (ne couvre que l ETH : un minimum en devise doit etre DANS le wallet) */
      const s2 = await simulerSequenceLancement({ rpc, compte, appels: appelsSim, surcharges: { [compte]: { balance: '0x' + (totalEthWei + 10n ** 16n).toString(16) } } });
      if (s2.etat === 'ACCEPTE') fondsManquants = true;
    }
    const base = { block, cout, aSigner, simulation: { etat: sim.etat, pourquoi: sim.pourquoi || null, soldeSuppose: !!supposer }, borne: BORNE_NAISSANCE,
      ordre: 'sign aSigner in order; a wallet batch (wallet_sendCalls) makes it one signature and all-or-nothing' };
    if (sim.etat === 'ACCEPTE') return versJson({ ok: true, etat: 'PRET', pourquoi: null, ...base });
    if (sim.etat === 'NON_MESURE' && !fondsManquants && !/insufficient funds/i.test(String(sim.pourquoi))) return versJson({ ok: false, etat: 'NON_MESURE', pourquoi: 'the birth could not be simulated: ' + sim.pourquoi, ...base, aSigner: [] });
    return versJson({ ok: false, etat: 'REFUSE', fondsManquants,
      pourquoi: fondsManquants
        ? 'the plan is sound but this wallet does not hold enough ETH: the birth needs ' + totalEthWei + ' wei in total, plus gas'
        : 'the chain would refuse this birth: ' + sim.pourquoi + (devise ? ' — check that the wallet holds the creator minimum in ' + paire.symbole : ''),
      /* ⛔ on ne rend les appels que si le plan est SAIN (il ne manque que les fonds) : un plan que la chaine refuse ne se signe pas */
      ...base, aSigner: fondsManquants ? aSigner : [] });
  } catch (e) {
    return nonMesure(String((e && e.message) || e).slice(0, 160));
  }
}
