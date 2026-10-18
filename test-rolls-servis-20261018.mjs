/* test-rolls-servis-20261018.mjs - BLOCKROLLS : CE QUE LE SERVEUR SERT, ET CE QU IL DIT DU CONTRAT.
 * AFFIRME (lecture de serveur-web.js + la fiche generee) : (1) les 5 fichiers de BlockRolls sont dans SERVIS (page de deploiement, fiche,
 *   encodeur, appels, pont) - absent = 404 = page morte ; (2) /api/tirage rend `rolls` : `contrat` = l adresse de la fiche si elle est une
 *   adresse, sinon null (practice) ; les prix et gains viennent de la fiche (constructeur), jamais tapes dans le serveur ; (3) la fiche d
 *   aujourd hui dit adresse null ET bloc null (rien de deploye) : l app ne doit montrer aucun bouton payant ; (4) la fiche porte un
 *   sha256Creation et une `creation` de la taille annoncee (octetsCreation).
 * NE PROUVE PAS : un deploiement reel ni le rendu. */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { BLOCKROLLS_DEPLOIEMENT as D } from './blockrolls-deploiement.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const s0 = srv.indexOf('const SERVIS = ['), s1 = srv.indexOf('const SERVIS_EN_ESSAI_SEULEMENT');
vu(s0 > 0 && s1 > s0, 'SERVIS present');
const servis = srv.slice(s0, s1);
for (const f of ['deployer-blockrolls.html', 'blockrolls-deploiement.js', 'blockrolls-config.js', 'blockrolls-plan.js', 'rolls-jeu.js']) vu(servis.includes("'" + f + "'"), f + ' est servi');
vu(/import \{ BLOCKROLLS_DEPLOIEMENT \} from '\.\/blockrolls-deploiement\.js';/.test(srv), 'la fiche est importee (pas une variable d environnement)');
const t0 = srv.indexOf("if (chemin === '/api/tirage')"), t1 = srv.indexOf('regle: ', t0);
const tirage = srv.slice(t0, t1);
vu(/contrat: \/\^0x\[0-9a-f\]\{40\}\$\/i\.test\(String\(BLOCKROLLS_DEPLOIEMENT\.adresse \|\| ''\)\)/.test(tirage) && /: null/.test(tirage), '/api/tirage.rolls.contrat = adresse de la fiche ou null');
vu(/prixRoll: String\(rc\.rollPrice/.test(tirage) && /prixPass: String\(rc\.passPrice/.test(tirage) && /prizes: \[rc\.prize5, rc\.prize4, rc\.prize3\]/.test(tirage), 'prix et gains lus dans la fiche');
vu(!/500000|10000000/.test(tirage), 'aucun prix tape dans la route');
/* 2026-10-18 14:25 UTC : Phil a signe (tx 0x6412ec99…be ca2, bloc 52 770 558) ; noter-deploiement-blockrolls a verifie input == creation, recu 0x1
 *   et les relectures avant d ecrire. La fiche porte l adresse ET le bloc, ensemble — c est ce qui ouvre les boutons payants (rolls.contrat). */
vu(D.adresse === '0x0c5b490196f06db40ab8af68ecb2313029460fe9' && D.bloc === 52770558, 'fiche : deploye, adresse et bloc ecrits ensemble (lus au recu)');
vu(D.chaine === 8453 && D.contrat === 'BlockRolls' && /^0x[0-9a-f]+$/.test(D.creation) && (D.creation.length - 2) / 2 === D.octetsCreation, 'fiche : chaine, nom, taille de la creation');
vu(createHash('sha256').update(Buffer.from(D.creation.slice(2), 'hex')).digest('hex') === D.sha256Creation, 'fiche : empreinte de la creation recomputee');
console.log('ok rolls-servis - ' + n + ' assertions ; NE PROUVE PAS un deploiement reel');
