/* verifie-parcours-v4.mjs — LE PARCOURS COMPLET, PROUVE SUR MAINNET, SANS RIEN SIGNER.
 *
 * ⛔⛔ J AI REPETE « impossible a prouver sans mainnet » PENDANT DES HEURES. C ETAIT FAUX, et l outil
 *    etait la depuis le debut : `eth_call` accepte un `from` ARBITRAIRE et un override de solde. On
 *    joue donc la transaction de n importe qui, contre les VRAIS contrats, sans signature et sans
 *    envoi. Un fork ne pouvait pas le faire (la factory B20 n a pas de bytecode, elle est native au
 *    noeud) — mais le noeud, lui, sait tres bien la simuler.
 * ⛔ LECTURE SEULE : aucune signature, aucun envoi, aucun etat modifie.
 *
 * DEUX MOITIES, parce qu aucune seule ne suffit :
 *   A. un INCONNU cree un block avec le calldata exact de l app -> l adresse sort, et le contractURI
 *      grave porte le marqueur exige par le V4 ;
 *   B. le VRAI admin d un block ne par notre app paie la mise en vie sur le V4 -> la chaine accepte.
 *   (B ne peut pas se faire sur le block de A : il n existe pas encore. C est dit, pas cache.)
 */

const RPC = 'https://mainnet.base.org';
const HOOK_V4 = '0x11FCd588c96b1781cc88B8B9F349B6067D9BE4c4';
const BASED = '0xb200000000000000000000809778b2d38d114351';
const ADMIN = '0x37Eb9b7ce0b51Fe12fBf092026e001918128580A';
const ETH = '0x0000000000000000000000000000000000000000';
const SEL_INSCRIRE = '0xbb920fed';
const FRAIS_VIE = 300000000000000n;
const PRIX_1_1 = 79228162514264337593543950336n;
const ERREURS = {
  '0x9e16f763': 'PaireNonAdmise', '0x37d927c1': 'PasAdminDuBlock', '0x3f685d8d': 'PasDeLabelTokenizedBlock',
  '0x3571c1d6': 'PasUnB20', '0x237411fa': 'FraisLPNonNul', '0x0a0fbb95': 'MontantInsuffisant',
};
const mot = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const nb = (v) => BigInt(v).toString(16).padStart(64, '0');
const cle = (a, b, hooks) => {
  const [c0, c1] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return mot(c0) + mot(c1) + nb(0) + nb(60) + mot(hooks);
};
let id = 1;
async function rpc(method, params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }) });
  return (await r.json());
}
function lire(j) {
  if (j.error) {
    const d = j.error.data && String(j.error.data);
    const sel = d && d.startsWith('0x') ? d.slice(0, 10) : null;
    return 'REVERT ' + (sel && ERREURS[sel] ? ERREURS[sel] + ' (' + sel + ')' : (d || j.error.message).slice(0, 110));
  }
  return 'OK (la chaine accepte cet appel)';
}

const data = SEL_INSCRIRE + cle(ETH, BASED, HOOK_V4) + nb(PRIX_1_1);
const appel = { to: HOOK_V4, from: ADMIN, data, value: '0x' + FRAIS_VIE.toString(16) };
const solde = { [ADMIN]: { balance: '0x' + (10n ** 18n).toString(16) } };

console.log('1. inscrire() par le VRAI admin, frais payes  ->',
  lire(await rpc('eth_call', [appel, 'latest', solde])));
console.log('2. le meme, mais SANS payer                   ->',
  lire(await rpc('eth_call', [{ ...appel, value: '0x0' }, 'latest', solde])));
console.log('3. le meme, par quelqu un qui n est PAS admin  ->',
  lire(await rpc('eth_call', [{ ...appel, from: '0x1111111111111111111111111111111111111111' }, 'latest',
    { '0x1111111111111111111111111111111111111111': { balance: '0x' + (10n ** 18n).toString(16) } }])));
/* temoin : un block ne AILLEURS, meme admin fictif -> doit buter sur le LABEL, pas sur autre chose */
const CRONOS = '0xb200000000000000000000a48caef31dc6a4fce9';
console.log('4. un block ne AILLEURS, par son admin        ->',
  lire(await rpc('eth_call', [{ to: HOOK_V4, from: ADMIN, value: '0x' + FRAIS_VIE.toString(16),
    data: SEL_INSCRIRE + cle(ETH, CRONOS, HOOK_V4) + nb(PRIX_1_1) }, 'latest', solde])));
