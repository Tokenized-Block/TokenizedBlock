/* banc-skins-validation-fork-20261011.mjs - « LES DEUX COCHENT », EXECUTE SUR UN FORK contre le contrat BlockSkins v2 DEPLOYE.
 * Phil (2026-10-04, spec) : « si les deux parties cochent valide, l echange est execute automatiquement par les agents » ; 2026-10-11 :
 *   « fini le Skinbrain market ». Le contrat l a (validateBuy / executeValidated / revokeBuy) ; ce banc prouve que les appels de
 *   blockskins.js (appelValiderAchat, appelExecuterValide, appelRevoquerAchat, appelAnnonce/decoderAnnonce, appelValidation/
 *   decoderValidation, validationCourante, SUJET_ACHAT_VALIDE/acheteursValides) font ce qu ils disent, a l adresse REELLE.
 * DEROULE : un vendeur minte (1 USDC), met en vente a prix fixe ; l acheteur VALIDE ; un TIERS (l agent) EXECUTE -> la skin est a
 *   l acheteur, le vendeur recoit 90 %, le wallet des frais 10 %, le tiers ne recoit RIEN (il paie son gaz). En ETH puis en USDC.
 *   Puis : une validation revoquee credite l ETH tenu ; une annonce retiree puis remise rend l ancienne validation caduque (ListingChanged).
 * ⛔ BORNES : un fork (base-anvil), comptes impersonnes, aucune cle ; evm_snapshot / evm_revert. Ne prouve PAS l ecran. */
import * as S from './blockskins.js';
import { USDC_BASE, FEE_WALLET } from './frais-creation.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';

const URL_FORK = process.env.FORK || 'http://127.0.0.1:8566';
let n = 0, ko = 0, id = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const rpc = async (method, params) => { const r = await (await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) })).json(); if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; } return r.result; };
const USDC = USDC_BASE.toLowerCase(), FRAIS = FEE_WALLET.toLowerCase(), C = S.BLOCKSKINS;
const motA = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const bal = async (j, q) => (j === S.ETH ? BigInt(await rpc('eth_getBalance', [q, 'latest'])) : BigInt(await rpc('eth_call', [{ to: j, data: '0x70a08231' + motA(q) }, 'latest'])));
async function envoyer(de, tx) {
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data, value: tx.value || '0x0', gas: '0x' + (1500000).toString(16) }]);
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('no receipt');
}
const proprietaire = async (t) => '0x' + String(await rpc('eth_call', [{ to: C, data: '0x6352211e' + BigInt(t).toString(16).padStart(64, '0') }, 'latest'])).slice(-40);
const recette = { id: 'random', angle: 10, h: [20, 30, 40], cube: 50, noyau: 60, fond: 70 };

const chaine = parseInt(await rpc('eth_chainId', []), 16), tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · bloc ' + tete + ' · BlockSkins ' + C);
if (!ok(chaine === 8453, 'le fork est Base')) process.exit(1);
ok(String(await rpc('eth_getCode', [C, 'latest'])).length > 1000, 'le contrat BlockSkins v2 est bien la (code lu a l adresse du depot)');
const snap = await rpc('evm_snapshot', []);
try {
  const vendeur = '0x' + 'a1'.repeat(20), acheteur = '0x' + 'b2'.repeat(20), agent = '0x' + 'c3'.repeat(20);
  const BLOCK = '0x' + 'b2' + '0'.repeat(30) + 'e4b0c5fbe9'.slice(0, 8); /* une adresse de block quelconque : le mint la NOMME, il ne la lit pas */
  const source = [...POOLS_ACTIONS_AERODROME.values()][0].pool;
  for (const q of [vendeur, acheteur, agent, source]) { await rpc('anvil_impersonateAccount', [q]); await rpc('anvil_setBalance', [q, '0x' + (10n ** 19n).toString(16)]); }
  for (const q of [vendeur, acheteur]) ok((await envoyer(source, { to: USDC, data: '0xa9059cbb' + motA(q) + (100n * 10n ** 6n).toString(16).padStart(64, '0') })).status === '0x1', 'USDC donnes a ' + q.slice(0, 6));
  const minter = async () => {
    ok((await envoyer(vendeur, S.appelApprouver(USDC, S.SKIN_MINT_USDC))).status === '0x1', 'approbation exacte de 1 USDC pour le mint');
    const r = await envoyer(vendeur, S.appelMint(BLOCK, recette));
    ok(r.status === '0x1', 'mint (1 USDC)');
    ok(S.verifierValidation({ recu: r }).etat === 'REFUSE', 'temoin : le recu d un MINT n est pas une validation (REFUSE)');
    return BigInt(await rpc('eth_call', [{ to: C, data: '0x18160ddd' }, 'latest']));
  };
  for (const [nom, devise, prix] of [['ETH', S.ETH, 10n ** 15n], ['USDC', USDC, 5n * 10n ** 6n]]) {
    console.log('— ' + nom);
    const t = await minter();
    ok((await envoyer(vendeur, S.appelMettreEnVente(t, devise, prix))).status === '0x1', nom + ' : mise en vente a prix fixe');
    const annonce = S.decoderAnnonce(await rpc('eth_call', [{ to: C, data: S.appelAnnonce(t) }, 'latest']));
    ok(annonce.vendeur === vendeur && annonce.devise === devise && annonce.prix === prix && annonce.debut === 0n && annonce.id > 0n, nom + ' : listingOf decode (vendeur, devise, prix, prix fixe, id ' + annonce.id + ')');
    if (devise !== S.ETH) ok((await envoyer(acheteur, S.appelApprouver(devise, prix))).status === '0x1', nom + ' : l acheteur approuve EXACTEMENT le prix');
    const rv = await envoyer(acheteur, S.appelValiderAchat(t, devise, prix));
    ok(rv.status === '0x1', nom + ' : validateBuy (la validation de l acheteur)');
    ok(rv.logs.some((l) => String(l.topics[0]).toLowerCase() === S.SUJET_ACHAT_VALIDE.toLowerCase()), nom + ' : le journal BuyValidated porte le sujet de SUJET_ACHAT_VALIDE');
    ok(S.acheteursValides(rv.logs, t).includes(acheteur), nom + ' : acheteursValides retrouve l acheteur dans les journaux');
    /* l INDEX SERVEUR (POST /api/skins/validation) verifie ce RECU-la : la skin, l acheteur, la devise, le prix - lus du journal du contrat */
    const vv = S.verifierValidation({ recu: rv });
    ok(vv.ok && vv.validations.length === 1 && vv.validations[0].tokenId === String(t) && vv.validations[0].acheteur === acheteur
      && vv.validations[0].devise === devise && vv.validations[0].prix === String(prix), nom + ' : verifierValidation sur le VRAI recu -> ' + JSON.stringify(vv.validations && vv.validations[0]));
    const recuMint = await rpc('eth_getTransactionReceipt', [String(rv.transactionHash)]);
    ok(S.verifierValidation({ recu: recuMint }).ok, nom + ' : le meme recu relu par eth_getTransactionReceipt (le chemin du serveur) est verifie');
    const v = S.decoderValidation(await rpc('eth_call', [{ to: C, data: S.appelValidation(t, acheteur) }, 'latest']));
    ok(S.validationCourante(v, annonce) && v.ethTenu === (devise === S.ETH ? prix : 0n), nom + ' : validated() vaut pour CETTE annonce ; ETH tenu = ' + v.ethTenu);
    const av = { v: await bal(devise, vendeur), f: await bal(devise, FRAIS), a: await bal(devise, agent), b: await bal(devise, acheteur) };
    const re = await envoyer(agent, S.appelExecuterValide(t, acheteur));
    ok(re.status === '0x1', nom + ' : executeValidated par un TIERS (l agent)');
    const ap = { v: await bal(devise, vendeur), f: await bal(devise, FRAIS), a: await bal(devise, agent), b: await bal(devise, acheteur) };
    const { frais, vendeur: partV } = S.partage(prix);
    ok(await proprietaire(t) === acheteur, nom + ' : la skin est a l acheteur');
    ok(ap.v - av.v === partV, nom + ' : le vendeur recoit 90 % (' + (ap.v - av.v) + ' = ' + partV + ')');
    ok(ap.f - av.f === frais, nom + ' : le wallet des frais recoit 10 % (' + (ap.f - av.f) + ' = ' + frais + ')');
    if (devise !== S.ETH) ok(av.b - ap.b === prix && ap.a === av.a, nom + ' : l acheteur paie le prix a l execution ; l agent ne recoit rien');
    else ok(ap.a <= av.a, nom + ' : l agent ne recoit rien (il paie son gaz)');
  }
  console.log('— revocation et annonce remise');
  const t = await minter();
  await envoyer(vendeur, S.appelMettreEnVente(t, S.ETH, 10n ** 15n));
  await envoyer(acheteur, S.appelValiderAchat(t, S.ETH, 10n ** 15n));
  const credAv = BigInt(await rpc('eth_call', [{ to: C, data: S.appelCredit(S.ETH, acheteur) }, 'latest']));
  ok((await envoyer(acheteur, S.appelRevoquerAchat(t))).status === '0x1', 'revokeBuy');
  const credAp = BigInt(await rpc('eth_call', [{ to: C, data: S.appelCredit(S.ETH, acheteur) }, 'latest']));
  ok(credAp - credAv === 10n ** 15n, 'l ETH tenu est CREDITE a l acheteur (pending +' + (credAp - credAv) + ')');
  const v0 = S.decoderValidation(await rpc('eth_call', [{ to: C, data: S.appelValidation(t, acheteur) }, 'latest']));
  ok(v0.annonce === 0n, 'apres revocation : plus de validation');
  await envoyer(acheteur, S.appelValiderAchat(t, S.ETH, 10n ** 15n));
  await envoyer(vendeur, S.appelRetirer(t));
  await envoyer(vendeur, S.appelMettreEnVente(t, S.ETH, 10n ** 15n));
  const a2 = S.decoderAnnonce(await rpc('eth_call', [{ to: C, data: S.appelAnnonce(t) }, 'latest']));
  const v2 = S.decoderValidation(await rpc('eth_call', [{ to: C, data: S.appelValidation(t, acheteur) }, 'latest']));
  ok(!S.validationCourante(v2, a2), 'annonce retiree puis remise : l ancienne validation n est PLUS courante (id ' + v2.annonce + ' != ' + a2.id + ')');
  const rx = await envoyer(agent, S.appelExecuterValide(t, acheteur));
  ok(rx.status === '0x0', '... et le contrat refuse de l executer (status ' + rx.status + ')');
} catch (e) {
  ok(false, 'le banc a leve : ' + String((e && e.message) || e).slice(0, 200));
} finally {
  await rpc('evm_revert', [snap]);
}
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) — fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);
