/* rouleaux.js — LES TROIS ROULEAUX DE LA CARTE DRAWS (Phil 2026-10-24 : « change le draw et fusionne pour le spin ; fais tourner l aleatoire
 * en image colle au hash ; voir en direct les 3 faces tourner en boucle »).
 * Pur cote logique : AUCUN reseau propre (lireBloc est injecte : l app passe eth_getBlockByNumber), aucun DOM global (les cases et les
 * etiquettes sont injectees), aucune horloge globale (horloge injectee). Les faces sont dessinees par les fonctions de l app (svgLive :
 * la face d un hash de bloc, celle de « Base block N » ; svgSpin : la face r d un spin, la graine du contrat) — jamais une 2e implementation.
 * MODES :
 *   LIVE      les faces des trois derniers blocs Base LUS (N-2, N-1, N), chaque case etiquetee de son bloc ; un nouveau bloc fait avancer
 *             les rouleaux (une courte rotation qui se POSE sur la face calculee du hash reel du bloc) ;
 *   SPIN      un spin en attente du joueur (cible t) : les cases tournent jusqu a ce que les blocs t, t+1, t+2 existent, puis se posent une a
 *             une sur la face du spin ; `surPose` est appele quand les trois sont posees (l app y peint les points par trait) ;
 *   RESULTAT  un spin regle ici (les hashes du Settled) : tenu RESULTAT_MS, puis retour au LIVE (un meme spin n y revient plus).
 * ⛔ AU REPOS, chaque face visible est EXACTEMENT celle calculee du hash du bloc de son etiquette : une case ne se pose que sur un hash LU ;
 *   un bloc illisible laisse la case sur sa face et son etiquette precedentes ; une case qui attend un bloc a venir tourne, ou reste VIDE
 *   en mouvement reduit (jamais une face d un autre bloc sous l etiquette du nouveau).
 * ⛔ La boucle decorative (LIVE seulement, entre deux lectures) ne fait defiler que des faces DEJA posees ; elle ne predit rien et se
 *   repose sur les memes faces, memes etiquettes.
 * CADENCE (Base : 2 s par bloc ; Denim : 200 ms prevus) : une pose au plus par case et par POSE_MIN_MS ; une lecture LIVE au plus toutes les
 *   LECTURE_MIN_MS (les blocs intermediaires sont SAUTES, l etiquette dit le bloc montre) ; un hash lu est garde (le hash d un bloc passe ne
 *   change plus), et le parentHash d un bloc lu donne celui du bloc d avant : 1 ou 2 lectures pour trois blocs. Rien ne tourne ni ne lit
 *   quand `cache()` est vrai (page cachee, carte pas montree) ; mouvement reduit : aucune rotation, les faces sont remplacees.
 * NE PROUVE PAS (ici) : le rendu au navigateur, la chaine reelle. */
export const POSE_MIN_MS = 1000;
export const LECTURE_MIN_MS = 5000;
export const LECTURE_SPIN_MS = 1000;
export const TOUR_MS = 650;
export const DECALAGE_MS = 300;
export const REPOS_MS = 4000;
export const BOUCLE_MAX_MS = 9000;
export const RESULTAT_MS = 15000;
export const ECHEC_MS = 5000;
export const HASHES_MAX = 600;
export const REELS = 3;
const HASH = /^0x[0-9a-f]{64}$/;
const bas = (x) => String(x || '').toLowerCase();
/** les blocs montres en LIVE : N-2, N-1, N */
export const blocsLive = (n) => [n - 2, n - 1, n];
/** les blocs d un spin de cible t : t, t+1, t+2 (slots-plan.js blocsDesFaces, meme ordre) */
export const blocsSpin = (t) => [t, t + 1, t + 2];

export function creerRouleaux(o) {
  const cases = o.cases, etiquettes = o.etiquettes || [], legende = o.legende || null, h = o.horloge;
  const reduit = o.reduit || (() => false), cache = o.cache || (() => false), fmt = o.fmt || ((n) => String(n));
  const hashes = o.hashes || new Map();
  const st = {
    mode: 'LIVE', tete: null, base: null, spin: null, res: null, finis: new Set(),
    rs: Array.from({ length: REELS }, () => ({ cle: null, bloc: null, hash: null, svg: '', poseA: -Infinity, roule: false, timer: null, vise: null })),
    dernierTour: -Infinity, tourA: null, enTour: false, encore: false, boucle: false, boucleA: null, boucleFinA: null, resFinA: null,
    echecs: new Map(), recentes: [], lectures: 0, poses: 0, journal: [],
  };
  const maintenant = () => h.maintenant();
  const lu = (b) => { const x = hashes.get(b); return typeof x === 'string' && HASH.test(x) ? x : null; };
  const stocker = (b, x) => {
    if (!Number.isSafeInteger(b) || !HASH.test(x)) return;
    if (!hashes.has(b)) hashes.set(b, x);
    while (hashes.size > HASHES_MAX) hashes.delete(hashes.keys().next().value);
  };
  const cls = (el, c, on) => { try { if (el && el.classList) el.classList.toggle(c, !!on); } catch (_) { /* sans classList */ } };
  const attr = (el, k, v) => { try { if (el && el.setAttribute) el.setAttribute(k, v); } catch (_) { /* sans attribut */ } };
  const svgDe = (c) => { try { return (c.spin ? o.svgSpin(c.hash, c.id, c.r) : o.svgLive(c.hash)) || ''; } catch (_) { return ''; } };
  const lettre = () => (st.mode === 'LIVE' ? 'L' : st.mode === 'SPIN' ? 'S' : 'R');

  /* ce que chaque case DOIT montrer dans le mode courant (le hash quand il est connu) */
  function cibles() {
    if (st.mode === 'RESULTAT' && st.res) {
      const r0 = st.res;
      return [0, 1, 2].map((r) => ({ cle: 'R:' + r0.id + ':' + r, r, bloc: r0.t !== null ? r0.t + r : null, hash: r0.hashes[r], id: r0.id, spin: true }));
    }
    if (st.mode === 'SPIN' && st.spin) { const s = st.spin; return blocsSpin(s.t).map((b, r) => ({ cle: 'S:' + s.id + ':' + r, r, bloc: b, hash: lu(b), id: s.id, spin: true })); }
    const n = st.base !== null ? st.base : st.tete;
    if (n === null) return [null, null, null];
    return blocsLive(n).map((b, r) => ({ cle: 'L:' + b, r, bloc: b, hash: lu(b), spin: false }));
  }
  /* LIVE : la tete la plus haute dont les TROIS blocs N-2, N-1, N sont lus (un noeud en retard peut ne pas encore servir le dernier) — les
   *   trois cases avancent ENSEMBLE, jamais « 702, 699, 700 » (mesure au navigateur, 2026-10-24) ; aucune : la base ne bouge pas */
  function choisirBase() {
    if (st.tete === null) return;
    for (let k = st.tete; k > st.tete - 4 && k > 2; k -= 1) if (blocsLive(k).every((b) => lu(b))) { if (st.base === null || k > st.base) st.base = k; return; }
  }
  const posesSur = (id) => st.rs.every((x, r) => x.cle === 'S:' + id + ':' + r || x.cle === 'R:' + id + ':' + r);
  const auRepos = () => st.rs.every((x) => !x.roule && !x.timer);

  /* les hashes manquants : du plus haut au plus bas (le parentHash du plus haut couvre le suivant) ; un bloc pas encore la n est pas lu ;
   * un echec attend ECHEC_MS avant d etre relu (pas de rafale sur un noeud qui refuse) */
  async function assurer(blocs) {
    for (const b of [...new Set(blocs)].sort((x, y) => y - x)) {
      if (lu(b) || st.tete === null || b > st.tete || b <= 0) continue;
      const e = st.echecs.get(b);
      if (e !== undefined && maintenant() - e < ECHEC_MS) continue;
      st.lectures += 1;
      let x = null; try { x = await o.lireBloc(b); } catch (_) { x = null; }
      const hb = x ? bas(x.hash) : '', hp = x ? bas(x.parentHash) : '';
      if (HASH.test(hb)) { stocker(b, hb); st.echecs.delete(b); if (HASH.test(hp)) stocker(b - 1, hp); } else st.echecs.set(b, maintenant());
    }
  }
  /* trois blocs qui se suivent : « 53,031,700–702 » (UNE ligne a 375 px, mesure : la liste complete en prenait deux) ; sinon la liste */
  const plage = (bs) => {
    const [a, , c] = bs;
    if (!(bs[1] === a + 1 && c === a + 2)) return bs.map(fmt).join(', ');
    return Math.floor(a / 1000) === Math.floor(c / 1000) ? fmt(a) + '–' + String(c % 1000).padStart(3, '0') : fmt(a) + '–' + fmt(c);
  };
  function peindreLegende() {
    if (!legende) return;
    let t;
    if (st.mode === 'SPIN' && st.spin) {
      const bs = blocsSpin(st.spin.t).map(fmt).join(', ');
      t = posesSur(st.spin.id) ? 'Spin #' + st.spin.id + ': its faces, from blocks ' + bs + '.' : 'Spin #' + st.spin.id + ': blocks ' + bs + ' draw its three faces.';
    } else if (st.mode === 'RESULTAT' && st.res) {
      t = 'Spin #' + st.res.id + ' settled: its faces' + (st.res.t !== null ? ', from blocks ' + blocsSpin(st.res.t).map(fmt).join(', ') : '') + '.';
    } else {
      /* une case qui tourne vers un bloc nouveau compte pour ce bloc (son etiquette le dit deja) ; sinon le bloc de sa face posee */
      const bs = st.rs.map((x) => (x.roule && x.vise && x.vise.cle[0] === 'L' ? x.vise.bloc : x.cle && x.cle[0] === 'L' ? x.bloc : null));
      t = bs.every((b) => b !== null) ? 'Live: the faces of Base blocks ' + plage(bs) + '.' : 'Reading the latest Base blocks…';
    }
    legende.textContent = t;
  }
  const etiqueter = (r, bloc) => { const e = etiquettes[r]; if (e) e.textContent = bloc === null ? 'face ' + (r + 1) : fmt(bloc); };
  /* une case tourne : une bande des faces DEJA posees (decor), floue ; jamais en mouvement reduit ni page cachee */
  function rouler(r) {
    if (reduit() || cache()) return false;
    const el = cases[r], x = st.rs[r];
    const src = st.recentes.length ? st.recentes : x.svg ? [x.svg] : [];
    /* deux faces, doublees (la rotation CSS fait -50 % : la boucle se raccorde) — 4 images au plus par case */
    const bande = src.length ? [0, 1].map((k) => src[(k + r) % src.length]).join('') : '';
    el.innerHTML = '<div class="rouleauBande" aria-hidden="true">' + bande + bande + '</div>';
    el.dataset.roule = '1'; cls(el, 'roule', true); cls(el, 'pose', false);
    x.roule = true;
    return true;
  }
  /* retour a la face posee (la meme, la meme etiquette) : fin de boucle, ou une pose impossible */
  function reposer(r) {
    const el = cases[r], x = st.rs[r];
    el.innerHTML = x.svg; el.dataset.roule = '0'; el.dataset.gagne = x.svg ? '1' : '0';
    el.dataset.bloc = x.bloc === null ? '' : String(x.bloc); el.dataset.hash = x.hash || '';
    cls(el, 'roule', false);
    if (x.cle) etiqueter(r, x.bloc); else { const e = etiquettes[r]; if (e) e.textContent = ''; }
    x.roule = false;
  }
  /* une case attend un bloc a venir (SPIN) : son etiquette dit ce bloc ; elle tourne, ou reste VIDE (mouvement reduit / page cachee) */
  function attendre(r, c) {
    const el = cases[r], x = st.rs[r];
    Object.assign(x, { cle: null, bloc: c.bloc, hash: null, svg: '' });
    etiqueter(r, c.bloc);
    el.dataset.bloc = String(c.bloc); el.dataset.hash = '';
    if (x.roule) return;
    if (!rouler(r)) { el.innerHTML = ''; el.dataset.gagne = '0'; el.dataset.roule = '0'; cls(el, 'roule', false); }
  }
  function poser(r, c) {
    const svg = svgDe(c), el = cases[r], x = st.rs[r];
    if (!svg) { reposer(r); return false; }
    el.innerHTML = svg;
    el.dataset.bloc = c.bloc === null ? '' : String(c.bloc); el.dataset.hash = c.hash; el.dataset.gagne = '1'; el.dataset.roule = '0';
    cls(el, 'roule', false); cls(el, 'pose', !reduit() && !cache());
    attr(el, 'aria-label', c.spin ? 'Spin #' + c.id + ', face ' + (r + 1) + (c.bloc !== null ? ', block ' + fmt(c.bloc) : '') : 'Face of Base block ' + fmt(c.bloc));
    etiqueter(r, c.bloc);
    Object.assign(x, { cle: c.cle, bloc: c.bloc, hash: c.hash, svg, poseA: maintenant(), roule: false, vise: null });
    st.poses += 1; st.journal.push({ r, cle: c.cle, a: x.poseA });
    if (st.journal.length > 400) st.journal.shift();
    if (!st.recentes.includes(svg)) { st.recentes.push(svg); if (st.recentes.length > 6) st.recentes.shift(); }
    if (st.boucle && st.rs.every((y) => !y.roule)) { st.boucle = false; if (st.boucleFinA) { h.annuler(st.boucleFinA); st.boucleFinA = null; } }
    peindreLegende();
    if (c.spin && posesSur(c.id)) {
      if (o.surPose) { try { o.surPose({ id: c.id, hashes: st.rs.map((y) => y.hash) }); } catch (_) { /* le peintre de l app */ } }
      if (st.mode === 'RESULTAT' && !st.resFinA) {
        const id = c.id;
        st.resFinA = h.planifier(() => { st.resFinA = null; st.finis.add(id); if (st.mode === 'RESULTAT' && st.res && st.res.id === id) { st.mode = 'LIVE'; st.res = null; planifierTour(true); } }, RESULTAT_MS);
      }
    }
    if (st.mode === 'LIVE' && auRepos()) planifierBoucle();
    return true;
  }
  /* la pose d une case a l heure dite : sur la cible COURANTE si son hash est lu (les blocs intermediaires sont sautes), sinon sur celle
   * visee quand la pose a ete planifiee (lue, du meme mode) ; sinon la case revient a sa face posee */
  function poserMaintenant(r) {
    const x = st.rs[r]; x.timer = null;
    const c2 = cibles()[r];
    const c = c2 && c2.hash ? c2 : x.vise && x.vise.cle[0] === lettre() && x.vise.hash ? x.vise : null;
    if (!c) { if (c2 && st.mode === 'SPIN') attendre(r, c2); else reposer(r); return; }
    if (x.cle === c.cle && !x.roule) return;
    poser(r, c);
  }
  function planifierPose(r, c, dansMs) {
    const x = st.rs[r];
    if (x.timer) h.annuler(x.timer);
    x.vise = c;
    x.timer = h.planifier(() => poserMaintenant(r), Math.max(0, dansMs));
  }
  function arreterBoucle() {
    if (st.boucleA) { h.annuler(st.boucleA); st.boucleA = null; }
    if (st.boucleFinA) { h.annuler(st.boucleFinA); st.boucleFinA = null; }
    if (st.boucle) { st.boucle = false; st.rs.forEach((x, r) => { if (x.roule && !x.timer) reposer(r); }); }
  }
  /* LA BOUCLE DECORATIVE : REPOS_MS au repos, puis les trois tournent (bande des faces deja posees) ; BOUCLE_MAX_MS plus tard elles se
   * reposent sur les MEMES faces (memes etiquettes) — sauf si une vraie lecture les pose avant. LIVE seulement, jamais page cachee. */
  function planifierBoucle() {
    if (st.boucleA || reduit()) return;
    st.boucleA = h.planifier(() => {
      st.boucleA = null;
      if (st.mode !== 'LIVE' || cache() || reduit() || !auRepos() || st.rs.some((x) => !x.svg || !x.cle)) return;
      st.boucle = true;
      st.rs.forEach((_, r) => rouler(r));
      st.boucleFinA = h.planifier(() => {
        st.boucleFinA = null;
        if (!st.boucle) return;
        st.boucle = false;
        st.rs.forEach((x, r) => { if (x.roule && !x.timer) reposer(r); });
        if (st.mode === 'LIVE' && !cache() && auRepos()) planifierBoucle();
      }, BOUCLE_MAX_MS);
    }, REPOS_MS);
  }
  async function tour() {
    if (st.enTour) { st.encore = true; return; }
    if (cache()) return;
    st.enTour = true; st.dernierTour = maintenant();
    try {
      let cs = st.mode === 'LIVE' && st.tete !== null ? blocsLive(st.tete).map((b) => ({ bloc: b, hash: lu(b) })) : cibles();
      await assurer(cs.filter((c) => c && !c.hash && c.bloc !== null).map((c) => c.bloc));
      if (st.mode === 'LIVE') choisirBase();
      cs = cibles();
      const t0 = maintenant();
      cs.forEach((c, r) => {
        const x = st.rs[r];
        if (!c) { if (x.roule && !x.timer) reposer(r); return; }
        if (x.cle === c.cle) return;
        if (!c.hash) { if (c.spin) attendre(r, c); return; }
        /* l etiquette dit DEJA le bloc qui se pose (la case tourne : aucune face n est montree sous elle) */
        if (rouler(r) || x.roule) etiqueter(r, c.bloc);
        planifierPose(r, c, Math.max(reduit() || cache() ? 0 : TOUR_MS + r * DECALAGE_MS, x.poseA + POSE_MIN_MS - t0));
      });
      peindreLegende();
    } finally {
      st.enTour = false;
      if (st.encore) { st.encore = false; planifierTour(); }
    }
  }
  function planifierTour(immediat = false) {
    if (st.tourA) { if (!immediat) return; h.annuler(st.tourA); st.tourA = null; }
    const pas = st.mode === 'LIVE' ? LECTURE_MIN_MS : LECTURE_SPIN_MS;
    const dans = immediat ? 0 : Math.max(0, st.dernierTour + pas - maintenant());
    st.tourA = h.planifier(() => { st.tourA = null; void tour(); }, dans);
  }

  return {
    /** la tete lue ailleurs (la boucle du Game, l apercu du serveur, le minuteur des slots) ; `hash` = celui de ce bloc s il est connu */
    tete(n, hash = null) {
      const b = Number(n);
      if (!Number.isSafeInteger(b) || b <= 0) return;
      if (typeof hash === 'string' && HASH.test(bas(hash))) stocker(b, bas(hash));
      if (st.tete !== null && b <= st.tete) return;
      st.tete = b;
      planifierTour();
    },
    /** le spin suivi : { id, t, hashes? } (en attente) ou null (aucun : LIVE) */
    suivre(s) {
      if (!s) { if (st.mode === 'SPIN') { st.mode = 'LIVE'; st.spin = null; planifierTour(true); } return; }
      const id = String(s.id), t = Number(s.t);
      if (!Number.isSafeInteger(t) || t <= 0) return;
      if (st.finis.has(id)) { if (st.mode === 'SPIN' && st.spin && st.spin.id === id) { st.mode = 'LIVE'; st.spin = null; planifierTour(true); } return; }
      if (Array.isArray(s.hashes)) s.hashes.forEach((x, r) => stocker(t + r, bas(x)));
      const meme = st.mode === 'SPIN' && st.spin && st.spin.id === id;
      if (meme) { if (st.rs.some((x, r) => x.cle !== 'S:' + id + ':' + r)) planifierTour(); return; }
      if (st.resFinA) { h.annuler(st.resFinA); st.resFinA = null; }
      st.mode = 'SPIN'; st.spin = { id, t }; st.res = null;
      arreterBoucle();
      planifierTour(true);
    },
    /** un spin regle ici (le recu) : ses trois hashes ; montre RESULTAT_MS, puis LIVE ; un meme spin n y revient plus */
    resultat({ id, hashes: hs, t = null }) {
      const k = String(id);
      if (st.finis.has(k) || !Array.isArray(hs) || hs.length !== REELS || !hs.every((x) => HASH.test(bas(x)))) return;
      if (st.mode === 'RESULTAT' && st.res && st.res.id === k) return;
      const tt = t !== null && Number.isSafeInteger(Number(t)) ? Number(t) : st.spin && st.spin.id === k ? st.spin.t : null;
      st.mode = 'RESULTAT'; st.res = { id: k, hashes: hs.map(bas), t: tt }; st.spin = null;
      arreterBoucle();
      planifierTour(true);
    },
    /** vrai quand les trois cases sont posees sur CE spin (suivi ou regle) */
    pose: (id) => posesSur(String(id)),
    /** la page redevient visible (ou la carte montree) : une lecture, puis la boucle */
    reprendre() {
      if (cache()) return;
      if (st.tete !== null) planifierTour(true);
      if (st.mode === 'LIVE' && auRepos()) planifierBoucle();
    },
    /** un instantane (les bancs) */
    etat: () => ({ mode: st.mode, tete: st.tete, lectures: st.lectures, poses: st.poses, boucle: st.boucle, journal: st.journal.slice(),
      rs: st.rs.map((x) => ({ cle: x.cle, bloc: x.bloc, hash: x.hash, roule: x.roule, enAttente: !!x.timer })) }),
  };
}
