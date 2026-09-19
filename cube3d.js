// cube3d.js — le block de la map en VOLUME : un cube qui tourne sur lui-meme, ses eclats en orbite comme des satellites.
// ================================================================================================================
// ⛔ PHIL (2026-09-19) : « rends les blocks en 3D, le block tourne sur lui-meme en libre mouvement x y z avec son logo ;
//    le fond blanc casse la galaxie ; les petits elements exterieurs tournent autour du block comme planete et satellites ».
// ⛔ UNE SEULE SOURCE DE VERITE : couleurs, motif et eclats viennent de `modeleFace` (logo.js), la meme fonction que le
//    logo GRAVE. Le cube de la map ne peut donc pas contredire l image du block.
// ⛔ AUCUN FOND : le logo grave a un rectangle de fond (blanc pour papier / encre / rose) ; le cube n en a pas — la galaxie
//    se voit autour de lui.
// ⛔ CSS 3D PUR, aucun WebGL : 6 faces + au plus 2 satellites par block (perf, 2026-09-19), animes par le compositeur du navigateur.
//    Mouvement reduit : aucune rotation, aucune orbite (le cube reste pose en 3/4).
// ⚠️ Les tailles sont en unites de conteneur (cqw) : le cube suit la taille de sa tuile sans qu on la lui repasse.
import { modeleFace } from './logo.js';

/** Nombre pseudo-aleatoire DETERMINISTE depuis l adresse : chaque block tourne toujours de la meme facon. */
function graine(adr, i) {
  const s = String(adr || '').toLowerCase() + ':' + i;
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

const face = (cls, fond, trait, ep, motif) => '<div class="c3f ' + cls + '" style="background:' + (fond === 'none' ? 'transparent' : fond)
  + ';border:' + Math.max(1, ep * 0.6).toFixed(1) + 'px solid ' + trait + '">'
  + (motif ? '<svg viewBox="-26 -26 52 52" aria-hidden="true">' + motif + '</svg>' : '') + '</div>';

/**
 * Le HTML d un cube 3D pour la map.
 * @param {object} params  parametres du logo (paramsLogoDepuisApparence)
 * @param {string} adr     adresse du block (rotation deterministe)
 */
export function cube3dHtml(params, adr) {
  let m;
  try { m = modeleFace(params); } catch (_) { m = null; }
  if (!m || typeof m !== 'object') return '';
  /* axe de rotation libre (x, y, z), vitesse et sens : propres a chaque block */
  const vx = (graine(adr, 1) * 2 - 1).toFixed(3), vy = (0.4 + graine(adr, 2)).toFixed(3), vz = (graine(adr, 3) * 2 - 1).toFixed(3);
  const duree = (14 + graine(adr, 4) * 16).toFixed(1);
  const sens = graine(adr, 5) < 0.5 ? 'normal' : 'reverse';
  const faces = face('av', m.gauche, m.trait, m.ep, m.motifs.gauche)
    + face('ar', m.gauche, m.trait, m.ep, m.motifs.gauche)
    + face('dr', m.droite, m.trait, m.ep, m.motifs.droite)
    + face('ga', m.droite, m.trait, m.ep, m.motifs.droite)
    + face('ha', m.haut, m.trait, m.ep, m.motifs.haut)
    + face('ba', m.haut, m.trait, m.ep, m.motifs.haut);
  /* les satellites : les eclats du logo (petits cubes a sa couleur), puis l ornement s il y en a un ; 2 au plus */
  const sats = [];
  const nEclats = Math.min(2, Number(m.eclats) || 0);
  for (let i = 0; i < nEclats; i++) sats.push({ genre: 'eclat' });
  if (m.coin && sats.length < 2) sats.push({ genre: 'coin' });
  const orbites = sats.map((s, i) => {
    const incl = (55 + graine(adr, 10 + i) * 50).toFixed(0);
    const tour = (graine(adr, 20 + i) * 360).toFixed(0);
    const rayon = (46 + i * 7 + graine(adr, 30 + i) * 6).toFixed(1);
    const d = (7 + i * 3 + graine(adr, 40 + i) * 5).toFixed(1);
    const corps = s.genre === 'eclat'
      ? '<i class="c3s" style="background:linear-gradient(135deg,' + m.eclat.haut + ',' + m.eclat.droite + ');border-color:' + m.eclat.trait + '"></i>'
      : '<i class="c3s c3c" style="color:' + m.coinCouleur + '"><svg viewBox="-14 -14 40 40" fill="currentColor" stroke="currentColor">' + m.coin + '</svg></i>';
    return '<div class="c3o" style="--incl:' + incl + 'deg;--tour:' + tour + 'deg;--rayon:' + rayon + 'cqw;--d:' + d + 's">'
      + '<div class="c3p">' + corps + '</div></div>';
  }).join('');
  return '<div class="c3" aria-hidden="true"><div class="c3t">'
    + '<div class="c3r" style="--vx:' + vx + ';--vy:' + vy + ';--vz:' + vz + ';--d:' + duree + 's;animation-direction:' + sens + '">'
    + faces + '</div>' + orbites + '</div></div>';
}

/** La feuille de style du cube (injectee une fois). */
export const CUBE3D_CSS = `
.c3{position:absolute;inset:0 0 12% 0;perspective:420px;pointer-events:none;container-type:size}
.c3t{position:absolute;inset:0;transform-style:preserve-3d;transform:rotateX(-22deg) rotateY(34deg)}
.c3r{position:absolute;left:50%;top:50%;width:0;height:0;transform-style:preserve-3d;
  animation:c3tourne var(--d) linear infinite}
@keyframes c3tourne{from{transform:rotate3d(var(--vx),var(--vy),var(--vz),0deg)}to{transform:rotate3d(var(--vx),var(--vy),var(--vz),360deg)}}
.c3f{position:absolute;left:-28cqmin;top:-28cqmin;width:56cqmin;height:56cqmin;box-sizing:border-box;border-radius:3px;
  display:flex;align-items:center;justify-content:center;backface-visibility:visible}
.c3f svg{width:62%;height:62%}
.c3f.av{transform:translateZ(28cqmin)}
.c3f.ar{transform:rotateY(180deg) translateZ(28cqmin)}
.c3f.dr{transform:rotateY(90deg) translateZ(28cqmin)}
.c3f.ga{transform:rotateY(-90deg) translateZ(28cqmin)}
.c3f.ha{transform:rotateX(90deg) translateZ(28cqmin)}
.c3f.ba{transform:rotateX(-90deg) translateZ(28cqmin)}
.c3o{position:absolute;left:50%;top:50%;width:0;height:0;transform-style:preserve-3d;
  transform:rotateX(var(--incl)) rotateZ(var(--tour));animation:c3orbite var(--d) linear infinite}
@keyframes c3orbite{from{transform:rotateX(var(--incl)) rotateZ(var(--tour))}to{transform:rotateX(var(--incl)) rotateZ(calc(var(--tour) + 360deg))}}
.c3p{position:absolute;transform:translateX(var(--rayon))}
.c3s{display:block;width:11cqmin;height:11cqmin;margin:-5.5cqmin 0 0 -5.5cqmin;border:1px solid;border-radius:2px;
}
.c3s.c3c{background:none;border:0;box-shadow:none;width:13cqmin;height:13cqmin}
.c3s.c3c svg{width:100%;height:100%}
@media (prefers-reduced-motion: reduce){.c3r,.c3o{animation:none}}
/* ⛔ MELANGE 3D / 2D (Phil : « fais un melange 3D 2D qui passe bien pour optimiser les fps ») : un block petit a l ecran
   (classe « loin », posee par map3d) devient UNE face plate, de face, avec son logo — 1 element peint au lieu de 6,
   aucune rotation, aucun satellite. Seuls les blocks proches sont en volume. */
.bloc.loin .c3{perspective:none}
.bloc.loin .c3t{transform:none}
.bloc.loin .c3r{animation:none;transform:none}
.bloc.loin .c3f:not(.av){display:none}
.bloc.loin .c3f.av{transform:none;border-radius:4px}
.bloc.loin .c3o{display:none}
`;
