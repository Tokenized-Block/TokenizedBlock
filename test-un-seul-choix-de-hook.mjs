// test-un-seul-choix-de-hook.mjs — LE HOOK D UN NOUVEAU MARCHE SE CHOISIT A UN SEUL ENDROIT.
//
// ⛔⛔ LE DEFAUT QUE CE FICHIER EXISTE POUR EMPECHER (mesure du 2026-09-21). L app avait DEUX
//     chemins d ouverture de marche, et ils ne choisissaient pas le meme hook :
//       · Launch pas a pas lisait la chaine et prenait le plus recent hook deploye ;
//       · Create « une seule signature » ecrivait `const hook = HOOK_V5;` EN DUR.
//     Et la garde censee rendre ce second chemin optionnel interroge `#cVieDirecte`, un element qui
//     n existe dans AUCUNE page servie : elle est donc toujours fausse, et ce chemin tourne a chaque
//     Create sur mainnet. Resultat MESURE : les hooks V6, V7 et V8 ont ete deployes, verifies,
//     annonces — et sont restes a 0 marche. On a cherche l explication du cote de la demande, du
//     taux de frais, de la devise. Elle etait dans une constante.
//
// ⛔ LA LECON : une meme decision prise a deux endroits finit toujours par diverger, et le correctif
//    applique a l un ne suit jamais l autre. Ce test ne verifie pas que le choix est BON — il
//    verifie qu il n existe qu UNE FOIS.
//
// ⛔ LA BORNE DE CE FICHIER : il lit du texte. Il ne peut pas prouver qu aucun autre mecanisme ne
//    fixe un hook (une valeur venue d un JSON, par exemple). Ce qu il attrape est la forme exacte
//    du defaut constate, et le temoin en bas le prouve.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hookCourant, HOOK_V8, HOOK_V7, HOOK_V6, HOOK_V5, HOOK_V4, HOOK_PREVU } from './tokenomics.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const page = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

/* ══ 1. LE MOTIF INTERDIT : un hook ECRIT EN DUR dans la variable qui part au lancement ═════════ */
/** Les lignes qui affectent directement une constante HOOK_* a une variable `hook`/`hooks`. */
function affectationsEnDur(texte) {
  return texte.split('\n')
    .map((l, i) => ({ n: i + 1, l }))
    .filter(({ l }) => /(?:const|let|var)\s+hooks?\s*=\s*HOOK_[A-Z0-9_]+\s*;/.test(l));
}
const enDur = affectationsEnDur(page);
eq(enDur.length, 0, 'app.html ne doit plus ecrire aucun hook en dur — trouve : '
  + enDur.map((x) => 'ligne ' + x.n + ' « ' + x.l.trim() + ' »').join(' · '));

/* ══ 2. LES DEUX CHEMINS PASSENT PAR LA MEME FONCTION ══════════════════════════════════════════ */
const appels = (page.match(/await\s+hookCourant\s*\(/g) || []).length;
ok(appels >= 2, 'les DEUX chemins d ouverture appellent hookCourant — trouve ' + appels + ' appel(s)');
ok(/creerEtVivreUneSignature/.test(page), 'le chemin « une seule signature » existe toujours');

/* ══ 3. L ECHELLE PREFERE LE PLUS RECENT, ET « NON_LU » N EST PAS « DEPLOYE » ═══════════════════ */
/** Un rpc de laboratoire : seules les adresses listees ont du code. */
const rpcAvec = (deployes) => async (m, p) => {
  if (m !== 'eth_getCode') throw new Error('appel inattendu : ' + m);
  const a = String(p[0]).toLowerCase();
  return deployes.some((d) => String(d).toLowerCase() === a) ? '0xdead' : '0x';
};
eq(await hookCourant({ rpc: rpcAvec([HOOK_V8, HOOK_V7, HOOK_V6]) }), HOOK_V8,
  'tous deployes → le plus recent (V8, le taux de 0,5 %)');
eq(await hookCourant({ rpc: rpcAvec([HOOK_V7, HOOK_V6]) }), HOOK_V7, 'sans V8 → V7');
eq(await hookCourant({ rpc: rpcAvec([HOOK_V6]) }), HOOK_V6, 'sans V7 → V6');
eq(await hookCourant({ rpc: rpcAvec([HOOK_V5]) }), HOOK_V5, 'sans V6 → V5');
eq(await hookCourant({ rpc: rpcAvec([HOOK_V4]) }), HOOK_V4, 'sans V5 → V4');

/* ⛔ LE PIEGE QUI COMPTE : un noeud qui tousse ne doit jamais faire CHOISIR un hook. */
const rpcMuet = async () => { throw new Error('noeud injoignable'); };
eq(await hookCourant({ rpc: rpcMuet, etatV1: 'DEPLOYE' }), HOOK_PREVU,
  'chaine illisible → on retombe sur le V1 connu deploye, jamais sur un hook non lu');
eq(await hookCourant({ rpc: rpcMuet, etatV1: 'NON_LU' }), undefined,
  'chaine illisible et V1 non lu → AUCUN hook, plutot qu un hook suppose');

/* ⛔ Le V1 n admet que l ETH : une devise ne doit jamais y atterrir. */
eq(await hookCourant({ rpc: rpcAvec([]), avecDevise: true, etatV1: 'DEPLOYE' }), undefined,
  'une paire en devise ne retombe PAS sur le V1, qui ne sait pas la traiter');
eq(await hookCourant({ rpc: rpcAvec([]), avecDevise: false, etatV1: 'DEPLOYE' }), HOOK_PREVU,
  'une paire en ETH, elle, peut retomber sur le V1');

/* ⛔ `mainnet` ne doit pas SURCLASSER un hook plus recent : V4/V5 y sont reputes deployes, mais le
 *    V8 doit rester prioritaire. Une garde peut etre vraie et couvrir la mauvaise moitie. */
eq(await hookCourant({ rpc: rpcAvec([HOOK_V8]), mainnet: true }), HOOK_V8,
  'sur mainnet, le V8 passe toujours avant les V4/V5 reputes deployes');
eq(await hookCourant({ rpc: rpcAvec([]), mainnet: true }), HOOK_V5,
  'sur mainnet sans V6/V7/V8, on descend au V5 — pas plus bas');

/* ══ 4. LE TEMOIN — sans lui, un detecteur qui ne detecte rien passerait aussi ══════════════════ */
{
  const faux = 'function x() {\n  const hook = HOOK_V5;\n  return hook;\n}';
  const attrape = affectationsEnDur(faux);
  eq(attrape.length, 1, 'temoin : la ligne exacte du 2026-09-21 EST attrapee par le detecteur');
  eq(affectationsEnDur('  const hook = await hookCourant({ rpc });').length, 0,
    'temoin inverse : la forme CORRIGEE n est pas signalee a tort');
}

console.log('test-un-seul-choix-de-hook : ' + n + ' assertions, OK');
