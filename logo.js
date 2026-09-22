// logo.js — LE dessin d un block. Un seul, partage par tous les ecrans.
// ================================================================================================
// ⛔⛔ CE FICHIER EST DEPLACE DEPUIS `index.html`, PAS REECRIT. Le dessin part dans le
//    `contractURI`, qui est GRAVE : mesure du 2026-09-06, `updateContractURI` est refuse au
//    createur, aux tiers ET au jeton lui-meme. Une seule difference de caractere ici et les blocks
//    crees demain ne ressembleraient plus a ceux d hier, sans aucun moyen de revenir en arriere.
//
// ⇒ `test-logo.mjs` compare le rendu de ce module a une REFERENCE figee, sur un large echantillon
//   de reglages. Ce n est pas une precaution de style : c est ce qui rend le deplacement sur.
//
// ⛔ POURQUOI LE DEPLACER. La map de `app.html` dessinait ses propres cubes, parce que `logoSvg`
//    vivait dans une balise `<script>` et n etait donc importable par personne. Deux dessins pour
//    le meme block, c est deux identites pour une seule chose — et celui qu on maintient le moins
//    finit par contredire l autre. Phil l a dit autrement : « prends tes exemples de creation qui
//    existaient deja et mets-les sur la map ».
//
// ⚠️ FONCTION PURE : aucun DOM, aucun reseau, aucune horloge. Le meme objet de reglages rend
//    TOUJOURS exactement le meme texte SVG — c est ce qui permet de le graver.

/* ⛔⛔ VINGT-NEUF SILHOUETTES IMPORTEES, SOUS APACHE-2.0, ET LA LICENCE A ETE LUE — pas supposee.
 * `googlefonts/noto-emoji`, dossier `2D/svg`, qui porte son propre LICENSE : « Copyright 2013
 * Google, Inc. … Licensed under the Apache License, Version 2.0 ». Reutilisation et modification
 * permises, AUCUN share-alike, l avis conserve dans NOTICE.md.
 * ⛔ POURQUOI PAS LES EMOJI D APPLE, demandes d abord : leurs dessins sont une oeuvre proprietaire,
 *    et les copier les graverait dans une image on-chain irreversible. Refuse, et remplace par un
 *    jeu dont la licence permet cet usage.
 * ⛔ VINGT ONT ETE ECARTEES APRES LES AVOIR REGARDEES : les visages rendent tous le meme disque
 *    quand on les aplatit, parce que ce qui les distingue est leur couleur interieure. Une
 *    silhouette ne porte le sens que si la FORME le porte. */
import { MOTIFS_NOTO } from './motifs-noto.js';

/** Les reglages de logo derives d une apparence deterministe (voir `apparence.js`). */
export function paramsLogoDepuisApparence(a, lettre) {
  return {
    teinte: a.teinte, accent: a.accent, division: a.division, eclats: a.eclats,
    orbite: a.orbite, facette: a.facette, matiere: a.matiere, ornement: a.ornement,
    ecart: a.ecart, lettre: (lettre || 'T').toUpperCase().slice(0, 1),
    photoOu: 'aucune', photo: null,
    /* ⛔ ABSENT SUR LES FACES D AVANT : `undefined` rend le dessin d avant (voir `sat` ci-dessous). */
    ...(a.saturation !== undefined ? { saturation: a.saturation } : {}),
  };
}

/** Les couleurs, le motif et les eclats d une face, pour la dessiner en volume (map). Meme source que le logo grave. */
export function modeleFace(o) { return logoSvg({ ...(o || {}), _modele: true }); }

export function logoSvg(o) {
  /* tip 2165: never throw on null/partial settings — map paint must not die mid-frame. */
  if (!o || typeof o !== 'object') o = {};
  const h = Number(o.teinte), ha = Number(o.accent);
  /* ⚠️ Bornes elargies le 2026-09-13 (5→8, 6→12) : toute valeur d avant rend EXACTEMENT le meme dessin. */
  const n = Math.max(1, Math.min(8, Number(o.division) || 3));
  const eclats = Math.max(0, Math.min(12, Number(o.eclats) ?? 3));
  /* ⛔ SANS SATURATION, LE TEXTE SVG EST CELUI D AVANT AU CARACTERE PRES : on ne multiplie que si le
   * champ existe — `s * 1` ecrit le meme nombre, mais un arrondi a la main aurait pu le changer. */
  const sat = o.saturation === undefined ? null : Math.max(20, Math.min(100, Number(o.saturation))) / 100;
  const S = (s) => (sat === null ? s : Math.round(s * sat));
  const c = (s, l, a = 1) => `hsl(${h} ${S(s)}% ${l}%${a < 1 ? ' / ' + a : ''})`;
  const ca = (s, l) => `hsl(${ha} ${S(s)}% ${l}%)`;
  const L = (o.lettre || 'T').toUpperCase().slice(0, 1);

  /* La grille suit la division : n = 1 ne trace rien, n = 5 decoupe finement. */
  let grille = '';
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const p = (ax, ay, bx, by) => `${ax + (bx - ax) * t} ${ay + (by - ay) * t}`;
    grille += `M${p(100, 30, 30, 70)} L${p(170, 70, 100, 110)}`
      + `M${p(100, 30, 170, 70)} L${p(30, 70, 100, 110)}`
      + `M${p(30, 70, 30, 150)} L${p(100, 110, 100, 190)}`
      + `M${p(30, 70, 100, 110)} L${p(30, 150, 100, 190)}`
      + `M${p(170, 70, 170, 150)} L${p(100, 110, 100, 190)}`
      + `M${p(170, 70, 100, 110)} L${p(170, 150, 100, 190)}`;
  }

  /* ⛔ Le motif de face est un CHOIX, pas une lettre imposee : un symbole de plus d une lettre,
   * ou aucun, doit rester representable. */
  const motif = (m, f) => {
    if (o.facette === 'vide') return '';
    /* ⛔ TOUT EST DESSINE, RIEN N EST IMPORTE. Chaque motif est une forme geometrique tracee ici :
     *    aucun asset tiers, donc aucune licence a verifier — et c est la seule politique tenable,
     *    puisque l image est GRAVEE et que personne ne peut la changer ensuite. Une licence mal lue
     *    serait la seule erreur irreversible du projet. */
    const d = { anneau: `<circle r="17" fill="none" stroke="${f}" stroke-width="9"/>`,
      barres: `<g fill="${f}"><rect x="-19" y="-17" width="38" height="9" rx="2"/>`
        + `<rect x="-19" y="-4" width="38" height="9" rx="2"/><rect x="-19" y="9" width="38" height="9" rx="2"/></g>`,
      disque: `<circle r="18" fill="${f}"/>`,
      croix: `<g fill="${f}"><rect x="-6" y="-20" width="12" height="40" rx="3"/>`
        + `<rect x="-20" y="-6" width="40" height="12" rx="3"/></g>`,
      losange: `<path d="M0-20 20 0 0 20-20 0Z" fill="none" stroke="${f}" stroke-width="8" stroke-linejoin="round"/>`,
      triangle: `<path d="M0-19 19 15-19 15Z" fill="${f}"/>`,
      points: `<g fill="${f}">` + [-13, 0, 13].map((y) => [-13, 0, 13].map((x) =>
        `<circle cx="${x}" cy="${y}" r="4"/>`).join('')).join('') + `</g>`,
      chevrons: `<g fill="none" stroke="${f}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">`
        + `<path d="M-15-14 0-2-15 10"/><path d="M2-14 17-2 2 10"/></g>`,
      cible: `<g fill="none" stroke="${f}"><circle r="19" stroke-width="6"/><circle r="8" stroke-width="6"/></g>`,
      etoile: `<path d="M0-21 6-7 21-7 9 2 14 17 0 8-14 17-9 2-21-7-6-7Z" fill="${f}"/>`,
      eclair: `<path d="M4-21-14 3H-2L-4 21 14-4H2Z" fill="${f}"/>`,
      hexagone: `<path d="M0-20 17-10 17 10 0 20-17 10-17-10Z" fill="none" stroke="${f}" stroke-width="7" stroke-linejoin="round"/>`,
      coche: `<path d="M-17 1 -5 13 18-13" fill="none" stroke="${f}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`,
      cle: `<g fill="${f}"><circle cx="-8" cy="0" r="11"/><rect x="0" y="-4" width="21" height="8" rx="2"/>`
        + `<rect x="12" y="0" width="6" height="9" rx="2"/></g>`,
      vague: `<path d="M-19-6q9-11 19 0t19 0M-19 8q9-11 19 0t19 0" fill="none" stroke="${f}" stroke-width="6" stroke-linecap="round"/>`,
      grille: `<g fill="none" stroke="${f}" stroke-width="5" stroke-linecap="round">`
        + `<path d="M-18-7H18M-18 7H18M-7-18V18M7-18V18"/></g>`,
      fleche: `<path d="M0-20 0 20M-12-8 0-20 12-8" fill="none" stroke="${f}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,
      /* ── ajoutes le 2026-09-13, toujours dessines ici, sans asset tiers ── */
      coeur: `<path d="M0 18-17 1A10 10 0 0 1 0-12 10 10 0 0 1 17 1Z" fill="${f}"/>`,
      lune: `<path d="M6-19A20 20 0 1 0 6 19 15 15 0 1 1 6-19Z" fill="${f}"/>`,
      soleil: `<g fill="${f}" stroke="${f}" stroke-width="4" stroke-linecap="round"><circle r="9"/>`
        + `<path d="M0-21V-14M0 14V21M-21 0H-14M14 0H21M-15-15-10-10M10 10 15 15M-15 15-10 10M10-10 15-15"/></g>`,
      oeil: `<g><path d="M-21 0Q0-19 21 0Q0 19-21 0Z" fill="none" stroke="${f}" stroke-width="5"/><circle r="7" fill="${f}"/></g>`,
      couronne: `<path d="M-19 14-19-12-9 0 0-16 9 0 19-12 19 14Z" fill="${f}"/>`,
      infini: `<path d="M0 0C-6-10-20-10-20 0S-6 10 0 0 20-10 20 0 6 10 0 0Z" fill="none" stroke="${f}" stroke-width="6"/>`,
      goutte: `<path d="M0-21C8-8 15 0 15 7A15 15 0 0 1-15 7C-15 0-8-8 0-21Z" fill="${f}"/>`,
      diamant: `<g fill="none" stroke="${f}" stroke-width="5" stroke-linejoin="round"><path d="M-19-6-10-17H10L19-6 0 20Z"/><path d="M-19-6H19"/></g>`,
      /* ── ajoutes le 2026-09-21 (Phil : « ajoute bcp de possibilite »). Les SUJETS sont ceux des
         emoji ; le TRACE est a nous. Un emoji est un glyphe de police : il change de dessin selon
         l appareil, or la face est GRAVEE et ne peut plus changer. Aucun octet importe, donc aucune
         licence a verifier — et c est la seule politique tenable pour une image irreversible. ── */
      fusee: `<g fill="${f}"><path d="M0-21c6 6 9 13 9 20l-4 6h-10l-4-6c0-7 3-14 9-20Z"/>`
        + `<path d="M-9-2-17 8-9 7ZM9-2 17 8 9 7Z"/><circle cy="-6" r="3.5" fill="none" stroke="${f}" stroke-width="2.5"/>`
        + `<path d="M-4 12 0 20 4 12Z"/></g>`,
      flamme: `<path d="M0-21c8 8 13 13 13 21A13 13 0 0 1-13 0c0-8 5-13 13-21Zm0 12a6 6 0 0 0 0 12 6 6 0 0 0 0-12Z" fill="${f}" fill-rule="evenodd"/>`,
      crane: `<g fill="${f}"><path d="M0-20a17 17 0 0 0-17 17c0 6 3 10 6 12v5a3 3 0 0 0 3 3h16a3 3 0 0 0 3-3v-5c3-2 6-6 6-12A17 17 0 0 0 0-20Z"/>`
        + `</g><g fill="#0b0d10"><circle cx="-6" cy="-3" r="4"/><circle cx="6" cy="-3" r="4"/><path d="M-2 5h4v6h-4Z"/></g>`,
      planete: `<g><circle r="11" fill="${f}"/><ellipse rx="20" ry="6" fill="none" stroke="${f}" stroke-width="3.5" transform="rotate(-20)"/></g>`,
      fantome: `<g fill="${f}"><path d="M0-20a15 15 0 0 0-15 15v22l5-5 5 5 5-5 5 5 5-5 5 5V-5A15 15 0 0 0 0-20Z"/></g>`
        + `<g fill="#0b0d10"><circle cx="-5" cy="-5" r="3"/><circle cx="5" cy="-5" r="3"/></g>`,
      robot: `<g fill="none" stroke="${f}" stroke-width="4" stroke-linejoin="round"><rect x="-15" y="-12" width="30" height="24" rx="5"/>`
        + `<path d="M0-12v-6M-15 0h-5M15 0h5"/></g><g fill="${f}"><circle cx="-6" cy="-1" r="3"/><circle cx="6" cy="-1" r="3"/>`
        + `<rect x="-6" y="5" width="12" height="3" rx="1.5"/><circle cy="-20" r="2.5"/></g>`,
      chat: `<g fill="${f}"><path d="M-15-18-11-3a13 13 0 0 0 22 0L15-18 6-9a16 16 0 0 0-12 0Z"/>`
        + `<path d="M-13 0a13 13 0 0 0 26 0 13 13 0 0 0-26 0Z"/></g>`
        + `<g fill="#0b0d10"><circle cx="-5" cy="-1" r="2.5"/><circle cx="5" cy="-1" r="2.5"/><path d="M-2 5h4l-2 3Z"/></g>`,
      fleur: `<g fill="${f}">` + [0, 60, 120, 180, 240, 300].map((r) =>
        `<ellipse cx="0" cy="-11" rx="5.5" ry="9" transform="rotate(${r})"/>`).join('')
        + `</g><circle r="4.5" fill="#0b0d10"/>`,
      feuille: `<g><path d="M-14 16C-14-4 0-18 16-20 16-2 2 14-14 16Z" fill="${f}"/>`
        + `<path d="M-9 13C-3 2 5-6 14-17" fill="none" stroke="#0b0d10" stroke-width="2.5"/></g>`,
      montagne: `<g fill="${f}"><path d="M-20 16 -6-10 2 4 7-4 20 16Z"/></g>`
        + `<path d="M-11 3-6-10-1 3Z" fill="#0b0d10" opacity=".55"/>`,
      nuage: `<path d="M-13 12a8 8 0 0 1 0-16 11 11 0 0 1 21-3 8 8 0 0 1 5 19Z" fill="${f}"/>`,
      note: `<g fill="${f}"><path d="M-2 10V-16l18-4v6l-14 3v21Z"/><ellipse cx="-8" cy="11" rx="8" ry="6.5"/></g>`,
      horloge: `<g fill="none" stroke="${f}" stroke-width="4"><circle r="18"/><path d="M0-10V1l8 5" stroke-linecap="round"/></g>`,
      ampoule: `<g fill="none" stroke="${f}" stroke-width="4" stroke-linejoin="round">`
        + `<path d="M0-20a12 12 0 0 0-7 22v3h14v-3A12 12 0 0 0 0-20Z"/><path d="M-6 11h12M-4 17h8" stroke-linecap="round"/></g>`,
      engrenage: `<g fill="${f}">` + [0, 45, 90, 135].map((r) =>
        `<rect x="-3.5" y="-21" width="7" height="42" rx="2" transform="rotate(${r})"/>`).join('')
        + `<circle r="13"/></g><circle r="5.5" fill="#0b0d10"/>`,
      bouclier: `<path d="M0-20 17-14v12C17 8 9 16 0 20-9 16-17 8-17-2v-12Z" fill="none" stroke="${f}" stroke-width="5" stroke-linejoin="round"/>`,
      epee: `<g fill="${f}"><path d="M-3-21h6l2 26-5 5-5-5Z"/><rect x="-13" y="5" width="26" height="5" rx="2.5"/>`
        + `<rect x="-3" y="12" width="6" height="9" rx="2"/></g>`,
      de: `<g><rect x="-17" y="-17" width="34" height="34" rx="7" fill="none" stroke="${f}" stroke-width="4.5"/>`
        + `<g fill="${f}"><circle cx="-8" cy="-8" r="3.2"/><circle cx="8" cy="-8" r="3.2"/><circle r="3.2"/>`
        + `<circle cx="-8" cy="8" r="3.2"/><circle cx="8" cy="8" r="3.2"/></g></g>`,
      cube: `<g fill="none" stroke="${f}" stroke-width="4" stroke-linejoin="round">`
        + `<path d="M0-20 18-10v20L0 20-18 10v-20Z"/><path d="M0-20 0 0M0 0 18-10M0 0-18-10"/></g>`,
      trefle: `<g fill="${f}"><circle cx="-8" cy="-6" r="8"/><circle cx="8" cy="-6" r="8"/><circle cy="6" r="8"/>`
        + `<rect x="-2" y="6" width="4" height="15" rx="2"/></g>`,
      ancre: `<g fill="none" stroke="${f}" stroke-width="4.5" stroke-linecap="round">`
        + `<circle cy="-15" r="5"/><path d="M0-10V18M-11 2H11M-16 6a16 16 0 0 0 32 0"/></g>`,
      champignon: `<g fill="${f}"><path d="M-19-2a19 15 0 0 1 38 0Z"/><path d="M-6-2h12v15a6 6 0 0 1-12 0Z"/></g>`
        + `<g fill="#0b0d10"><circle cx="-8" cy="-7" r="3"/><circle cx="7" cy="-9" r="2.4"/></g>`,
      papillon: `<g fill="${f}"><path d="M-1-2C-6-16-20-18-20-7-20 2-10 6-1 2Z"/><path d="M1-2C6-16 20-18 20-7 20 2 10 6 1 2Z"/>`
        + `<path d="M-1 2C-6 10-16 12-16 18-16 22-6 20-1 8Z"/><path d="M1 2C6 10 16 12 16 18 16 22 6 20 1 8Z"/>`
        + `<rect x="-1.5" y="-8" width="3" height="26" rx="1.5"/></g>`,
      pique: `<g fill="${f}"><path d="M0-21C-4-11-17-4-17 5a9 9 0 0 0 15 6v4l-5 6h14l-5-6v-4a9 9 0 0 0 15-6c0-9-13-16-17-26Z"/></g>`,
      /* ── deuxieme serie, 2026-09-22. Phil demandait les emoji d Apple ; leurs dessins sont une
         oeuvre proprietaire et la face est GRAVEE, donc irreversible : on garde les SUJETS, qui
         n appartiennent a personne, et on trace tout soi-meme. Meme politique qu au-dessus. ── */
      pouce: `<g fill="${f}"><path d="M-3-20c3 0 5 2 5 5v6h9a4 4 0 0 1 4 5l-3 13a5 5 0 0 1-5 4H-3Z"/>`
        + `<rect x="-17" y="-8" width="11" height="28" rx="3"/></g>`,
      main: `<g fill="${f}"><rect x="-15" y="-11" width="6" height="18" rx="3"/><rect x="-7" y="-19" width="6" height="26" rx="3"/>`
        + `<rect x="1" y="-21" width="6" height="28" rx="3"/><rect x="9" y="-16" width="6" height="23" rx="3"/>`
        + `<path d="M-15 2h30v5a13 13 0 0 1-13 13h-4A13 13 0 0 1-15 7Z"/></g>`,
      poing: `<g fill="${f}"><rect x="-17" y="-7" width="34" height="24" rx="8"/><circle cx="-10" cy="-9" r="5.5"/>`
        + `<circle cx="0" cy="-11" r="5.5"/><circle cx="10" cy="-9" r="5.5"/></g>`,
      bouche: `<g><path d="M-20 0Q-12-11 0-4 12-11 20 0 10 12 0 12-10 12-20 0Z" fill="${f}"/>`
        + `<path d="M-20 0H20" fill="none" stroke="#0b0d10" stroke-width="2.5"/></g>`,
      alien: `<g fill="${f}"><path d="M0-20c11 0 19 8 19 18 0 12-11 22-19 22S-19 10-19-2c0-10 8-18 19-18Z"/></g>`
        + `<g fill="#0b0d10"><ellipse cx="-7" cy="0" rx="5" ry="7.5" transform="rotate(-20 -7 0)"/>`
        + `<ellipse cx="7" cy="0" rx="5" ry="7.5" transform="rotate(20 7 0)"/></g>`,
      ovni: `<g fill="${f}"><ellipse cy="3" rx="21" ry="7"/><path d="M-11 1a11 10 0 0 1 22 0Z"/></g>`
        + `<g fill="#0b0d10"><circle cx="-11" cy="4" r="2.5"/><circle cy="5" r="2.5"/><circle cx="11" cy="4" r="2.5"/></g>`,
      atome: `<g fill="none" stroke="${f}" stroke-width="3.5"><ellipse rx="20" ry="8"/>`
        + `<ellipse rx="20" ry="8" transform="rotate(60)"/><ellipse rx="20" ry="8" transform="rotate(-60)"/></g>`
        + `<circle r="4.5" fill="${f}"/>`,
      /* ⛔ REDESSINE LE 2026-09-22 : Phil a juge la premiere version faible, et il avait raison —
       *    deux courbes croisees sans BARREAUX rendaient un simple X, illisible comme ADN. Les
       *    montants sont plus fins, les barreaux font le motif, et l espacement est regulier. */
      adn: `<g fill="none" stroke="${f}" stroke-linecap="round"><g stroke-width="3.5">`
        + `<path d="M-8-21C6-14-6-7 8 0-6 7 6 14-8 21"/><path d="M8-21C-6-14 6-7-8 0 6 7-6 14 8 21"/></g>`
        + `<g stroke-width="3"><path d="M-6-16 6-16M-7-8 7-8M-7 8 7 8M-6 16 6 16"/></g></g>`,
      cadeau: `<g fill="none" stroke="${f}" stroke-width="4" stroke-linejoin="round">`
        + `<rect x="-17" y="-5" width="34" height="23" rx="3"/><path d="M-17 3h34M0-5v23"/>`
        + `<path d="M0-5c-4-12-14-12-14-6M0-5c4-12 14-12 14-6" stroke-linecap="round"/></g>`,
      ballon: `<g><ellipse cy="-6" rx="13" ry="15" fill="${f}"/>`
        + `<path d="M0 9v12" fill="none" stroke="${f}" stroke-width="3"/><path d="M-3.5 8h7L0 13Z" fill="${f}"/></g>`,
      bombe: `<g fill="${f}"><circle cx="-2" cy="6" r="14"/><rect x="5" y="-9" width="9" height="7" rx="2" transform="rotate(45 9 -5)"/></g>`
        + `<path d="M13-9q7-6 3-12" fill="none" stroke="${f}" stroke-width="3" stroke-linecap="round"/>`,
      cadenas: `<g fill="none" stroke="${f}" stroke-width="4.5" stroke-linejoin="round">`
        + `<rect x="-14" y="-2" width="28" height="21" rx="4"/><path d="M-8-2v-7a8 8 0 0 1 16 0v7"/></g>`
        + `<circle cy="8" r="3" fill="${f}"/>`,
      enveloppe: `<g fill="none" stroke="${f}" stroke-width="4" stroke-linejoin="round">`
        + `<rect x="-19" y="-13" width="38" height="26" rx="3"/><path d="M-19-11 0 3 19-11"/></g>`,
      casque: `<path d="M-17 7V-2a17 17 0 0 1 34 0v9" fill="none" stroke="${f}" stroke-width="4.5"/>`
        + `<g fill="${f}"><rect x="-21" y="4" width="9" height="16" rx="4"/><rect x="12" y="4" width="9" height="16" rx="4"/></g>`,
      camera: `<g fill="none" stroke="${f}" stroke-width="4" stroke-linejoin="round">`
        + `<rect x="-18" y="-9" width="36" height="24" rx="4"/><path d="M-7-9-4-15h8l3 6"/></g><circle cy="3" r="6" fill="${f}"/>`,
      /* ⛔ REDESSINE LE 2026-09-22 : la premiere version rendait un rectangle avec une ligne au
       *    milieu — ca pouvait etre une porte, une carte, n importe quoi. Ce qui fait un livre est
       *    le CREUX de la reliure et les pages qui remontent de chaque cote. Il est donc rempli,
       *    pas trace, et les deux pages se voient separement. */
      livre: `<g fill="${f}"><path d="M-2-14C-7-19-14-19-19-16v25c5-3 12-3 17 1V-14Z"/>`
        + `<path d="M2-14C7-19 14-19 19-16v25c-5-3-12-3-17 1V-14Z"/></g>`
        + `<g fill="none" stroke="#0b0d10" stroke-width="2.2" stroke-linecap="round">`
        + `<path d="M-15-11-6-9M-15-5-6-3M-15 1-6 3M15-11 6-9M15-5 6-3M15 1 6 3"/></g>`,
      crayon: `<g fill="${f}"><path d="M6-21 21-6 0 15-15 0Z"/><path d="M-15 0-20 20 0 15Z"/></g>`
        + `<path d="M-10 5-5 10" fill="none" stroke="#0b0d10" stroke-width="3"/>`,
      manette: `<g fill="${f}"><path d="M-14-6h28a10 10 0 0 1 8 15l-3 6a6 6 0 0 1-9 1l-4-4H-6l-4 4a6 6 0 0 1-9-1l-3-6a10 10 0 0 1 8-15Z"/></g>`
        + `<g fill="#0b0d10"><rect x="-12" y="1" width="10" height="3" rx="1.5"/><rect x="-8.5" y="-2.5" width="3" height="10" rx="1.5"/>`
        + `<circle cx="7" cy="3" r="2.5"/><circle cx="12" cy="-2" r="2.5"/></g>`,
      avion: `<path d="M0-20 4-2 21 4v4L4 5 3 17l6 4v3l-9-3-9 3v-3l6-4L-4 5-21 8V4L-4-2Z" fill="${f}"/>`,
      voiture: `<g fill="${f}"><path d="M-19 4-15-7a4 4 0 0 1 4-3h22a4 4 0 0 1 4 3L19 4v7a3 3 0 0 1-3 3h-2a5 5 0 0 0-10 0H-4a5 5 0 0 0-10 0h-2a3 3 0 0 1-3-3Z"/>`
        + `<circle cx="-9" cy="14" r="5"/><circle cx="9" cy="14" r="5"/></g>`
        + `<g fill="#0b0d10"><path d="M-12-6h9v7h-12ZM3-6h9l3 7H3Z"/></g>`,
      bateau: `<g fill="${f}"><path d="M-19 4h38l-6 11a4 4 0 0 1-3 2H-10a4 4 0 0 1-3-2Z"/>`
        + `<rect x="-2" y="-20" width="4" height="22"/><path d="M3-17 17 0H3Z"/><path d="M-4-11-16 0h12Z"/></g>`,
      maison: `<g fill="none" stroke="${f}" stroke-width="4" stroke-linejoin="round">`
        + `<path d="M-19 0 0-18 19 0v18H-19Z"/><path d="M-6 18V5h12v13"/></g>`,
      arbre: `<g fill="${f}"><circle cy="-6" r="13"/><circle cx="-9" cy="2" r="9"/><circle cx="9" cy="2" r="9"/>`
        + `<rect x="-3" y="4" width="6" height="16" rx="2"/></g>`,
      cactus: `<g fill="${f}"><rect x="-5" y="-18" width="10" height="38" rx="5"/>`
        + `<path d="M-5-6h-4a6 6 0 0 1-6-6v-3a3 3 0 0 1 6 0v3h4Z"/><path d="M5-1h4a6 6 0 0 0 6-6v-5a3 3 0 0 0-6 0v5H5Z"/></g>`,
      poisson: `<g fill="${f}"><path d="M-6 0C-6-9 2-14 10-14c7 0 11 6 11 14s-4 14-11 14C2 14-6 9-6 0Z"/>`
        + `<path d="M-6 0-21-12v24Z"/></g><circle cx="12" cy="-4" r="2.5" fill="#0b0d10"/>`,
      oiseau: `<g fill="none" stroke="${f}" stroke-width="5" stroke-linecap="round">`
        + `<path d="M-20 2q10-13 20 0"/><path d="M0 2q10-13 20 0"/></g>`,
      abeille: `<g><ellipse cx="1" cy="5" rx="13" ry="10" fill="${f}"/>`
        + `<g fill="#0b0d10"><path d="M-3-4h4v18h-4ZM5-3h4v15H5Z"/></g>`
        + `<g fill="${f}" opacity=".65"><ellipse cx="-5" cy="-8" rx="8" ry="5" transform="rotate(-25 -5 -8)"/>`
        + `<ellipse cx="7" cy="-9" rx="8" ry="5" transform="rotate(25 7 -9)"/></g></g>`,
      patte: `<g fill="${f}"><path d="M0 3c7 0 12 4 12 9s-5 7-12 7-12-2-12-7 5-9 12-9Z"/>`
        + `<circle cx="-13" cy="-4" r="5"/><circle cx="-5" cy="-12" r="5"/><circle cx="5" cy="-12" r="5"/><circle cx="13" cy="-4" r="5"/></g>`,
      trophee: `<g fill="none" stroke="${f}" stroke-width="4" stroke-linejoin="round">`
        + `<path d="M-11-18h22v8a11 11 0 0 1-22 0Z"/><path d="M-11-14h-6v4a6 6 0 0 0 6 6M11-14h6v4a6 6 0 0 1-6 6"/>`
        + `<path d="M0 1v8M-9 18h18l-2-9H-7Z"/></g>`,
      medaille: `<g fill="none" stroke="${f}" stroke-width="4" stroke-linejoin="round"><path d="M-10-20-2-4M10-20 2-4"/>`
        + `<circle cy="7" r="12"/></g><path d="M0 0 3 5H8L4 8 5 13 0 10-5 13-4 8-8 5H-3Z" fill="${f}"/>`,
      foot: `<g><circle r="18" fill="none" stroke="${f}" stroke-width="4"/>`
        + `<path d="M0-10 8-4 5 6H-5L-8-4Z" fill="${f}"/>`
        + `<path d="M0-18v8M-17-5-8-4M17-5 8-4M-10 17-5 6M10 17 5 6" fill="none" stroke="${f}" stroke-width="3.5"/></g>`,
      guitare: `<g fill="none" stroke="${f}" stroke-width="4" stroke-linejoin="round"><circle cy="10" r="10"/>`
        + `<circle cy="-3" r="7"/><path d="M0-10V-20M-4-21h8"/></g><circle cy="10" r="3.5" fill="${f}"/>`,
      baguette: `<g fill="${f}"><rect x="-3" y="-2" width="6" height="24" rx="3" transform="rotate(-30 0 10)"/>`
        + `<path d="M8-19 11-12 18-9 11-6 8 1 5-6-2-9 5-12Z"/></g>`,
      potion: `<g fill="none" stroke="${f}" stroke-width="4" stroke-linejoin="round">`
        + `<path d="M-5-19h10v7l7 13a11 11 0 0 1-24 0l7-13Z"/><path d="M-7-19h14"/></g>`
        + `<path d="M-9 4a11 11 0 0 0 18 0Z" fill="${f}"/>`,
      tornade: `<g fill="none" stroke="${f}" stroke-width="4" stroke-linecap="round">`
        + `<path d="M-19-14H19M-15-6H15M-10 2H10M-5 10H5M-2 18H2"/></g>`,
      volcan: `<g fill="${f}"><path d="M-20 17-8-4h16L20 17Z"/><path d="M-5-5c0-6 5-9 5-15 0 6 5 9 5 15Z"/></g>`,
      terre: `<g fill="none" stroke="${f}" stroke-width="4"><circle r="18"/>`
        + `<path d="M-18 0H18" stroke-width="3"/><path d="M0-18a26 26 0 0 1 0 36" stroke-width="3"/>`
        + `<path d="M0-18a26 26 0 0 0 0 36" stroke-width="3"/></g>`,
      flocon: `<g fill="none" stroke="${f}" stroke-width="4" stroke-linecap="round">`
        + [0, 60, 120].map((r) => `<g transform="rotate(${r})"><path d="M0-20V20"/>`
          + `<path d="M-6-14 0-20 6-14"/><path d="M-6 14 0 20 6 14"/></g>`).join('') + `</g>`,
      pomme: `<g fill="${f}"><path d="M0-9c4-4 12-4 14 3 2 8-4 20-8 22-3 1-4-1-6-1s-3 2-6 1c-4-2-10-14-8-22 2-7 10-7 14-3Z"/></g>`
        + `<path d="M0-9c0-6 4-10 8-11" fill="none" stroke="${f}" stroke-width="3" stroke-linecap="round"/>`,
      cerise: `<g fill="${f}"><circle cx="-7" cy="10" r="8"/><circle cx="9" cy="12" r="7"/></g>`
        + `<g fill="none" stroke="${f}" stroke-width="3" stroke-linecap="round"><path d="M-7 2C-7-8 0-14 6-18M9 5C9-4 4-12 6-18"/></g>`,
      pizza: `<g><path d="M0-20 19 14a40 40 0 0 1-38 0Z" fill="${f}"/>`
        + `<g fill="#0b0d10"><circle cx="-5" cy="2" r="3"/><circle cx="6" cy="4" r="3"/><circle cy="-6" r="2.5"/></g></g>`,
      glace: `<g fill="${f}"><circle cx="-5" cy="-8" r="7"/><circle cx="5" cy="-8" r="7"/>`
        + `<path d="M-11-4a11 11 0 0 1 22 0Z"/><path d="M-10-2h20L0 20Z"/></g>`,
      cafe: `<g fill="none" stroke="${f}" stroke-width="4" stroke-linejoin="round">`
        + `<path d="M-14-8h24v13a11 11 0 0 1-11 11h-2A11 11 0 0 1-14 5Z"/><path d="M10-3h5a5 5 0 0 1 0 10h-5"/></g>`
        + `<path d="M-6-14q3-4 0-7M2-14q3-4 0-7" fill="none" stroke="${f}" stroke-width="3" stroke-linecap="round"/>`,
      arcenciel: `<g fill="none" stroke="${f}" stroke-linecap="round" stroke-width="4">`
        + `<path d="M-19 14a19 19 0 0 1 38 0"/><path d="M-12 14a12 12 0 0 1 24 0"/><path d="M-5 14a5 5 0 0 1 10 0"/></g>`,
    }[o.facette]
    /* ⛔⛔ LES SILHOUETTES NOTO SONT CHERCHEES EN SECOND, ET C EST DELIBERE. Nos traces a nous
     *     gagnent toujours : si un nom existait des deux cotes, changer de gagnant changerait la
     *     tete de blocks DEJA GRAVES. L ordre est donc une garantie, pas une preference.
     * ⛔ `__F__` est remplace par la couleur d accent du createur : c est ce qui integre un dessin
     *    importe a NOTRE systeme de personnalisation, au lieu de plaquer une image figee.
     * ⛔ PROVENANCE : googlefonts/noto-emoji, 2D/svg, Apache-2.0 (licence lue le 2026-09-22, voir
     *    NOTICE.md). Rien ne part on-chain : la chaine ne grave que le NOM de la facette. */
      || (MOTIFS_NOTO[o.facette] ? MOTIFS_NOTO[o.facette].split('__F__').join(f) : null);
    return `<g transform="matrix(${m})">`
      + (d || `<text x="0" y="14" font-family="ui-sans-serif,sans-serif" font-size="46" font-weight="800" text-anchor="middle" fill="${f}">${L}</text>`)
      + `</g>`;
  };

  /* Les eclats : le meme cube, plus petit, qui s eloigne. Zero est un etat valide.
   * ⚠️ Chaque disposition est PURE et deterministe : le meme choix rend toujours le meme dessin.
   *    Un aleatoire, meme joli, rendrait le logo non reproductible — or il part dans les
   *    metadonnees, ou il est GRAVE. */
  const PLACES = {
    sillage: (i) => ({ x: 158 + i * 11, y: 34 - i * 11, s: 0.30 - i * 0.035, o: 1 - i * 0.13 }),
    couronne: (i, n) => { const a = Math.PI * (0.15 + 0.7 * (n === 1 ? 0.5 : i / (n - 1)));
      return { x: 100 - Math.cos(a) * 78, y: 44 - Math.sin(a) * 30, s: 0.26 - i * 0.012, o: 0.95 - i * 0.06 }; },
    essaim: (i) => { const a = (i * 137.5) * Math.PI / 180;
      const r = 74 + (i % 3) * 12;
      return { x: 100 + Math.cos(a) * r, y: 104 + Math.sin(a) * r * 0.62, s: 0.24 - (i % 3) * 0.04, o: 0.9 - i * 0.07 }; },
    chute: (i) => ({ x: 150 + i * 9, y: 150 + i * 12, s: 0.26 - i * 0.03, o: 0.92 - i * 0.12 }),
    coins: (i) => { const p = [[26, 26], [174, 26], [26, 196], [174, 196], [100, 14], [100, 208]][i % 6];
      return { x: p[0], y: p[1], s: 0.22 - (i > 3 ? 0.05 : 0), o: 0.9 }; },
    spirale: (i) => { const a = (i * 137.5) * Math.PI / 180, r = 46 + i * 15;
      return { x: 100 + Math.cos(a) * r, y: 104 + Math.sin(a) * r * 0.6, s: 0.30 - i * 0.03, o: 1 - i * 0.11 }; },
    colonne: (i) => ({ x: 100, y: 26 - i * 0, s: 0.20 - i * 0.02, o: 0.95 - i * 0.1,
      /* ⚠️ decale horizontalement en alternance, sinon les eclats se superposent EXACTEMENT et
       *    « 6 eclats » se dessine comme un seul — un reglage qui ne change rien a l ecran. */
      ...{ x: 100 + (i % 2 ? 26 : -26) * Math.ceil(i / 2) * 0.7, y: 30 + i * 4 } }),
    ailes: (i) => { const cote = i % 2 ? 1 : -1, rang = Math.floor(i / 2);
      return { x: 100 + cote * (58 + rang * 26), y: 96 + rang * 16, s: 0.26 - rang * 0.05, o: 0.95 - rang * 0.15 }; },
    ronde: (i, n) => { const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
      return { x: 100 + Math.cos(a) * 80, y: 106 + Math.sin(a) * 52, s: 0.22, o: 0.92 }; },
    diagonale: (i) => ({ x: 22 + i * 28, y: 200 - i * 30, s: 0.24 - i * 0.02, o: 0.95 - i * 0.09 }),
    /* ── ajoutees le 2026-09-13 ; pensees pour 12 eclats, bornees dans le cadre plus bas ── */
    vortex: (i) => { const a = i * 0.9, r = 30 + i * 7;
      return { x: 100 + Math.cos(a) * r, y: 106 + Math.sin(a) * r * 0.7, s: 0.12 + i * 0.012, o: 0.5 + i * 0.04 }; },
    pluie: (i) => ({ x: 18 + ((i * 47) % 164), y: 16 + ((i * 29) % 60), s: 0.14, o: 0.85 - (i % 4) * 0.12 }),
    constellation: (i) => { const p = [[30, 30], [66, 18], [134, 22], [170, 40], [184, 110], [172, 186],
      [130, 206], [70, 204], [26, 184], [14, 112], [100, 12], [100, 212]][i % 12];
      return { x: p[0], y: p[1], s: 0.1 + (i % 3) * 0.04, o: 0.95 }; },
    halo: (i, n) => { const a = (i / Math.max(1, n)) * Math.PI * 2;
      return { x: 100 + Math.cos(a) * 62, y: 28 + Math.sin(a) * 14, s: 0.13, o: 0.9 }; },
    escalier: (i) => ({ x: 24 + i * 15, y: 196 - i * 15, s: 0.18, o: 0.95 - i * 0.05 }),
    ellipse: (i, n) => { const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.4;
      return { x: 100 + Math.cos(a) * 90, y: 110 + Math.sin(a) * 92, s: 0.16, o: 0.9 }; },
  };
  const place = PLACES[o.orbite] || PLACES.sillage;
  /* ⛔ L ECART S APPLIQUE A UN SEUL ENDROIT : le vecteur qui va du CENTRE DU BLOC vers l eclat.
   * ⚠️ Valeurs 5 a 8 AJOUTEES A LA FIN le 2026-09-13 : les indices 0 a 4 ne bougent pas. */
  const ECARTS = [0.55, 0.78, 1, 1.28, 1.6, 1.9, 2.2, 2.5, 2.8];
  const k = ECARTS[Math.max(0, Math.min(8, Number(o.ecart) ?? 2))] ?? 1;
  let frag = '';
  for (let i = 0; i < eclats; i++) {
    const p0 = place(i, eclats);
    const dans = (v, min, max) => Math.max(min, Math.min(max, v));
    const p = k === 1 ? p0 : { ...p0,
      x: dans(100 + (p0.x - 100) * k, 12, 188),
      y: dans(104 + (p0.y - 104) * k, 12, 208) };
    /* ⛔ AU-DELA DE 1.6, LES ECLATS BUTENT SUR LE CADRE : mesure du 2026-09-13, `sillage` a ecart 7 et 8
     * rendait le MEME dessin — un cran de curseur qui ne change rien. Ils RAPETISSENT donc aussi en
     * s eloignant. Jusqu a 1.6 (toutes les valeurs d avant), rien ne change. */
    const s = k > 1.6 ? p.s * 1.6 / k : p.s, x = p.x, y = p.y;
    frag += `<g transform="translate(${x.toFixed(1)} ${Math.max(4, y).toFixed(1)}) scale(${Math.max(0.08, s).toFixed(3)})" opacity="${Math.max(0.15, p.o).toFixed(2)}">`
      + `<path d="M0-40 46-13 0 13-46-13Z" fill="${c(70, 62)}"/>`
      + `<path d="M-46-13 0 13 0 66-46 40Z" fill="${c(75, 44)}"/>`
      + `<path d="M46-13 0 13 0 66 46 40Z" fill="${c(78, 32)}"/>`
      + `<path d="M0-40 46-13 46 40 0 66-46 40-46-13Z" fill="none" stroke="${ca(90, 72)}" stroke-width="5" stroke-linejoin="round"/></g>`;
  }

  /* ⛔ L IDENTIFIANT DU clipPath NE DEPEND QUE DE LA FACE, ET C EST VOULU : la collision entre deux
   * blocks qui utilisent la meme face est INOFFENSIVE (le decoupage est identique), tandis qu un
   * identifiant unique par rendu casserait la REPRODUCTIBILITE — or le SVG est GRAVE. */
  const FACES = {
    haut: { d: 'M100 30 170 70 100 110 30 70Z', x: 30, y: 30, w: 140, h: 80 },
    gauche: { d: 'M30 70 100 110 100 190 30 150Z', x: 30, y: 70, w: 70, h: 120 },
    droite: { d: 'M170 70 100 110 100 190 170 150Z', x: 100, y: 70, w: 70, h: 120 },
  };
  const face = FACES[o.photoOu];
  const photo = typeof o.photo === 'string' && o.photo.startsWith('data:image/') ? o.photo : null;
  const surFace = face && photo
    ? `<clipPath id="tbf-${o.photoOu}"><path d="${face.d}"/></clipPath>`
      + `<image href="${photo}" x="${face.x}" y="${face.y}" width="${face.w}" height="${face.h}"`
      + ` preserveAspectRatio="xMidYMid slice" clip-path="url(#tbf-${o.photoOu})"/>`
      + `<path d="${face.d}" fill="none" stroke="${ca(90, 70)}" stroke-width="2" stroke-linejoin="round" opacity=".9"/>`
    : '';

  /* ⛔ NOMMEE `COINS` ET PAS `ORNEMENTS`, ET LA VALEUR `motifCoin` ET PAS `motif` : il existe DEJA
   *    un `const motif` dans cette meme fonction. Deux `const` du meme nom dans la meme portee,
   *    c est une SyntaxError — la page entiere n aurait pas demarre. */
  const COINS = {
    aucun: '',
    points: '<circle cx="0" cy="0" r="5"/>',
    equerres: '<path d="M0 22 L0 0 L22 0" fill="none" stroke-width="5" stroke-linecap="round"/>',
    griffes: '<path d="M2 26 L2 2 L26 2" fill="none" stroke-width="4" stroke-linecap="round"/><circle cx="2" cy="2" r="3.5" stroke="none"/>',
    arcs: '<path d="M0 26 A26 26 0 0 1 26 0" fill="none" stroke-width="5" stroke-linecap="round"/>',
    croix: '<path d="M-8 0 H8 M0 -8 V8" fill="none" stroke-width="5" stroke-linecap="round"/>',
    chevrons: '<path d="M18 4 L4 4 L4 18" fill="none" stroke-width="5" stroke-linecap="round"/><path d="M26 12 L12 12 L12 26" fill="none" stroke-width="4" stroke-linecap="round" opacity="0.55"/>',
    etoiles: '<path d="M0-11 3-3 11 0 3 3 0 11-3 3-11 0-3-3Z"/>',
    /* ── ajoutes le 2026-09-13 ── */
    cercles: '<circle cx="6" cy="6" r="7" fill="none" stroke-width="3"/><circle cx="6" cy="6" r="2.5" stroke="none"/>',
    losanges: '<path d="M8-2 18 8 8 18-2 8Z" stroke="none"/>',
    fleurs: '<g stroke="none"><circle cx="8" cy="0" r="4.5"/><circle cx="0" cy="8" r="4.5"/><circle cx="16" cy="8" r="4.5"/><circle cx="8" cy="16" r="4.5"/></g><circle cx="8" cy="8" r="3" fill="#fff" stroke="none"/>',
    eclairs: '<path d="M10-4 0 10H7L3 24 16 6H9Z" stroke="none"/>',
    lignes: '<path d="M0 6H28M0 14H20M0 22H12" fill="none" stroke-width="3" stroke-linecap="round"/>',
    cadre: '<path d="M0 60 L0 0 L60 0" fill="none" stroke-width="3" stroke-linecap="round"/><path d="M8 40 L8 8 L40 8" fill="none" stroke-width="1.5" opacity="0.6"/>',
    ondes: '<path d="M0 18A18 18 0 0 1 18 0M0 30A30 30 0 0 1 30 0" fill="none" stroke-width="3" stroke-linecap="round"/>',
    pixels: '<g stroke="none"><rect x="0" y="0" width="7" height="7"/><rect x="10" y="0" width="7" height="7" opacity=".6"/><rect x="0" y="10" width="7" height="7" opacity=".6"/><rect x="10" y="10" width="7" height="7" opacity=".3"/></g>',
    coeurs: '<path d="M9 18 1 10A5 5 0 0 1 9 3 5 5 0 0 1 17 10Z" stroke="none"/>',
    lunes: '<path d="M12 0A12 12 0 1 0 12 24 9 9 0 1 1 12 0Z" stroke="none"/>',
    soleils: '<circle cx="10" cy="10" r="5" stroke="none"/><path d="M10-1V3M10 17V21M-1 10H3M17 10H21M2 2 5 5M15 15 18 18M2 18 5 15M15 5 18 2" fill="none" stroke-width="2.5" stroke-linecap="round"/>',
    couronnes: '<path d="M0 16V2L6 9 11 0 16 9 22 2V16Z" stroke="none"/>',
  };
  const motifCoin = COINS[o.ornement] ?? '';
  const coins = !motifCoin ? '' : '<g fill="' + ca(85, 66) + '" stroke="' + ca(85, 66) + '" opacity="0.85">'
    + [[16, 16, 1, 1], [184, 16, -1, 1], [16, 204, 1, -1], [184, 204, -1, -1]]
      .map(([x, y, sx, sy]) => `<g transform="translate(${x} ${y}) scale(${sx} ${sy})">${motifCoin}</g>`).join('')
    + '</g>';

  /* ⛔ ET LE DEFAUT DOIT RENDRE EXACTEMENT L ANCIEN DESSIN : les blocs deja graves ont ete crees
   *    sans ce champ, et leur logo ne doit pas se mettre a differer du jour ou on ajoute une
   *    option. Les valeurs de « verre » sont donc celles d avant, au chiffre pres.
   * ⚠️ `epInt` est ECRIT, PAS CALCULE : `ep * 0.87` donnait 1.31 la ou l original valait 1.3. */
  const MATIERES = {
    verre: { haut: c(75, 52, .72), gauche: c(78, 42, .68), droite: c(80, 30, .7), fond: c(80, 8),
      trait: '#eaf6ff', ep: 1.5, epInt: 1.3, lustre: true },
    plein: { haut: c(85, 58), gauche: c(88, 40), droite: c(90, 26), fond: c(70, 6),
      trait: '#0b1020', ep: 2, epInt: 1.6, lustre: false },
    /* ⛔ « fil » n a AUCUN remplissage : sans lustre, le cube serait recouvert d un voile blanc
     *    qui le rendrait plein — c est-a-dire exactement ce qu il n est pas. */
    fil: { haut: 'none', gauche: 'none', droite: 'none', fond: c(85, 5),
      trait: ca(92, 66), ep: 2, epInt: 1.6, lustre: false },
    neon: { haut: c(90, 14, .5), gauche: c(90, 10, .5), droite: c(90, 8, .5), fond: 'hsl(0 0% 4%)',
      trait: ca(100, 62), ep: 3, epInt: 2.2, lustre: false },
    papier: { haut: c(18, 92), gauche: c(20, 82), droite: c(22, 72), fond: c(15, 96),
      trait: c(45, 28), ep: 1.6, epInt: 1.2, lustre: false },
    encre: { haut: 'hsl(0 0% 96%)', gauche: 'hsl(0 0% 88%)', droite: 'hsl(0 0% 78%)', fond: 'hsl(0 0% 100%)',
      trait: 'hsl(0 0% 6%)', ep: 3.4, epInt: 2.4, lustre: false },
    chrome: { haut: c(6, 88), gauche: c(8, 62), droite: c(10, 40), fond: c(10, 12),
      trait: c(4, 98), ep: 2, epInt: 1.5, lustre: true },
    braise: { haut: c(95, 46), gauche: c(98, 26), droite: c(100, 16), fond: c(90, 4),
      trait: ca(100, 70), ep: 2.4, epInt: 1.8, lustre: false },
    givre: { haut: c(30, 78, .55), gauche: c(34, 66, .5), droite: c(38, 54, .5), fond: c(40, 14),
      trait: c(20, 96), ep: 1.4, epInt: 1.1, lustre: true },
    /* ── ajoutees le 2026-09-13 ── */
    or: { haut: 'hsl(46 90% 62%)', gauche: 'hsl(40 85% 44%)', droite: 'hsl(34 80% 30%)', fond: c(40, 7),
      trait: 'hsl(50 100% 88%)', ep: 2, epInt: 1.5, lustre: true },
    holo: { haut: c(90, 70, .75), gauche: ca(90, 60), droite: `hsl(${(h + 180) % 360} 90% 55%)`, fond: 'hsl(250 30% 8%)',
      trait: '#ffffff', ep: 1.6, epInt: 1.2, lustre: true },
    nuit: { haut: c(60, 18), gauche: c(60, 12), droite: c(60, 8), fond: 'hsl(230 40% 3%)',
      trait: ca(80, 60), ep: 1.4, epInt: 1, lustre: false },
    acide: { haut: 'hsl(90 100% 55%)', gauche: c(100, 45), droite: ca(100, 35), fond: 'hsl(0 0% 3%)',
      trait: 'hsl(90 100% 85%)', ep: 2.6, epInt: 2, lustre: false },
    ombre: { haut: 'hsl(0 0% 22%)', gauche: 'hsl(0 0% 14%)', droite: 'hsl(0 0% 8%)', fond: 'hsl(0 0% 2%)',
      trait: ca(70, 55), ep: 2, epInt: 1.4, lustre: false },
    rose: { haut: 'hsl(330 80% 80%)', gauche: 'hsl(335 70% 68%)', droite: 'hsl(340 60% 56%)', fond: 'hsl(330 40% 95%)',
      trait: 'hsl(330 50% 30%)', ep: 1.8, epInt: 1.3, lustre: true },
  };
  const M = MATIERES[o.matiere] || MATIERES.verre;

  /* ⛔⛔ LE MODELE 3D DE LA MAP (2026-09-19) lit les MEMES couleurs et le MEME motif que le logo grave — une seule source.
   *    Branche privee (`_modele`) : le SVG grave, lui, sort plus bas sans avoir change d un caractere (test golden). */
  if (o._modele === true) {
    const plat = (f) => motif('1 0 0 1 0 0', f);
    return {
      haut: M.haut, gauche: M.gauche, droite: M.droite, trait: M.trait, ep: M.ep, lustre: M.lustre, division: n,
      motifs: { haut: plat(ca(92, 56)), gauche: plat(ca(90, 48)), droite: plat(ca(88, 38)) },
      eclats, eclat: { haut: c(70, 62), gauche: c(75, 44), droite: c(78, 32), trait: ca(90, 72) },
      coin: motifCoin, coinCouleur: ca(85, 66),
    };
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220"><rect width="200" height="220" fill="${M.fond}"/>`
    + coins
    + `<path d="M100 30 170 70 100 110 30 70Z" fill="${M.haut}"/>`
    + `<path d="M30 70 100 110 100 190 30 150Z" fill="${M.gauche}"/>`
    + `<path d="M170 70 100 110 100 190 170 150Z" fill="${M.droite}"/>`
    + (grille ? `<path d="${grille}" fill="none" stroke="#cfe6ff" stroke-width="1" opacity=".32"/>` : '')
    /* ⛔ LA PHOTO REMPLACE LE MOTIF DE SA FACE, elle ne se pose pas DESSUS. */
    + (o.photoOu === 'haut' && surFace ? '' : motif('.866 .5 -.866 .5 100 70', ca(92, 56)))
    + (o.photoOu === 'gauche' && surFace ? '' : motif('.866 .5 0 1 65 130', ca(90, 48)))
    + (o.photoOu === 'droite' && surFace ? '' : motif('.866 -.5 0 1 135 130', ca(88, 38)))
    + surFace
    + (M.lustre ? `<path d="M100 30 170 70 100 110 30 70Z" fill="#fff" opacity=".10"/>` : '')
    + `<g fill="none" stroke="${M.trait}" stroke-width="${M.ep}" stroke-linejoin="round">`
    + `<path d="M100 30 170 70 170 150 100 190 30 150 30 70Z"/>`
    + `<path d="M100 110 30 70 M100 110 170 70 M100 110 100 190" stroke-width="${M.epInt}" opacity=".85"/></g>`
    + frag + `</svg>`;
}
