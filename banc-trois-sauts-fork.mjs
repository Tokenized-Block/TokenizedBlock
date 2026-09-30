/* banc-trois-sauts-fork.mjs — UN BLOCK COTE EN ACTION S ACHETE-T-IL EN ETH, EN UNE TRANSACTION,
 * AVEC NOS 0,1 % AU BOUT ?
 *
 * ⛔⛔ LE BUG QUE CE BANC ATTAQUE, ET IL DURE DEPUIS DES JOURS : un visiteur qui tient de l ETH ne
 *     peut pas acheter un block cote en action tokenisee (TE/MUc, LAPTOP/AAPLc, DGUY/AMZNc…).
 *     Le chemin bati va ETH -> USDC -> ACTION : DEUX sauts. Un block cote en action en demande
 *     TROIS : ETH -> USDC -> ACTION -> BLOCK. J avais MASQUE le bouton Buy sur ces marches — c est
 *     honnete, ce n est pas une solution.
 *
 * ⛔⛔ ET DEUX CHOSES QUE J AI CRUES ABSENTES ET QUI EXISTAIENT. Avant d ecrire une ligne de
 *     produit : `calldataExactInputCL` accepte deja N sauts (aucun plafond, chemin de 20 + 23N
 *     octets, chainage verifie) et `calldataExactInputAvecFrais` construit deja le multicall
 *     complet. Le trou n est donc PAS le calldata — c est la DECOUVERTE de la 3e jambe et le
 *     cablage. Ce banc prouve la route AVANT qu on cable quoi que ce soit.
 *
 * ⛔⛔⛔ TROIS CONDITIONS, PAS UNE. Un banc de fork de ce depot a deja rendu VERT sur une
 *      transaction de statut `0x0` : le rejeu « marchait » et la transaction avait echoue.
 *        1. le recu porte `status` = 0x1
 *        2. le solde de a6cf EN BLOCK augmente
 *        3. l augmentation vaut EXACTEMENT 10 bps de la sortie totale
 * ⛔ CONTROLE NEGATIF OBLIGATOIRE, ET IL PASSE EN PREMIER : la MEME route sans montage de frais
 *   doit laisser a6cf INCHANGE. Sans lui, n importe quelle derive de solde signerait un faux succes.
 * ⛔ LE BANC S ACCUSE D ABORD : le decodeur de revert est force sur un revert CONNU avant toute
 *   mesure. Une fonction qui ne tourne que dans le cas rare est cassee le jour ou on en a besoin.
 *
 * ⛔ RIEN N EST SIGNE SUR MAINNET. Tout se passe sur un fork local `base-anvil`, avec un compte
 *   USURPE par `anvil_impersonateAccount` : aucune cle privee n est touchee, aucun fonds reel ne
 *   bouge. ⛔ `anvil` standard ne suffit PAS — un B20 n a aucun bytecode et rend `OpcodeNotFound`.
 *
 * ⚠️ BORNE : un fork prouve que la MECANIQUE tient a l etat forke. Il ne prouve pas qu un visiteur
 *    passera, ni qu un wallet affichera ce qu on annonce, ni qu un centime soit encaisse. a6cf n a
 *    a ce jour recu AUCUN jeton d action.
 *
 * Usage : RPC_FORK=http://127.0.0.1:8547 node banc-trois-sauts-fork.mjs
 */
import { calldataExactInputAvecFrais, calldataExactInputCL, calldataApprove,
  ROUTEUR_AERODROME_CL, FACTORY_AERODROME_CL } from './calldata-aerodrome.js';
import { FEE_WALLET } from './frais-creation.js';
import { ESPACEMENTS_RETOMBEE } from './espacements-cl.js';
import { selecteur as selPrefixe } from './keccak.js';

const sel = (s) => selPrefixe(s).replace(/^0x/, '');

/* ⛔⛔ LE TAUX ATTENDU EST ECRIT ICI, PAS IMPORTE. Le calculer avec la constante qui construit le
 *     calldata rendrait ce banc D ACCORD avec n importe quelle derive : passer la constante a
 *     100 bps laisserait tout vert. Une assertion qui prend son attendu dans la chose qu elle
 *     mesure ne mesure rien. 10 bps = 0,1 %, decision de Phil du 2026-09-28. */
const BPS_DECIDES = 10n;

/* ⛔ L URL EST LUE ET IMPRIMEE. Une variable d environnement ignoree en silence fait croire que
 *   l instrument est dirige : quatre passages de ce depot ont tape le mauvais fork ainsi. */
const FORK = process.env.RPC_FORK || 'http://127.0.0.1:8545';

/* ⛔ Adresses : WETH et USDC recopiees de `paires.js`/`plan-eth-block.js`. Les deux dernieres sont
 *   RESOLUES par l API DexScreener le 2026-09-30, jamais completees de tete — completer la queue
 *   d une adresse tronquee a deja envoye une enquete entiere de ce depot sur une fausse piste. */
const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const MUc = '0xb200000000000000000000fd2f87532b90095211';
const TE = '0x3C573bdd88008c94F025e5023212f28e5F39744c';  /* le block le plus echange cote en action : 107 505 $/24 h */

/* Un compte de test USURPE — pas une baleine a trouver, pas une cle a manipuler. */
const ACHETEUR = '0x00000000000000000000000000000000000fa1ce';
const ENTREE = 10n ** 17n;              /* 0,1 WETH */
/* ⛔⛔⛔ CE BANC A RENDU « AUCUNE POOL VIVANTE » SUR MUc -> TE, ET C ETAIT MA FAUTE, PAS CELLE DE LA
 *      CHAINE. Je sondais `[1, 10, 50, 100, 200, 2000]` — une liste ecrite a la main — alors que
 *      cette pool vit a tickSpacing **80**, avec 107 505 $ de volume 24 h. « Aucune pool » etait un
 *      fait sur MA LISTE. C est exactement le bug que `espacements-cl.js` ferme, et le meme que
 *      `serveur-web.js` portait en production. Les espacements sont maintenant DEMANDES. */
const ESPACEMENTS = [...ESPACEMENTS_RETOMBEE];

let id = 0;
async function rpc(method, params, url = FORK) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(method + ' : ' + JSON.stringify(j.error));
  return j.result;
}
const mot32 = (a) => '0'.repeat(24) + String(a).replace(/^0x/, '').toLowerCase();
const nombre32 = (n) => BigInt(n).toString(16).padStart(64, '0');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const balanceOf = async (jeton, qui) => {
  const v = await rpc('eth_call', [{ to: jeton, data: '0x' + sel('balanceOf(address)') + mot32(qui) }, 'latest']);
  /* ⛔ `"0x"` N EST PAS UN ECHEC : c est un ZERO. `BigInt('0x')` leve. */
  return (!v || v === '0x') ? 0n : BigInt(v);
};

/* ── 0. le fork repond-il, et sur quel bloc ? ──────────────────────────────────────────────── */
let tete = null;
for (let i = 0; i < 40 && tete === null; i += 1) {
  try { tete = BigInt(await rpc('eth_blockNumber', [])); } catch (_) { await pause(500); }
}
if (tete === null) { console.log('⛔ le fork ne repond pas sur ' + FORK + ' — NON MESURE, je ne conclus rien'); process.exit(1); }
console.log('fork ' + FORK + ' au bloc ' + tete + (process.env.RPC_FORK ? '  (RPC_FORK lu)' : '  (defaut, RPC_FORK absent)'));

/* ⛔⛔ TEMOIN QUE LE FORK SAIT LIRE UN B20 : `anvil` standard rend `OpcodeNotFound` sur ces jetons.
 *     Sans ce controle, un rouge plus bas se lirait comme « la route ne marche pas » alors qu il
 *     voudrait dire « ce fork ne sait pas lire l actif ». */
const codeMUc = await rpc('eth_getCode', [MUc, 'latest']);
if (codeMUc !== '0xef') {
  console.log('⛔ ce fork rend `eth_getCode(MUc)` = ' + String(codeMUc).slice(0, 20)
    + ' au lieu de `0xef` : il ne sait pas lire un B20. Il faut `base-anvil`. NON MESURE.');
  process.exit(1);
}
console.log('temoin B20 : eth_getCode(MUc) == 0xef  -> ce fork sait lire les actions tokenisees');

/* ── 1. les TROIS jambes, par ALLER-RETOUR sur la factory ──────────────────────────────────── */
async function jambe(a, b, nom) {
  const trouvees = [];
  for (const ts of ESPACEMENTS) {
    let pool = null;
    try {
      const r = await rpc('eth_call', [{ to: FACTORY_AERODROME_CL,
        data: '0x28af8d0b' + mot32(a) + mot32(b) + nombre32(ts) }, 'latest']);
      pool = (!r || r === '0x') ? null : '0x' + r.slice(-40);
    } catch (_) { pool = null; }
    if (!pool || /^0x0+$/.test(pool)) continue;
    /* ⛔ ALLER-RETOUR : la pool doit confirmer le MEME tickSpacing. Sinon la factory a repondu pour
     *   autre chose et on graverait un chemin faux. */
    let tsPool = null; let liq = null;
    try {
      const t = await rpc('eth_call', [{ to: pool, data: '0xd0c93a7c' }, 'latest']);
      tsPool = (!t || t === '0x') ? null : Number(BigInt(t));
      const l = await rpc('eth_call', [{ to: pool, data: '0x1a686502' }, 'latest']);
      liq = (!l || l === '0x') ? null : BigInt(l);
    } catch (_) { /* on laisse null : « pas lu » n est pas « zero » */ }
    /* ⛔⛔ LIQUIDITE > 0 EXIGEE, ET CE N EST PAS DU CONFORT : sur USDC/PLTRc la pool ts=1 EXISTE et
     *     porte `liquidity = 0`. Prendre la premiere adresse non nulle aurait grave une pool MORTE,
     *     et le swap aurait reverte sans qu on sache pourquoi. */
    if (tsPool === ts && liq !== null && liq > 0n) trouvees.push({ ts, pool, liq });
  }
  trouvees.sort((x, y) => (y.liq > x.liq ? 1 : -1));
  const g = trouvees[0] || null;
  console.log('  ' + nom.padEnd(16) + (g ? 'ts=' + String(g.ts).padEnd(5) + g.pool + '  liquidity=' + g.liq
    : '⛔ AUCUNE POOL VIVANTE'));
  return g;
}
console.log('les trois jambes, par aller-retour sur la factory :');
const j1 = await jambe(WETH, USDC, 'WETH -> USDC');
const j2 = await jambe(USDC, MUc, 'USDC -> MUc');
const j3 = await jambe(MUc, TE, 'MUc  -> TE');
if (!j1 || !j2 || !j3) { console.log('⛔ une jambe manque : NON MESURE, aucune route a prouver'); process.exit(2); }

const SAUTS = [{ de: WETH, vers: USDC, tickSpacing: j1.ts },
  { de: USDC, vers: MUc, tickSpacing: j2.ts },
  { de: MUc, vers: TE, tickSpacing: j3.ts }];

/* ── 2. usurper l acheteur, le financer, fabriquer du WETH ─────────────────────────────────── */
await rpc('anvil_impersonateAccount', [ACHETEUR]);
await rpc('anvil_setBalance', [ACHETEUR, '0x' + (10n ** 19n).toString(16)]);

async function envoyer(to, data, quoi, value = undefined) {
  const tx = { from: ACHETEUR, to, data, gas: '0x' + (6_000_000).toString(16) };
  if (value !== undefined) tx.value = '0x' + BigInt(value).toString(16);
  const h = await rpc('eth_sendTransaction', [tx]);
  /* ⛔ LE RECU N EST PAS IMMEDIAT. Lire `.status` sur `null` ferait mourir le banc AVANT tout
   *   verdict — et un banc qui meurt ne rend pas ROUGE, il ne rend RIEN, ce qui est pire. */
  let recu = null;
  for (let i = 0; i < 60 && recu === null; i += 1) { recu = await rpc('eth_getTransactionReceipt', [h]); if (recu === null) await pause(250); }
  if (recu === null) { console.log('  ' + quoi + ' : AUCUN RECU apres 15 s — NON MESURE'); return { status: null }; }
  console.log('  ' + quoi + ' : status ' + recu.status + (recu.status === '0x1' ? '' : '  <== ECHEC ON-CHAIN'));
  if (recu.status !== '0x1') console.log('     cause -> ' + (await causeDuRevert(to, data, recu, value)));
  return recu;
}

/* ⛔ REJEU AU BLOC PRECEDENT — le meme etat que la transaction a vu. Rejouer a `latest` mesurerait
 *   un etat que la transaction n a jamais connu. */
async function causeDuRevert(to, data, recu, value) {
  const bloc = recu && recu.blockNumber ? '0x' + (BigInt(recu.blockNumber) - 1n).toString(16) : 'latest';
  let brut = null;
  const appel = { from: ACHETEUR, to, data, gas: '0x' + (6_000_000).toString(16) };
  if (value !== undefined) appel.value = '0x' + BigInt(value).toString(16);
  try { brut = await rpc('eth_call', [appel, bloc]); } catch (e) { brut = (e && e.message) || String(e); }
  if (typeof brut !== 'string') return 'reponse illisible au bloc ' + bloc;
  const m = /0x08c379a0[0-9a-fA-F]*/.exec(brut);
  if (m) {
    const corps = m[0].slice(10);
    try {
      const lg = Number(BigInt('0x' + corps.slice(64, 128)));
      const txt = corps.slice(128, 128 + lg * 2).replace(/../g, (h) => String.fromCharCode(parseInt(h, 16)));
      if (txt) return 'Error(string) « ' + txt + ' » (bloc ' + bloc + ')';
    } catch (_) { /* on rend le brut */ }
  }
  return String(brut).slice(0, 260) + ' (bloc ' + bloc + ')';
}

/* ── 2 bis. LE BANC S ACCUSE D ABORD ───────────────────────────────────────────────────────────
 * ⛔⛔ `causeDuRevert` ne tourne QUE sur un echec. Une fonction qui ne s execute que dans le cas
 *     rare peut etre cassee des mois sans que personne le voie — et elle sera cassee precisement le
 *     jour ou on en a besoin. On la force sur un revert CONNU : transferer du WETH qu on n a pas. */
console.log('le banc s accuse d abord — revert provoque, le decodeur doit le NOMMER :');
const faux = await envoyer(WETH, '0x' + sel('transfer(address,uint256)') + mot32(FEE_WALLET) + nombre32(10n ** 24n), 'transfert impossible');
let decodeurSait = false;
if (faux.status === '0x0') {
  const cause = await causeDuRevert(WETH, '0x' + sel('transfer(address,uint256)') + mot32(FEE_WALLET) + nombre32(10n ** 24n), faux);
  decodeurSait = /Error\(string\)|revert/i.test(cause);
  console.log('     ' + (decodeurSait ? '✓ le decodeur nomme la cause' : '⚠️ le decodeur NE sait pas nommer ce revert')
    + ' -> ' + String(cause).slice(0, 120));
} else console.log('     ⚠️ le revert attendu n a pas eu lieu (status ' + faux.status + ') : ce controle n a rien prouve');
if (!decodeurSait) console.log('     ⚠️ TOUT ROUGE PLUS BAS DEVRA SE LIRE « cause inconnue », pas « pas de cause ».');

/* fabriquer du WETH : deposit() avec de la valeur */
await envoyer(WETH, '0x' + sel('deposit()'), 'WETH deposit 1 ETH', 10n ** 18n);
const wethDispo = await balanceOf(WETH, ACHETEUR);
console.log('  WETH de l acheteur : ' + wethDispo);
if (wethDispo < ENTREE * 2n) { console.log('⛔ pas assez de WETH pour deux passages — NON MESURE'); process.exit(2); }

const ap = calldataApprove({ token: WETH, montant: (1n << 255n).toString(), beneficiaire: ROUTEUR_AERODROME_CL });
if (ap.etat !== 'PRET') { console.log('⛔ approve refuse : ' + ap.pourquoi); process.exit(2); }
await envoyer(ap.to, ap.data, 'approve WETH -> routeur');

const maintenant = BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp);
const echeance = maintenant + 600n;

/* ── 3. CONTROLE NEGATIF D ABORD : la meme route SANS frais ────────────────────────────────── */
console.log('');
console.log('CONTROLE NEGATIF — meme route a 3 sauts, SANS montage de frais :');
const a6cfAvantTemoin = await balanceOf(TE, FEE_WALLET);
const sansFrais = calldataExactInputCL({ sauts: SAUTS, recipient: ACHETEUR, amountIn: ENTREE,
  amountOutMinimum: 1n, deadline: echeance, maintenant });
if (sansFrais.etat !== 'PRET') { console.log('⛔ le module refuse la route nue : ' + sansFrais.pourquoi); process.exit(2); }
console.log('  chemin : ' + sansFrais.champs.cheminOctets + ' octets · ' + sansFrais.champs.sauts + ' sauts');
const acheteurAvantTemoin = await balanceOf(TE, ACHETEUR);
const rTemoin = await envoyer(sansFrais.to, sansFrais.data, 'exactInput 3 sauts, nu');
const sortieNue = (await balanceOf(TE, ACHETEUR)) - acheteurAvantTemoin;
console.log('  sortie observee sur la route nue : ' + sortieNue + ' unites de TE');
const a6cfApresTemoin = await balanceOf(TE, FEE_WALLET);
const temoinInchange = a6cfApresTemoin === a6cfAvantTemoin;
console.log('  a6cf en TE : ' + a6cfAvantTemoin + ' -> ' + a6cfApresTemoin
  + (temoinInchange ? '  ✓ INCHANGE (comme il doit)' : '  ⛔ A BOUGE SANS MONTAGE DE FRAIS : toute mesure plus bas est nulle'));

/* ── 4. LA MESURE : la meme route AVEC le montage de frais ─────────────────────────────────── */
console.log('');
console.log('LA MESURE — meme route a 3 sauts, AVEC `multicall([exactInput(routeur), sweepTokenWithFee])` :');
const a6cfAvant = await balanceOf(TE, FEE_WALLET);
const acheteurAvant = await balanceOf(TE, ACHETEUR);
/* ⛔⛔ LE MINIMUM VIENT DE LA SORTIE OBSERVEE, PAS D UN CHIFFRE DE CONFORT. Mon premier passage
 *     passait `1n` et le module a REFUSE — a juste titre : apres notre coupe de 10 bps, un minimum
 *     de 1 unite tombe a zero, et un minimum nul laisse la derniere pool rendre presque rien pour
 *     la totalite de l entree. Le refus du module etait le bon comportement, pas un obstacle.
 *   ⛔ 90 % de la sortie nue : assez serre pour etre un vrai minimum, assez large pour absorber le
 *     deplacement de prix du second passage sur les MEMES pools (le premier swap les a bougees). */
if (sortieNue <= 0n) { console.log('⛔ la route nue n a rien rendu : NON MESURE, rien a mesurer avec frais'); process.exit(2); }
const minimumReel = sortieNue * 90n / 100n;
console.log('  minimum exige : ' + minimumReel + '  (90 % de la sortie nue observee)');
const avecFrais = calldataExactInputAvecFrais({ sauts: SAUTS, recipient: ACHETEUR, amountIn: ENTREE,
  amountOutMinimum: minimumReel, deadline: echeance, maintenant, fraisBps: BPS_DECIDES, beneficiaireFrais: FEE_WALLET });
if (avecFrais.etat !== 'PRET') { console.log('⛔ le module refuse le montage a frais : ' + avecFrais.pourquoi); process.exit(2); }
const recu = await envoyer(avecFrais.to, avecFrais.data, 'multicall 3 sauts + frais');
const a6cfApres = await balanceOf(TE, FEE_WALLET);
const acheteurApres = await balanceOf(TE, ACHETEUR);
const partA6cf = a6cfApres - a6cfAvant;
const partAcheteur = acheteurApres - acheteurAvant;
const sortieTotale = partA6cf + partAcheteur;
const attendu = sortieTotale * BPS_DECIDES / 10000n;

console.log('  sortie totale du swap : ' + sortieTotale + ' unites de TE');
console.log('  part acheteur         : ' + partAcheteur);
console.log('  part a6cf             : ' + partA6cf + '   (attendu ' + attendu + ' = ' + BPS_DECIDES + ' bps)');

/* ── 5. LE VERDICT, LES TROIS CONDITIONS SEPAREES ──────────────────────────────────────────── */
console.log('');
console.log('═'.repeat(94));
const c0 = temoinInchange;
const c1 = recu.status === '0x1';
const c2 = partA6cf > 0n;
const c3 = sortieTotale > 0n && partA6cf === attendu;
const dire = (b, t) => console.log((b ? '✓ ' : '✗ ') + t);
dire(c0, 'CONTROLE NEGATIF : a6cf inchange sur la route nue');
dire(c1, 'CONDITION 1 : le recu porte status 0x1');
dire(c2, 'CONDITION 2 : le solde de a6cf EN BLOCK augmente');
dire(c3, 'CONDITION 3 : l augmentation vaut EXACTEMENT ' + BPS_DECIDES + ' bps de la sortie totale');
const tout = c0 && c1 && c2 && c3;
console.log('═'.repeat(94));
console.log(tout
  ? '⭐ LA ROUTE A TROIS SAUTS TIENT, ET LE FRAIS ARRIVE — sur un fork, a cet etat.'
  : '⛔ LA ROUTE N EST PAS PROUVEE. Rien ne doit etre cable sur cette base.');
console.log('⚠️ CE QUE CE BANC NE PROUVE PAS : qu un visiteur passe, qu un wallet affiche ce qu on');
console.log('   annonce, ni qu un centime soit encaisse. a6cf n a a ce jour recu AUCUN jeton d action');
console.log('   sur mainnet. Un fork prouve la MECANIQUE, pas le revenu.');
process.exit(tout ? 0 : 1);
