// outils/generer-frais-contrats.mjs — ecrit frais-contrats.js : les constantes de FRAIS gravees dans les sources Solidity du depot
// (BlockSkins, BlockMissionsV3), LUES dans le texte des .sol, jamais recopiees a la main. Lancer : node outils/generer-frais-contrats.mjs
// ⛔ Pur cote fonctions (constantes, texteModule) : test-frais-et-risques les appelle et exige que frais-contrats.js soit IDENTIQUE a ce
//   qu elles redonnent sur les sources du depot (fichier perime = rouge). Une constante absente de la source LEVE : jamais un defaut.
// ⛔ BlockSkins v2 (deploye, 0xc0d1…8e2f) a ete relu sur la chaine le 2026-10-18 : SALE_FEE_BPS 1000, MIN_RAISE_BPS 500, MAX_AUCTION 604800
//   = ces memes valeurs de la source v3. BlockMissionsV3 n est PAS deploye : ses chiffres sont ceux du brouillon, la page le dit.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const SOURCES = Object.freeze([
  Object.freeze({ contrat: 'BlockSkins', fichier: 'contracts/src/BlockSkins.sol', noms: Object.freeze(['MINT_PRICE', 'SALE_FEE_BPS', 'MIN_RAISE_BPS', 'MAX_AUCTION']) }),
  Object.freeze({ contrat: 'BlockMissionsV3', fichier: 'contracts/src/BlockMissionsV3.sol', noms: Object.freeze(['FEE_BPS', 'TB_SHARE_BPS', 'RESERVE_SHARE_BPS']) }),
]);

const UNITES = { days: 86400n, hours: 3600n, minutes: 60n, seconds: 1n };
/** `uint256 public constant NOM = 1_000;` (ou `7 days`) -> { NOM: '1000' } ; leve si un nom manque ou se lit deux fois */
export function constantes(texte, noms) {
  const out = {};
  for (const nom of noms) {
    const re = new RegExp('uint\\d*\\s+(?:public\\s+|internal\\s+|private\\s+)?constant\\s+' + nom + '\\s*=\\s*([0-9_]+)\\s*(days|hours|minutes|seconds)?\\s*;', 'g');
    const m = [...texte.matchAll(re)];
    if (m.length !== 1) throw new Error(nom + ': ' + m.length + ' declaration(s) found, expected exactly 1');
    out[nom] = (BigInt(m[0][1].replace(/_/g, '')) * (m[0][2] ? UNITES[m[0][2]] : 1n)).toString();
  }
  return out;
}

/** l empreinte d une source, fins de ligne ramenees a LF (= l objet git ; une copie Windows en CRLF donne la meme). C est aussi la
 *  convention des fiches de deploiement : BlockSkins.sol -> c11d84…, BlockMissionsV3.sol -> 491aaa… */
export const sha256Lf = (t) => createHash('sha256').update(String(t).replace(/\r\n/g, '\n')).digest('hex');

/** le texte EXACT de frais-contrats.js pour ces sources { fichier: texte } */
export function texteModule(sources) {
  const lignes = SOURCES.map((s) => {
    const t = sources[s.fichier];
    if (typeof t !== 'string') throw new Error('missing source ' + s.fichier);
    const c = constantes(t, s.noms);
    const champs = s.noms.map((k) => k + ": '" + c[k] + "'").join(', ');
    return '  ' + s.contrat + ": Object.freeze({ source: '" + s.fichier + "', sha256Source: '" + sha256Lf(t) + "', " + champs + ' }),';
  });
  return '/* frais-contrats.js — GENERE par outils/generer-frais-contrats.mjs depuis les sources Solidity du depot. NE PAS EDITER A LA MAIN.\n'
    + ' * Les constantes de frais gravees dans les contrats (entiers bruts, en texte). Pur, sans import : la page frais-et-risques.html\n'
    + ' * l importe via frais-risques.js. test-frais-et-risques-20261018 exige que ce fichier soit identique a une regeneration. */\n'
    + 'export const FRAIS_CONTRATS = Object.freeze({\n' + lignes.join('\n') + '\n});\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = new URL('../', import.meta.url);
  const sources = Object.fromEntries(SOURCES.map((s) => [s.fichier, readFileSync(new URL(s.fichier, racine), 'utf8')]));
  const texte = texteModule(sources);
  writeFileSync(new URL('frais-contrats.js', racine), texte);
  console.log('frais-contrats.js ecrit (' + texte.length + ' octets)');
}
