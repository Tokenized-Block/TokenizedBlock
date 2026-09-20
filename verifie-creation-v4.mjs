/* essai-create-v4.mjs — LE PARCOURS COMPLET D UN INCONNU, simule sur mainnet, sans rien signer.
 *
 * ⛔ Je repetais « impossible a prouver sans mainnet ». FAUX : `eth_call` accepte un `from` arbitraire
 *    et un override de solde. On joue donc la creation d un visiteur qui n a jamais rien fait, avec
 *    EXACTEMENT le calldata que l app construit — puis sa mise en vie sur le V4.
 * ⛔ LECTURE SEULE : aucune signature, aucun envoi, aucun etat modifie.
 */
const A = 'file:///D:/Users/VolKov/veilleIA/tblock-app/';
const { paramsAsset, encodeUpdateContractURI, encodeUpdateSupplyCap, encodeBatchMint, encodeCreateB20 } = await import(A + 'encodeur.js');
const { SUPPLY_FIXE, DECIMALES_FIXES, repartitionFrappe } = await import(A + 'tokenomics.js');

const RPC = 'https://mainnet.base.org';
const FACTORY = '0xb20f000000000000000000000000000000000000';
const HOOK_V4 = '0x11FCd588c96b1781cc88B8B9F349B6067D9BE4c4';
const ETH = '0x0000000000000000000000000000000000000000';
const INCONNU = '0x5555555555555555555555555555555555555555'; /* un visiteur qui n a jamais rien fait */
const SEL_INSCRIRE = '0xbb920fed';
const FRAIS_VIE = 300000000000000n;
const PRIX_1_1 = 79228162514264337593543950336n;
const SOLDE = { [INCONNU]: { balance: '0x' + (10n ** 18n).toString(16) } };

let id = 1;
const appel = async (params) => {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: id++, method: 'eth_call', params }) });
  return r.json();
};
const dire = (j) => j.error
  ? 'REVERT ' + String(j.error.data || j.error.message).slice(0, 90)
  : 'OK';

/* ── 1. LA CREATION, avec les metadonnees que l app grave vraiment ─────────────────────────────── */
const face = { teinte: 210, accent: 40, saturation: 60, division: 3, eclats: 4, ecart: 2,
  orbite: 'sillage', facette: 'anneau', matiere: 'verre', ornement: 'points' };
const meta = { name: 'First Timer', symbol: 'FIRST', supply: SUPPLY_FIXE.toString(), sealed: true,
  face, flyBrain: true, image: 'https://tokenizedblock.space/face/x.png', pair: null };
const uri = 'data:application/json,' + encodeURIComponent(JSON.stringify(meta));
const rep = repartitionFrappe(SUPPLY_FIXE, INCONNU);
const data = '0x' + encodeCreateB20({ variant: 0, saltTexte: 'inconnu-' + Date.now(),
  params: paramsAsset({ nom: meta.name, symbole: meta.symbol, admin: INCONNU, decimales: DECIMALES_FIXES }),
  initCalls: [encodeUpdateContractURI(uri), encodeUpdateSupplyCap(SUPPLY_FIXE), encodeBatchMint(rep.destinataires, rep.montants)] }).replace(/^0x/, '');

const jc = await appel([{ to: FACTORY, from: INCONNU, data }, 'latest', SOLDE]);
const jeton = jc.result && jc.result !== '0x' ? '0x' + jc.result.slice(-40) : null;
console.log('1. CREATE simule par un inconnu ->', dire(jc), jeton ? '· block prevu ' + jeton : '');
if (!jeton) { console.log('⛔ pas d adresse rendue — on s arrete'); process.exit(1); }
console.log('   le contractURI grave porte le marqueur :', uri.includes('%22face%22%3A%7B'));

/* ── 2. LA MISE EN VIE sur le V4 — le block n existe PAS encore, donc on attend un refus NOMME ──── */
const mot = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const nb = (v) => BigInt(v).toString(16).padStart(64, '0');
const [c0, c1] = ETH.toLowerCase() < jeton.toLowerCase() ? [ETH, jeton] : [jeton, ETH];
const di = SEL_INSCRIRE + mot(c0) + mot(c1) + nb(0) + nb(60) + mot(HOOK_V4) + nb(PRIX_1_1);
const ji = await appel([{ to: HOOK_V4, from: INCONNU, data: di, value: '0x' + FRAIS_VIE.toString(16) }, 'latest', SOLDE]);
console.log('2. INSCRIRE sur un block pas encore cree ->', dire(ji));
console.log('   ⚠️ un refus ici est ATTENDU : le block n existe pas encore sur la chaine. Ce que ce test');
console.log('      prouve, c est que la CREATION passe et que son adresse est calculable. La mise en vie,');
console.log('      elle, est prouvee separement sur un block REEL (essai-inscrire-v4.mjs).');
