/* devises-admises.mjs — EN QUOI UN BLOCK PEUT-IL ETRE LIBELLE, SUR LA CHAINE TELLE QU ELLE EST ?
 *
 *   node devises-admises.mjs            le hook V8 (celui que l app propose)
 *   node devises-admises.mjs 0x...      un autre hook
 *
 * ⛔ POURQUOI CE FICHIER EXISTE (2026-09-21). On s appretait a ecrire une feuille de route pour
 *    « des blocks en USDC et dans les autres monnaies tokenisees ». La reponse n etait ni dans une
 *    roadmap ni dans un README : elle etait deja dans le mapping `deviseAdmise` du hook DEPLOYE.
 *    Ce mapping est ecrit UNIQUEMENT au constructeur (TBlockFeeHookV8.sol:236) et le fichier ne
 *    contient AUCUN setter — la liste est donc definitive pour un hook donne, et le hook fait
 *    partie de la PoolKey : un marche deja ouvert ne peut pas changer de liste.
 *
 * ⛔ LA BORNE, ECRITE ICI PARCE QU ELLE EST LE PIEGE PRINCIPAL : ce fichier mesure ce qu on PEUT
 *    LIBELLER, pas ce qui S ECHANGE. Les deux ne sont pas la meme question, et c est la seconde qui
 *    paie. Au 2026-09-21 : 17 devises libellables, 0 marche ouvert sur le V8.
 *
 * ⛔ TEMOIN NEGATIF : une adresse sans aucune raison d etre admise est interrogee a chaque passage.
 *    Si elle ressortait admise, le tableau serait faux et le script le dit au lieu de le publier.
 * ⛔ « illisible » n est PAS « refuse » : un hook anterieur au mapping (le V1) rend une reponse vide,
 *    et confondre les deux ferait croire a un refus la ou il n y a pas de question.
 * ⛔ LECTURE SEULE : aucun envoi, aucune signature.
 */
import { keccak256 } from './keccak.js';
import { DEVISES_BASE, ACTIONS_COINBASE, ETH_NATIF, TBLOCK_MAINNET } from './paires.js';
import { HOOK_V8 } from './tokenomics.js';

const enHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const sel4 = (s) => '0x' + enHex(keccak256(new TextEncoder().encode(s))).slice(0, 8);
const mot = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');

export const SEL_DEVISE_ADMISE = sel4('deviseAdmise(address)');
/** ⛔ Sans raison d etre admise. Sa reponse donne sa valeur a toutes les autres. */
export const TEMOIN = '0x000000000000000000000000000000000000beef';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
let idRpc = 1;
async function rpc(methode, params) {
  let dernier = 'inconnu';
  for (let essai = 0; essai < 8; essai++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: idRpc++, method: methode, params }) });
    const j = await r.json();
    if (!j.error) return j.result;
    dernier = j.error.message || '';
    /* ⛔ Un debit depasse n est pas un verdict : on reessaie avant de conclure quoi que ce soit. */
    if (!/rate limit|limit exceeded|too many/i.test(dernier)) return { __erreur: dernier };
    await new Promise((f) => setTimeout(f, 700 * (essai + 1)));
  }
  return { __erreur: dernier };
}

/** true / false / null. NULL = illisible — jamais confondu avec un refus. */
export async function deviseAdmise(hook, adresse, appel = rpc) {
  const r = await appel('eth_call', [{ to: hook, data: SEL_DEVISE_ADMISE + mot(adresse) }, 'latest']);
  if (r && r.__erreur) return null;
  return /^0x[0-9a-f]{64}$/i.test(String(r)) ? BigInt(String(r)) !== 0n : null;
}

/** Les devises a interroger : celles que l app PROPOSE, plus le temoin. */
export function ciblesDuCensus() {
  return [
    ...DEVISES_BASE.filter((p) => p.adr !== ETH_NATIF && p.adr !== TBLOCK_MAINNET)
      .map((p) => ({ sym: p.symbole, nom: p.nom, adr: p.adr })),
    ...ACTIONS_COINBASE.map((s) => ({ sym: s.symbole, nom: s.nom, adr: s.adr })),
    { sym: 'TEMOIN', nom: 'adresse sans raison d etre admise', adr: TEMOIN },
  ];
}

export async function census(hook, appel = rpc) {
  const lignes = [];
  for (const c of ciblesDuCensus()) lignes.push({ ...c, admise: await deviseAdmise(hook, c.adr, appel) });
  const temoin = lignes.find((l) => l.sym === 'TEMOIN');
  const utiles = lignes.filter((l) => l.sym !== 'TEMOIN');
  return {
    hook,
    lignes,
    /* ⛔ Si le temoin ressort admis, le decodage ne discrimine pas et RIEN n est publiable. */
    fiable: temoin ? temoin.admise === false : false,
    admises: utiles.filter((l) => l.admise === true).length,
    refusees: utiles.filter((l) => l.admise === false).length,
    illisibles: utiles.filter((l) => l.admise === null).length,
  };
}

if (import.meta.url === new URL('file://' + process.argv[1].split('\\').join('/')).href
  || process.argv[1].endsWith('devises-admises.mjs')) {
  const hook = process.argv[2] || HOOK_V8;
  const r = await census(hook);
  console.log('hook : ' + hook + '   selecteur deviseAdmise(address) : ' + SEL_DEVISE_ADMISE + '\n');
  console.log('symbole'.padEnd(10) + 'adresse'.padEnd(44) + 'admise  nom');
  console.log('-'.repeat(100));
  for (const l of r.lignes) {
    console.log(l.sym.padEnd(10) + l.adr.padEnd(44)
      + (l.admise === null ? 'illisible' : l.admise ? 'OUI' : 'non').padEnd(8) + l.nom);
  }
  console.log('\n=== LE COMPTE ===');
  console.log('   ETH natif  : admis d office (_estDevise rend true pour address(0))');
  console.log('   TBLOCK     : admis d office (champ `tblock` du constructeur)');
  console.log('   par liste  : ' + r.admises + ' admises · ' + r.refusees + ' refusees · '
    + r.illisibles + ' illisibles');
  console.log(r.fiable
    ? '   temoin     : non admis ✅ le decodage discrimine'
    : '⛔⛔ TEMOIN ADMIS OU ILLISIBLE — ce tableau n est PAS fiable, ne rien en publier.');
  console.log('\n⛔ CE QUE CA NE DIT PAS : qu une de ces paires ait le moindre volume. Etre libellable');
  console.log('   et etre echange sont deux questions differentes — c est la seconde qui paie.');
}
