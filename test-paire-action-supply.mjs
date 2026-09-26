/* test-paire-action-supply.mjs — ON NE PAIRE PAS UN BLOCK NEUF A UNE ACTION QUI N EXISTE PAS.
 *
 * ⛔⛔ CE QUI L A DECIDE, ET C EST UNE MESURE DU 2026-09-26. Les treize « actions Coinbase » de
 *     `paires.js` existent bien sur Base, sont TOUTES des B20 natifs (`0xef` exactement) et leurs
 *     symboles concordent avec ce qu on annonce — 13/13, aucun desaccord. Ma suspicion de depart
 *     (« le prefixe `0xb2…` est imitable, ce sont peut-etre des homonymes ») etait INFONDEE.
 *   ⇒ MAIS TROIS ONT UNE SUPPLY EXACTEMENT NULLE : COINc, CRCLc, INTCc. Et `qualifierPaire` les
 *     rendait avec `verifiee: true`, parce que « verifiee » y veut dire « DANS NOTRE REGISTRE », pas
 *     « EXISTE COMME ACTIF ». L ecran de creation proposait donc de pairer un block a du VIDE : la
 *     pool s ouvrirait contre zero jeton et ne pourrait jamais s echanger.
 *
 * ⛔ LA SONDE NE LE VOYAIT PAS NON PLUS AU DEPART, et ca fait partie de la lecon : elle affichait
 *   « 0.000 » parce qu elle divisait par 1e18 sans lire `decimals()`. Un chiffre juste mais
 *   illisible n avertit pas. Les trois zeros n ont apparu qu apres avoir corrige l AFFICHAGE.
 *
 * ⛔⛔ CE QUE CE TEST DEFEND, C EST LA DISTINCTION QUI COUTE : `supply === 0n` (« le jeton existe,
 *     rien ne circule ») et `supply === null` (« on n a PAS PU lire ») sont deux faits opposes et
 *     doivent produire deux phrases differentes. Les confondre accuserait un jeton sain parce que le
 *     noeud a hoquete — ou, la logique inversee un jour, laisserait passer un jeton vide.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : le rendu a l ecran. Il verifie le contrat du module de faits et la
 *   presence des gardes dans `app.html` par lecture du source — pas un navigateur. Les trois zeros,
 *   eux, ont ete mesures sur la chaine, pas supposes.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { faitsDuBlock } from './faits.js';
import { qualifierPaire, ACTIONS_COINBASE } from './paires.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const casAsync = async (titre, f) => { n++; try { await f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

const ADR = ACTIONS_COINBASE[0].adr;
const mot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
/** Un noeud local : `0xef` pour le code, et la supply qu on lui demande de rendre. */
function noeud({ supply = 1000n, codeEf = true, supplyRefuse = false } = {}) {
  return async (m, p) => {
    if (m === 'eth_getCode') return codeEf ? '0xef' : '0x60806040';
    if (m === 'eth_call') {
      const data = String((p && p[0] && p[0].data) || '');
      /* selecteurs : on ne devine pas, on repond a tout par defaut et on distingue totalSupply */
      if (data.startsWith('0x18160ddd')) {                     /* totalSupply() */
        if (supplyRefuse) throw new Error('node hiccup');
        return mot(supply);
      }
      if (data.startsWith('0x313ce567')) return mot(6);          /* decimals() */
      return mot(0);
    }
    throw new Error('methode non prevue : ' + m);
  };
}

/* ── 1. le module de faits distingue bien les trois etats ───────────────────────────────────── */
await casAsync('une supply nulle est rendue 0n, PAS null', async () => {
  const f = await faitsDuBlock({ rpc: noeud({ supply: 0n }), jeton: ADR });
  assert.equal(f.supply, 0n, 'une supply nulle n est pas rendue comme 0n');
  assert.notEqual(f.supply, null, 'une supply nulle est confondue avec « non lu »');
});

await casAsync('une supply ILLISIBLE est rendue null, PAS 0n', async () => {
  /* ⛔⛔ LE CAS SYMETRIQUE, ET C EST LUI QUI PROTEGE LES JETONS SAINS. Si une lecture ratee rendait
   *     `0n`, l ecran accuserait un jeton parfaitement valide d etre vide. */
  const f = await faitsDuBlock({ rpc: noeud({ supplyRefuse: true }), jeton: ADR });
  assert.equal(f.supply, null, 'une lecture ratee est rendue comme une supply de zero');
  assert.ok(f.manques.includes('totalSupply'), 'la lecture ratee n est pas signalee dans `manques`');
});

await casAsync('une supply reelle passe', async () => {
  const f = await faitsDuBlock({ rpc: noeud({ supply: 4114810000n }), jeton: ADR });
  assert.equal(f.supply, 4114810000n, 'une supply reelle n est pas rendue telle quelle');
  assert.equal(f.estB20, true, 'un code `0xef` n est pas reconnu comme B20');
});

/* ── 2. le registre annonce « verifiee » sans rien savoir de la supply ──────────────────────── */
cas('⛔ `qualifierPaire` dit « verifiee » pour une action, SANS lire la chaine', () => {
  /* ⛔ CE TEST FIGE LE DEFAUT PLUTOT QUE DE LE CACHER : la fonction est PURE, donc elle ne PEUT PAS
   *   connaitre la supply — et c est tres bien, c est ce qui la rend testable. Le point est que
   *   « verifiee » n a jamais voulu dire « existe », et que la garde doit donc vivre EN AVAL. */
  const q = qualifierPaire(ADR, 8453);
  assert.equal(q.etat, 'OK', 'une action du registre est refusee');
  assert.equal(q.paire.verifiee, true, 'le registre ne marque plus ses actions comme verifiees');
  assert.equal(q.paire.supply, undefined,
    'la fonction pure pretend connaitre une supply — elle ne lit pas la chaine');
});

/* ── 3. la garde est bien EN AVAL, dans l ecran de creation ─────────────────────────────────── */
const src = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
/* ⛔ On extrait la FONCTION par equilibrage d accolades, pas par une fenetre de N caracteres : une
 *   fenetre fixe se met a mesurer la fonction suivante des que le fichier grossit, et devient verte
 *   sur elle. Ce piege m a deja coute un test qui tenait la mauvaise moitie. */
function corpsDe(nom) {
  const i = src.indexOf(nom);
  assert.notEqual(i, -1, 'fonction introuvable dans app.html : ' + nom);
  const debut = src.indexOf('{', i);
  let p = 0;
  for (let k = debut; k < src.length; k++) {
    if (src[k] === '{') p++;
    else if (src[k] === '}') { p--; if (p === 0) return src.slice(debut, k + 1); }
  }
  assert.fail('accolades non equilibrees pour ' + nom);
}
const majPaire = corpsDe('async function majPaire');

cas('une ACTION passe par le controle on-chain', () => {
  assert.match(majPaire, /q\.paire\.type === 'ACTION'/,
    'les actions du registre ne passent pas par le controle on-chain');
});

cas('la garde refuse une supply de ZERO **et** une supply non lue', () => {
  /* ⛔ LA GARDE DOIT TESTER LES DEUX. Une garde sur `=== 0n` seule laisserait passer un jeton dont
   *   la supply n a pas pu etre lue : l echec serait OUVERT, exactement le defaut trouve le meme
   *   jour dans notre autre paywall (`init failed -> paywall disabled`). */
  assert.match(majPaire, /f\.supply === null \|\| f\.supply === 0n/,
    'la garde ne refuse pas les DEUX cas (zero ET non lu)');
});

cas('les deux refus ne disent PAS la meme phrase', () => {
  /* ⛔ Une garde peut etre VRAIE et couvrir la mauvaise moitie : si les deux etats produisaient le
   *   meme texte, le visiteur ne saurait pas s il doit changer de jeton ou simplement reessayer. */
  assert.match(majPaire, /no units in circulation/, 'le refus « supply zero » ne dit pas sa cause');
  assert.match(majPaire, /could not read how many units exist/,
    'le refus « non lu » n est pas distingue du refus « supply zero »');
});

cas('une action GARDE son type apres le controle', () => {
  /* ⛔ UNE VALEUR JUSTE DEJA PRESENTE NE DOIT PAS ETRE EFFACEE PAR UN CONTROLE AJOUTE. La promotion
   *   en `B20` sert a une adresse SAISIE, qui n avait pas de type ; l appliquer a une action lui
   *   ferait perdre son etiquette « Coinbase tokenized stock ». */
  assert.match(majPaire, /if \(!estAction\) q\.paire\.type = 'B20';/,
    'le controle ecrase le type d une action et lui fait perdre son etiquette');
});

/* ⛔ LE COMPTE A ATTRAPE MON PROPRE COMPTE : j avais ecrit 9, il y en a 8. C est exactement a ca
 *   qu il sert — sans lui, ajouter un cas et oublier de l appeler passerait inapercu. */
assert.equal(n, 8, 'compte de cas inattendu : ' + n);
console.log('ok paire-action-supply — ' + n + ' cas.');
console.log('   `0n` et `null` restent DEUX faits distincts, et les deux ferment la paire —');
console.log('   avec deux phrases differentes. Une action garde son etiquette.');
console.log('⚠️ MESURE, pas supposition : sur les 13 actions declarees, 13 existent, 13 symboles');
console.log('   concordent, et TROIS ont une supply nulle (COINc, CRCLc, INTCc).');
console.log('⚠️ NE PROUVE PAS le rendu a l ecran : les gardes sont lues dans le source, pas dans un');
console.log('   navigateur.');
