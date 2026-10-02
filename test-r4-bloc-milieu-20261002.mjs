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
 *   Non modelise : HOOK_PREVU a l ACHAT preleve du block sur la chaine (hors liste, invisible a l oracle). */
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const charger = async (dir) => {
  const imp = (f) => import(pathToFileURL(path.join(dir, f)).href);
  return { E: await imp('echange.js'), T: await imp('tokenomics.js'), P: await imp('paires.js'), F: await imp('frais-creation.js'),
    S: await imp('sauts-depuis-chemin.js') };
};

const ETH = '0x' + '0'.repeat(40);
const bas = (a) => String(a).toLowerCase();
const B4 = '0xb200000000000000000000000000000000000001';  /* trie AVANT NVDAc : B4 = currency0 face a NVDAc */
const B1 = '0xb2ffffffffffffffffffffffffffffffffffff01';  /* trie APRES tout : block = currency1 */
const B2 = '0xb2ffffffffffffffffffffffffffffffffffff02';
const BLOCS = new Set([B4, B1, B2]);
const INCONNU = '0x' + '1'.repeat(36) + '00cc';
const compte = '0x' + '4'.repeat(40);
const REFUS = ['refusSansHook', 'refusFraisEnBlock', 'refusBlocIntermediaire', 'refusPlusieursHooks', 'refusTblock'];

async function banc({ E, T, P, F, S }) {
  const USDC = bas(F.USDC_BASE);
  const NVDA = bas(P.ACTIONS_COINBASE.find((a) => a.symbole === 'NVDAc').adr);
  const OUSD = bas(P.DEVISES_BASE.find((d) => d.symbole === 'OUSD').adr);
  const Q = bas(E.QUOTEUR[8453]);
  const q = '0x' + (10n ** 18n).toString(16).padStart(64, '0') + '0'.repeat(64);
  /* le quoter rend 1e18 ; tout autre eth_call (autorisations, simulation) rend des mots pleins : autorisations OK */
  const rpc = async (m, p) => (m === 'eth_call' ? (bas((p && p[0] && p[0].to) || '') === Q ? q : '0x' + 'f'.repeat(128))
    : m === 'eth_chainId' ? '0x2105' : '0x' + '0'.repeat(64));
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
    return T.hookPaieDejaA6cf(s.cle.hooks, sens) ? T.deviseFraisHook(s.cle, sens, s.zeroForOne) : null; }).filter(Boolean);
  const multi = (sauts, entree, sortie, montant, dec, fraisDevisesOk = null) => E.planEchangeMultiSauts({ rpc, chaine: 8453, compte, sauts,
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
  { nom: 'B block prixe = devise', edits: [['pool-sans-hook.js', "(/^0xb2/.test(a) || !(fraisDevisesOk", "(false || !(fraisDevisesOk"]],
    doitCasser: [/^R4 avec B4 prixe/] },
  { nom: 'C regle (1) retiree', edits: [['echange.js', 'if (blocsRoute.some((b) => !bouts.has(b)))', 'if (false)']],
    doitCasser: [/^SEULE regle \(1\)/] },
  { nom: 'D regle (2) retiree', edits: [['echange.js', 'if (sauts.filter((x) => x && x.cle && !cleSansHook(x.cle)).length >= 2)', 'if (false)']],
    doitCasser: [/^SEULE regle \(2\)/] },
  { nom: 'E pay-with regle (1) retiree', edits: [['sauts-depuis-chemin.js', "if (/^0xb2/i.test(String(chemin[i].vers || '')) && estBlockDeRoute(chemin[i].vers))", 'if (false)']],
    doitCasser: [/^pay-with SEULE regle \(1\)/] },
  { nom: 'F pay-with regle (2) retiree', edits: [['sauts-depuis-chemin.js', 'if (sauts.filter((x) => !cleSansHook(x.cle)).length >= 2)', 'if (false)']],
    doitCasser: [/^pay-with SEULE regle \(2\)/] },
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
    ok(!rouges.some((id) => /^(R0|R1|R3|pay-with R1a)/.test(id)), 'mutant ' + M.nom + ' : R0/R1/R3 restent verts');
  }
} finally {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
}

console.log(nAssert + ' assertions, ' + ko + ' KO');
if (nAssert === 0) { console.log('⛔ aucune assertion executee'); process.exit(1); }
process.exit(ko ? 1 : 0);
