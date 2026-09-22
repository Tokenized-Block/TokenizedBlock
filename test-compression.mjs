// test-compression.mjs — CE QUI EST SERVI DOIT ETRE COMPRESSE, ET LE RESTER.
//
// ⛔⛔ CE QUI A ETE MESURE LE 2026-09-22, ET PERSONNE NE L AVAIT VU. Le serveur n envoyait AUCUNE
//     compression. Une requete avec `Accept-Encoding: gzip` ne rendait pas de `content-encoding`,
//     et `app.html` partait en **672 523 octets bruts** a chaque visite — la ou il en fait 213 707
//     en gzip. **458 816 octets de trop, pour chaque visiteur**, sur la page d accueil d un produit
//     qu on passe nos journees a essayer de faire decouvrir.
//
// ⛔ CE N EST PAS UNE MICRO-OPTIMISATION, et c est pour ca que ce test existe : le meme jour, on
//    mesurait que 0 de nos 8 blocks est connu de l index public et qu un inconnu ne peut pas nous
//    trouver. Servir trois fois trop d octets a celui qui arrive quand meme est du meme ordre de
//    probleme, en pire : lui, il etait la.
//
// ⛔ CE QUE CE FICHIER NE PEUT PAS FAIRE : parler au serveur. Il n en demarre pas un — ce serait un
//    test lent et capricieux dans une suite qui doit rester rapide. Il verifie le CABLAGE : que la
//    compression est branchee, qu elle porte ses garde-fous, et qu aucun des quatre pieges connus
//    n est ouvert. La verification en vrai a ete faite a la main, avant et apres, et les deux
//    chiffres sont dans l en-tete ci-dessus.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };

const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');

/* ══ 1. LA COMPRESSION EST BRANCHEE ═════════════════════════════════════════════════════════ */
ok(/import \{ gzipSync \} from 'node:zlib'/.test(src), 'le serveur importe gzipSync');
ok(/gz: gz && gz\.length < corps\.length \? gz : null/.test(src),
  'le gzip pre-calcule est garde SEULEMENT s il est plus petit que l original');
ok(/if \(accepteGz && e\.gz\)/.test(src), 'le corps compresse est servi quand il existe');
ok(/'content-encoding': 'gzip'/.test(src), "l en-tete content-encoding est pose");

/* ══ 2. LES QUATRE PIEGES, CHACUN NOMME ═════════════════════════════════════════════════════ */

// ⛔ PIEGE 1 : servir du gzip a un client qui n en veut pas. Il ne verrait que du binaire.
ok(/accepteGz = \/\\bgzip\\b\/\.test\(String\(req\.headers\['accept-encoding'\]/.test(src),
  'le client doit AVOIR DEMANDE le gzip — jamais devine');

// ⛔ PIEGE 2 : oublier `vary`. Un cache intermediaire servirait alors le corps compresse a tout le
//    monde, y compris a qui ne l accepte pas.
ok(/vary: 'accept-encoding'/.test(src),
  "`vary: accept-encoding` est present — sans lui un cache sert du gzip a n importe qui");

// ⛔ PIEGE 3 : gzipper les images. Un PNG est deja compresse : on brule du CPU, et le resultat peut
//    etre PLUS GROS.
ok(/const gz = image \? null : gzipSync/.test(src),
  'les images ne sont pas re-compressees');

// ⛔ PIEGE 4, LE PLUS VICIEUX : le chemin `?block=` REECRIT le HTML par requete (les balises og du
//    block demande). Le gzip pre-calcule ne correspond donc plus au corps. Servir l ancien
//    enverrait les MAUVAISES balises — une erreur qu un cache rendrait indebuggable.
const bloc = /if \(blocDemande\) \{[\s\S]*?\n  \}/.exec(src);
ok(bloc !== null, 'le chemin `?block=` est lisible pour etre controle');
ok(bloc && /gzipSync\(Buffer\.from\(html/.test(bloc[0]),
  'le chemin `?block=` recompresse A LA VOLEE le html reecrit, au lieu de servir le gzip du fichier');
ok(bloc && !/e\.gz/.test(bloc[0]),
  "ce chemin n utilise JAMAIS le gzip pre-calcule — il ne correspond pas a ce qu il envoie");

/* ══ 3. LE GAIN EST REEL SUR LE FICHIER LE PLUS LOURD ═══════════════════════════════════════
 * ⛔ On ne verifie pas « ca compresse » dans l abstrait : on mesure le fichier qui part a chaque
 *    visite. Un jour ou il cesserait de se compresser, ce test le dirait. */
const page = readFileSync(new URL('./app.html', import.meta.url));
const comprime = gzipSync(page, { level: 9 });
const ratio = comprime.length / page.length;
ok(ratio < 0.45,
  'app.html tombe a ' + Math.round(ratio * 100) + ' % de sa taille en gzip ('
  + page.length + ' → ' + comprime.length + ' o) — le gain reste massif');
ok(page.length - comprime.length > 300000,
  'le gain depasse 300 Ko par visite — ' + (page.length - comprime.length) + ' o economises');

/* ══ 4. LE TEMOIN — sans lui, un test qui ne verifierait rien passerait aussi ════════════════ */
{
  const avant = "  cache.set('/' + nom, {\n    corps,\n    type: TYPES[";
  ok(!src.includes(avant),
    "temoin : la forme SANS gzip du cache n est plus la — c est exactement ce qui servait 672 Ko");
  const minuscule = Buffer.from('ok');
  ok(gzipSync(minuscule, { level: 9 }).length > minuscule.length,
    'temoin : sur un fichier minuscule le gzip est PLUS GROS — le garde-fou du point 1 sert '
    + 'vraiment a quelque chose');
}

console.log('test-compression : ' + n + ' assertions, app.html ' + page.length + ' → '
  + comprime.length + ' o gzip, OK');
