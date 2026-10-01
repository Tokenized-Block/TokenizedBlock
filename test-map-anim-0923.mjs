import { readFileSync } from 'fs';
const h = readFileSync('./app.html', 'utf8');
/* ⛔ EPINGLE DE BUILD RETIREE (2026-09-23, passe globale) : elle exigeait un numero de
 *    build precis, donc elle rougissait des qu un AUTRE deploiement bumpait le build. Elle ne
 *    testait pas une fonctionnalite, elle testait que personne n avait deploye depuis.
 *    L intention — « c est bien une page servie, avec sa ligne de build » — est gardee. */
if (!/data-build="[\w-]+"/.test(h)) throw new Error('ligne de build absente ou mal formee');
if (!h.includes('tip 20260923-map-anim: soleilsSurLaMap creates')) throw new Error('soleils animer');
if (!h.includes('thin merge skips poserBlocks')) throw new Error('charger animer');
if (h.includes('data-build="20260923-map-3dplace"')) throw new Error('old tip left');
/* ⛔⛔⛔ « SHOW ON MAP » DOIT RELANCER L ANIMATION DANS TOUS LES CAS, PAS SEULEMENT QUAND IL CREE
 *      LE CUBE. Signale par le Grok Bot (2026-10-01, trois fois de suite) : apres « Show on map »,
 *      la carte reste VIDE 7 a 10 s puis revient seule.
 *      ⇒ Elle n est pas vidée, elle n est plus PROJETEE : sans `animer()`, aucun cube n a de
 *        transformation CSS et tout s empile en haut a gauche — ce que Phil avait deja signale, et
 *        que le depot nomme lui-meme « Raksha pile top-left ».
 *      ⇒ La relance etait A L INTERIEUR du `if (!h)`, donc elle ne tirait que si le block n etait
 *        PAS deja sur la carte. Pour un marche suivi — le cas NORMAL — elle etait sautee.
 *      ⇒ Et la carte revenait 7 a 10 s plus tard via une AUTRE relance, dans la boucle des soleils,
 *        a l arrivee de `/api/trending`. Ca colle a la seconde pres au chiffre du Grok Bot.
 *
 * ⛔⛔ ON VERIFIE LA POSITION DE LA LIGNE, PAS SA PRESENCE. `if (!anim) animer();` EXISTAIT DEJA —
 *     il etait seulement au mauvais endroit. Une assertion « la chaine est presente » aurait ete
 *     VERTE sur le bug. C est tout le piege de ce defaut : la garde etait vraie, et elle couvrait
 *     la moitie RARE. */
const iMap = h.indexOf("$('#pMap').addEventListener");
if (iMap === -1) throw new Error('handler Show on map introuvable');
const bloc = h.slice(iMap, iMap + 3000);
const iFin = bloc.indexOf('h.el.click();');
if (iFin === -1) throw new Error('fin du handler Show on map introuvable');
const corps = bloc.slice(0, iFin);
const iRelance = corps.indexOf('if (!anim) animer();');
if (iRelance === -1) throw new Error('Show on map ne relance plus l animation du tout');
const iIf = corps.indexOf('if (!h) {');
const iAccolade = iIf === -1 ? -1 : corps.indexOf('\n  }', iIf);
if (iIf !== -1 && iAccolade !== -1 && iRelance > iIf && iRelance < iAccolade) {
  throw new Error('la relance d animer() est REVENUE dans le `if (!h)` : elle ne couvrira que le cas '
    + 'ou le block n est PAS deja sur la carte, et la carte restera figee pour tous les autres');
}
console.log('ok map-anim');
