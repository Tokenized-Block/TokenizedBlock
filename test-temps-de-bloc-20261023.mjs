// test-temps-de-bloc-20261023.mjs — le temps de bloc MESURE (Denim : Base passe de 2 s a 200 ms/bloc, mainnet vise novembre 2026).
// Chaque borne convertie (secondes -> blocs) et chaque texte de fenetre (« ~X s at the measured block time ») passe par ce module.
// ⛔ Ce test ne prouve PAS le comportement apres Denim sur mainnet : il prouve l arithmetique, sur des en-tetes simules a 2 s et a 200 ms.
import assert from 'node:assert/strict';
import {
  sParBlocMesure, enteteVersMesure, blocsPour, secondesPour, dureeTexte, texteBlocs, intervalleSondageMs, pasAttenteBlocMs,
  S_PAR_BLOC_MIN, S_PAR_BLOC_MAX, ECART_MIN_S, RECUL_MESURE_BLOCS,
} from './temps-de-bloc.js';

let n = 0;
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

/* 1. la mesure : deux en-tetes, horodatage en SECONDES (aujourd hui) */
eq(sParBlocMesure({ haut: { bloc: 53000000, ts: 1761200000 }, bas: { bloc: 52999000, ts: 1761198000 } }), 2, '1000 blocs en 2000 s = 2 s/bloc');
eq(sParBlocMesure({ haut: { bloc: 53000000, ts: 1761200000 }, bas: { bloc: 52999000, ts: 1761199800 } }), 0.2, 'Denim : 1000 blocs en 200 s = 0,2 s/bloc');
/* les secondes entieres : 5 blocs partagent un horodatage apres Denim — un ecart trop court est refuse (erreur d arrondi > 5 %) */
eq(sParBlocMesure({ haut: { bloc: 100, ts: 1000 }, bas: { bloc: 90, ts: 998 } }), null, 'ecart de 2 s : trop court pour des secondes entieres -> null');
eq(sParBlocMesure({ haut: { bloc: 100, ts: 1000 }, bas: { bloc: 0, ts: 1000 - ECART_MIN_S } }), ECART_MIN_S / 100, 'ecart = ECART_MIN_S : accepte');
eq(sParBlocMesure({ haut: { bloc: 100, ts: 1000 }, bas: { bloc: 0, ts: 1000 - ECART_MIN_S + 1 } }), null, 'ecart = ECART_MIN_S - 1 : refuse');
/* les millisecondes (champ RPC optionnel timestampMs de Denim) : precises, pas d ecart minimum */
eq(sParBlocMesure({ haut: { bloc: 110, ts: 1001, tsMs: 1000600 }, bas: { bloc: 100, ts: 999, tsMs: 998600 } }), 0.2, 'ms : 10 blocs en 2 000 ms = 0,2 s/bloc');
eq(sParBlocMesure({ haut: { bloc: 110, ts: 1001, tsMs: 1000600 }, bas: { bloc: 100, ts: 999, tsMs: null } }), null, 'ms d un seul cote : on retombe sur les secondes (2 s d ecart -> null)');
/* entrees invalides -> null, jamais un temps invente */
eq(sParBlocMesure({ haut: { bloc: 100, ts: 2000 }, bas: { bloc: 100, ts: 1000 } }), null, 'meme bloc -> null');
eq(sParBlocMesure({ haut: { bloc: 90, ts: 2000 }, bas: { bloc: 100, ts: 1000 } }), null, 'haut < bas -> null');
eq(sParBlocMesure({ haut: { bloc: 1100, ts: 1000 }, bas: { bloc: 100, ts: 2000 } }), null, 'temps qui recule -> null');
eq(sParBlocMesure({ haut: { bloc: 1100, ts: NaN }, bas: { bloc: 100, ts: 2000 } }), null, 'NaN -> null');
eq(sParBlocMesure({ haut: null, bas: { bloc: 100, ts: 2000 } }), null, 'en-tete absent -> null');
eq(sParBlocMesure({ haut: { bloc: 1100, ts: 1000 + 100000 }, bas: { bloc: 100, ts: 1000 } }), null, '100 s/bloc : hors des bornes plausibles -> null');
ok(S_PAR_BLOC_MIN <= 0.2 && S_PAR_BLOC_MAX >= 2, 'les bornes plausibles couvrent 200 ms et 2 s');
ok(RECUL_MESURE_BLOCS * 0.2 >= ECART_MIN_S, 'le recul de mesure donne un ecart suffisant meme a 200 ms');

/* 2. l en-tete RPC -> la mesure (hex ; timestampMs hex ou nombre, optionnel) */
eq(enteteVersMesure({ number: '0x10', timestamp: '0x3e8' }), { bloc: 16, ts: 1000, tsMs: null }, 'en-tete sans ms');
eq(enteteVersMesure({ number: '0x10', timestamp: '0x3e8', timestampMs: '0xf4240' }), { bloc: 16, ts: 1000, tsMs: 1000000 }, 'timestampMs hex');
eq(enteteVersMesure({ number: '0x10', timestamp: '0x3e8', timestampMs: 1000200 }), { bloc: 16, ts: 1000, tsMs: 1000200 }, 'timestampMs nombre');
eq(enteteVersMesure({ number: '0x10', timestamp: '0x3e8', timestampMs: '1000' }).tsMs, null, 'timestampMs incoherent avec timestamp (1000 ms vs 1000 s) -> ignore');
eq(enteteVersMesure(null), null, 'null -> null');
eq(enteteVersMesure({ number: 'zz', timestamp: '0x1' }), null, 'numero illisible -> null');

/* 3. les conversions — a 2 s on retrouve EXACTEMENT les anciennes constantes (aucun changement avant Denim) */
eq(blocsPour(7 * 86400, 2), 302400, '7 jours a 2 s = 302 400 blocs (ancien DUELS_RECUL_BLOCS sans marges)');
eq(blocsPour(7 * 86400, 0.2), 3024000, '7 jours a 200 ms = 3 024 000 blocs');
eq(blocsPour(3600, 2), 1800, '1 h a 2 s = 1 800 (ancien heures * 1800)');
eq(blocsPour(3600, 0.2), 18000, '1 h a 200 ms = 18 000');
eq(blocsPour(6, 2), 3, '6 s a 2 s = 3 (ancienne marge ROLLS_MARGE_BLOCS)');
eq(blocsPour(6, 0.2), 30, '6 s a 200 ms = 30');
eq(blocsPour(5, 2), 3, 'arrondi vers le HAUT (2,5 -> 3)');
eq(blocsPour(1, 0.3), 4, 'arrondi vers le HAUT (3,33 -> 4), jamais au plus proche');
eq(blocsPour(3600, 0.1 + 0.1), 18000, 'pas de 18 001 par erreur flottante');
eq(blocsPour(3600, null), null, 'temps de bloc inconnu -> null');
eq(blocsPour(-1, 2), null, 'secondes negatives -> null');
eq(secondesPour(256, 2), 512, '256 blocs a 2 s = 512 s');
eq(secondesPour(256, 0.2), 51.2, '256 blocs a 200 ms = 51,2 s');
eq(secondesPour(256, 0), null, 'temps de bloc nul -> null');

/* 4. les textes (anglais, calcules) */
eq(dureeTexte(51.2), '~51 s', '51,2 s');
eq(dureeTexte(512), '~9 min', '512 s');
eq(dureeTexte(90), '~2 min', '90 s');
eq(dureeTexte(3 * 3600), '~3 h', '3 h');
eq(dureeTexte(3 * 86400), '~3 days', '3 jours');
eq(dureeTexte(0.4), '~0 s', '0,4 s');
eq(dureeTexte(null), null, 'inconnu -> null');
eq(texteBlocs(256, 0.2), '256 blocks (~51 s at the measured block time)', 'fenetre a 200 ms');
eq(texteBlocs(256, 2), '256 blocks (~9 min at the measured block time)', 'fenetre a 2 s');
eq(texteBlocs(1, 2), '1 block (~2 s at the measured block time)', 'singulier');
eq(texteBlocs(256, null), '256 blocks', 'temps de bloc non mesure : on ne dit QUE les blocs');

/* 5. le sondage : assez souvent pour la fenetre (~8 lectures par fenetre), jamais plus vite que 2 s, jamais plus lent que 20 s */
eq(intervalleSondageMs(secondesPour(256, 2)), 20000, '2 s/bloc : fenetre 512 s -> 20 s (inchange)');
eq(intervalleSondageMs(secondesPour(256, 0.2)), 6400, '200 ms/bloc : fenetre 51,2 s -> 6,4 s');
ok(secondesPour(256, 0.2) * 1000 / intervalleSondageMs(secondesPour(256, 0.2)) >= 8, 'au moins 8 lectures dans une fenetre de 51 s');
eq(intervalleSondageMs(5), 2000, 'plancher 2 s');
eq(intervalleSondageMs(null), 5000, 'fenetre inconnue -> 5 s (sur pour une fenetre de 51 s)');
eq(pasAttenteBlocMs(2), 2000, 'attente d un bloc a 2 s : 2 s');
eq(pasAttenteBlocMs(0.2), 250, 'attente d un bloc a 200 ms : 250 ms (plancher)');
eq(pasAttenteBlocMs(null), 1000, 'inconnu : 1 s');

console.log('test-temps-de-bloc : ' + n + ' assertions, OK');
