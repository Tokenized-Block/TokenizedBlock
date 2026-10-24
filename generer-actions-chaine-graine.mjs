/* generer-actions-chaine-graine.mjs — ECRIT actions-chaine-graine.js DEPUIS LE RECENSEMENT DU 2026-10-24, PAR COPIE (jamais de memoire).
 *
 * Source : le recensement en lecture seule du 2026-10-24 (bloc 53 040 674 ; D:\tmp\stocks-census\stocks-census.json). Pour chacune des
 * 202 actions de la liste de l emetteur, il a lu : eth_getCode == 0xef, symbol(), decimals(), totalSupply(), puis la TRANSACTION de
 * creation (log B20Created emis par la factory 0xb20f… avec topics[1] = le jeton ; tx.from, tx.to, status).
 * ⛔ La graine ne porte QUE ce qui ne change jamais (adresse, hash de la tx de creation, bloc, symbole). Elle ne PROUVE rien seule :
 *   actions-chaine.js RE-LIT chaque preuve sur la chaine avant de lister une action (recu + transaction + code).
 * Usage : node generer-actions-chaine-graine.mjs <stocks-census.json> */
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2];
if (!src) { console.error('usage: node generer-actions-chaine-graine.mjs <stocks-census.json>'); process.exit(2); }
const c = JSON.parse(readFileSync(src, 'utf8'));
const ADR = /^0x[0-9a-fA-F]{40}$/, TX = /^0x[0-9a-fA-F]{64}$/;
const lignes = [];
const createurs = new Set(), appeles = new Set();
for (const r of c.rows) {
  const k = r.creation || {};
  if (!ADR.test(r.address) || !TX.test(k.tx || '') || !Number.isSafeInteger(k.block)) throw new Error('ligne incomplete : ' + JSON.stringify(r.address));
  if (r.code !== '0xef' || k.tx_status === '0x0') throw new Error('ligne non prouvee : ' + r.address);
  createurs.add(String(k.tx_from).toLowerCase()); appeles.add(String(k.tx_to).toLowerCase());
  lignes.push([r.address.toLowerCase(), k.tx.toLowerCase(), k.block, String(r.symbol_api || r.symbol_onchain)]);
}
if (createurs.size !== 1 || appeles.size !== 1) throw new Error('plusieurs createurs ou appeles : ' + [...createurs, ...appeles].join(','));
lignes.sort((a, b) => a[2] - b[2] || (a[0] < b[0] ? -1 : 1));
const corps = '/* actions-chaine-graine.js — GENERE par generer-actions-chaine-graine.mjs. Ne pas editer a la main.\n'
  + ' * Recensement du ' + String(c.measuredAt || '').slice(0, 10) + ', bloc ' + c.block + ', lecture seule : ' + lignes.length + ' actions de la liste de l emetteur,\n'
  + ' * chacune avec la transaction qui l a creee (log B20Created de la factory 0xb20f…, topics[1] = le jeton).\n'
  + ' * ⛔ CE N EST PAS UNE PREUVE : actions-chaine.js relit le recu, la transaction et le code de chacune avant de la lister.\n'
  + ' * Colonnes : [jeton, tx de creation, bloc, symbole de l emetteur]. */\n'
  + 'export const GRAINE_BLOC = ' + c.block + ';\n'
  + 'export const GRAINE_CREATEUR = ' + JSON.stringify([...createurs][0]) + ';\n'
  + 'export const GRAINE_APPELE = ' + JSON.stringify([...appeles][0]) + ';\n'
  + 'export const GRAINE_ACTIONS = Object.freeze([\n'
  + lignes.map((l) => '  ' + JSON.stringify(l) + ',').join('\n') + '\n]);\n';
writeFileSync(new URL('./actions-chaine-graine.js', import.meta.url), corps);
console.log('actions-chaine-graine.js : ' + lignes.length + ' actions, createur ' + [...createurs][0] + ', appele ' + [...appeles][0]);
