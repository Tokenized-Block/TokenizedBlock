// map3d.js — la map en VRAIE 3D : un cube geant qui contient tous les blocks vivants, qu on tourne, zoome et deplace.
// ================================================================================================
// ⛔ DEMANDE DE PHIL (2026-09-16) : « la carte on peut la tourner en 3D, ajoute de la profondeur ; la camera est deja dans
//    le cube, il faut beaucoup dezoomer pour voir le cube ; accueillir TOUS les blocks vivants ; voir toutes les connexions
//    en live ; couvrir toute la surface ; il n y a pas de rotation, fais-le bien ».
// ⇒ Projection perspective faite ICI (pas de CSS 3D, pas de bibliotheque) : chaque block a une position (wx, wy, wz) dans
//   un cube [-S, S]^3 ; la camera tourne autour du centre (yaw, pitch), recule (dist) et se decale a l ecran (ox, oy).
//   Les tuiles restent des boutons du DOM (clic, accessibilite) : on leur donne position, echelle, profondeur (z-index)
//   et opacite. Le cube, les liens et les impulsions sont dessines dans UNE couche SVG a la taille de la fenetre.
// ⛔ LES LIENS ET IMPULSIONS NE MONTRENT QUE DES EVENEMENTS LUS (l appelant les fournit) — rien n est invente ici.
// ⛔ PAS DE RESEAU, PAS DE CHAINE : ce module ne fait que dessiner.

/* tip 0026 (Phil « augmente les limites du cube, agrandis-le ») : 520 -> 1000 ; les tuiles gardent leur taille a l ecran (k x S/520) */
export const DEMI_COTE = 1000;
const LIEN_VIE_MS = 10 * 60 * 1000;
const ROT_AUTO = 0.0014;

export function creerMoteur3D({ map, habitants, enTexte, mouvementReduit = false }) {
  const S = DEMI_COTE;
  /* tip 0026 (Phil « un GROS CUBE, pas un rectangle ») : cote egal sur les trois axes */
  const SX = S, SY = S, SZ = S;
  /* zoom avant jusque DANS le cube (Phil « tu te balades dans la map, visite ») : les blocks derriere la camera sont caches */
  /* dezoom maximum = le cube entier qui REMPLIT la fenetre (Phil « prends l espace, dezoom a fond ») : il ne redevient jamais minuscule */
  const cam = { yaw: 0.65, pitch: -0.42, dist: 0, ox: 0, oy: 0, auto: !mouvementReduit, touchee: false, cible: null, pret: false };
  let effets = [];
  let liens = [];
  let glisse = false;
  /* etoiles : directions sur la sphere, graine fixe (meme ciel chez tout le monde), taille et eclat varies */
  const ETOILES = [];
  {
    let g = 20260916;
    const rnd = () => { g = (g * 1664525 + 1013904223) % 4294967296; return g / 4294967296; };
    for (let i = 0; i < 260; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      ETOILES.push([r * Math.cos(a), u, r * Math.sin(a), (0.5 + rnd() * 1.3).toFixed(1), (0.25 + rnd() * 0.6).toFixed(2)]);
    }
  }

  map.classList.add('a3d');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'map3dFx');
  map.appendChild(svg);
  const ui = document.createElement('div');
  ui.className = 'mapZoom';
  ui.innerHTML = '<button type="button" data-cam="plus" aria-label="Zoom in" title="Zoom in">+</button>'
    + '<button type="button" data-cam="moins" aria-label="Zoom out" title="Zoom out">−</button>'
    + '<button type="button" data-cam="tout" aria-label="See the whole cube" title="See the whole cube">⤢</button>'
    + '<button type="button" data-cam="auto" aria-label="Auto-rotate" title="Auto-rotate on / off">⟳</button>';
  map.appendChild(ui);
  const compteur = document.createElement('div');
  compteur.className = 'mapAide';
  compteur.textContent = 'Drag to rotate · scroll or pinch to fly in · right-drag or two fingers to move';
  map.appendChild(compteur);

  const taille = () => ({ L: map.clientWidth, H: map.clientHeight });
  const focale = (L, H) => 1.1 * Math.min(L, H);
  /* tip 0026 (Phil « agrandis de base le cube, c est trop petit ») : la distance de depart est CALCULEE pour que les 8 coins
   * projetes remplissent ~94 % de la fenetre (largeur ET hauteur), mesuree sur l angle le plus large du tour (45°).
   * Une formule sur le rayon laissait le cube a la moitie de l ecran (vu en test, fenetre 1568x670). */
  const distTout = (L, H) => {
    if (!(L > 0 && H > 0)) return S * 6;
    const f = focale(L, H), pitch = -0.42;
    const tient = (d) => {
      for (const yaw of [0.65, Math.PI / 4]) {
        const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
        for (const x of [-SX, SX]) for (const y of [-SY, SY]) for (const z of [-SZ, SZ]) {
          const x1 = x * cy - z * sy, z1 = x * sy + z * cy, y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
          const zc = z2 + d;
          if (zc < 40) return false;
          if (Math.abs(x1 * f / zc) > L * 0.47 || Math.abs(y2 * f / zc) > H * 0.47) return false;
        }
      }
      return true;
    };
    let lo = SX * 1.2, hi = S * 60;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (tient(mid)) hi = mid; else lo = mid; }
    return hi;
  };

  function vueDeDepart(doux) {
    const { L, H } = taille();
    const c = { yaw: 0.65, pitch: -0.42, dist: distTout(L, H), ox: 0, oy: 0 };
    if (doux && !mouvementReduit) cam.cible = c; else { Object.assign(cam, c); cam.cible = null; }
    cam.auto = !mouvementReduit;
  }

  function tourner(x, y, z) {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    return [x1, y2, z2];
  }
  function projeter(x, y, z, L, H) {
    const [x1, y2, z2] = tourner(x, y, z);
    const zc = z2 + cam.dist;
    if (zc < 40) return null;
    const f = focale(L, H);
    return { sx: L / 2 + cam.ox + x1 * f / zc, sy: H / 2 + cam.oy + y2 * f / zc, zc, z2, k: f / zc };
  }

  /** place un block neuf dans le cube (position et derive 3D) */
  function placer(h) {
    const m = h.t * 0.8;
    h.wx = (Math.random() * 2 - 1) * (SX - m);
    h.wy = (Math.random() * 2 - 1) * (SY - m);
    h.wz = (Math.random() * 2 - 1) * (SZ - m);
    h.vz = (Math.random() - 0.5) * 0.22;
    h._op = -1;
  }

  function vers(h, L, H) {
    const cx = L >= 700 ? (L - 380) / 2 : L / 2, cy = L >= 700 ? H / 2 : H * 0.28;
    const distNeuve = Math.min(cam.dist, distTout(L, H) * 0.5);
    const [x1, y2, z2] = tourner(h.wx, h.wy, h.wz);
    const zc = z2 + distNeuve, f = focale(L, H);
    return { yaw: cam.yaw, pitch: cam.pitch, dist: distNeuve, ox: cx - L / 2 - x1 * f / zc, oy: cy - H / 2 - y2 * f / zc };
  }
  function centrerSur(h) {
    if (!h) return;
    const { L, H } = taille();
    if (L <= 0 || H <= 0) return;
    cam.auto = false; cam.touchee = true;
    const c = vers(h, L, H);
    if (mouvementReduit) { Object.assign(cam, c); cam.cible = null; } else cam.cible = c;
  }

  function lien(de, a, couleur) {
    if (!de || !a || de === a) return;
    const k = de.adr + '>' + a.adr;
    liens = liens.filter((x) => x.k !== k);
    liens.push({ k, de, a, couleur, t0: performance.now() });
    if (liens.length > 400) liens = liens.slice(-400);
  }
  function impulsion(de, a, couleur) {
    if (!de || !a || de === a) return;
    lien(de, a, couleur);
    if (!mouvementReduit) effets.push({ genre: 'IMPULSION', de, a, couleur, t0: performance.now(), duree: 1800 });
  }
  function onde(h, couleur, etiquette) {
    if (!h || mouvementReduit) return;
    effets.push({ genre: 'ONDE', h, couleur, etiquette: etiquette || '', t0: performance.now(), duree: 1600 });
  }

  /** une image : derive 3D, camera, tuiles, cube, liens, effets */
  function image(maintenant) {
    const { L, H } = taille();
    if (L <= 0 || H <= 0) return;
    /* premiere image, ou fenetre redimensionnee sans que l utilisateur ait touche la camera : on recadre le cube entier */
    if (!cam.pret || (!cam.touchee && (cam.L !== L || cam.H !== H))) { vueDeDepart(false); cam.pret = true; }
    cam.L = L; cam.H = H;
    /* lisible pour les verifications (DevTools) : distance et taille de fenetre utilisees */
    const trace = Math.round(cam.dist) + "@" + L + "x" + H;
    if (map.dataset.cam !== trace) map.dataset.cam = trace;
    if (cam.auto && !cam.cible) cam.yaw += ROT_AUTO;
    if (cam.cible) {
      const c = cam.cible, q = 0.14;
      for (const key of ['yaw', 'pitch', 'dist', 'ox', 'oy']) cam[key] += (c[key] - cam[key]) * q;
      if (Math.abs(c.dist - cam.dist) < 1 && Math.abs(c.ox - cam.ox) < 0.5 && Math.abs(c.oy - cam.oy) < 0.5 && Math.abs(c.yaw - cam.yaw) < 0.001) {
        Object.assign(cam, c); cam.cible = null;
      }
    }
    const f = focale(L, H), R = Math.hypot(SX, SY, SZ);
    for (const h of habitants) {
      if (h.wx === undefined) placer(h);
      /* derive : vx/vy viennent du cerveau (battre), vz est la profondeur ; x3 pour que le mouvement se voie dans un grand cube */
      h.wx += h.vx * 3; h.wy += h.vy * 3; h.wz += (h.vz || 0) * 3;
      const m = h.t * 0.8;
      if (Math.abs(h.wx) > SX - m) { h.vx = -Math.sign(h.wx) * Math.abs(h.vx); h.wx = Math.sign(h.wx) * (SX - m); }
      if (Math.abs(h.wy) > SY - m) { h.vy = -Math.sign(h.wy) * Math.abs(h.vy); h.wy = Math.sign(h.wy) * (SY - m); }
      if (Math.abs(h.wz) > SZ - m) { h.vz = -Math.sign(h.wz) * Math.abs(h.vz || 0.1); h.wz = Math.sign(h.wz) * (SZ - m); }
      const p = projeter(h.wx, h.wy, h.wz, L, H);
      /* dans le cube, un block colle a la camera couvrirait l ecran : sous 0,3 S il est cache */
      if (!p || p.zc < S * 0.3) { if (h.visible !== false) { h.el.style.visibility = 'hidden'; h.visible = false; } continue; }
      if (!h.visible) { h.el.style.visibility = ''; h.visible = true; }
      const k = p.k * 2.2 * (S / 520);
      h.sx = p.sx; h.sy = p.sy; h.k = k;
      h.el.style.transform = 'translate(' + (p.sx - h.t * k / 2).toFixed(1) + 'px,' + (p.sy - h.t * 1.1 * k / 2).toFixed(1) + 'px) scale(' + k.toFixed(3) + ')';
      h.el.style.zIndex = String(Math.max(1, Math.round(200000 / p.zc)));
      const loin = Math.min(1, Math.max(0, (p.z2 + R) / (2 * R)));
      const op = Math.round((1 - 0.6 * loin) * 20) / 20;
      if (op !== h._op) { h.el.style.opacity = String(h.el.classList.contains('sansPrix') ? op * 0.75 : op); h._op = op; }
    }
    dessiner(maintenant, L, H, f);
  }

  function dessiner(maintenant, L, H) {
    const R = Math.hypot(SX, SY, SZ);
    let html = '';
    /* tip 0026 (Phil « comme si tu etais dans une galaxie avec les planetes, la ce sont des cubes ») : un champ d etoiles
     * DECORATIF, fixe (graine constante), tres loin autour du cube ; il tourne avec la camera. Ce ne sont pas des blocks. */
    for (const e of ETOILES) {
      const p = projeter(e[0] * S * 7, e[1] * S * 7, e[2] * S * 7, L, H);
      if (!p || p.sx < -4 || p.sy < -4 || p.sx > L + 4 || p.sy > H + 4) continue;
      html += '<circle cx="' + p.sx.toFixed(1) + '" cy="' + p.sy.toFixed(1) + '" r="' + e[3] + '" fill="#e9e3ff" fill-opacity="' + e[4] + '"/>';
    }
    /* le cube : 12 aretes, les plus proches plus claires ; un quadrillage au sol pour la profondeur */
    const coins = [];
    for (const x of [-SX, SX]) for (const y of [-SY, SY]) for (const z of [-SZ, SZ]) coins.push([x, y, z]);
    const aretes = [];
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
      const d = coins[i].reduce((n, v, q) => n + (v !== coins[j][q] ? 1 : 0), 0);
      if (d === 1) aretes.push([coins[i], coins[j]]);
    }
    const seg = (a, b, largeur, base, dash) => {
      const p = projeter(a[0], a[1], a[2], L, H), q = projeter(b[0], b[1], b[2], L, H);
      if (!p || !q) return '';
      const loin = Math.min(1, Math.max(0, ((p.z2 + q.z2) / 2 + R) / (2 * R)));
      return '<line x1="' + p.sx.toFixed(1) + '" y1="' + p.sy.toFixed(1) + '" x2="' + q.sx.toFixed(1) + '" y2="' + q.sy.toFixed(1)
        + '" stroke="rgb(167,139,250)" stroke-opacity="' + (base * (1 - 0.7 * loin)).toFixed(3) + '" stroke-width="' + largeur + '"'
        + (dash ? ' stroke-dasharray="4 6"' : '') + '/>';
    };
    for (let g = 1; g < 6; g++) {
      const vx = -SX + (2 * SX * g) / 6, vz = -SZ + (2 * SZ * g) / 6;
      html += seg([vx, SY, -SZ], [vx, SY, SZ], 1, 0.16, false) + seg([-SX, SY, vz], [SX, SY, vz], 1, 0.16, false);
    }
    for (const [a, b] of aretes) html += seg(a, b, 2, 0.7, false);
    /* les connexions lues ces 10 dernieres minutes */
    liens = liens.filter((x) => maintenant - x.t0 < LIEN_VIE_MS && x.de.visible !== undefined);
    for (const x of liens) {
      if (!x.de.visible || !x.a.visible) continue;
      const age = (maintenant - x.t0) / LIEN_VIE_MS;
      html += '<line x1="' + x.de.sx.toFixed(1) + '" y1="' + x.de.sy.toFixed(1) + '" x2="' + x.a.sx.toFixed(1) + '" y2="' + x.a.sy.toFixed(1)
        + '" stroke="' + x.couleur + '" stroke-opacity="' + (0.5 * (1 - age) + 0.06).toFixed(3) + '" stroke-width="1.5"/>';
    }
    effets = effets.filter((e) => maintenant - e.t0 < e.duree).slice(-80);
    for (const e of effets) {
      const k = (maintenant - e.t0) / e.duree;
      if (e.genre === 'IMPULSION') {
        if (!e.de.visible || !e.a.visible) continue;
        const t = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const px = e.de.sx + (e.a.sx - e.de.sx) * t, py = e.de.sy + (e.a.sy - e.de.sy) * t;
        const op = k < 0.85 ? 1 : (1 - k) / 0.15;
        html += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="13" fill="' + e.couleur + '" fill-opacity="' + (0.22 * op).toFixed(2) + '"/>'
          + '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="5" fill="' + e.couleur + '" fill-opacity="' + op.toFixed(2) + '"/>';
      } else {
        if (!e.h.visible) continue;
        const r = e.h.t * e.h.k * 0.6 + k * 42, op = 1 - k;
        html += '<circle cx="' + e.h.sx.toFixed(1) + '" cy="' + e.h.sy.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="none" stroke="' + e.couleur
          + '" stroke-width="2.5" stroke-opacity="' + op.toFixed(2) + '"/>';
        if (e.etiquette) {
          html += '<text x="' + e.h.sx.toFixed(1) + '" y="' + (e.h.sy - e.h.t * e.h.k * 0.7 - 6 - k * 26).toFixed(1)
            + '" text-anchor="middle" font-size="13" font-weight="800" fill="' + e.couleur + '" fill-opacity="' + op.toFixed(2) + '">' + enTexte(e.etiquette) + '</text>';
        }
      }
    }
    svg.innerHTML = html;
  }

  /* ── entrees : glisser = tourner ; clic droit / Maj / deux doigts = deplacer ; molette / pincer = zoom ── */
  const doigts = new Map();
  let depart = null, pince = null;
  const zoomer = (facteur) => {
    const { L, H } = taille();
    const base = cam.cible || cam;
    const dist = Math.max(S * 0.12, Math.min(distTout(L, H), base.dist * facteur));
    if (cam.cible) cam.cible.dist = dist; else cam.dist = dist;
  };
  map.addEventListener('contextmenu', (e) => { if (e.target.closest('.a3d')) e.preventDefault(); });
  map.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.mapZoom, .bMasquer')) return;
    /* une souris n a qu un pointeur : un pointerup perdu (hors fenetre) laissait un faux 2e doigt -> « pince » geante (vu en test) */
    if (e.pointerType === "mouse") doigts.clear();
    doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    glisse = false;
    if (doigts.size === 1) depart = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch, ox: cam.ox, oy: cam.oy, deplacer: e.button === 2 || e.shiftKey };
    if (doigts.size === 2) {
      const [a, b] = [...doigts.values()];
      pince = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, dist: cam.dist, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, ox: cam.ox, oy: cam.oy };
      depart = null;
    }
  });
  map.addEventListener('pointermove', (e) => {
    if (!doigts.has(e.pointerId)) return;
    doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (doigts.size >= 2 && pince) {
      const [a, b] = [...doigts.values()];
      const { L, H } = taille();
      cam.dist = Math.max(S * 0.12, Math.min(distTout(L, H), pince.dist * pince.d / (Math.hypot(a.x - b.x, a.y - b.y) || 1)));
      cam.ox = pince.ox + ((a.x + b.x) / 2 - pince.mx); cam.oy = pince.oy + ((a.y + b.y) / 2 - pince.my);
      glisse = true; cam.touchee = true; cam.auto = false; cam.cible = null;
      return;
    }
    if (!depart) return;
    const dx = e.clientX - depart.x, dy = e.clientY - depart.y;
    if (!glisse && Math.hypot(dx, dy) < 6) return;
    if (!glisse) { try { map.setPointerCapture(e.pointerId); } catch (_) { /* optionnel */ } }
    glisse = true; cam.touchee = true; cam.auto = false; cam.cible = null;
    map.classList.add('glisse');
    compteur.style.opacity = '0';
    if (depart.deplacer) { cam.ox = depart.ox + dx; cam.oy = depart.oy + dy; }
    else { cam.yaw = depart.yaw + dx * 0.006; cam.pitch = Math.max(-1.45, Math.min(1.45, depart.pitch + dy * 0.006)); }
  });
  const fin = (e) => {
    doigts.delete(e.pointerId);
    if (doigts.size < 2) pince = null;
    if (!doigts.size) { depart = null; map.classList.remove('glisse'); }
  };
  map.addEventListener('pointerup', fin);
  map.addEventListener('pointercancel', fin);
  map.addEventListener('lostpointercapture', fin);
  map.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.touchee = true; cam.auto = false;
    zoomer(Math.exp(e.deltaY * 0.0012));
    compteur.style.opacity = '0';
  }, { passive: false });
  ui.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cam]');
    if (!b) return;
    e.stopPropagation();
    const quoi = b.getAttribute('data-cam');
    if (quoi === 'plus') { cam.auto = false; zoomer(1 / 1.4); }
    else if (quoi === 'moins') { cam.auto = false; zoomer(1.4); }
    else if (quoi === 'tout') vueDeDepart(true);
    else if (quoi === 'auto') { cam.auto = !cam.auto; cam.cible = null; }
  });

  return {
    image, placer, centrerSur, impulsion, onde, vueDeDepart,
    glisseAuClic: () => glisse, oublierGlisse: () => { glisse = false; },
    nbLiens: () => liens.length,
    vider: () => { effets = []; liens = []; },
  };
}
