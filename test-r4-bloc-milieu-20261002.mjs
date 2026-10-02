/* test-r4-bloc-milieu-20261002.mjs — AU PLUS UN FRAIS VERS a6cf PAR ECHANGE, JAMAIS EN BLOCK (fix R4, 2026-10-02).
 *
 * Bug (lecture de source + fork de Raksha, puis RESULT-once-per-swap-6fc35ab de Zero 1) : ETH -> (sans hook) -> blockC
 *   -> (V8, blockC = currency0) -> NVDAc etait signable avec DEUX frais, dont un en block. Les gardes de
 *   planEchangeMultiSauts ne regardaient que [entree, sortie] ; le block du milieu n etait jamais teste.
 * Regles (fail-closed) : par saut et par cote block, pool sans hook -> refus, frais du hook en block -> refus ; block
 *   INTERMEDIAIRE -> refus ; deux jambes hookees ou plus -> refus. Les memes dans le constructeur « pay with »
 *   (sauts-depuis-chemin.js, cas R4g).
 * ⛔ L ORACLE DES FRAIS N APPELLE PAS la fonction jugee : il part de la liste mesuree (hookPaieDejaA6cf) et de la devise
 *   mesuree du hook (deviseFraisHook). Un frais = le routeur s il preleve, plus CHAQUE jambe dont le hook verse a6cf,
 *   DANS N IMPORTE QUELLE DEVISE (un frais en block compte, c est le bug).
 * ⛔ TEMOINS NEGATIFS : le meme banc tourne sur une COPIE du depot (doit rester vert : la copie est fidele) puis sur des
 *   MUTANTS de cette copie ; chacun DOIT rendre le banc rouge sur les cas qu il vise.
 * ⚠️ NE PROUVE PAS : que ces pools existent ni le montant reel preleve (quoter simule). Le fork le mesure a part.
 * ⛔ 2026-10-02 (porte de livraison, revue Claude) :
 *   · JONCTIONS : un block entre un segment Aerodrome (ou Uniswap V3) et un segment V4, dans les deux sens, ou entre deux
 *     sauts Aerodrome, est REFUSE dans CHAQUE planificateur qui les enchaine (franchissement, segment Aerodrome,
 *     ETH -> pivot -> action, multipool). Temoins positifs : jonction ETH / USDC, la route se planifie, un frais.
 *   · HOOK_PREVU a l ACHAT preleve du BLOCK : l oracle le compte (frais en block) et le planificateur le refuse. */
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const charger = async (dir) => {
  const imp = (f) => import(pathToFileURL(path.join(dir, f)).href);
  return { E: await imp('echange.js'), T: await imp('tokenomics.js'), P: await imp('paires.js'), F: await imp('frais-creation.js'),
    S: await imp('sauts-depuis-chemin.js'), PS: await imp('pool-sans-hook.js'), PF: await imp('plan-franchissement.js'), PA: await imp('plan-aerodrome-segment.js'),
    PE: await imp('plan-eth-block.js'), MP: await imp('multipool.js'), PO: await imp('pool.js') };
};

const ETH = '0x' + '0'.repeat(40);
const bas = (a) => String(a).toLowerCase();
const B4 = '0xb200000000000000000000000000000000000001';  /* trie AVANT NVDAc : B4 = currency0 face a NVDAc */
/* ⛔ 2026-10-02 (Zero 1, R4 item 2) : un block = 0xb2 + 20 zeros (B20) ; B1/B2 en ont la forme (avant : 0xb2ff…, plus un block) */
const B1 = '0xb2' + '0'.repeat(20) + 'ffffffffffffffff01';  /* trie APRES tout : block = currency1 */
const B2 = '0xb2' + '0'.repeat(20) + 'ffffffffffffffff02';
const B2_ORDINAIRE = '0xb2ffffffffffffffffffffffffffffffffffff03'; /* jeton ORDINAIRE 0xb2… (pas B20) : pas un block */
const HTZC = '0xb2000000000000000000002601c5c94f435da168'; /* action Coinbase B20 (symbol() lu = HTZc), au registre depuis 56878eb : pas un block */
const BLOCS = new Set([B4, B1, B2]);
const INCONNU = '0x' + '1'.repeat(36) + '00cc';
const compte = '0x' + '4'.repeat(40);
const REFUS = ['refusSansHook', 'refusFraisEnBlock', 'refusBlocIntermediaire', 'refusPlusieursHooks', 'refusTblock', 'refusV1Route', 'refusBlocSansHookTb'];

async function banc({ E, T, P, F, S, PS, PF, PA, PE, MP, PO }) {
  const USDC = bas(F.USDC_BASE);
  const NVDA = bas(P.ACTIONS_COINBASE.find((a) => a.symbole === 'NVDAc').adr);
  const OUSD = bas(P.DEVISES_BASE.find((d) => d.symbole === 'OUSD').adr);
  const Q = bas(E.QUOTEUR[8453]);
  const q = '0x' + (10n ** 18n).toString(16).padStart(64, '0') + '0'.repeat(64);
  /* le quoter rend 1e18 ; tout autre eth_call (autorisations, simulation) rend des mots pleins : autorisations OK */
  /* StateView (getSlot0/getLiquidity) : `sv` dit quelles pools de version actuelle existent — par defaut AUCUNE.
   *   sv = { ids: Set(poolId), liquidite: bigint } ; sv = 'panne' : la lecture echoue. */
  const SEL_SLOT0 = '0x' + PO.selecteur('getSlot0(bytes32)'), SEL_LIQ = '0x' + PO.selecteur('getLiquidity(bytes32)');
  const rpcSV = (sv = null) => async (m, p) => {
    if (m !== 'eth_call') return m === 'eth_chainId' ? '0x2105' : '0x' + '0'.repeat(64);
    const d = bas((p && p[0] && p[0].data) || '');
    if (d.startsWith(SEL_SLOT0) || d.startsWith(SEL_LIQ)) {
      if (sv === 'panne') throw new Error('StateView rate limit');
      const id = '0x' + d.slice(10, 74);
      if (!sv || !sv.ids.has(id)) return '0x' + '0'.repeat(256);
      return d.startsWith(SEL_SLOT0) ? '0x' + (2n ** 96n).toString(16).padStart(64, '0') + '0'.repeat(192) : '0x' + BigInt(sv.liquidite).toString(16).padStart(64, '0');
    }
    return bas((p && p[0] && p[0].to) || '') === Q ? q : '0x' + 'f'.repeat(128);
  };
  const rpc = rpcSV(null);
  const cle = (a, b, h, forme = null) => { const [c0, c1] = bas(a) < bas(b) ? [bas(a), bas(b)] : [bas(b), bas(a)];
    if (forme) return { currency0: c0, currency1: c1, ...forme, hooks: h };
    return h === ETH ? { currency0: c0, currency1: c1, fee: 500, tickSpacing: 10, hooks: h } : { currency0: c0, currency1: c1, fee: 0, tickSpacing: 200, hooks: h }; };
  const jambe = (de, vers, h, forme) => { const c = cle(de, vers, h, forme); return { cle: c, zeroForOne: bas(de) === c.currency0 }; };
  const OL = { fee: 30000, tickSpacing: 200 }; /* format OpenLaunch : seule exception de la regle « sans hook » */
  const V8 = T.HOOK_V8;
  const sensJambe = (s) => { const c0 = bas(s.cle.currency0), c1 = bas(s.cle.currency1);
    const b = BLOCS.has(c0) ? c0 : BLOCS.has(c1) ? c1 : null; if (!b) return s.zeroForOne ? 'ACHAT' : 'VENTE';
    return (s.zeroForOne ? c1 : c0) === b ? 'ACHAT' : 'VENTE'; };
  const fraisHooks = (sauts) => sauts.map((s) => { const sens = sensJambe(s);
    /* HOOK_PREVU (V1) a l ACHAT : a6cf recoit la SORTIE, le block (fork 52072599) — ecrit ici, pas lu dans le code juge */
    if (bas(s.cle.hooks) === bas(T.HOOK_PREVU) && sens === 'ACHAT') return bas(s.zeroForOne ? s.cle.currency1 : s.cle.currency0);
    return T.hookPaieDejaA6cf(s.cle.hooks, sens) ? T.deviseFraisHook(s.cle, sens, s.zeroForOne) : null; }).filter(Boolean);
  const multi = (sauts, entree, sortie, montant, dec, fraisDevisesOk = null, r = rpc) => E.planEchangeMultiSauts({ rpc: r, chaine: 8453, compte, sauts,
    entree, sortie, montant, decimalesEntree: dec, prixUsdEntree: null, fraisDevisesOk });

  const res = [];
  const verifier = (id, ok, detail = '') => res.push({ id, ok: !!ok, detail });
  const propre = (id, p) => verifier(id + ' : texte propre', !/hook|milieu|currency0|fee path|frais|a6cf|0x|intermedi/i.test(String(p.pourquoi || '')), String(p.pourquoi));
  const doitRefuser = async (id, sauts, e, s, m, dec, drapeaux, fdo = null) => {
    const p = await multi(sauts, e, s, m, dec, fdo);
    const vus = REFUS.filter((k) => p[k] === true);
    verifier(id + ' : REFUSE (' + drapeaux.join('|') + ')', p.etat === 'REFUSE' && vus.some((k) => drapeaux.includes(k)), p.etat + ' ' + vus.join(',') + ' ' + (p.pourquoi || ''));
    if (p.etat === 'REFUSE') propre(id, p);
    return p;
  };
  const juger1 = (id, p, sauts, attendu) => {
    const routeur = BigInt((p.resume && p.resume.frais) || 0);
    const hooks = fraisHooks(sauts);
    const n = (routeur > 0n ? 1 : 0) + hooks.length;
    verifier(id + ' : PRET', p.etat === 'PRET', p.etat + ' ' + (p.pourquoi || p.causeInterne || ''));
    verifier(id + ' : exactement 1 frais (' + attendu + ')', n === 1 && (attendu === 'routeur' ? routeur > 0n : routeur === 0n && hooks.length === 1),
      'routeur=' + routeur + ' hooks=' + JSON.stringify(hooks));
    const devR = bas((p.resume && (p.resume.fraisDevise === 'pair' ? p.resume.devise : p.resume.fraisDevise)) || '');
    verifier(id + ' : aucun frais en block', !hooks.some((d) => BLOCS.has(bas(d))) && !(routeur > 0n && BLOCS.has(devR)), JSON.stringify(hooks));
    return routeur;
  };
  const doitPasser = async (id, sauts, e, s, m, dec, attendu) => { const p = await multi(sauts, e, s, m, dec); juger1(id, p, sauts, attendu); return p; };

  /* ══ DOIVENT REFUSER ══ */
  const r4 = [jambe(ETH, B4, ETH), jambe(B4, NVDA, V8)];
  verifier('R4 forme : B4 est currency0 de la jambe V8', bas(r4[1].cle.currency0) === B4);
  verifier('R4 forme (oracle) : la jambe V8 verse a6cf EN BLOCK', fraisHooks(r4).some((d) => bas(d) === B4));
  const tousRefus = REFUS;
  await doitRefuser('R4 ETH>sans>B4>V8c0>NVDAc', r4, ETH, NVDA, 10n ** 15n, 18, tousRefus);
  await doitRefuser('R4 avec B4 prixe (fraisDevisesOk)', r4, ETH, NVDA, 10n ** 15n, 18, tousRefus, new Set([B4, USDC]));
  const r4m = [jambe(NVDA, B4, V8), jambe(B4, ETH, ETH)];
  await doitRefuser('R4 miroir NVDAc>V8c0>B4>sans>ETH', r4m, NVDA, ETH, 10n ** 8n, 8, tousRefus);
  await doitRefuser('R4 miroir avec NVDAc prixe', r4m, NVDA, ETH, 10n ** 8n, 8, tousRefus, new Set([NVDA, USDC]));
  await doitRefuser('R4a ETH>V8>B4>V8c0>NVDAc', [jambe(ETH, B4, V8), jambe(B4, NVDA, V8)], ETH, NVDA, 10n ** 12n, 18, tousRefus);
  await doitRefuser('R4b NVDAc>V8c0>B4>V8>ETH', [jambe(NVDA, B4, V8), jambe(B4, ETH, V8)], NVDA, ETH, 25n * 10n ** 8n, 8, tousRefus);
  await doitRefuser('R4c USDC>sans>ETH>V8>B4>V8c0>NVDAc', [jambe(USDC, ETH, ETH), jambe(ETH, B4, V8), jambe(B4, NVDA, V8)], USDC, NVDA, 10n ** 4n, 6, tousRefus);
  await doitRefuser('R4d NVDAc>V8c0>B4>V8>ETH>sans>USDC', [jambe(NVDA, B4, V8), jambe(B4, ETH, V8), jambe(ETH, USDC, ETH)], NVDA, USDC, 25n * 10n ** 8n, 8, tousRefus);
  const r4g = [jambe(NVDA, B4, V8), jambe(B4, ETH, V8), jambe(ETH, B1, V8)];
  await doitRefuser('R4g (sauts du pay-with) NVDAc>B4>ETH>B1', r4g, NVDA, B1, 25n * 10n ** 8n, 8, tousRefus);
  await doitRefuser('R5a USDC>sans>B4>V8c0>NVDAc', [jambe(USDC, B4, ETH), jambe(B4, NVDA, V8)], USDC, NVDA, 10n * 10n ** 6n, 6, tousRefus);
  await doitRefuser('R5c ETH>sans>USDC>sans>B4>V8c0>NVDAc', [jambe(ETH, USDC, ETH), jambe(USDC, B4, ETH), jambe(B4, NVDA, V8)], ETH, NVDA, 3n * 10n ** 15n, 18, tousRefus);
  /* ⚠️ R5d (USDC>sans>B4>V8,B4=c1>ETH) : Zero 1 le liste PRET, mais B4 y est INTERMEDIAIRE et la jambe sans hook touche
   *   un block — les deux regles demandees le refusent. Fail-closed : refus, et le conflit est dit dans le rapport. */
  await doitRefuser('R5d USDC>sans>B4>V8>ETH (conflit, voir rapport)', [jambe(USDC, B4, ETH), jambe(B4, ETH, V8)], USDC, ETH, 10n * 10n ** 6n, 6, tousRefus);
  /* chaque regle nouvelle, SEULE responsable du refus : */
  await doitRefuser('SEULE regle (1) : USDC>OpenLaunch>B1>V8>ETH (block intermediaire)', [jambe(USDC, B1, ETH, OL), jambe(B1, ETH, V8)], USDC, ETH, 10n ** 7n, 6, ['refusBlocIntermediaire']);
  await doitRefuser('SEULE regle (2) : B1>V8>ETH>sans>USDC>V8>B2 (deux hooks)', [jambe(B1, ETH, V8), jambe(ETH, USDC, ETH), jambe(USDC, B2, V8)], B1, B2, 10n ** 18n, 18, ['refusPlusieursHooks']);
  /* ⚠️ le brief initial voulait PRET ces routes « block V8 currency1 au milieu » : la regle (1) les refuse desormais */
  await doitRefuser('MILIEU USDC>V2(achat)>B1>V8>ETH', [jambe(USDC, B1, T.HOOK_V2), jambe(B1, ETH, V8)], USDC, ETH, 5n * 10n ** 6n, 6, ['refusBlocIntermediaire', 'refusPlusieursHooks']);
  await doitRefuser('MILIEU ETH>V8>B1>inconnu>USDC', [jambe(ETH, B1, V8), jambe(B1, USDC, INCONNU)], ETH, USDC, 10n ** 15n, 18, ['refusBlocIntermediaire', 'refusPlusieursHooks']);

  /* ══ DOIVENT PASSER, AVEC EXACTEMENT UN FRAIS ══ */
  for (const sens of ['ACHAT', 'VENTE']) {
    const c = cle(ETH, B1, V8);
    const p = await E.planEchange({ rpc, chaine: 8453, jeton: B1, compte, sens, montant: 10n ** 16n, marcheLu: { etat: 'LUE', cle: c, paire: 'ETH' } });
    juger1('R0 ' + sens + ' V8/ETH simple', p, [{ cle: c, zeroForOne: sens === 'ACHAT' }], 'hook');
  }
  await doitPasser('R1a USDC>sans>ETH>V8>B1', [jambe(USDC, ETH, ETH), jambe(ETH, B1, V8)], USDC, B1, 25n * 10n ** 6n, 6, 'hook');
  await doitPasser('R1b ETH>sans>USDC>V8>B2', [jambe(ETH, USDC, ETH), jambe(USDC, B2, V8)], ETH, B2, 10n ** 16n, 18, 'hook');
  await doitPasser('R1c B1>V8>ETH>sans>USDC', [jambe(B1, ETH, V8), jambe(ETH, USDC, ETH)], B1, USDC, 10n ** 18n, 18, 'hook');
  await doitPasser('R1d B2>V8>USDC>sans>ETH', [jambe(B2, USDC, V8), jambe(USDC, ETH, ETH)], B2, ETH, 10n ** 18n, 18, 'hook');
  const p3a = await doitPasser('R3a ETH>sans>USDC (1 saut)', [jambe(ETH, USDC, ETH)], ETH, USDC, 10n ** 16n, 18, 'routeur');
  verifier('R3a : 0,2 % (20 bps) exact', p3a.resume && BigInt(p3a.resume.fraisBps) === 20n && BigInt(p3a.resume.frais) === 2n * 10n ** 13n,
    p3a.resume && (p3a.resume.fraisBps + ' bps, ' + p3a.resume.frais));
  await doitPasser('R3b USDC>sans>ETH>sans>USDC', [jambe(USDC, ETH, ETH), jambe(ETH, USDC, ETH)], USDC, USDC, 25n * 10n ** 6n, 6, 'routeur');
  await doitPasser('R3 ETH>sans>USDC>sans>OUSD', [jambe(ETH, USDC, ETH), jambe(USDC, OUSD, ETH)], ETH, OUSD, 10n ** 15n, 18, 'routeur');

  /* ══ LE CONSTRUCTEUR « PAY WITH » (sauts-depuis-chemin.js) : memes regles ══ */
  const resolveur = (table) => async ({ de, vers }) => { const j = table[bas(de) + '>' + bas(vers)]; return j ? { etat: 'OK', ...j, quote: 10n ** 18n } : { etat: 'REFUSE', pourquoi: 'none' }; };
  const ch = (...n) => n.slice(1).map((v, i) => ({ de: n[i], vers: v, famille: 'uniswap-v4' }));
  const tab = (...js) => Object.fromEntries(js.map(([de, vers, h, forme]) => [bas(de) + '>' + bas(vers), jambe(de, vers, h, forme)]));
  const b4g = await S.sautsDepuisChemin({ chemin: ch(NVDA, B4, ETH, B1), montant: 10n ** 8n, resoudre: resolveur(tab([NVDA, B4, V8], [B4, ETH, V8], [ETH, B1, V8])) });
  verifier('R4g pay-with : constructeur REFUSE', b4g.etat === 'REFUSE' && (b4g.refusBlocIntermediaire || b4g.refusPlusieursHooks), b4g.etat + ' ' + b4g.pourquoi);
  if (b4g.etat === 'REFUSE') propre('R4g pay-with', b4g);
  const bOL = await S.sautsDepuisChemin({ chemin: ch(USDC, B1, ETH), montant: 10n ** 7n, resoudre: resolveur(tab([USDC, B1, ETH, OL], [B1, ETH, V8])) });
  verifier('pay-with SEULE regle (1) : block intermediaire refuse', bOL.etat === 'REFUSE' && bOL.refusBlocIntermediaire === true, bOL.etat + ' ' + bOL.pourquoi);
  const b2h = await S.sautsDepuisChemin({ chemin: ch(B1, ETH, USDC, B2), montant: 10n ** 18n, resoudre: resolveur(tab([B1, ETH, V8], [ETH, USDC, ETH], [USDC, B2, V8])) });
  verifier('pay-with SEULE regle (2) : deux hooks refuses', b2h.etat === 'REFUSE' && b2h.refusPlusieursHooks === true, b2h.etat + ' ' + b2h.pourquoi);
  const b1a = await S.sautsDepuisChemin({ chemin: ch(USDC, ETH, B1), montant: 25n * 10n ** 6n, resoudre: resolveur(tab([USDC, ETH, ETH], [ETH, B1, V8])) });
  verifier('pay-with R1a : constructeur OK (temoin)', b1a.etat === 'OK' && b1a.sauts && b1a.sauts.length === 2, b1a.etat + ' ' + (b1a.pourquoi || ''));
  if (b1a.etat === 'OK') await doitPasser('pay-with R1a -> planificateur', b1a.sauts, USDC, B1, 25n * 10n ** 6n, 6, 'hook');

  /* ══ HOOK_PREVU A L ACHAT : frais en block, donc refuse (simple et multi-sauts) ; la VENTE paie en ETH, une fois ══ */
  const PREVU = T.HOOK_PREVU;
  const cPrevu = cle(ETH, B1, PREVU);
  verifier('PREVU oracle : ACHAT ETH>B1 = un frais de hook EN BLOCK', JSON.stringify(fraisHooks([{ cle: cPrevu, zeroForOne: true }])) === JSON.stringify([B1]));
  verifier('PREVU oracle : VENTE B1>ETH = un frais de hook en ETH', JSON.stringify(fraisHooks([{ cle: cPrevu, zeroForOne: false }])) === JSON.stringify([ETH]));
  const pPa = await E.planEchange({ rpc, chaine: 8453, jeton: B1, compte, sens: 'ACHAT', montant: 10n ** 16n, marcheLu: { etat: 'LUE', cle: cPrevu, paire: 'ETH' } });
  verifier('PREVU ACHAT simple ETH>B1 : REFUSE (refusFraisEnBlock)', pPa.etat === 'REFUSE' && pPa.refusFraisEnBlock === true && pPa.pourquoi === PS.MESSAGE_PAS_ICI, pPa.etat + ' ' + pPa.pourquoi);
  /* 2026-10-02 (item e) : sans pool V8, la jambe V1 d une route est refusee AVANT le verrou de frais (refusV1Route) */
  await doitRefuser('PREVU ACHAT multi USDC>sans>ETH>PREVU>B1', [jambe(USDC, ETH, ETH), jambe(ETH, B1, PREVU)], USDC, B1, 25n * 10n ** 6n, 6, ['refusFraisEnBlock', 'refusV1Route']);
  const pPv = await E.planEchange({ rpc, chaine: 8453, jeton: B1, compte, sens: 'VENTE', montant: 10n ** 18n, marcheLu: { etat: 'LUE', cle: cPrevu, paire: 'ETH' } });
  juger1('R0 VENTE PREVU/ETH simple (temoin)', pPv, [{ cle: cPrevu, zeroForOne: false }], 'hook');
  verifier('V1-S2 VENTE sans pool actuelle : reste sur V1, marquee migrationEnAttente', pPv.resume && pPv.resume.migrationEnAttente === true && !pPv.resume.remplaceV1,
    JSON.stringify(pPv.resume && { m: pPv.resume.migrationEnAttente, r: pPv.resume.remplaceV1 }));

  /* ══ 2026-10-02 22:19 (Phil) — UN BLOCK V1 EST RAMENE SUR SA POOL DE VERSION ACTUELLE (V8), ACHAT ET VENTE ══ */
  const cV8 = cle(ETH, B1, V8); /* meme paire, format Launch frais 0 / espacement 200 */
  const avecV8 = (liquidite = 10n ** 18n) => rpcSV({ ids: new Set([bas(PO.poolId(cV8))]), liquidite });
  const hex = (a) => bas(a).slice(2);
  const planV1 = (sens, r) => E.planEchange({ rpc: r, chaine: 8453, jeton: B1, compte, sens, montant: sens === 'ACHAT' ? 10n ** 16n : 10n ** 18n,
    marcheLu: { etat: 'LUE', cle: cPrevu, paire: 'ETH' } });
  for (const sens of ['ACHAT', 'VENTE']) {
    const id = sens === 'ACHAT' ? 'V1-B1 ACHAT' : 'V1-S1 VENTE';
    const pV = await planV1(sens, avecV8());
    juger1(id + ' avec pool V8 : passe par V8', pV, [{ cle: cV8, zeroForOne: sens === 'ACHAT' }], 'hook');
    const data = bas((pV.tx && pV.tx.data) || '');
    verifier(id + ' avec pool V8 : calldata sur V8, pas sur V1', pV.resume && pV.resume.remplaceV1 === true && data.includes(hex(V8)) && !data.includes(hex(PREVU)),
      'remplaceV1=' + (pV.resume && pV.resume.remplaceV1) + ' v8=' + data.includes(hex(V8)) + ' v1=' + data.includes(hex(PREVU)));
  }
  const pVide = await planV1('ACHAT', avecV8(0n));
  verifier('V1-B3 ACHAT, pool V8 initialisee mais VIDE : REFUSE (pas une pool actuelle)', pVide.etat === 'REFUSE' && pVide.pourquoi === PS.MESSAGE_PAS_ICI, pVide.etat + ' ' + pVide.pourquoi);
  const pVideV = await planV1('VENTE', avecV8(0n));
  verifier('V1-S3 VENTE, pool V8 vide : reste sur V1 (migrationEnAttente)', pVideV.etat === 'PRET' && pVideV.resume.migrationEnAttente === true, pVideV.etat);
  for (const sens of ['ACHAT', 'VENTE']) {
    const pP = await planV1(sens, rpcSV('panne'));
    verifier('V1-R ' + sens + ' : StateView illisible => NON_MESURE (une panne n est pas une absence)', pP.etat === 'NON_MESURE', pP.etat + ' ' + pP.pourquoi);
  }

  /* ══ JONCTIONS AERODROME / V3 <-> V4 : un block a la jonction est REFUSE, avant toute lecture ══ */
  const rpcMuet = async (m) => { throw new Error('aucune lecture attendue (' + m + ')'); };
  const doitRefuserJonction = (id, p) => {
    verifier(id + ' : REFUSE (refusBlocJonction)', p && p.etat === 'REFUSE' && p.refusBlocJonction === true, (p && p.etat) + ' ' + (p && p.pourquoi));
    if (p && p.etat === 'REFUSE') { propre(id, p); verifier(id + ' : texte exact', p.pourquoi === PS.MESSAGE_PAS_ICI, p.pourquoi); }
  };
  const lieu = (de, vers, famille) => ({ de, vers, famille });
  const fr = (chemin, block) => PF.planFranchissement({ rpc: rpcMuet, chaine: 8453, compte, chemin, devise: chemin[0].de, block,
    montant: 10n ** 16n, decimalesEntree: 18, resoudreV4: async () => { throw new Error('aucune resolution attendue'); }, beneficiaireFrais: F.FEE_WALLET });
  doitRefuserJonction('J-F1 franchissement ETH>(V4)>B4>(Aerodrome)>NVDAc', await fr([lieu(ETH, B4, 'uniswap-v4'), lieu(B4, NVDA, 'aerodrome')], NVDA));
  const jf2 = await fr([lieu(ETH, B4, 'aerodrome'), lieu(B4, NVDA, 'uniswap-v4')], NVDA);
  verifier('J-F2 franchissement ETH>(Aerodrome)>B4>(V4)>NVDAc : REFUSE (ordre non construit)', jf2.etat === 'REFUSE' && jf2.etape === 'forme', jf2.etat + ' ' + jf2.pourquoi);
  const pf = await fr([lieu(OUSD, USDC, 'uniswap-v4'), lieu(USDC, NVDA, 'aerodrome')], NVDA);
  verifier('P-F franchissement OUSD>(V4)>USDC>(Aerodrome)>NVDAc : la garde laisse passer (lecture de la pool atteinte)',
    !pf.refusBlocJonction && pf.etape === 'pool aerodrome', pf.etat + ' ' + pf.etape + ' ' + pf.pourquoi);
  doitRefuserJonction('J-A1 segment Aerodrome USDC>B1>NVDAc', await PA.planAerodromeSegment({ rpc: rpcMuet, chemin: [lieu(USDC, B1, 'aerodrome'), lieu(B1, NVDA, 'aerodrome')],
    devise: USDC, block: NVDA, montant: 10n ** 7n, compte, beneficiaireFrais: F.FEE_WALLET }));
  const pa = await PA.planAerodromeSegment({ rpc: rpcMuet, chemin: [lieu(USDC, ETH, 'aerodrome'), lieu(ETH, NVDA, 'aerodrome')],
    devise: USDC, block: NVDA, montant: 10n ** 7n, compte, beneficiaireFrais: F.FEE_WALLET });
  verifier('P-A segment Aerodrome USDC>ETH>NVDAc : la garde laisse passer (lecture atteinte)', !pa.refusBlocJonction && pa.etat === 'NON_MESURE', pa.etat + ' ' + pa.pourquoi);
  /* ETH -> devise -> action (-> block) : pools lues (fixtures de test-plan-eth-block.mjs) */
  const PIV = [{ pool: '0x493e74eda2720e127baccc1a19b2d567bc14ab43', tickSpacing: 10, fee: 500, wethEst0: true, famille: 'aerodrome', sqrtPriceX96: '4102067387922704494368960' }];
  const PACT = { pool: '0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9', tickSpacing: 10, fee: 500, actionEst0: false, famille: 'aerodrome', sqrtPriceX96: '52267783314573183670416926724' };
  const eb = { montantWei: 10n ** 18n, poolAction: PACT, poolsPivot: PIV, recipient: compte, deadline: 1790626959n, maintenant: 1790625759n, beneficiaireFrais: F.FEE_WALLET };
  doitRefuserJonction('J-E1 ETH>USDC>B1>NVDAc (block = action du milieu)', PE.planEthVersAction({ ...eb, action: B1, block: NVDA,
    poolBlock: { pool: '0x' + '7'.repeat(40), sqrtPriceX96: '79228162514264337593543950336', fee: 500, tickSpacing: 10, blockEst0: false, famille: 'aerodrome' } }));
  doitRefuserJonction('J-E2 ETH>B1(devise pivot)>NVDAc', PE.planEthVersAction({ ...eb, action: NVDA, devise: B1 }));
  const pe = PE.planEthVersAction({ ...eb, action: NVDA });
  verifier('P-E ETH>USDC>NVDAc : PRET, un appel, un frais (fraisBps > 0, aucune pool hookee)', pe.etat === 'PRET' && pe.appels.length === 1 && Number(pe.fraisBps) > 0,
    pe.etat + ' ' + (pe.pourquoi || '') + ' ' + pe.fraisBps);
  /* multipool (Aerodrome Universal Router : V4 + V3 + CL dans un execute) */
  const v4 = (c0, c1, hooks) => { const [a, b] = bas(c0) < bas(c1) ? [bas(c0), bas(c1)] : [bas(c1), bas(c0)];
    return { venue: 'uniswap-v4', cle: { currency0: a, currency1: b, fee: hooks === ETH ? 500 : 0, tickSpacing: hooks === ETH ? 10 : 200, hooks } }; };
  const WETH = bas(MP.ADRESSES.WETH);
  const clA = (a, b) => ({ venue: 'aerodrome-cl', token0: a === ETH ? WETH : a, token1: b === ETH ? WETH : b, tickSpacing: 10, factory: 3 });
  const v3A = (a, b) => ({ venue: 'uniswap-v3', token0: a === ETH ? WETH : a, token1: b === ETH ? WETH : b, fee: 3000 });
  const ADM = new Set([NVDA, USDC]);
  const baseMP = { montant: 10n ** 18n, minSortie: 1n, destinataire: compte, deadline: 1n << 40n, admises: ADM };
  const routeur = (r) => (r.commandes || []).filter((c) => c === MP.CMD.PAY_PORTION || c === MP.CMD.TRANSFER).length;
  const jM = async (id, chemin) => {
    doitRefuserJonction(id + ' (cotation)', await MP.coterChemin({ rpc: rpcMuet, chemin, montant: 10n ** 18n, admises: ADM }));
    doitRefuserJonction(id + ' (construction)', MP.construireRoute({ ...baseMP, chemin, fraisIndice: 0 }));
  };
  await jM('J-M1 multipool ETH>(Aerodrome)>B4>(V4 V8)>NVDAc', [{ de: ETH, vers: B4, e: clA(ETH, B4) }, { de: B4, vers: NVDA, e: v4(B4, NVDA, V8) }]);
  await jM('J-M2 multipool NVDAc>(V4 V8)>B4>(Aerodrome)>ETH', [{ de: NVDA, vers: B4, e: v4(NVDA, B4, V8) }, { de: B4, vers: ETH, e: clA(B4, ETH) }]);
  await jM('J-M3 multipool USDC>(V4 V8)>B1>(V3)>ETH', [{ de: USDC, vers: B1, e: v4(USDC, B1, V8) }, { de: B1, vers: ETH, e: v3A(B1, ETH) }]);
  const ch1 = [{ de: ETH, vers: USDC, e: clA(ETH, USDC) }, { de: USDC, vers: B1, e: v4(USDC, B1, V8) }];
  const m1 = MP.construireRoute({ ...baseMP, chemin: ch1, fraisIndice: 0 });
  const h1 = fraisHooks(ch1.map((x) => ({ cle: x.e.cle || { hooks: ETH }, zeroForOne: x.e.cle ? bas(x.de) === x.e.cle.currency0 : true })));
  verifier('P-M1 multipool ETH>(Aerodrome)>USDC>(V4 V8)>B1 : PRET, 1 frais (hook V8 en USDC, routeur 0)',
    m1.etat === 'PRET' && routeur(m1) === 0 && h1.length === 1 && h1[0] === USDC, m1.etat + ' ' + (m1.pourquoi || '') + ' routeur=' + routeur(m1) + ' hooks=' + JSON.stringify(h1));
  const ch2 = [{ de: USDC, vers: ETH, e: v4(USDC, ETH, ETH) }, { de: ETH, vers: NVDA, e: clA(ETH, NVDA) }];
  const pl2 = MP.placerFrais(ch2, ADM);
  const m2 = MP.construireRoute({ ...baseMP, chemin: ch2, fraisIndice: pl2.indice });
  verifier('P-M2 multipool USDC>(V4 sans hook)>ETH>(Aerodrome)>NVDAc : PRET, 1 frais routeur, pas en block',
    m2.etat === 'PRET' && routeur(m2) === 1 && !BLOCS.has(bas(m2.fraisDevise || '')), m2.etat + ' ' + (m2.pourquoi || '') + ' routeur=' + routeur(m2) + ' devise=' + m2.fraisDevise);
  /* ══ 2026-10-02 VERDICT C2 (item b) : AUCUN BLOCK TB SUR UNE POOL SANS HOOK TB — debut, fin ou milieu ══ */
  const doitRefuserSansHookTb = (id, p) => {
    verifier(id + ' : REFUSE (refusBlocSansHookTb)', p && p.etat === 'REFUSE' && p.refusBlocSansHookTb === true, (p && p.etat) + ' ' + (p && p.pourquoi));
    if (p && p.etat === 'REFUSE') { propre(id, p); verifier(id + ' : texte exact', p.pourquoi === PS.MESSAGE_PAS_ICI, p.pourquoi); }
  };
  const seg = (chemin, devise, block) => PA.planAerodromeSegment({ rpc: rpcMuet, chemin, devise, block, montant: 10n ** 7n, compte, beneficiaireFrais: F.FEE_WALLET });
  doitRefuserSansHookTb('B-A1 segment Aerodrome USDC>B1 (block a la FIN : sweep 10 bps en block)', await seg([lieu(USDC, B1, 'aerodrome')], USDC, B1));
  doitRefuserSansHookTb('B-A2 segment Aerodrome B1>USDC (block au DEBUT)', await seg([lieu(B1, USDC, 'aerodrome')], B1, USDC));
  doitRefuserSansHookTb('B-A3 segment Aerodrome USDC>ETH>B1 (fin, 2 sauts)', await seg([lieu(USDC, ETH, 'aerodrome'), lieu(ETH, B1, 'aerodrome')], USDC, B1));
  const pOrd = await seg([lieu(USDC, B2_ORDINAIRE, 'aerodrome')], USDC, B2_ORDINAIRE);
  verifier('B20a segment Aerodrome USDC>0xb2ff… (jeton ordinaire, pas B20) : pas un block (lecture atteinte)', !pOrd.refusBlocSansHookTb && !pOrd.refusBlocJonction && pOrd.etat === 'NON_MESURE', pOrd.etat + ' ' + pOrd.pourquoi);
  const pHtz = await seg([lieu(USDC, HTZC, 'aerodrome')], USDC, HTZC);
  verifier('B20b segment Aerodrome USDC>HTZc (action B20 connue) : pas un block (lecture atteinte)', !pHtz.refusBlocSansHookTb && !pHtz.refusBlocJonction && pHtz.etat === 'NON_MESURE', pHtz.etat + ' ' + pHtz.pourquoi);
  const B20_CONNUS = ['HTZc', 'PFEc', 'PMc', 'GMEc'].map((sym) => P.ACTIONS_COINBASE.find((a) => a.symbole === sym)).filter(Boolean).map((a) => bas(a.adr)).concat([OUSD]);
  verifier('B20c oracle : B1/B2 sont des blocks ; 0xb2ff…, HTZc/PFEc/PMc/GMEc et OUSD non (B20 connus)', B20_CONNUS.length === 5 && B20_CONNUS.every((a) => PS.RE_B20.test(a) && !PS.estBlockAJonction(a) && !PS.estBlockDeRoute(a))
    && PS.estBlockAJonction(B1) && PS.estBlockAJonction(B2) && !PS.estBlockAJonction(B2_ORDINAIRE) && !PS.estBlockAJonction(HTZC)
    && PS.estBlockDeRoute(B1, new Set([B1])) && !PS.estBlockDeRoute(HTZC) && !PS.estBlockDeRoute(B2_ORDINAIRE, new Set([B2_ORDINAIRE])));
  doitRefuserSansHookTb('B-F1 franchissement OUSD>(V4)>USDC>(Aerodrome)>B1 (block a la FIN)', await fr([lieu(OUSD, USDC, 'uniswap-v4'), lieu(USDC, B1, 'aerodrome')], B1));
  doitRefuserSansHookTb('B-E1 ETH>USDC>B1 (block = action, fin du segment CL)', PE.planEthVersAction({ ...eb, action: B1 }));
  doitRefuserSansHookTb('B-E2 ETH>USDC>NVDAc>B1 (3e saut CL vers le block)', PE.planEthVersAction({ ...eb, action: NVDA, block: B1,
    poolBlock: { pool: '0x' + '7'.repeat(40), sqrtPriceX96: '79228162514264337593543950336', fee: 500, tickSpacing: 10, blockEst0: false, famille: 'aerodrome' } }));
  const v4f = (c0, c1, hooks, forme) => { const e = v4(c0, c1, hooks); return { ...e, cle: { ...e.cle, ...forme } }; };
  const sM = async (id, chemin) => {
    doitRefuserSansHookTb(id + ' (cotation)', await MP.coterChemin({ rpc: rpcMuet, chemin, montant: 10n ** 18n, admises: ADM }));
    doitRefuserSansHookTb(id + ' (construction)', MP.construireRoute({ ...baseMP, chemin, fraisIndice: 0 }));
  };
  await sM('B-M1 multipool ETH>(Aerodrome CL)>B1 (fin)', [{ de: ETH, vers: B1, e: clA(ETH, B1) }]);
  await sM('B-M2 multipool B1>(Aerodrome CL)>ETH (debut)', [{ de: B1, vers: ETH, e: clA(B1, ETH) }]);
  await sM('B-M3 multipool USDC>(V3)>B1 (fin)', [{ de: USDC, vers: B1, e: v3A(USDC, B1) }]);
  await sM('B-M4 multipool ETH>(V4 sans hook 500/10)>B1 (fin)', [{ de: ETH, vers: B1, e: v4(ETH, B1, ETH) }]);
  await sM('B-M5 multipool B1>(V4 sans hook 500/10)>ETH (debut)', [{ de: B1, vers: ETH, e: v4(B1, ETH, ETH) }]);
  /* TEMOIN POSITIF : le format OpenLaunch (V4 sans hook, 3 % / 200) reste la seule exception */
  const chOL = [{ de: ETH, vers: B1, e: v4f(ETH, B1, ETH, OL) }];
  const qOL = await MP.coterChemin({ rpc, chemin: chOL, montant: 10n ** 16n, admises: ADM });
  verifier('OL-M1 multipool ETH>(V4 OpenLaunch 3 %/200)>B1 : cotation pas refusee', qOL.etat !== 'REFUSE', qOL.etat + ' ' + (qOL.pourquoi || ''));
  const plOL = MP.placerFrais(chOL, ADM);
  const mOL = MP.construireRoute({ ...baseMP, montant: 10n ** 16n, chemin: chOL, fraisIndice: plOL.indice });
  verifier('OL-M2 multipool ETH>(V4 OpenLaunch)>B1 : PRET, 1 frais routeur, pas en block', mOL.etat === 'PRET' && routeur(mOL) === 1 && !BLOCS.has(bas(mOL.fraisDevise || '')),
    mOL.etat + ' ' + (mOL.pourquoi || '') + ' routeur=' + routeur(mOL) + ' devise=' + mOL.fraisDevise);
  const cOL = cle(ETH, B1, ETH, OL);
  const pOL = await E.planEchange({ rpc, chaine: 8453, jeton: B1, compte, sens: 'ACHAT', montant: 10n ** 16n, marcheLu: { etat: 'LUE', cle: cOL, paire: 'ETH' } });
  juger1('OL-S1 ACHAT simple ETH>(V4 OpenLaunch)>B1', pOL, [{ cle: cOL, zeroForOne: true }], 'routeur');

  /* ══ 2026-10-02 (item c) : multipool — un block AU MILIEU de deux sauts V4 est refuse (estBlockDeRoute) ══ */
  const chC = [{ de: USDC, vers: B1, e: v4(USDC, B1, V8) }, { de: B1, vers: ETH, e: v4(B1, ETH, V8) }];
  const qC = await MP.coterChemin({ rpc: rpcMuet, chemin: chC, montant: 10n ** 7n, admises: ADM });
  const rC = MP.construireRoute({ ...baseMP, chemin: chC, fraisIndice: 0 });
  for (const [k, p] of [['cotation', qC], ['construction', rC]]) {
    verifier('C-M1 multipool USDC>(V4 V8)>B1>(V4 V8)>ETH (' + k + ') : REFUSE (refusBlocIntermediaire)', p.etat === 'REFUSE' && p.refusBlocIntermediaire === true && p.pourquoi === PS.MESSAGE_PAS_ICI, p.etat + ' ' + p.pourquoi);
  }
  const chC2 = [{ de: USDC, vers: ETH, e: v4(USDC, ETH, ETH) }, { de: ETH, vers: B1, e: v4(ETH, B1, V8) }];
  const mC2 = MP.construireRoute({ ...baseMP, chemin: chC2, fraisIndice: 0, hooksFacturants: [V8] });
  verifier('P-M3 multipool USDC>(V4 sans hook)>ETH>(V4 V8)>B1 : PRET (block a la fin, pas au milieu)', mC2.etat === 'PRET' && routeur(mC2) === 0, mC2.etat + ' ' + (mC2.pourquoi || '') + ' routeur=' + routeur(mC2));

  /* ══ 2026-10-02 (item e) : une jambe V1 DANS une route multi-sauts suit f9888b4 — ramenee sur V8, sinon refusee ══ */
  const routeV1A = [jambe(USDC, ETH, ETH), jambe(ETH, B1, PREVU)];
  const eA = await multi(routeV1A, USDC, B1, 25n * 10n ** 6n, 6, null, avecV8());
  juger1('E-1 route ACHAT USDC>sans>ETH>V1>B1 avec pool V8', eA, [routeV1A[0], { cle: cV8, zeroForOne: routeV1A[1].zeroForOne }], 'hook');
  const dA = bas((eA.tx && eA.tx.data) || '');
  verifier('E-1 calldata sur V8, pas sur V1', dA.includes(hex(V8)) && !dA.includes(hex(PREVU)), 'v8=' + dA.includes(hex(V8)) + ' v1=' + dA.includes(hex(PREVU)));
  const routeV1V = [jambe(B1, ETH, PREVU), jambe(ETH, USDC, ETH)];
  const eV = await multi(routeV1V, B1, USDC, 10n ** 18n, 18, null, avecV8());
  juger1('E-2 route VENTE B1>V1>ETH>sans>USDC avec pool V8', eV, [{ cle: cV8, zeroForOne: routeV1V[0].zeroForOne }, routeV1V[1]], 'hook');
  const dV = bas((eV.tx && eV.tx.data) || '');
  verifier('E-2 calldata sur V8, pas sur V1', dV.includes(hex(V8)) && !dV.includes(hex(PREVU)), 'v8=' + dV.includes(hex(V8)) + ' v1=' + dV.includes(hex(PREVU)));
  await doitRefuser('E-3 route VENTE B1>V1>ETH>sans>USDC SANS pool V8', routeV1V, B1, USDC, 10n ** 18n, 18, ['refusV1Route']);
  const eP = await multi(routeV1V, B1, USDC, 10n ** 18n, 18, null, rpcSV('panne'));
  verifier('E-4 route V1, StateView illisible : NON_MESURE', eP.etat === 'NON_MESURE', eP.etat + ' ' + eP.pourquoi);

  /* ══ 242b475 : LA ROUTE OUSD (OUSD/USDC V4 sans hook 100/1, cle mesuree) passe par les regles R4 ══ */
  const OUSD_USDC = { fee: 100, tickSpacing: 1 };
  await doitPasser('R-OUSD1 OUSD>sans(100/1)>USDC>sans>ETH>V8>B1 (achat, 1 jambe payante)', [jambe(OUSD, USDC, ETH, OUSD_USDC), jambe(USDC, ETH, ETH), jambe(ETH, B1, V8)], OUSD, B1, 25n * 10n ** 18n, 18, 'hook');
  await doitPasser('R-OUSD2 B1>V8>ETH>sans>USDC>sans(100/1)>OUSD (vente)', [jambe(B1, ETH, V8), jambe(ETH, USDC, ETH), jambe(USDC, OUSD, ETH, OUSD_USDC)], B1, OUSD, 10n ** 18n, 18, 'hook');
  /* OUSD a un marche mesure (app : fraisDevisesOk) — sans lui, refusCheminFrais comme sur 242b475 */
  const sO3 = [jambe(OUSD, USDC, ETH, OUSD_USDC), jambe(USDC, ETH, ETH)];
  juger1('R-OUSD3 OUSD>sans(100/1)>USDC>sans>ETH (aucun hook : frais routeur une fois)', await multi(sO3, OUSD, ETH, 25n * 10n ** 18n, 18, new Set([OUSD, USDC])), sO3, 'routeur');
  await doitRefuser('R-OUSD4 OUSD>sans>USDC>V8>B1>V8>ETH (block au milieu)', [jambe(OUSD, USDC, ETH, OUSD_USDC), jambe(USDC, B1, V8), jambe(B1, ETH, V8)], OUSD, ETH, 25n * 10n ** 18n, 18, ['refusBlocIntermediaire', 'refusPlusieursHooks']);
  await doitRefuser('R-OUSD5 OUSD>V8>B1 ... B1 en tete : OUSD>sans>USDC>V8>B2 + V8 (deux jambes payantes)', [jambe(B1, ETH, V8), jambe(ETH, USDC, ETH), jambe(USDC, OUSD, ETH, OUSD_USDC), jambe(OUSD, B2, V8)], B1, B2, 10n ** 18n, 18, ['refusPlusieursHooks']);
  /* ══ 2026-10-02 (Phil : UN frais par swap ; C2 F3) — FRANCHISSEMENT Uniswap -> Aerodrome : UN frais a6cf par LOT ══
   * ⛔ L ORACLE LIT LES OCTETS : a6cf dans la jambe 1 (TAKE routeur), a6cf dans la jambe 2 (sweep CL), plus chaque jambe dont
   *   le hook verse a6cf (liste mesuree). Total attendu : 1. Sur f9368a0 : routeur V4 + sweep CL = 2 (ou hook + sweep = 2). */
  const POOL_A = '0xa3b1e3f9747065e2073722ff4c9027d3ea4994f0';
  const SEL_GP = '0x' + PO.selecteur('getPool(address,address,int24)'), SEL_T0 = '0x' + PO.selecteur('token0()'), SEL_S0 = '0x' + PO.selecteur('slot0()');
  const mot = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
  const rpcFr = (devis = 10n ** 18n) => async (m, p) => {
    if (m !== 'eth_call') return m === 'eth_chainId' ? '0x2105' : '0x' + '0'.repeat(64);
    const d = bas((p && p[0] && p[0].data) || '');
    if (d.startsWith(SEL_GP)) return '0x' + mot(parseInt(d.slice(10 + 128, 10 + 192), 16) === 10 ? POOL_A : ETH);
    if (d.startsWith(SEL_T0)) return '0x' + mot(USDC);
    if (d.startsWith(SEL_S0)) return '0x' + (2n ** 96n).toString(16).padStart(64, '0') + '0'.repeat(64 * 6);
    if (d.startsWith(SEL_SLOT0) || d.startsWith(SEL_LIQ)) return '0x' + '0'.repeat(256);
    return bas((p && p[0] && p[0].to) || '') === Q ? '0x' + devis.toString(16).padStart(64, '0') + '0'.repeat(64) : '0x' + 'f'.repeat(128);
  };
  const A6 = bas(F.FEE_WALLET).slice(2);
  const resV4 = (hBlock) => async ({ de, vers }) => { const c = cle(de, vers, BLOCS.has(bas(de)) || BLOCS.has(bas(vers)) ? hBlock : ETH);
    return { etat: 'OK', cle: c, zeroForOne: bas(de) === c.currency0, quote: 10n ** 18n }; };
  const frx = (chemin, { hBlock = V8, devis, montant = 10n ** 21n, fdo = null } = {}) => PF.planFranchissement({ rpc: rpcFr(devis), chaine: 8453, compte, chemin,
    devise: chemin[0].de, block: chemin[chemin.length - 1].vers, montant, decimalesEntree: 18, prixUsdEntree: null, beneficiaireFrais: F.FEE_WALLET,
    fraisDevisesOk: fdo || new Set([bas(chemin[0].de), NVDA]), resoudreV4: resV4(hBlock) });
  const sautsJ1 = (chemin, hBlock = V8) => chemin.filter((x) => x.famille === 'uniswap-v4').map((x) => { const c = cle(x.de, x.vers, BLOCS.has(bas(x.de)) || BLOCS.has(bas(x.vers)) ? hBlock : ETH); return { cle: c, zeroForOne: bas(x.de) === c.currency0 }; });
  const jugerLot = (id, p, chemin, attendu, hBlock = V8) => {
    verifier(id + ' : PRET', p.etat === 'PRET' && Array.isArray(p.appels) && p.appels.length === 3, p.etat + ' ' + (p.etape || '') + ' ' + (p.pourquoi || ''));
    if (p.etat !== 'PRET') return;
    const j1 = bas(p.appels[0].data).includes(A6), j2 = bas(p.appels[2].data).includes(A6);
    const hooks = fraisHooks(sautsJ1(chemin, hBlock));
    const n = (j1 ? 1 : 0) + (j2 ? 1 : 0) + hooks.length;
    verifier(id + ' : exactement 1 frais par lot (' + attendu + ')', n === 1 && (attendu === 'CL' ? j2 && !j1 : hooks.length === 1 && !j1 && !j2),
      'jambe1=' + j1 + ' jambe2=' + j2 + ' hooks=' + JSON.stringify(hooks));
    verifier(id + ' : le plan le dit (jambesPayantes 1, jambe ' + (attendu === 'CL' ? 2 : 1) + ')', p.resume.jambesPayantes === 1 && p.resume.jambePayante === (attendu === 'CL' ? 2 : 1)
      && p.resume.fraisParHook === (attendu !== 'CL') && p.resume.fraisBpsJambe1 === 0n && p.resume.fraisBpsJambe2 === (attendu === 'CL' ? 10n : 0n), JSON.stringify(p.resume, (k, v) => (typeof v === 'bigint' ? String(v) : v)));
    verifier(id + ' : aucun frais en block', !hooks.some((d) => BLOCS.has(bas(d))), JSON.stringify(hooks));
  };
  const cFR1 = [lieu(OUSD, USDC, 'uniswap-v4'), lieu(USDC, NVDA, 'aerodrome')];
  jugerLot('FR1 franchissement OUSD>(V4 sans hook, 1 saut)>USDC>(Aerodrome)>NVDAc', await frx(cFR1), cFR1, 'CL');
  const cFR2 = [lieu(ETH, USDC, 'uniswap-v4'), lieu(USDC, NVDA, 'aerodrome')];
  jugerLot('FR2 franchissement ETH>(V4 sans hook)>USDC>(Aerodrome)>NVDAc', await frx(cFR2), cFR2, 'CL');
  const cFR3 = [lieu(B4, ETH, 'uniswap-v4'), lieu(ETH, USDC, 'uniswap-v4'), lieu(USDC, NVDA, 'aerodrome')];
  jugerLot('FR3 franchissement B4>(V8)>ETH>(sans)>USDC>(Aerodrome)>NVDAc (hook payeur)', await frx(cFR3), cFR3, 'hook');
  jugerLot('FR3b franchissement B4>(V2, vente)>ETH>(sans)>USDC>(Aerodrome)>NVDAc (hook payeur)', await frx(cFR3, { hBlock: T.HOOK_V2 }), cFR3, 'hook', T.HOOK_V2);
  const cFR4 = [lieu(B4, USDC, 'uniswap-v4'), lieu(USDC, NVDA, 'aerodrome')];
  jugerLot('FR4 franchissement B4>(V8, 1 saut)>USDC>(Aerodrome)>NVDAc (hook payeur)', await frx(cFR4), cFR4, 'hook');
  const pFR5 = await frx(cFR1, { devis: 500n, montant: 500n });
  verifier('FR5 franchissement poussiere (frais CL arrondi a 0) : REFUSE refusPoussiere', pFR5.etat === 'REFUSE' && pFR5.refusPoussiere === true && pFR5.pourquoi === E.MESSAGE_TROP_PETIT,
    pFR5.etat + ' ' + pFR5.pourquoi);
  /* TEMOINS : une route a UNE jambe paie toujours exactement 1 frais (rail V4 seul, sans franchissement) */
  const sTS1 = [jambe(OUSD, USDC, ETH)];
  const pTS1 = await multi(sTS1, OUSD, USDC, 10n ** 21n, 18, new Set([OUSD, USDC]));
  juger1('TS1 une seule jambe OUSD>(V4 sans hook)>USDC : 1 frais routeur', pTS1, sTS1, 'routeur');
  verifier('TS1 : le TAKE a6cf est dans les octets', pTS1.tx && bas(pTS1.tx.data).includes(A6), pTS1.etat);
  const sTS2 = [jambe(ETH, USDC, ETH)];
  juger1('TS2 une seule jambe ETH>(V4 sans hook)>USDC : 1 frais routeur', await multi(sTS2, ETH, USDC, 10n ** 18n, 18), sTS2, 'routeur');

  /* ══ 2026-10-02 (C2, F1) — UN BLOCK SUR UNE POOL V4 A HOOK TIERS EST REFUSE, avant toute cotation ══ */
  const O1 = '0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc';
  const MEME = '0x' + 'ab'.repeat(20); /* memecoin hors B20 (type BRIAN), non prixe : PAS un block a la forme */
  const doitRefuserTiers = (id, p) => {
    verifier(id + ' : REFUSE (hook tiers)', p && p.etat === 'REFUSE' && p.refusBlocSansHookTb === true, (p && p.etat) + ' ' + (p && p.pourquoi));
    if (p && p.etat === 'REFUSE') { propre(id, p); verifier(id + ' : texte exact', p.pourquoi === PS.MESSAGE_PAS_ICI, p.pourquoi); }
  };
  for (const sens of ['ACHAT', 'VENTE']) {
    doitRefuserTiers('H1-S ' + sens + ' simple ETH/B1 hook tiers', await E.planEchange({ rpc, chaine: 8453, jeton: B1, compte, sens, montant: 10n ** 16n,
      marcheLu: { etat: 'LUE', cle: cle(ETH, B1, INCONNU), paire: 'ETH' } }));
  }
  doitRefuserTiers('H1-M1 multi ETH>(hook tiers)>B1', await multi([jambe(ETH, B1, INCONNU)], ETH, B1, 10n ** 16n, 18));
  doitRefuserTiers('H1-M2 multi USDC>sans>ETH>(hook tiers)>B1', await multi([jambe(USDC, ETH, ETH), jambe(ETH, B1, INCONNU)], USDC, B1, 10n ** 7n, 6));
  doitRefuserTiers('H1-M3 multi B1>(hook tiers)>ETH (vente)', await multi([jambe(B1, ETH, INCONNU)], B1, ETH, 10n ** 18n, 18));
  const chTiers = [{ de: ETH, vers: B1, e: v4(ETH, B1, INCONNU) }];
  doitRefuserTiers('H1-MP multipool ETH>(V4 hook tiers)>B1 (cotation)', await MP.coterChemin({ rpc: rpcMuet, chemin: chTiers, montant: 10n ** 18n, admises: ADM }));
  doitRefuserTiers('H1-MP multipool ETH>(V4 hook tiers)>B1 (construction)', MP.construireRoute({ ...baseMP, chemin: chTiers, fraisIndice: 0 }));
  /* TEMOINS POSITIFS : V8, o1 Standard (referent a6cf), OpenLaunch (OL-S1/OL-M2 plus haut), et un memecoin hors B20 */
  for (const sens of ['ACHAT', 'VENTE']) {
    const c = cle(ETH, B1, V8);
    juger1('H1-P V8 ' + sens + ' simple ETH/B1', await E.planEchange({ rpc, chaine: 8453, jeton: B1, compte, sens, montant: 10n ** 16n, marcheLu: { etat: 'LUE', cle: c, paire: 'ETH' } }),
      [{ cle: c, zeroForOne: sens === 'ACHAT' }], 'hook');
  }
  const cO1 = cle(ETH, B1, O1);
  juger1('H1-P o1 Standard ACHAT simple ETH>B1 (referent a6cf)', await E.planEchange({ rpc, chaine: 8453, jeton: B1, compte, sens: 'ACHAT', montant: 10n ** 16n,
    marcheLu: { etat: 'LUE', cle: cO1, paire: 'ETH' } }), [{ cle: cO1, zeroForOne: true }], 'routeur');
  const sO1 = [jambe(ETH, B1, O1)];
  juger1('H1-P o1 Standard multi ETH>(o1)>B1', await multi(sO1, ETH, B1, 10n ** 16n, 18), sO1, 'routeur');
  const chO1 = [{ de: ETH, vers: B1, e: v4(ETH, B1, O1) }];
  const mO1 = MP.construireRoute({ ...baseMP, montant: 10n ** 16n, chemin: chO1, fraisIndice: MP.placerFrais(chO1, ADM).indice });
  verifier('H1-P o1 Standard multipool ETH>(V4 o1)>B1 : PRET', mO1.etat === 'PRET', mO1.etat + ' ' + (mO1.pourquoi || ''));
  const admis = (c) => (typeof PS.hookAdmisPourBlock === 'function' ? PS.hookAdmisPourBlock(c) : null); /* absent (code d avant) : rouge, pas d exception */
  verifier('H1-P memecoin hors B20 sur hook tiers : la regle F1 ne le juge pas (forme)', admis(cle(ETH, MEME, INCONNU)) === true
    && admis(cle(ETH, B1, INCONNU)) === false && admis(cle(ETH, B1, O1)) === true && admis(cle(ETH, B1, ETH, OL)) === true
    && admis(cle(ETH, B1, ETH)) === false);

  /* ══ F6 (C2) : les 4 actions ajoutees par 56878eb sont CONNUES — aucune n est un block ══ */
  const QUATRE = ['GMEc', 'HTZc', 'PFEc', 'PMc'].map((s) => [s, P.ACTIONS_COINBASE.find((a) => a.symbole === s)]);
  verifier('F6 GMEc HTZc PFEc PMc au registre, ni block de route ni block a jonction', QUATRE.every(([, a]) => !!a && !PS.estBlockDeRoute(a.adr) && !PS.estBlockAJonction(a.adr) && admis(cle(ETH, a.adr, INCONNU)) !== false),
    QUATRE.map(([s, a]) => s + '=' + (a ? a.adr : 'ABSENTE')).join(' '));
  verifier('F6 compte : 37 actions au registre, 41 devises 7030 toutes connues', P.ACTIONS_COINBASE.length === 37 && P.DEVISES_ADMISES_7030.length === 41
    && P.DEVISES_ADMISES_7030.every((d) => PS.estDeviseConnue(d.adr || d)), P.ACTIONS_COINBASE.length + ' / ' + P.DEVISES_ADMISES_7030.length);
  return res;
}

/* ── une COPIE du depot (fichiers .js de premier niveau + package.json), mutee ou non ── */
function copie(mutation) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-r4-'));
  for (const f of fs.readdirSync(ICI)) if (/\.js$/.test(f) || f === 'package.json') fs.copyFileSync(path.join(ICI, f), path.join(dir, f));
  for (const [fichier, de, vers] of (mutation ? mutation.edits : [])) {
    const p = path.join(dir, fichier);
    const src = fs.readFileSync(p, 'utf8');
    const n = src.split(de).length - 1;
    if (n !== 1) throw new Error('mutant ' + mutation.nom + ' : motif trouve ' + n + ' fois dans ' + fichier + ' (attendu 1) — le mutant ne mute rien');
    fs.writeFileSync(p, src.replace(de, vers));
  }
  return dir;
}
const MUTANTS = [
  { nom: 'A [entree, sortie]', edits: [['echange.js', 'sauts.flatMap((x) => (x && x.cle ? [x.cle.currency0, x.cle.currency1] : []))', '[entree, sortie]']],
    doitCasser: [/^R4 ETH>sans/, /^R4 miroir NVDAc/, /^R4 miroir avec NVDAc prixe/, /^R5a /, /^R5c /] },
  { nom: 'B block prixe = devise', edits: [['pool-sans-hook.js', "(RE_B20.test(a) || !(fraisDevisesOk", "(false || !(fraisDevisesOk"]],
    doitCasser: [/^R4 avec B4 prixe/] },
  { nom: 'C regle (1) retiree', edits: [['echange.js', 'if (blocsRoute.some((b) => !bouts.has(b)))', 'if (false)']],
    doitCasser: [/^SEULE regle \(1\)/] }, /* R-OUSD4 reste refuse par la regle (2) : 2 jambes V8 */
  { nom: 'D regle (2) retiree', edits: [['echange.js', 'if (sauts.filter((x) => x && x.cle && !cleSansHook(x.cle)).length >= 2)', 'if (false)']],
    doitCasser: [/^SEULE regle \(2\)/, /^R-OUSD5 /] },
  { nom: 'E pay-with regle (1) retiree', edits: [['sauts-depuis-chemin.js', "if (RE_B20.test(String(chemin[i].vers || '')) && estBlockDeRoute(chemin[i].vers))", 'if (false)']],
    doitCasser: [/^pay-with SEULE regle \(1\)/] },
  { nom: 'F pay-with regle (2) retiree', edits: [['sauts-depuis-chemin.js', 'if (sauts.filter((x) => !cleSansHook(x.cle)).length >= 2)', 'if (false)']],
    doitCasser: [/^pay-with SEULE regle \(2\)/] },
  { nom: 'G jonction franchissement retiree', edits: [['plan-franchissement.js', 'if (indexBlocAJonction([forme.pivot]) >= 0)', 'if (false)']],
    doitCasser: [/^J-F1 /] },
  { nom: 'H jonction multipool retiree', edits: [['multipool.js', 'return indexBlocAJonction(noeudsJonction(chemin)) >= 0;', 'return false;']],
    doitCasser: [/^J-M1 .*cotation/, /^J-M1 .*construction/, /^J-M2 /, /^J-M3 /] },
  { nom: 'I jonction segment Aerodrome retiree', edits: [['plan-aerodrome-segment.js', 'if (indexBlocAJonction(chemin.slice(1).map((s) => s.de)) >= 0)', 'if (false)']],
    doitCasser: [/^J-A1 /] },
  { nom: 'J jonction ETH>pivot>action retiree', edits: [['plan-eth-block.js', 'if (indexBlocAJonction(troisSauts ? [devise, action] : [devise]) >= 0)', 'if (false)']],
    doitCasser: [/^J-E1 /, /^J-E2 /] },
  { nom: 'K garde de jonction retiree (partout)', edits: [['pool-sans-hook.js', "return BLOCKS_TB.has(a) || (RE_B20.test(a) && !pasUnBlockConnu(a));", 'return false;']],
    doitCasser: [/^J-F1 /, /^J-A1 /, /^J-E1 /, /^J-E2 /, /^J-M1 /, /^J-M2 /, /^J-M3 /, /^B-A1 /, /^B-F1 /, /^B-E1 /, /^B-M1 /] },
  { nom: 'M V1 non ramene sur la pool actuelle', edits: [['echange.js', "if (actuelle.cle) marche = { ...marche, etat: 'LUE', cle: actuelle.cle, remplaceV1: true };", 'if (false) marche = marche;']],
    doitCasser: [/^V1-B1 /, /^V1-S1 /] },
  { nom: 'N pool actuelle sans liquidite acceptee', edits: [['echange.js', 'if (s0 !== 0n && lq > 0n) return { cle: c, ratees };', 'if (s0 !== 0n) return { cle: c, ratees };']],
    doitCasser: [/^V1-B3 /, /^V1-S3 /] },
  { nom: 'L PREVU achat hors fraisHookEnBlock', edits: [['pool-sans-hook.js', 'deviseFraisHook(cle, sens, zeroForOne) || deviseFraisHookHorsListe(cle, sens, zeroForOne)', 'deviseFraisHook(cle, sens, zeroForOne)']],
    doitCasser: [/^PREVU ACHAT simple/] }, /* multi : refuse desormais plus tot par la jambe V1 (refusV1Route, item e) */
  { nom: 'O multipool : block sur pool sans hook TB accepte', edits: [['multipool.js', "&& (s.e.venue !== 'uniswap-v4' || (cleSansHook(s.e.cle) && !formatOpenLaunch(s.e.cle)) || tiers(s.e.cle)));", '&& false);']],
    doitCasser: [/^B-M1 /, /^B-M2 /, /^B-M3 /, /^B-M4 /, /^B-M5 /] },
  { nom: 'T multipool : exception OpenLaunch retiree', edits: [['multipool.js', '(cleSansHook(s.e.cle) && !formatOpenLaunch(s.e.cle))', 'cleSansHook(s.e.cle)']],
    doitCasser: [/^OL-M1 /, /^OL-M2 /] },
  { nom: 'P segment Aerodrome : debut/fin non gardes', edits: [['plan-aerodrome-segment.js', 'if (indexBlocAJonction([chemin[0].de, chemin[chemin.length - 1].vers]) >= 0)', 'if (false)']],
    doitCasser: [/^B-A1 /, /^B-A2 /, /^B-A3 /] },
  { nom: 'Q franchissement : block final non garde', edits: [['plan-franchissement.js', 'if (indexBlocAJonction([forme.action]) >= 0)', 'if (false)']],
    doitCasser: [/^B-F1 /] },
  { nom: 'R ETH>pivot>action(>block) : bout non garde', edits: [['plan-eth-block.js', 'if (indexBlocAJonction([troisSauts ? block : action]) >= 0)', 'if (false)']],
    doitCasser: [/^B-E1 /, /^B-E2 /] },
  { nom: 'S multipool : block au milieu de deux V4 accepte', edits: [['multipool.js', '&& estBlockDeRoute(noeud(chemin[i].de), admises instanceof Set ? admises : null)) return true;', '&& false) return true;']],
    doitCasser: [/^C-M1 /] },
  { nom: 'U route : jambe V1 non ramenee sur V8', edits: [['echange.js', 'if (a.cle) { neufs.push({ ...x, cle: a.cle }); continue; }', 'if (a.cle) { neufs.push(x); continue; }']],
    doitCasser: [/^E-1 /, /^E-2 /] },
  { nom: 'V B20 = simple prefixe 0xb2', edits: [['pool-sans-hook.js', 'export const RE_B20 = /^0xb20{20}/i;', 'export const RE_B20 = /^0xb2/i;']],
    doitCasser: [/^B20a /, /^B20c /] },
  { nom: 'W HTZc retire du registre (une action B20 connue n est un block que si elle sort du registre)', edits: [['paires.js', "{ symbole: 'HTZc', nom: 'Hertz', adr: '0xb2000000000000000000002601c5c94f435da168' },", '']],
    doitCasser: [/^B20b /, /^B20c /, /^F6 GMEc /] },
  /* ── 2026-10-02 (Phil : un frais par swap ; C2 F1/F3) ── */
  { nom: 'F3a franchissement : routeur V4 garde son frais (2 frais par lot)', edits: [['plan-franchissement.js', 'fraisDevisesOk, fraisRouteurAilleurs: true });', 'fraisDevisesOk });']],
    doitCasser: [/^FR1 .*exactement 1 frais/, /^FR2 .*exactement 1 frais/] },
  { nom: 'F3b franchissement : sweep CL garde malgre le hook payeur', edits: [['plan-franchissement.js', 'sansFrais: parHook,', 'sansFrais: false,']],
    doitCasser: [/^FR3 .*exactement 1 frais/, /^FR3b .*exactement 1 frais/, /^FR4 .*exactement 1 frais/] },
  { nom: 'F3c franchissement : garde poussiere retiree', edits: [['plan-franchissement.js', 'if (!parHook && (minPools * FRAIS_INTERFACE_BPS_CL) / 10000n <= 0n)', 'if (false)']],
    doitCasser: [/^FR5 /] },
  { nom: 'F3d jambe 1 a un saut sans TAKE refusee', edits: [['echange.js', 'const formeSansTake = fraisRouteurAilleurs &&', 'const formeSansTake = false &&']],
    doitCasser: [/^FR1 .*: PRET/, /^FR4 .*: PRET/] },
  { nom: 'F1a swap simple : hook tiers accepte', edits: [['echange.js', 'if (!hookAdmisPourBlock(marche.cle)) return', 'if (false) return']],
    doitCasser: [/^H1-S ACHAT /, /^H1-S VENTE /] },
  { nom: 'F1b multi-sauts : hook tiers accepte', edits: [['echange.js', '!hookAdmisPourBlock(x.cle) && !listePayeurs', 'false && !listePayeurs']],
    doitCasser: [/^H1-M1 /, /^H1-M2 /, /^H1-M3 /] },
  { nom: 'F1c multipool : hook tiers accepte', edits: [['multipool.js', '|| tiers(s.e.cle)));', '));']],
    doitCasser: [/^H1-MP .*cotation/, /^H1-MP .*construction/] },
  { nom: 'F1d helper : o1 Standard refuse (temoin positif)', edits: [['pool-sans-hook.js', 'return REFERENT_O1_ACTIF === true && estHookO1Standard(h);', 'return false;']],
    doitCasser: [/^H1-P o1 Standard ACHAT/, /^H1-P o1 Standard multi /, /^H1-P o1 Standard multipool/] },
];

let nAssert = 0, ko = 0;
const ok = (c, m) => { nAssert += 1; if (!c) { ko += 1; console.log('  KO  ' + m); } };

const reel = await banc(await charger(ICI));
for (const r of reel) ok(r.ok, 'depot : ' + r.id + ' — ' + r.detail);
console.log('depot : ' + reel.length + ' verifications, ' + reel.filter((r) => !r.ok).length + ' KO');

const dirs = [];
try {
  const d0 = copie(null); dirs.push(d0);
  const temoin = await banc(await charger(d0));
  ok(temoin.length === reel.length && temoin.every((r) => r.ok), 'copie non mutee : le banc doit rester vert (copie fidele)');
  for (const M of MUTANTS) {
    const d = copie(M); dirs.push(d);
    const r = await banc(await charger(d));
    const rouges = r.filter((x) => !x.ok).map((x) => x.id);
    console.log('mutant ' + M.nom + ' : ' + rouges.length + ' rouge(s) — ' + rouges.join(' | '));
    ok(rouges.length > 0, 'mutant ' + M.nom + ' : le banc doit devenir ROUGE');
    for (const re of M.doitCasser) ok(rouges.some((id) => re.test(id)), 'mutant ' + M.nom + ' : doit casser ' + re);
    /* les routes legitimes ne dependent d aucune mutation */
    ok(!rouges.some((id) => /^(R0|R1|R3|R-OUSD[123] |pay-with R1a|P-|PREVU oracle|TS[12] |H1-P V8 )/.test(id)), 'mutant ' + M.nom + ' : R0/R1/R3 et temoins P- restent verts');
  }
} finally {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
}

console.log(nAssert + ' assertions, ' + ko + ' KO');
if (nAssert === 0) { console.log('⛔ aucune assertion executee'); process.exit(1); }
process.exit(ko ? 1 : 0);
