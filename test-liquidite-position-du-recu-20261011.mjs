/* test-liquidite-position-du-recu-20261011.mjs - LA POSITION AJOUTEE SE RETROUVE PAR LE RECU, PAS PAR LE COMPTEUR GLOBAL.
 * Contre-test de Grok (2026-10-11, Add liquidity IB022 0,1 %, tx 0x615f56d6...20dc, NFT #3129294) : « None added from this browser yet »
 *   juste apres l ajout confirme. MESURE : entre l approbation (bloc 52465360) et l ajout (52465376), 2 positions v4 mintees par d AUTRES
 *   (#3129292, #3129293) : l id lu AVANT l envoi (nextTokenId) etait celui d un tiers, ownerOf l a refuse, rien n etait garde - et la
 *   carte disait quand meme « your position is listed below ».
 * AFFIRME : idsMintesDansRecu (EXECUTE) ne rend que les Transfer(0x0 -> compte) emis par le PositionManager lui-meme (un faux log d un
 *   autre contrat, un mint vers un tiers, un transfert ordinaire sont ignores) ; signerLiquidite lit le RECU, garde le compteur en
 *   secours seulement, verifie ownerOf, et ne dit « listed below » que si une position a ete gardee.
 * NE PROUVE PAS : le rendu, ni un vrai wallet (Grok le contre-testera). */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { idsMintesDansRecu } from './liquidite.js';
import { V4_ADRESSES } from './lancer-pool.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const POSM = V4_ADRESSES[8453].posm.toLowerCase();
const T = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const mot = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
const adrMot = (a) => '0x' + a.slice(2).toLowerCase().padStart(64, '0');
const MOI = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', AUTRE = '0x00000000000000000000000000000000000b0b01';
const recu = { logs: [
  { address: '0x' + '9'.repeat(40), topics: [T, mot(0), adrMot(MOI), mot(1)], data: '0x' },          /* faux : autre contrat */
  { address: POSM, topics: [T, mot(0), adrMot(AUTRE), mot(3129293)], data: '0x' },                   /* mint vers un tiers */
  { address: POSM, topics: [T, adrMot(AUTRE), adrMot(MOI), mot(42)], data: '0x' },                   /* transfert, pas un mint */
  { address: POSM.toUpperCase().replace('0X', '0x'), topics: [T, mot(0), adrMot(MOI), mot(3129294)], data: '0x' }, /* LE mint */
] };
const ids = idsMintesDansRecu({ recu, chaine: 8453, compte: MOI });
vu(ids.length === 1 && ids[0] === 3129294n, 'ids lus dans le recu : ' + ids.join(','));
vu(idsMintesDansRecu({ recu, chaine: 8453, compte: AUTRE }).join(',') === '3129293', 'le mint du tiers n est pas rendu au tiers');
vu(idsMintesDansRecu({ recu: null, chaine: 8453, compte: MOI }).length === 0 && idsMintesDansRecu({ recu, chaine: 1, compte: MOI }).length === 0
  && idsMintesDansRecu({ recu, chaine: 8453, compte: '0x31e0' }).length === 0, 'recu absent / chaine inconnue / compte tronque : doit rendre []');
/* cablage */
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const i = html.indexOf('async function signerLiquidite(tx, adr, genre) {');
vu(i > 0, 'signerLiquidite introuvable');
const f = html.slice(i, i + /\r?\n\}/.exec(html.slice(i)).index);
vu(/idsMintesDansRecu\(\{ recu: await rpc\('eth_getTransactionReceipt', \[r\.hash\]\), chaine: CHAINE, compte \}\)/.test(f), 'ROUGE->VERT : la position n est pas cherchee dans le recu');
vu(/if \(!ids\.length && idAvant !== null\) ids = \[idAvant\];/.test(f), 'le compteur global n est plus seulement un secours');
vu(/pos\.proprietaire\.toLowerCase\(\) === compte\.toLowerCase\(\)\) \{ garderPosition\(id, adr\); gardees \+= 1; \}/.test(f), 'ownerOf n est plus verifie avant de garder');
vu(/gardees \? 'Liquidity added — your position is listed below\.'/.test(f) && !/'Liquidity added — your position is listed below\.' : 'Position withdrawn\.'/.test(f),
  '« listed below » est dit meme quand aucune position n a ete gardee');
console.log('ok liquidite-position-du-recu - ' + n + ' assertions (idsMintesDansRecu execute) ; NE PROUVE PAS le rendu ni un vrai wallet');
