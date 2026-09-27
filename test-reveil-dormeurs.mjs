/* test-reveil-dormeurs.mjs — UN DORMEUR SE REVEILLE UNE FOIS PAR JOUR, ET IL NE MENT PAS.
 *
 * ⛔⛔ CE QUE PHIL A DEMANDE, MOT POUR MOT (2026-09-27) : « fais reveiller les dormeurs au moins une
 *     fois toutes les 24 h, aligne-toi au fuseau horaire de la ou l app est ouverte, adapte-toi ».
 *     Un block DORMANT ne recoit que `reposSansMarche` = 0,15 : son potentiel tourne autour de 1,1
 *     et il tire TRES rarement. Vu de l exterieur il semble eteint, alors qu il est juste calme.
 *
 * ⛔⛔ LA LIGNE A NE PAS FRANCHIR, ET C EST TOUT L OBJET DE CE FICHIER : un reveil N EST PAS une
 *     activite de marche. S il entrait dans `nouveau`, le block passerait d ENDORMI a EXCITE et
 *     l ecran annoncerait une agitation qui N A PAS EU LIEU. Une animation qui ment est pire qu un
 *     block immobile : elle fait croire a un marche.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : le rythme reel a l ecran. Le « une fois par jour » se compte dans le
 *   `localStorage` du visiteur, donc par navigateur — deux personnes dans deux fuseaux verront le
 *   reveil a deux moments differents, et c est exactement ce qui est demande.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { courant, pas, etatInitial, PARAMETRES, REVEIL_IMPULSION } from './cerveau.js';

let n = 0;
const v = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

const ADR = '0xb20000000000000000000024c30d3fcb7931272e';

v('⛔ l impulsion est SOUS le seuil — elle amorce, elle ne force pas', () => {
  /* ⛔ UNE IMPULSION AU-DESSUS DU SEUIL FERAIT TIRER TOUS LES CAPTEURS D UN COUP, quel que soit
   *   l etat du reseau. Ce ne serait plus un reveil, ce serait un interrupteur. */
  assert.ok(REVEIL_IMPULSION < PARAMETRES.seuil,
    'l impulsion de reveil (' + REVEIL_IMPULSION + ') atteint ou depasse le seuil ('
    + PARAMETRES.seuil + ') : elle forcerait le tir au lieu de l amorcer');
  assert.ok(REVEIL_IMPULSION > 0, 'l impulsion de reveil est nulle : rien ne se reveillerait');
});

v('⛔⛔ un reveil N ENTRE PAS dans « nouveau » — sinon il se ferait passer pour un marche', () => {
  /* ⛔⛔ LE CAS QUI COMPTE. `nouveau` porte ce qui est REELLEMENT arrive au block sur la chaine :
   *     transferts, messages, detenteurs, achats. Si le reveil y entrait, le block passerait
   *     d ENDORMI a EXCITE et l ecran annoncerait une agitation qui n a pas eu lieu. */
  const sans = courant({ vie: null, etatVie: 'NON_LUE' });
  const avec = courant({ vie: null, etatVie: 'NON_LUE', reveil: true });
  assert.equal(avec.reveil, true, 'le reveil ne voyage plus jusqu au pas de temps');
  assert.equal(sans.reveil, false, 'le reveil est actif sans avoir ete demande');
  assert.equal(avec.nouveau, sans.nouveau,
    'le reveil gonfle `nouveau` : le block se dirait EXCITE sans qu il se soit rien passe');
  assert.equal(avec.pression, sans.pression, 'le reveil gonfle la pression vendeuse');
  assert.equal(avec.aMarche, sans.aMarche, 'le reveil fait croire a un marche');
});

v('⛔⛔ un reveil FAIT TIRER un dormeur — sinon il ne sert a rien', () => {
  /* ⛔ UNE FONCTIONNALITE QUI NE CHANGE RIEN EST PIRE QU ABSENTE : elle se coche comme faite.
   *   On REJOUE donc les deux cerveaux depuis le MEME etat initial et on compare les tirs. */
  let dort = etatInitial(ADR), reveille = etatInitial(ADR);
  let spikesDort = 0, spikesReveille = 0;
  for (let i = 0; i < 6; i++) {
    const a = pas(dort, courant({ vie: null, etatVie: 'NON_LUE' }));
    dort = a.etat; spikesDort += a.vu.spikes;
    const b = pas(reveille, courant({ vie: null, etatVie: 'NON_LUE', reveil: true }));
    reveille = b.etat; spikesReveille += b.vu.spikes;
  }
  assert.ok(spikesReveille > spikesDort,
    'le reveil ne change rien : ' + spikesReveille + ' tirs contre ' + spikesDort + ' sans lui');
});

v('⛔⛔ un block MORT ne se reveille JAMAIS', () => {
  /* ⛔⛔ « Mort » veut dire que son createur n en detient plus rien. Le faire tirer serait une
   *     animation qui ment sur l etat le plus grave que l app puisse annoncer. Le module coupe
   *     deja tout courant a un mort ; on verifie que le reveil ne rouvre pas cette porte. */
  let m = etatInitial(ADR);
  let spikes = 0;
  for (let i = 0; i < 8; i++) {
    const r = pas(m, courant({ vie: null, etatVie: 'NON_LUE', mort: true, reveil: true }));
    m = r.etat; spikes += r.vu.spikes;
  }
  assert.equal(spikes, 0, 'un block mort tire ' + spikes + ' fois a cause du reveil');
});

v('⛔ le declencheur ne vise QUE les dormeurs', () => {
  assert.ok(/if \(h\.phase === 'DORMANT'\)/.test(app),
    'le reveil ne se limite plus aux dormeurs : il secouerait des blocks qui vivent deja, ou des morts');
});

v('⛔⛔ le jour est celui du VISITEUR, pas un fuseau grave', () => {
  /* ⛔⛔ Phil : « aligne-toi au fuseau horaire de la ou l app est ouverte ». `toLocaleDateString()`
   *     SANS argument rend la date locale du navigateur. Passer un `timeZone` fige l app sur un
   *     endroit du monde — c est l inverse exact de ce qui est demande.
   *   ⚠️ Et `heures-marche.js` utilise bien `America/New_York`, mais pour les HORAIRES DE BOURSE :
   *     deux questions differentes, deux reponses differentes. Ne pas confondre. */
  const i = app.indexOf("tb.reveil.");
  assert.notEqual(i, -1, 'le declencheur du reveil a disparu');
  const bloc = app.slice(i - 900, i + 900);
  assert.ok(/new Date\(\)\.toLocaleDateString\(\)/.test(bloc),
    'le jour du reveil n est plus la date LOCALE du visiteur');
  assert.ok(!/toLocaleDateString\(['"][^'"]*['"]/.test(bloc),
    'un fuseau est impose au reveil : l app cesserait de s aligner sur la ou elle est ouverte');
});

v('⛔ une trace illisible fait tirer une fois de TROP, jamais une fois de moins', () => {
  /* ⛔ `localStorage` se vide, se bloque en navigation privee, et n est jamais partage. Traiter un
   *   echec de lecture comme « deja reveille » condamnerait au silence les visiteurs en navigation
   *   privee — precisement ceux qui ne laissent aucune trace. On echoue du cote du mouvement. */
  const i = app.indexOf("tb.reveil.");
  const bloc = app.slice(i - 400, i + 900);
  assert.ok(/catch \(_\) \{ vuJour = null; \}/.test(bloc),
    'une lecture ratee de la trace ne retombe plus sur `null` : le block pourrait ne jamais se reveiller');
  assert.ok(/vuJour !== jour/.test(bloc),
    'la comparaison du jour a change : verifier qu une trace absente declenche bien le reveil');
});

assert.equal(n, 7, 'compte de cas inattendu : ' + n);
console.log('ok reveil-dormeurs — ' + n + ' cas.');
console.log('   Un dormeur tire une fois par jour LOCAL du visiteur, un mort jamais, et le reveil');
console.log('   n entre ni dans `nouveau` ni dans la pression : il ne peut pas se faire passer');
console.log('   pour un evenement de marche.');
console.log('⚠️ NE PROUVE PAS le rythme reel : le « une fois par jour » se compte dans le navigateur');
console.log('   de celui qui regarde, donc deux fuseaux voient le reveil a deux moments differents.');
