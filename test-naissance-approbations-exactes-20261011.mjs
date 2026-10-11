/* test-naissance-approbations-exactes-20261011.mjs - LA NAISSANCE AUSSI : « MONTANT EXACT PARTOUT » (Phil, 2026-10-11).
 * Avant : planLancement (lancer-pool.js, naissances de l app + plan MCP) demandait block -> Permit2 = MAX_UINT256 et Permit2 -> position
 *   manager = MAX_UINT160 sans expiration (MAX_UINT48), et jugeait « deja autorise » toute autorisation > 0 (meme 1 unite).
 * AFFIRME (planLancement EXECUTE, rpc simule) :
 *   - naissance ETH avant Create (sans apport, puis avec apport) : 2 etapes, block -> Permit2 = EXACTEMENT le plafond du mint cote block
 *     (blocksRequis + 2 %), Permit2 -> position manager = ce meme montant, expiration = maintenant + 1 h ;
 *   - block existant : autorisations nulles -> 2 etapes ; une autorisation NON NULLE MAIS INSUFFISANTE -> l etape est redemandee (l ancien
 *     `> 0n` la croyait suffisante : le mint aurait reverte apres la signature) ; Permit2 suffisant mais EXPIRE -> redemande ;
 *     les deux suffisants et valides -> 0 etape (PRET) ;
 *   - aucune constante illimitee dans le code de lancer-pool.js ; le texte rendu dit « exactly ».
 * NE PROUVE PAS : l execution (banc fork banc-naissance-7030-fork-20261003.mjs), ni un vrai wallet. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { planLancement, V4_ADRESSES, PERMIT2 as P2 } from './lancer-pool.js';
import { selecteur } from './pool.js';
import * as T from './tokenomics.js';
import * as F from './frais-creation.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const PERMIT2 = P2.toLowerCase(); /* copiee du depot (lancer-pool.js), jamais de memoire */
const JETON = '0xb200000000000000000000000000000000000abc'; /* adresse fictive de test */
const COMPTE = '0x00000000000000000000000000000000c0ffee77';
const MAINTENANT = 1800000000000; /* ms, fixe : l expiration attendue est 1 800 000 000 + 3600 */
const V = V4_ADRESSES[8453];
const mots = (data) => String(data).slice(10).match(/.{64}/g).map((w) => BigInt('0x' + w));
const sel = (s) => '0x' + selecteur(s);
const refuseTout = async () => { throw new Error('aucune lecture attendue avant le Create'); };

/* 1. naissance ETH AVANT Create, sans apport puis avec apport */
for (const [nom, quote] of [['sans apport', 0n], ['avec apport', F.CREATE_FEE_WEI_FLOOR]]) {
  const p = await planLancement({ rpc: refuseTout, chaine: 8453, jeton: JETON, compte: COMPTE, valorisationEth: 10, partPourMille: 999,
    hooks: T.HOOK_7030, quoteEthWei: quote, soldePresume: T.SUPPLY_FIXE, maintenant: MAINTENANT });
  vu(p.etat === 'APPROBATIONS' && p.etapes.length === 2, nom + ' : ' + p.etat + ' / ' + (p.pourquoi || p.etapes && p.etapes.length));
  /* le plafond du mint cote block (+2 %), borne au solde : le mint ne peut pas tirer plus que ce que le compte detient (sans apport,
   *   99,9 % du supply x 1,02 depasse le supply - mesure au premier passage rouge : 1 018 979 999... > 1e27) */
  const cap0 = (p.blocksRequis * 102n) / 100n, cap = cap0 < p.solde ? cap0 : p.solde;
  vu(cap >= p.blocksRequis, nom + ' : le montant approuve est sous ce que le mint tire');
  const [a, b] = p.etapes;
  vu(a.to.toLowerCase() === JETON && a.data.startsWith(sel('approve(address,uint256)')) && mots(a.data)[0] === BigInt(PERMIT2) && mots(a.data)[1] === cap,
    nom + ' : block -> Permit2 n est pas le plafond du mint (' + (a && mots(a.data)[1]) + ' au lieu de ' + cap + ')');
  const w = mots(b.data);
  vu(b.to.toLowerCase() === PERMIT2 && w[0] === BigInt(JETON) && w[1] === BigInt(V.posm) && w[2] === cap && w[3] === 1800000000n + 3600n,
    nom + ' : Permit2 -> position manager : ' + w.slice(2).join(' / '));
  vu(/exactly/.test(a.nom) && /exactly/.test(b.nom) && /position manager/.test(b.nom), nom + ' : les libelles ne disent pas « exactly » / le position manager');
  vu(/exactly/.test(String(p.approbations || '')) && !/unlimited|MAX_UINT/.test(String(p.approbations || '')), nom + ' : la carte dit encore « unlimited » : ' + p.approbations);
}

/* 2. block EXISTANT : les autorisations se LISENT et se comparent au plafond */
const fabriquerRpc = ({ allowanceP2, permit2Montant, permit2Expiration }) => async (methode, params) => {
  const o = params[0], d = String(o.data).toLowerCase(), to = String(o.to).toLowerCase();
  const mot = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
  if (to === JETON && d.startsWith(sel('totalSupply()'))) return mot(T.SUPPLY_FIXE);
  if (to === JETON && d.startsWith(sel('decimals()'))) return mot(18);
  if (to === JETON && d.startsWith(sel('balanceOf(address)'))) return mot(T.SUPPLY_FIXE);
  if (to === JETON && d.startsWith(sel('allowance(address,address)'))) return mot(allowanceP2);
  if (to === PERMIT2 && d.startsWith(sel('allowance(address,address,address)'))) return mot(permit2Montant) + mot(permit2Expiration).slice(2) + mot(0).slice(2);
  if (d.startsWith(sel('getSlot0(bytes32)'))) return '0x' + '0'.repeat(256);
  throw new Error('lecture inattendue ' + to + ' ' + d.slice(0, 10));
};
const planExistant = (lus) => planLancement({ rpc: fabriquerRpc(lus), chaine: 8453, jeton: JETON, compte: COMPTE, valorisationEth: 10, partPourMille: 999,
  hooks: T.HOOK_7030, maintenant: MAINTENANT });
const ref = await planExistant({ allowanceP2: 0n, permit2Montant: 0n, permit2Expiration: 0n });
vu(ref.etat === 'APPROBATIONS' && ref.etapes.length === 2, 'block existant sans autorisation : ' + ref.etat + ' / ' + (ref.pourquoi || ref.etapes.length));
const capE0 = (ref.blocksRequis * 102n) / 100n, capE = capE0 < ref.solde ? capE0 : ref.solde;
vu(mots(ref.etapes[0].data)[1] === capE && mots(ref.etapes[1].data)[2] === capE, 'block existant : les montants ne sont pas le plafond du mint');
const futur = 1800000000n + 600n, passe = 1800000000n - 1n;
const insuffisant = await planExistant({ allowanceP2: capE - 1n, permit2Montant: capE - 1n, permit2Expiration: futur });
vu(insuffisant.etapes.length === 2, 'ROUGE->VERT : une autorisation non nulle mais INSUFFISANTE passe pour suffisante (le mint reverterait apres signature)');
const expire = await planExistant({ allowanceP2: capE, permit2Montant: capE, permit2Expiration: passe });
vu(expire.etapes.length === 1 && expire.etapes[0].to.toLowerCase() === PERMIT2, 'Permit2 suffisant mais EXPIRE : ' + expire.etapes.length + ' etape(s)');
const assez = await planExistant({ allowanceP2: capE, permit2Montant: capE, permit2Expiration: futur });
vu(assez.etat === 'PRET' && assez.etapes.length === 0, 'autorisations suffisantes et valides : ' + assez.etat + ' / ' + assez.etapes.length);

/* 3. plus aucune constante illimitee dans le code (commentaires retires : ils citent l ancien defaut, expres) */
const src = readFileSync(new URL('./lancer-pool.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
vu(!/MAX_UINT256|MAX_UINT160|MAX_UINT48/.test(src) && /etapesPermit2Exactes\(/.test(src), 'lancer-pool.js construit encore une autorisation illimitee (ou ne passe pas par etapesPermit2Exactes)');
console.log('ok naissance-approbations-exactes - ' + n + ' assertions (planLancement execute) ; NE PROUVE PAS l execution (banc fork)');
