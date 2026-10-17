/* test-reste-pivot-annonce-20261017.mjs — LE FRANCHISSEMENT (block|OUSD -> USDC -> action) DIT, CHIFFRE, L USDC QUI RESTE AU COMPTE.
 *
 * LE DEFAUT (mesure sur fork, banc-reste-pivot-fork-20261017.mjs) : l appel 3 du lot (Aerodrome exactInput) depense le MINIMUM de la
 *   jambe 1 (tolerance 1 %), pas l USDC reellement recu : IB022 > AAPLc laissait 0,1296 $ d USDC au compte sur ~12,96 $, et ni le plan
 *   ni l ecran ne le disaient. Pas de correctif atomique : le routeur Aerodrome CL ne depense pas un solde qu il detient (banc, option a).
 * CE QUE CE TEST PROUVE (hors reseau) :
 *   - le resume porte `devisPivot`, `pivotAuMoins`, `restePivot = devis - minimum` et `resteAuCompte` (phrase en dollars pour l USDC) ;
 *   - l entree de la jambe 2 reste EXACTEMENT le minimum de la jambe 1 (aucun montant du lot ne change : l annonce ne touche pas l argent) ;
 *   - la phrase : arrondi au cent inferieur, « less than $0.01 », pas de dollars pour un pivot autre que l USDC, pas de chiffre sans devis ;
 *   - l ecran du franchissement (app.html, afficherFranchissement) affiche `resteAuCompte`.
 * ⛔ CE QU IL NE PROUVE PAS : l execution (le banc fork le fait, par les soldes), ni le rendu dans un vrai navigateur. */
import fs from 'node:fs';
import * as PF from './plan-franchissement.js';
/* espace de noms : sur le code d avant (sans la phrase), le test ROUGIT par ses assertions, pas par un import qui casse */
const { planFranchissement } = PF;
const phraseResteAuCompte = typeof PF.phraseResteAuCompte === 'function' ? PF.phraseResteAuCompte : () => '';
import { selecteur } from './keccak.js';
import { USDC_BASE } from './frais-creation.js';
import { ACTIONS_COINBASE } from './paires.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';

let ok = 0; const ko = [];
const t = (nom, cond) => { if (cond) ok += 1; else ko.push(nom); };
const bas = (a) => String(a || '').toLowerCase();
const USDC = bas(USDC_BASE);
const AAPLC = bas((ACTIONS_COINBASE.find((a) => a.symbole === 'AAPLc') || {}).adr);
const epingle = POOLS_ACTIONS_AERODROME.get(AAPLC);
const OUSD = '0xb2000000000000000000002feb517dfec7415344';
const NUL = '0x' + '0'.repeat(40);
const FEE = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
const mot = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
t('fixture : AAPLc est epinglee dans la table Aerodrome', !!epingle && /^0x[0-9a-f]{40}$/.test(bas(epingle.pool)));

/* rpc de laboratoire : getPool rend la pool epinglee, token0 = USDC, slot0 = prix 1:1 en unites brutes */
const SEL = { getPool: selecteur('getPool(address,address,int24)'), token0: selecteur('token0()'), slot0: selecteur('slot0()') };
const rpc = async (_m, p) => {
  const d = String(p[0].data || '');
  if (d.startsWith(SEL.getPool)) return '0x' + mot(epingle.pool);
  if (d.startsWith(SEL.token0)) return '0x' + mot(USDC);
  if (d.startsWith(SEL.slot0)) return '0x' + (79228162514264337593543950336n).toString(16).padStart(64, '0') + '0'.repeat(64 * 6);
  throw new Error('selecteur inattendu ' + d.slice(0, 10));
};
/* la jambe 1 : un plan v4 PRET dont le devis est 12,143900 USDC (le chiffre du fork UNIT > AAPLc) et le minimum a 1 % */
const DEVIS = 12143900n;
const jambe1 = (devis, tol = 100n) => async ({ entree, sortie, montant }) => ({
  etat: 'PRET',
  tx: { to: '0x6ff5693b99212da76ad316178a184ab56d299b43', data: '0x3593564c' + '00'.repeat(32), value: '0x0' },
  resume: { paye: BigInt(montant), recoitAuMoins: devis === null ? (DEVIS * (10000n - tol)) / 10000n : (devis * (10000n - tol)) / 10000n,
    quote: devis === null ? undefined : devis, frais: 0n, fraisBps: 0n, fraisParHook: false, entree, sortie },
});
const base = { rpc, chaine: 8453, compte: '0x' + '1'.repeat(40), devise: OUSD, block: AAPLC, montant: 12150000n, decimalesEntree: 6,
  beneficiaireFrais: FEE, fraisDevisesOk: new Set([OUSD]),
  chemin: [{ de: OUSD, vers: USDC, famille: 'uniswap-v4' }, { de: USDC, vers: AAPLC, famille: 'aerodrome' }],
  resoudreV4: async () => ({ etat: 'OK', cle: { currency0: USDC, currency1: OUSD, fee: 100, tickSpacing: 1, hooks: NUL }, zeroForOne: false, quote: DEVIS }) };

const p = await planFranchissement({ ...base, planJambe1: jambe1(DEVIS) });
t('plan PRET avec la jambe 1 injectee (' + p.etat + ' ' + (p.etape || '') + ' ' + (p.pourquoi || '') + ')', p.etat === 'PRET');
const r = (p && p.resume) || {};
const min = (DEVIS * 9900n) / 10000n;
t('resume.devisPivot = le devis de la jambe 1', r.devisPivot === DEVIS);
t('resume.pivotAuMoins = le minimum de la jambe 1', r.pivotAuMoins === min);
t('resume.restePivot = devis - minimum (' + r.restePivot + ')', r.restePivot === DEVIS - min && r.restePivot === 121439n);
t('resume.toleranceBpsJambe1 = 100', r.toleranceBpsJambe1 === 100n);
t('resume.resteAuCompte dit « About $0.12 stays as USDC in your wallet » (' + r.resteAuCompte + ')',
  typeof r.resteAuCompte === 'string' && r.resteAuCompte.startsWith('About $0.12 stays as USDC in your wallet') && /1% slippage margin/.test(r.resteAuCompte));
/* l annonce ne change AUCUN montant : l appel 2 approuve exactement le minimum, l appel 3 depense exactement le minimum */
const appro = p.appels && p.appels[1];
t('appel 2 : approve EXACT du minimum de la jambe 1 (jamais plus, jamais illimite)', !!appro && appro.to === USDC && BigInt('0x' + appro.data.slice(-64)) === min);
t('appel 3 : vers le routeur Aerodrome CL', !!p.appels && /^0x698cb2b6dd822994581fea6ea4fc755d1363a92f$/i.test(p.appels[2].to));
t('appel 3 : amountIn = le minimum de la jambe 1 (le reste ne peut pas etre depense par un calldata fige)',
  !!p.appels && p.appels[2].data.includes(min.toString(16).padStart(64, '0')));

/* sans devis lisible : la nature du reste est dite, sans chiffre invente */
const p2 = await planFranchissement({ ...base, planJambe1: jambe1(null) });
t('sans devis : plan PRET quand meme (rien ne change aux montants)', p2.etat === 'PRET');
t('sans devis : restePivot null, phrase sans dollars', p2.resume && p2.resume.restePivot === null && !/\$\d/.test(p2.resume.resteAuCompte) && /stay in your wallet/.test(p2.resume.resteAuCompte));

/* la phrase seule */
t('phrase : 9615 u USDC -> « less than $0.01 », jamais « $0.00 »',
  phraseResteAuCompte({ reste: 9615n, pivot: USDC }).startsWith('About less than $0.01 stays as USDC'));
t('phrase : 129634 u -> $0.13 (au cent le plus proche : 0,1296 $)', phraseResteAuCompte({ reste: 129634n, pivot: USDC }).startsWith('About $0.13 '));
t('phrase : 121439 u -> $0.12', phraseResteAuCompte({ reste: 121439n, pivot: USDC }).startsWith('About $0.12 '));
t('phrase : 10000 u -> $0.01 (la borne du « less than »)', phraseResteAuCompte({ reste: 10000n, pivot: USDC }).startsWith('About $0.01 '));
t('phrase : 2500000 u -> $2.50', phraseResteAuCompte({ reste: 2500000n, pivot: USDC }).startsWith('About $2.50 '));
t('phrase : reste nul -> rien n est attendu', /^Nothing is expected/.test(phraseResteAuCompte({ reste: 0n, pivot: USDC })));
t('phrase : pivot autre que USDC -> unites brutes et adresse, jamais de $',
  (() => { const s = phraseResteAuCompte({ reste: 5n, pivot: OUSD }); return !/\$/.test(s) && s.includes(OUSD) && /5 raw units/.test(s); })());
t('phrase : la tolerance est la vraie (50 bps -> 0.5%)', /0\.5% slippage margin/.test(phraseResteAuCompte({ reste: 129634n, pivot: USDC, toleranceBps: 50n })));

/* l ecran : afficherFranchissement affiche la phrase du plan */
const app = fs.readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const i0 = app.indexOf('function afficherFranchissement(');
const corps = i0 >= 0 ? app.slice(i0, app.indexOf("$('#peLignes').innerHTML", i0) + 2000) : '';
const lignes = corps.slice(corps.indexOf("$('#peLignes').innerHTML"), corps.indexOf(".join('')", corps.indexOf("$('#peLignes').innerHTML")));
t('app.html : afficherFranchissement existe', i0 >= 0);
t('app.html : la liste des lignes du franchissement porte r.resteAuCompte', /r\.resteAuCompte/.test(lignes));

console.log((ko.length ? 'KO ' + ko.length : 'OK') + ' — ' + ok + ' assertions');
for (const k of ko) console.log('  KO ' + k);
process.exit(ko.length ? 1 : 0);
