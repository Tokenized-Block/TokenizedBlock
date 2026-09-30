/* Le defaut MESURE que ce module repare (2026-09-30, production) :
 *   la map posait 461 creations des dernieres 24 h, puis ajoutait les blocks du marche sous
 *   `habitants.length < 450`. Le plafond etait deja depasse — NVDAc, n°1 du classement a
 *   4 346 212 $, n apparaissait JAMAIS sur la carte. Inversion de priorite : premier arrive,
 *   premier servi, et les premiers arrives sont les plus RECENTS, pas les plus importants.
 */
import { PLAFOND_MAP, RESERVE_COTES, VERDICTS, aUnMarche, placePourLeBlock, phrasePlace } from './place-sur-la-map.js';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu)));
}
/* Les vrais chiffres du jour. */
const NVDAC = { sym: 'NVDAc', fdvUsd: 4346212, volume24hUsd: 11200000, liquiditeUsd: 2300000 };
const NEUF = { sym: 'XYZ' };   /* un block tout neuf : aucun chiffre lu */

console.log('aUnMarche');
ok('NVDAc a un marche', aUnMarche(NVDAC) === true);
ok('un block neuf SANS chiffre n a pas de marche', aUnMarche(NEUF) === false);
ok('une FDV seule suffit', aUnMarche({ fdvUsd: 1 }) === true);
ok('un volume seul suffit', aUnMarche({ volume24hUsd: 1 }) === true);
ok('une liquidite seule suffit', aUnMarche({ liquiditeUsd: 1 }) === true);
/* ⛔ UN CHIFFRE ABSENT N EST PAS UN ZERO, et un zero n est pas un marche. */
ok('des zeros ne sont pas un marche', aUnMarche({ fdvUsd: 0, volume24hUsd: 0, liquiditeUsd: 0 }) === false);
ok('un texte illisible ne compte pas', aUnMarche({ fdvUsd: 'beaucoup' }) === false);
ok('null -> pas de marche', aUnMarche(null) === false);
ok('une chaine -> pas de marche', aUnMarche('NVDAc') === false);

console.log('placePourLeBlock — LE REGLAGE LIVRE : AUCUN PLAFOND (Phil)');
/* ⛔⛔ PHIL A TRANCHE : « au max pas de plafond sur la maps ». `PLAFOND_MAP` vaut donc `null`,
 *    et TOUT LE MONDE entre. Ces cas tiennent la decision livree, pas mon intention. */
ok('le reglage livre est SANS plafond', PLAFOND_MAP === null, PLAFOND_MAP);
ok('a 461 poses, NVDAc entre', (() => {
  const v = placePourLeBlock({ dejaPoses: 461, ligne: NVDAC });
  return v.verdict === 'POSER' && v.pourquoi === 'SANS_PLAFOND';
})(), placePourLeBlock({ dejaPoses: 461, ligne: NVDAC }));
/* ⛔ ET SANS PLAFOND, LE BLOCK NEUF ENTRE AUSSI — c est la decision, pas un effet de bord. */
ok('a 461 poses, un block SANS marche entre AUSSI',
  placePourLeBlock({ dejaPoses: 461, ligne: NEUF }).verdict === 'POSER');
ok('a 5000 poses, tout le monde entre encore',
  placePourLeBlock({ dejaPoses: 5000, ligne: NEUF }).verdict === 'POSER');
/* ⛔ MAIS UN COMPTE INVALIDE RESTE REFUSE : « pas de plafond » n est pas « plus aucune garde ». */
ok('sans plafond, un compte invalide est TOUJOURS refuse',
  placePourLeBlock({ dejaPoses: -1, ligne: NVDAC }).verdict === 'REFUSER');
ok('sans plafond, un compte non numerique est TOUJOURS refuse',
  placePourLeBlock({ dejaPoses: 'beaucoup', ligne: NVDAC }).verdict === 'REFUSER');

console.log('placePourLeBlock — LE JOUR OU UNE LIMITE REVIENDRAIT');
/* ⛔ La logique de tri reste TESTEE meme si elle ne sert pas aujourd hui. Si la map rame un jour,
 *   la reponse ne doit PAS etre de revenir au « premier arrive, premier servi » qui effaçait
 *   NVDAc — c est celle-ci qu il faudra rallumer, et elle doit etre prouvee le jour dit. */
const P = 450;
ok('avec un plafond, pile dessous -> POSER sans reserve',
  placePourLeBlock({ dejaPoses: P - 1, ligne: NEUF, plafond: P }).pourquoi === 'SOUS_LE_PLAFOND');
ok('avec un plafond, le neuf est refuse au plafond',
  placePourLeBlock({ dejaPoses: P, ligne: NEUF, plafond: P }).verdict === 'REFUSER');
ok('avec un plafond, le COTE passe par la reserve', (() => {
  const v = placePourLeBlock({ dejaPoses: P, ligne: NVDAC, plafond: P });
  return v.verdict === 'POSER' && v.pourquoi === 'RESERVE_AUX_COTES';
})(), placePourLeBlock({ dejaPoses: P, ligne: NVDAC, plafond: P }));
ok('avec un plafond, la reserve a une FIN', (() => {
  const v = placePourLeBlock({ dejaPoses: P + RESERVE_COTES, ligne: NVDAC, plafond: P });
  return v.verdict === 'REFUSER' && v.pourquoi === 'RESERVE_PLEINE';
})());
ok('la reserve depasse les 216 lignes cotees mesurees', RESERVE_COTES > 216, RESERVE_COTES);

console.log('placePourLeBlock — les refus d entree');
ok('compte non numerique -> REFUSER', placePourLeBlock({ dejaPoses: 'beaucoup', ligne: NVDAC }).verdict === 'REFUSER');
ok('compte negatif -> REFUSER', placePourLeBlock({ dejaPoses: -1, ligne: NVDAC }).verdict === 'REFUSER');
ok('plafond non entier -> REFUSER',
  placePourLeBlock({ dejaPoses: 10, ligne: NVDAC, plafond: 1.5 }).verdict === 'REFUSER');
/* ⛔ SANS PLAFOND, LA RESERVE NE SERT PAS — donc une reserve absurde ne doit PAS faire echouer
 *   une pose. C est le test qui tenait l ancien ordre, pas le code qui se trompe. La garde sur
 *   la reserve reste verifiee quand une limite est posee, juste en dessous. */
ok('sans plafond, une reserve negative n empeche rien',
  placePourLeBlock({ dejaPoses: 10, ligne: NVDAC, reserve: -1 }).verdict === 'POSER');
ok('AVEC un plafond, une reserve negative -> REFUSER',
  placePourLeBlock({ dejaPoses: 10, ligne: NVDAC, plafond: 450, reserve: -1 }).verdict === 'REFUSER',
  placePourLeBlock({ dejaPoses: 10, ligne: NVDAC, plafond: 450, reserve: -1 }));
ok('chaque refus porte un motif', (() => {
  const cas = [placePourLeBlock({ dejaPoses: -1, ligne: NVDAC }),
    placePourLeBlock({ dejaPoses: 999, ligne: NEUF })];
  return cas.every((c) => typeof c.pourquoi === 'string' && c.pourquoi.length > 0);
})());
ok('les verdicts sont geles', Object.isFrozen(VERDICTS));

console.log('phrasePlace');
ok('null PARLE', phrasePlace(null).length > 0);
/* Le reglage LIVRE : sans plafond, la phrase le dit. */
ok('sans plafond, la phrase dit que la map prend TOUT',
  /takes every block/i.test(phrasePlace(placePourLeBlock({ dejaPoses: 461, ligne: NEUF }))),
  phrasePlace(placePourLeBlock({ dejaPoses: 461, ligne: NEUF })));
/* ⛔ Les phrases du mode « avec limite » restent tenues, pour le jour ou il reviendrait. */
ok('avec limite, la reserve se NOMME dans la phrase',
  /readable market/i.test(phrasePlace(placePourLeBlock({ dejaPoses: 450, ligne: NVDAC, plafond: 450 }))));
ok('avec limite, le refus dit POURQUOI', (() => {
  const p = phrasePlace(placePourLeBlock({ dejaPoses: 450, ligne: NEUF, plafond: 450 }));
  return /full/i.test(p) && /no readable market/i.test(p);
})(), phrasePlace(placePourLeBlock({ dejaPoses: 450, ligne: NEUF, plafond: 450 })));

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
