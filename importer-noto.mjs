/* importer-noto.mjs — DES SILHOUETTES D EMOJI OPEN SOURCE, ADAPTEES A NOTRE SYSTEME DE COULEUR.
 *
 *   node importer-noto.mjs            ecrit motifs-noto.js
 *   node importer-noto.mjs --verifie  ne rien ecrire, seulement dire ce qui changerait
 *
 * ⛔⛔ D OU VIENT CE QU ON IMPORTE, ET SOUS QUELLE LICENCE. `googlefonts/noto-emoji`, dossier
 *     `2D/svg`, qui porte SON PROPRE fichier LICENSE — lu le 2026-09-22, et il dit :
 *       « Copyright 2013 Google, Inc. … Licensed under the Apache License, Version 2.0 »
 *     Apache-2.0 : reutilisation permise, modification permise, AUCUN share-alike — donc rien ne
 *     contamine ce depot. La seule obligation est de conserver l avis, ce que fait NOTICE.md.
 *
 * ⛔ POURQUOI PAS LES EMOJI D APPLE, demandes d abord : leurs dessins sont une oeuvre PROPRIETAIRE.
 *    Les copier serait une contrefacon, et elle serait GRAVEE dans une image on-chain irreversible.
 *    Refuse, et remplace par un jeu dont la licence a ete LUE, pas supposee.
 *
 * ⛔ CE QUE LA CHAINE PORTE, ET C EST CE QUI REND TOUT CA PROPRE : le block grave le NOM de sa
 *    facette (`{"facette":"fusee"}`), jamais le dessin. Aucun octet sous licence ne part on-chain.
 *    L obligation Apache-2.0 porte donc sur NOTRE depot et notre app — un fichier NOTICE suffit.
 *
 * ⛔ POURQUOI DES SILHOUETTES ET PAS LA COULEUR D ORIGINE : notre systeme repeint le motif avec UNE
 *    couleur d accent, choisie par le createur (`fill="${f}"`). Un emoji multicolore y perdrait sa
 *    couleur de toute facon — on aplatit donc volontairement en silhouette, ce qui est un CHOIX
 *    d integration et pas une perte accidentelle. C est aussi ce qui garde le dessin lisible a 40 px.
 *
 * ⛔ LECTURE SEULE SUR LE RESEAU : on telecharge des fichiers publics, on n envoie rien.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/googlefonts/noto-emoji/main/2D/svg/';
const SORTIE = new URL('./motifs-noto.js', import.meta.url);

/* ⛔ NOM CHEZ NOUS -> POINT DE CODE UNICODE. Le nom est ce que la chaine grave : il doit rester
 *    stable meme si l upstream renumerote ses fichiers. C est pourquoi la table est ici, explicite,
 *    et pas deduite d un nom de fichier. */
/* ⛔⛔ VINGT-NEUF GARDES SUR CINQUANTE, APRES LES AVOIR REGARDEES UNE PAR UNE. La premiere passe en
 *     importait cinquante ; rendues a plat, vingt s averaient inutilisables — et le motif du
 *     rejet est net, pas arbitraire : UNE SILHOUETTE NE PORTE LE SENS QUE SI LA FORME LE PORTE.
 *     Les visages (clin, rire, cool, pensif, dodo, fete, coeurYeux, explose, diable, ange) sont
 *     tous une TETE RONDE : ce qui les distingue est a l interieur, en couleur. Aplatis, ils
 *     rendent le meme disque. Idem panda, ours, tigre — un blob a oreilles — et etoileFilante,
 *     cible2, poignee, fusible, pile, qui rendent un carre ou une barre.
 * ⛔ Ecarte aussi `tulipe`, non par jugement mais parce qu il est reste HORS CADRE a l ecran : je
 *    ne garde pas un dessin que je n ai pas vu. `cerisier` couvre deja la fleur, et il a ete vu.
 * ⛔ Et `diamant2` n avait aucun <path> exploitable — l import le signalait deja. */
export const CORRESPONDANCE = {
  singe: '1f412', licorne: '1f984', dragon: '1f409', pingouin: '1f427', hibou: '1f989',
  renard: '1f98a', baleine: '1f40b', poulpe: '1f419', crabe: '1f980', scarabee: '1f41e',
  dinosaure: '1f996', cerveau: '1f9e0', muscle: '1f4aa', priere: '1f64f', applaudir: '1f44f',
  feu: '1f525', eclipse: '1f311', cerisier: '1f338', trefle4: '1f340', palmier: '1f334',
  volant: '1f3ae', aimant: '1f9f2', boussole: '1f9ed', telescope: '1f52d', loupe: '1f50e',
  cle2: '1f5dd', sablier: '23f3', satellite: '1f6f0', mappemonde: '1f5fa',
};

async function chercher(cp) {
  const r = await fetch(BASE + 'emoji_u' + cp + '.svg');
  if (!r.ok) return { erreur: 'HTTP ' + r.status };
  return { texte: await r.text() };
}

/** Les `d=` de tous les chemins, dans l ordre. ⛔ On IGNORE les couleurs : la silhouette est le but.
 *  Un fichier sans aucun `<path>` (cercles, rects seuls) rend une liste vide — et l appelant le
 *  compte comme un echec au lieu d ecrire un motif muet. */
function chemins(svg) {
  const vb = /viewBox="([-\d.\s]+)"/.exec(svg);
  const d = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  return { vb: vb ? vb[1].trim().split(/\s+/).map(Number) : null, d };
}

/** Notre repere va de -21 a 21. Noto dessine dans un carre de 128. On ramene par une transformation
 *  SVG plutot qu en reecrivant les chemins : ⛔ reecrire des coordonnees a la main est le genre
 *  d operation qui deforme un dessin sans que rien ne casse. */
/** ⛔⛔ LES COORDONNEES SONT ARRONDIES, ET C EST MESURE : la premiere passe a rendu 4330 octets par
 *  motif, soit 212 Ko pour le catalogue — +30 % sur le poids de l app, pour de la decoration. Noto
 *  dessine avec deux a quatre decimales dans un carre de 128, puis on reduit d un facteur ~0,3 pour
 *  tenir dans notre repere : a 40 px de rendu, la deuxieme decimale represente moins d un centieme
 *  de pixel. Elle ne peut pas etre vue, elle peut seulement etre payee.
 *  ⛔ UNE decimale est GARDEE : arrondir a l entier deformerait visiblement les petites courbes. */
const arrondir = (d) => d.replace(/-?\d+\.\d+/g, (x) => String(Math.round(Number(x) * 10) / 10));

function enveloppe(vb, ds, taille = 40) {
  if (!vb || vb.length !== 4 || !ds.length) return null;
  const [x, y, w, h] = vb;
  const k = taille / Math.max(w, h);
  const cx = x + w / 2, cy = y + h / 2;
  const corps = ds.map((d) => '<path d="' + arrondir(d) + '"/>').join('');
  return '<g transform="scale(' + k.toFixed(4) + ') translate(' + (-cx).toFixed(1) + ' '
    + (-cy).toFixed(1) + ')" fill="__F__">' + corps + '</g>';
}

const verifieSeulement = process.argv.includes('--verifie');
const noms = Object.keys(CORRESPONDANCE);
const motifs = {};
const rates = [];
for (const nom of noms) {
  const cp = CORRESPONDANCE[nom];
  const r = await chercher(cp);
  if (r.erreur) { rates.push(nom + ' (' + cp + ') : ' + r.erreur); continue; }
  const { vb, d } = chemins(r.texte);
  const g = enveloppe(vb, d);
  if (!g) { rates.push(nom + ' (' + cp + ') : aucun <path> exploitable'); continue; }
  motifs[nom] = g;
  await new Promise((f) => setTimeout(f, 120));
}

console.log('=== IMPORT NOTO EMOJI (Apache-2.0) ===');
console.log('   demandes : ' + noms.length + ' · importes : ' + Object.keys(motifs).length
  + ' · rates : ' + rates.length);
for (const r of rates) console.log('   ⛔ ' + r);
const octets = Object.values(motifs).reduce((s, g) => s + g.length, 0);
console.log('   poids total des traces : ' + octets + ' octets · moyenne '
  + Math.round(octets / Math.max(1, Object.keys(motifs).length)) + ' o');

if (!Object.keys(motifs).length) {
  console.log('\n⛔ RIEN N A ETE IMPORTE — on n ecrit pas un fichier vide qui passerait pour un succes.');
  process.exit(1);
}
if (verifieSeulement) {
  const avant = existsSync(SORTIE) ? readFileSync(SORTIE, 'utf8') : '';
  console.log('\n--verifie : ' + (avant ? 'le fichier existe deja (' + avant.length + ' o)' : 'le fichier n existe pas encore'));
  process.exit(0);
}

const entete = `// motifs-noto.js — GENERE PAR \`importer-noto.mjs\`. NE PAS EDITER A LA MAIN.
//
// ⛔⛔ PROVENANCE ET LICENCE, lues a la source le 2026-09-22 :
//    googlefonts/noto-emoji, dossier \`2D/svg\`, qui porte son propre fichier LICENSE :
//      « Copyright 2013 Google, Inc. … Licensed under the Apache License, Version 2.0 »
//    Apache-2.0 : reutilisation et modification permises, AUCUN share-alike. L avis est conserve
//    dans NOTICE.md a la racine, ce qui remplit l obligation.
//
// ⛔ CE SONT DES SILHOUETTES, PAS LES EMOJI EN COULEUR, et c est un choix : notre systeme repeint le
//    motif avec l UNE couleur d accent choisie par le createur. Aplatir est donc necessaire, et ca
//    garde le dessin lisible a 40 px.
//
// ⛔ LA CHAINE NE GRAVE QUE LE NOM de la facette. Aucun octet sous licence ne part on-chain.
export const MOTIFS_NOTO = {
`;
const corps = Object.entries(motifs)
  .map(([nom, g]) => '  ' + nom + ': ' + JSON.stringify(g) + ',')
  .join('\n');
writeFileSync(SORTIE, entete + corps + '\n};\n');
console.log('\nmotifs-noto.js ecrit · ' + Object.keys(motifs).length + ' motifs');
