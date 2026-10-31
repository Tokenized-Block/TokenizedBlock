/* generer-echantillons-tam.mjs — ecrit test/TamEchantillons.sol a partir du moteur de la PHASE A (tam-moteur.js, cfd7e7b).
 * Memes graines que test-tam-moteur-20261031.mjs : keccak("tam-echantillon-i"), etatCerveau { tick: i } (PAS de vrais blocs).
 * Chaque echantillon porte ses octets ET le keccak calcule en JS : le test forge compare le keccak Solidity a celui du JS.
 * Rien n est signe ni envoye. Usage (depuis contracts/) : node generer-echantillons-tam.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, '..', f)).href);
const [T, K] = await Promise.all([imp('tam-moteur.js'), imp('keccak.js')]);
const graineDe = (s) => K.keccak256Hex(new TextEncoder().encode(s));
const hex = (u8) => Buffer.from(u8).toString('hex');
/* le SVG attendu, construit ICI comme TamArt._svg le construit : le test exige l egalite OCTET pour OCTET (le decodage Solidity
 * des residus est donc compare au decodeur JS, sur toute la chaine de prediction). */
const MAX_TRACE = 600;
function svgAttendu(oct) {
  const d = T.decoder(oct), m = (1 << d.q) - 1, nuage = d.ordre === 1, pas = d.n <= MAX_TRACE ? 1 : Math.ceil(d.n / MAX_TRACE);
  const cl = (v) => (v < 0 ? 0 : v > m ? m : v);
  let p = "";
  for (let i = 0; i < d.n; i += pas) p += (i === 0 || nuage ? "M" : "L") + cl(d.points[3 * i]) + " " + (m - cl(d.points[3 * i + 1])) + (nuage ? "h0" : "") + " ";
  const sw = nuage ? Math.floor(m / 200) + 1 : Math.floor(m / 800) + 1;
  return Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " + m + " " + m + "'><rect width='100%' height='100%' fill='#0b0d17'/><path fill='none' stroke='#7fd1ff' stroke-linecap='round' stroke-width='" + sw + "' d='" + p + "'/></svg>", "utf8").toString("hex");
}
const existantes = [], lignes = [];
for (let i = 1; i <= 5; i++) {
  const g = graineDe('tam-echantillon-' + i);
  const ch = T.choisirOeuvre({ graine: g, etatCerveau: { tick: i }, existantes });
  if (!ch.ok) throw new Error('echantillon ' + i + ' sans oeuvre certifiee');
  existantes.push(ch.certificats.signature);
  const r = T.rejouer(ch.params);
  if (!r.ok || hex(r.octets) !== hex(ch.octets)) throw new Error('rejouer() differe pour ' + i);
  const params = Buffer.from(JSON.stringify(ch.params), 'utf8');
  lignes.push({ i, g, oct: hex(ch.octets), n: ch.octets.length, hash: ch.hash, params: params.toString('hex'), svg: svgAttendu(ch.octets), pts: ch.params.n, ordre: ch.params.ordre });
}
const g0 = (h) => (h.startsWith('0x') ? h : '0x' + h);
const src = [
  '// SPDX-License-Identifier: MIT',
  '// GENERE par contracts/generer-echantillons-tam.mjs depuis tam-moteur.js (phase A). NE PAS EDITER A LA MAIN.',
  'pragma solidity ^0.8.24;',
  '',
  'library TamEchantillons {',
  '    function nombre() internal pure returns (uint256) { return ' + lignes.length + '; }',
  ...lignes.map((l) => '    // #' + l.i + ' : ' + l.n + ' octets, ' + l.pts + ' points, ordre ' + l.ordre),
  '    function donnees(uint256 i) internal pure returns (bytes memory) {',
  ...lignes.map((l) => '        if (i == ' + l.i + ') return hex"' + l.oct + '";'),
  '        revert("echantillon inconnu");',
  '    }',
  '    function graine(uint256 i) internal pure returns (bytes32) {',
  ...lignes.map((l) => '        if (i == ' + l.i + ') return ' + g0(l.g) + ';'),
  '        revert("echantillon inconnu");',
  '    }',
  '    function hashJs(uint256 i) internal pure returns (bytes32) {',
  ...lignes.map((l) => '        if (i == ' + l.i + ') return ' + g0(l.hash) + ';'),
  '        revert("echantillon inconnu");',
  '    }',
  '    function params(uint256 i) internal pure returns (bytes memory) {',
  ...lignes.map((l) => '        if (i == ' + l.i + ') return hex"' + l.params + '";'),
  '        revert("echantillon inconnu");',
  '    }',
  '    function svgJs(uint256 i) internal pure returns (bytes memory) {',
  ...lignes.map((l) => '        if (i == ' + l.i + ') return hex"' + l.svg + '";'),
  '        revert("echantillon inconnu");',
  '    }',
  '}',
  '',
].join('\n');
fs.writeFileSync(path.join(ICI, 'test', 'TamEchantillons.sol'), src);
for (const l of lignes) console.log('#' + l.i, l.n, 'octets', l.pts, 'pts ordre', l.ordre, 'params', l.params.length / 2, 'octets', l.hash.slice(0, 18));
