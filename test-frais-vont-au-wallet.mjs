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
      const RETRACTATION = /earlier version|retracted|overclaim|was wrong|no longer/i;
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
