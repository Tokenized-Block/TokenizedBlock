/* test-frais-devise-mesuree.mjs — ON N ENCAISSE QUE CE QU ON PEUT REVENDRE.
 *
 * ⛔⛔ DEUX ERREURS OPPOSEES, ET IL FALLAIT SORTIR DES DEUX.
 *     1. TOUT REFUSER. `echange.js` fermait tout marche cote autrement qu en USDC — les treize
 *        actions Coinbase comprises — pendant que l ecran de Create promettait « buyers will need
 *        INTCc to trade your block ». Vrai sur la chaine, FAUX dans l app, affiche juste avant de
 *        demander 0,001 ETH. Mesure du 2026-09-25 : 8 des 13 actions ont un marche reel (prix
 *        lisible, liquidite au-dessus du seuil) — on fermait donc des echanges qui nous auraient
 *        payes en quelque chose de vendable.
 *     2. TOUT OUVRIR. Le frais atterrit DANS la devise du marche. L ouvrir en aveugle, c est se
 *        faire payer en jetons qu on ne peut pas revendre — et ca a DEJA coute : mesure d aout
 *        2026, sept detentions de a6cf verifiees, ZERO avec un marche, part reelle 0 $.
 *
 * ⇒ LA DEVISE DE FRAIS EST AUTORISEE PAR LA MESURE : l appelant passe l ensemble des devises dont
 *   il a LU le prix. Ensemble vide ou absent = comportement d avant, ETH ou USDC. Une devise qu on
 *   n a pas su mesurer n y entre jamais.
 *
 * ⛔ CE TEST EXECUTE LE PLANIFICATEUR REEL avec un RPC de laboratoire — il ne lit pas la source.
 *   C est un chemin d argent : une garde qui verifie qu une ligne existe n y suffit pas.
 *
 * ⛔ CE QU IL NE PROUVE PAS : que les jetons encaisses seront effectivement revendus, ni a quel
 *   prix. Il prouve qu on refuse d etre paye dans une devise dont le prix n a pas ete mesure.
 */
import { strict as assert } from 'node:assert';
import { planEchange, FRAIS_INTERFACE_BPS } from './echange.js';
import { FEE_WALLET, USDC_BASE } from './frais-creation.js';

let n = 0;
const cas = [];
const v = (nom, fn) => { cas.push([nom, fn]); };

/* une action Coinbase reelle : AAPLc, 8 decimales — adresse lue dans paires.js, jamais de memoire */
const { pairesProposees } = await import('./paires.js');
const AAPL = pairesProposees(8453).find((p) => p.symbole === 'AAPLc');
assert.ok(AAPL && AAPL.adr, 'AAPLc est introuvable dans le registre : ce test ne garde plus rien');
const BLOCK = '0xb20000000000000000000016d09cd53724fc0601';
const COMPTE = '0x1111111111111111111111111111111111111111';

/** Un marche deja lu, cote dans `devise` : on evite tout reseau pour la decouverte. */
const marcheEn = (devise) => ({
  etat: 'LUE', vie: 10, devise: 'AAPLc', via: 'v4',
  cle: { currency0: devise, currency1: BLOCK, fee: 3000, tickSpacing: 60, hooks: HOOK },
});
const HOOK = '0x5926abdAbf5D0006Ee960A8270f3e124e5a764cc';

/** RPC de laboratoire : un devis positif, et une simulation qui accepte. */
function rpcLabo() {
  return async (methode, params) => {
    if (methode === 'eth_call') {
      const to = String(params && params[0] && params[0].to || '').toLowerCase();
      /* le quoteur rend un montant non nul ; tout le reste rend un mot plein */
      return '0x' + (10n ** 8n).toString(16).padStart(64, '0');
    }
    if (methode === 'eth_getBalance') return '0x' + (10n ** 20n).toString(16);
    if (methode === 'eth_blockNumber') return '0x3160000';
    return '0x';
  };
}

v('⛔⛔ sans mesure, une action est REFUSEE — et le refus dit pourquoi', async () => {
  /* ⛔⛔ LE VERROU QUI PROTEGE LE REVENU. Sans ensemble, on ne doit pas encaisser en AAPLc. */
  const p = await planEchange({ rpc: rpcLabo(), chaine: 8453, jeton: BLOCK, compte: COMPTE,
    sens: 'ACHAT', montant: 10n ** 8n, marcheLu: marcheEn(AAPL.adr) });
  assert.equal(p.etat, 'REFUSE', 'un marche cote en action passe SANS mesure du prix de la devise');
  assert.match(String(p.pourquoi), /could not price|sellable|not a TokenizedBlock market/i,
    'le refus ne dit pas pourquoi : ' + p.pourquoi);
  /* ⛔ et surtout : plus de jargon interne sur l ecran de quelqu un qui voulait acheter */
  assert.doesNotMatch(String(p.pourquoi), /interface fee in an allowed asset/,
    'le refus montre de nouveau notre contrainte de frais comme si c etait la sienne');
});

v('⛔ un ensemble VIDE se comporte exactement comme avant', async () => {
  /* ⛔ Fail-closed par construction : l absence de mesure ne doit jamais elargir quoi que ce soit. */
  const p = await planEchange({ rpc: rpcLabo(), chaine: 8453, jeton: BLOCK, compte: COMPTE,
    sens: 'ACHAT', montant: 10n ** 8n, marcheLu: marcheEn(AAPL.adr), fraisDevisesOk: new Set() });
  assert.equal(p.etat, 'REFUSE', 'un ensemble vide autorise un encaissement non mesure');
});

v('⛔⛔ une devise MESUREE ouvre le marche, et le frais y est libelle', async () => {
  /* ⛔⛔ LE CAS CENTRAL : c est ce qui rend les 8 actions liquides reellement echangeables. */
  const p = await planEchange({ rpc: rpcLabo(), chaine: 8453, jeton: BLOCK, compte: COMPTE,
    sens: 'ACHAT', montant: 10n ** 8n, marcheLu: marcheEn(AAPL.adr),
    fraisDevisesOk: new Set([String(AAPL.adr).toLowerCase()]) });
  assert.notEqual(p.etat, 'REFUSE', 'une devise mesuree reste refusee : ' + p.pourquoi);
  assert.ok(p.resume, 'aucun resume rendu');
  assert.equal(p.resume.fraisDevise, 'pair',
    'le frais est de nouveau etiquete « USDC » en dur alors qu il est pris dans la devise du marche');
  assert.equal(String(p.resume.devise).toLowerCase(), String(AAPL.adr).toLowerCase(),
    'le resume ne nomme pas la devise reelle du marche');
  assert.equal(String(p.resume.beneficiaireFrais).toLowerCase(), FEE_WALLET.toLowerCase(),
    'le frais ne va plus au wallet de frais');
  assert.ok(p.resume.frais > 0n, 'le frais est nul : rien n est encaisse');
});

v('⛔ le taux ne bouge pas en ouvrant la porte', async () => {
  /* ⛔ Ouvrir un marche et changer le tarif au passage serait deux decisions dans un seul geste. */
  const p = await planEchange({ rpc: rpcLabo(), chaine: 8453, jeton: BLOCK, compte: COMPTE,
    sens: 'ACHAT', montant: 10n ** 8n, marcheLu: marcheEn(AAPL.adr),
    fraisDevisesOk: new Set([String(AAPL.adr).toLowerCase()]) });
  assert.equal(BigInt(p.resume.fraisBps), FRAIS_INTERFACE_BPS,
    'le taux du frais a change en meme temps que la devise : une decision a la fois');
  assert.equal(p.resume.frais, (10n ** 8n * FRAIS_INTERFACE_BPS) / 10000n,
    'le montant du frais ne suit plus 0,5 % du montant paye');
});

v('⛔⛔ l USDC reste autorise SANS aucun ensemble — on ne casse pas ce qui marchait', async () => {
  /* ⛔⛔ Le piege du jour ou l on ouvre : casser le cas qui fonctionnait deja. */
  const p = await planEchange({ rpc: rpcLabo(), chaine: 8453, jeton: BLOCK, compte: COMPTE,
    sens: 'ACHAT', montant: 10n ** 8n, marcheLu: marcheEn(USDC_BASE) });
  assert.notEqual(p.etat, 'REFUSE', 'un marche USDC est devenu refuse : regression : ' + p.pourquoi);
});

for (const [nom, fn] of cas) { await fn(); n++; }
assert.equal(n, 5, 'compte de cas inattendu : ' + n);
console.log('ok frais-devise-mesuree — ' + n + ' cas, planificateur REEL execute : une devise');
console.log('   mesuree ouvre le marche, une devise non mesuree reste refusee, l USDC intact.');
console.log('⚠️ NE PROUVE PAS que les jetons encaisses seront revendus, ni a quel prix : seulement');
console.log('   qu on refuse d etre paye dans une devise dont le prix n a pas ete mesure.');
