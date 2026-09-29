// test-frais-vont-au-wallet.mjs — QUI QUE CE SOIT QUI OUVRE UN MARCHE SUR NOS HOOKS NOUS PAIE.
//
// ⛔⛔ POURQUOI CE FICHIER EXISTE (Phil, 2026-09-21) : « rendre possible a redeploy avec nos fees,
//     pour ca que le fix de ses fees est capital pour la reussite de notre projet, sans le reste ne
//     sert a rien ». Le depot est public et fait pour etre forke. La question n est donc pas
//     « est-ce que NOUS sommes payes » mais « est-ce qu un COPIEUR peut rediriger l argent ».
//
// ⛔ LA REPONSE EST DANS LE CONTRAT, PAS DANS UNE LICENCE : `address public immutable feeWallet`,
//    ecrit une seule fois au constructeur, sans setter, sans owner, sans admin. Changer la constante
//    dans ce depot ne change RIEN sur la chaine. C est ce que ce fichier verifie, des deux cotes :
//    dans la SOURCE (aucun setter n a ete ajoute) et sur la CHAINE (le hook deploye rend bien a6cf).
//
// ⛔ LA LIMITE, ET ELLE EST DITE : un copieur peut deployer SON PROPRE hook avec SON wallet. Rien ne
//    l en empeche, et pretendre le contraire serait faux. Ce qui est garanti, c est qu il ne peut
//    pas utiliser LE NOTRE en detournant l argent — et que ses blocks ne seront alors pas les notres.
//
// ⛔ LECTURE SEULE. Le test reseau est SAUTE proprement si la chaine est injoignable — mais il
//    l annonce au lieu de passer en silence, parce qu un test qui se saute tout seul est un test vert
//    qui ne prouve rien.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { FEE_WALLET, FRAIS_OUVERTURE_WEI } from './frais-creation.js';
import { HOOK_V5, HOOK_V6, HOOK_V7, HOOK_V8 } from './tokenomics.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

/* ⛔⛔ LE MARQUEUR DE RETRACTATION, DEFINI UNE SEULE FOIS ET POUR LES DEUX GARDES DE CETTE PAGE.
 *     Une garde qui interdit une phrase fautive doit laisser passer LA RETRACTATION, qui cite
 *     forcement cette phrase pour dire qu elle etait fausse. Interdire de citer une erreur
 *     reviendrait a interdire de la corriger.
 *   ⛔ ET IL EST HISSE ICI PARCE QUE J AI REFAIT LA FAUTE : la garde du taux, ajoutee le
 *     2026-09-29, s est mise a accuser ma propre retractation — j avais reinvente une liste
 *     d exceptions plus etroite au lieu de reutiliser celle-ci, trois lignes plus bas. Deux
 *     marqueurs jumeaux auraient diverge au premier ajout de texte. */
const RETRACTATION = /This page said|earlier version|retracted|overclaim|was wrong|no longer/i;

/* ══ 1. LA SOURCE : immuable, et personne pour la changer ════════════════════════════════════ */
const SRC = new URL('../tblock-hook/src/TBlockFeeHookV8.sol', import.meta.url);
if (existsSync(SRC)) {
  const src = readFileSync(SRC, 'utf8');
  ok(/address\s+public\s+immutable\s+feeWallet\s*;/.test(src),
    'le wallet de frais est `immutable` dans la source — ecrit au constructeur, jamais apres');
  /* ⛔ LE CONTROLE QUI COMPTE VRAIMENT : qu aucune fonction ne le reassigne. `immutable` l interdit
   *    deja au compilateur, mais une version future pourrait retirer le mot-cle sans que personne
   *    ne le remarque — et c est exactement le genre de changement qui ne casse aucun test. */
  ok(!/function\s+\w*[fF]eeWallet\w*\s*\(/.test(src.replace(/address\s+public\s+immutable\s+feeWallet\s*;/, '')),
    'aucune fonction ne porte un nom de setter du wallet');
  ok(!/\bfeeWallet\s*=/.test(src.replace(/feeWallet\s*=\s*_feeWallet\s*;/, '')),
    'la seule affectation de `feeWallet` est celle du constructeur');
  /* ⛔⛔ PREMIERE VERSION DE CETTE GARDE : elle refusait toute occurrence de `DEFAULT_ADMIN_ROLE`.
   *     Or le hook s en sert pour LIRE, par `staticcall`, si quelqu un est admin du B20 — c est le
   *     verrou de `inscrire`, pas un admin du hook. La garde accusait donc du code sain, et une
   *     garde qui rougit a tort finit desactivee. Elle est RESSERREE, pas retiree : ce qu on refuse,
   *     c est que le HOOK LUI-MEME ait un proprietaire. */
  ok(!/\bonlyOwner\b|\bis\s+Ownable\b|\bOwnable\s*\(/.test(src),
    'le hook n herite d aucun Ownable et n a aucun modificateur onlyOwner');
  ok(!/\b(address|bytes32)\s+(public|internal|private)?\s*(immutable\s+)?(owner|_owner|admin|_admin)\b/.test(src),
    'le hook ne declare aucune variable owner/admin — il n y a personne a qui prendre le controle');
} else {
  /* ⛔ ON NE FAIT PAS SEMBLANT : sans la source, ce pan n a PAS ete verifie. */
  ok(false, 'source du hook V8 introuvable — l immuabilite du wallet n est PAS verifiee');
}

/* ══ 2. LA CHAINE : les hooks deployes rendent bien NOTRE wallet ═════════════════════════════ */
const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
const SEL_FEE_WALLET = '0xf25f4b56'; /* feeWallet() — recopie du descripteur de deploiement */
let idRpc = 1;
async function appel(to, data) {
  for (let e = 0; e < 6; e++) {
    try {
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: idRpc++, method: 'eth_call',
          params: [{ to, data }, 'latest'] }) });
      const j = await r.json();
      if (!j.error) return String(j.result || '');
      if (!/rate limit|limit exceeded|too many/i.test(j.error.message || '')) return null;
    } catch (_) { /* reseau : on reessaie */ }
    await new Promise((f) => setTimeout(f, 500 * (e + 1)));
  }
  return null;
}

/* ══ CE QUE LE CONTRAT EXIGE N EST PAS CE QUE L APP ENVOIE ═══════════════════════════════════
 * ⛔⛔ LE DEFAUT QUE CE BLOC EXISTE POUR EMPECHER (Phil, 2026-09-21 : « t'as dit n'importe quoi,
 *     recherche toujours »). J avais ecrit, dans le README, dans DEPLOY.md et dans la description
 *     publique du depot, qu un fork « ne peut pas rediriger les frais ». C etait faux DEUX FOIS :
 *       · un fork peut deployer SON hook — je le disais plus bas, puis je l ai aplati en absolu ;
 *       · et meme sur NOS hooks, `inscrire` n exige que `msg.value >= fraisVie`. Or `fraisVie()`
 *         rend 0,0003 ETH, pendant que notre app choisit d envoyer 0,001 ETH. Un fork peut donc
 *         envoyer le minimum et nous payer 70 % de moins, sans rien deployer.
 * ⛔ LA LECON : un montant decide dans l APP n est pas un montant garanti par la CHAINE. Les deux
 *    se ressemblent dans une doc et n ont rien a voir. Ce test les confronte. */
const SEL_FRAIS_VIE = '0xbb2c8161'; /* fraisVie() — keccak recalcule, pas recopie de memoire */
{
  const r = await appel(HOOK_V8, SEL_FRAIS_VIE);
  if (r === null || !/^0x[0-9a-f]{64}$/i.test(r)) {
    console.log('   · fraisVie() illisible — le minimum on-chain n est PAS verifie ce passage');
  } else {
    const minimum = BigInt(r);
    ok(minimum > 0n, 'le hook exige un minimum non nul a l ouverture');
    ok(minimum <= FRAIS_OUVERTURE_WEI,
      'ce que l app envoie (' + FRAIS_OUVERTURE_WEI + ') couvre le minimum exige (' + minimum + ')');
    /* ⛔ LA GARDE QUI COMPTE : si les deux divergent, la doc ne doit PAS parler d un montant
     *    garanti. Elle ne bloque pas — elle force la phrase honnete. */
    const DOC = readFileSync(new URL('./DEPLOY.md', import.meta.url), 'utf8');
    if (minimum < FRAIS_OUVERTURE_WEI) {
      ok(/fraisVie/.test(DOC) && /0\.0003 ETH/.test(DOC),
        'le minimum on-chain (' + minimum + ') est INFERIEUR a ce que l app envoie ('
        + FRAIS_OUVERTURE_WEI + ') : DEPLOY.md doit le dire, sinon la doc promet un montant que la '
        + 'chaine n impose pas');
      /* ⛔⛔ PREMIERE VERSION : `!/cannot redirect/i.test(DOC)`. Elle a virse au rouge sur MA PROPRE
       *     RETRACTATION, qui cite forcement la phrase fautive pour dire qu elle etait fausse.
       *     Interdire de citer une erreur reviendrait a interdire de la corriger — c est exactement
       *     l inverse du but. La garde refuse donc l AFFIRMATION, pas la citation : une ligne qui
       *     porte un marqueur de retractation est admise. */
      /* La constante est desormais HISSEE en haut du fichier, et partagee avec la garde du taux. */
      const affirme = DOC.split('\n')
        .filter((l) => /cannot redirect/i.test(l) && !RETRACTATION.test(l));
      ok(affirme.length === 0,
        'DEPLOY.md ne doit plus AFFIRMER qu un fork << cannot redirect >> — il le peut, de deux '
        + 'facons mesurees. Ligne(s) fautive(s) : ' + affirme.map((l) => '« ' + l.trim() + ' »').join(' · '));
    }
  }
}

const HOOKS = [['V5', HOOK_V5], ['V6', HOOK_V6], ['V7', HOOK_V7], ['V8', HOOK_V8]];
let lus = 0;
for (const [nom, adr] of HOOKS) {
  const r = await appel(adr, SEL_FEE_WALLET);
  if (r === null || !/^0x[0-9a-f]{64}$/i.test(r)) {
    console.log('   · ' + nom + ' : illisible (chaine injoignable) — NON VERIFIE, et ce n est pas un succes');
    continue;
  }
  lus++;
  eq('0x' + r.slice(26).toLowerCase(), FEE_WALLET.toLowerCase(),
    'le hook ' + nom + ' deploye verse a NOTRE wallet, lu sur la chaine');
}
if (lus === 0) {
  console.log('   ⛔ AUCUN hook lu sur la chaine. Le pan « chaine » de ce test n a rien prouve.');
} else {
  ok(lus >= 1, lus + ' hook(s) confronte(s) a la chaine');
}

/* ══ 2bis. LE TAUX — ET IL N ETAIT PAS TESTE DU TOUT ═══════════════════════════════════════════
 * ⛔⛔ CE QUE CE TEST A LAISSE PASSER PENDANT UNE SEMAINE. `DEPLOY.md` renvoyait ici pour verifier
 *     « the 0.5 % swap rate … while using our hooks », et ce fichier NE LISAIT JAMAIS `HOOK_FEE()`.
 *     Il ne couvrait meme que V5 a V8. Mesure du 2026-09-29 : `HOOK_FEE()` rend **5 000 sur V8**
 *     (0,5 %, le hook que l app utilise d apres `deploy-v8.json`) mais **30 000 sur V2 a V7**,
 *     soit 3 % a la meme echelle 1e6. Six de nos huit hooks ne portent donc PAS le taux que la
 *     page annoncait — et le garde cense le prouver ne regardait pas.
 *   ⛔ ON GELE LE TAUX MESURE PAR HOOK, pas une moyenne ni une intention : si V8 cessait d etre a
 *     5 000, ou si un ancien passait a autre chose, ce test rougit et la page doit etre relue.
 *   ⛔ UN HOOK ILLISIBLE N EST PAS UN HOOK CONFORME : il est compte a part, jamais comme un succes.
 */
{
  /* ⛔ LE SELECTEUR EST RECALCULE, pas recopie : un selecteur recite est un nombre magique, et
   *   `selecteur()` du depot rend deja le prefixe `0x` dont `appel` a besoin. */
  const { selecteur } = await import('./keccak.js');
  const SEL_HOOK_FEE = selecteur('HOOK_FEE()');
  /* ⛔ `DOC` du bloc precedent est hors de portee ici : on relit la page plutot que d elargir une
   *   portee, parce qu une variable partagee entre deux controles les rend dependants. */
  const DOC = existsSync(new URL('./DEPLOY.md', import.meta.url))
    ? readFileSync(new URL('./DEPLOY.md', import.meta.url), 'utf8') : null;
  /* les huit adresses, pas quatre : l ancien perimetre etait la moitie du probleme */
  const TOUS = [
    ['V1', '0xaa6d7bd9fc7d394bc717137936f2939834382044', null],
    ['V2', '0x8e1eb57ad2a87a4f7bc89ce94efd5cd77aec2044', 30000n],
    ['V3', '0x7a7cebb2ccb84c9fbfa2730e6cb23bb192166044', 30000n],
    ['V4', '0x11fcd588c96b1781cc88b8b9f349b6067d9be4c4', 30000n],
    ['V5', '0x799136c3f5f572f1597b5b7e067d3ee45fe4a4c4', 30000n],
    ['V6', '0xd71af554b5b3dcb6bb17946cfa3c41860a50a4cc', 30000n],
    ['V7', '0xb5680fc44ea440fc223d1ca62f2b4f261fda24cc', 30000n],
    ['V8', '0x5926abdabf5d0006ee960a8270f3e124e5a764cc', 5000n],
  ];
  let tauxLus = 0, illisibles = [];
  for (const [nom, adr, attendu] of TOUS) {
    const r = await appel(adr, SEL_HOOK_FEE);
    const vide = r === null || !/^0x[0-9a-f]{2,}$/i.test(r) || r === '0x';
    if (attendu === null) {
      /* ⛔ V1 NE DECLARE PAS `HOOK_FEE` : mesure du 2026-09-29 par extraction des PUSH4 de son
       *   bytecode. On l affirme donc, au lieu de le passer sous silence. */
      ok(vide, 'V1 ne declare pas HOOK_FEE() — mesure, pas suppose');
      continue;
    }
    if (vide) { illisibles.push(nom); continue; }
    tauxLus += 1;
    eq(String(BigInt(r)), String(attendu),
      'HOOK_FEE() du hook ' + nom + ' vaut ' + attendu + ' ('
      + (Number(attendu) / 10000).toFixed(2) + ' %), lu sur la chaine');
  }
  if (illisibles.length) {
    console.log('   · taux NON LUS (chaine injoignable) : ' + illisibles.join(', ')
      + ' — NON VERIFIE, et ce n est pas un succes');
  }
  ok(tauxLus >= 1, tauxLus + ' taux confronte(s) a la chaine');
  /* ⛔⛔ ET LA PAGE DOIT PORTER L ECART. Sans cette garde, quelqu un « nettoierait » la
   *     retractation et la page redeviendrait fausse en silence. */
  if (DOC) {
    ok(/30\s*000|30_000/.test(DOC),
      'DEPLOY.md doit nommer les 30 000 de V2-V7 : sans ca, la page laisse croire que « nos hooks » '
      + 'prelevent tous 0,5 %, ce qui est faux pour six des huit');
    /* ⛔ MEME MARQUEUR QUE L AUTRE GARDE : une retractation cite forcement la phrase fautive. */
    const affirmeUniforme = DOC.split('\n').filter((l) =>
      /0\.5\s*%/.test(l) && /our hooks/i.test(l) && !RETRACTATION.test(l)
      && !/not 0\.5|see below|six of the eight/i.test(l));
    ok(affirmeUniforme.length === 0,
      'DEPLOY.md ne doit plus affirmer 0,5 % pour « our hooks » sans distinguer V8. Ligne(s) : '
      + affirmeUniforme.map((l) => '« ' + l.trim() + ' »').join(' · '));
  }
}

/* ══ 3. LE TEMOIN — un test qui ne comparerait rien passerait aussi ══════════════════════════ */
{
  const fausseSource = 'address public feeWallet;\nfunction setFeeWallet(address w) external { feeWallet = w; }';
  ok(!/address\s+public\s+immutable\s+feeWallet\s*;/.test(fausseSource),
    'temoin : un wallet NON immuable serait attrape par le controle 1');
  ok(/function\s+\w*[fF]eeWallet\w*\s*\(/.test(fausseSource),
    'temoin : un setter serait attrape — c est la seule chose qui rendrait un fork capable de '
    + 'detourner l argent en gardant nos hooks');
}

console.log('test-frais-vont-au-wallet : ' + n + ' assertions, ' + lus + ' hook(s) lu(s) sur la chaine, OK');
