// test-cerveau-ne-signe-pas.mjs — LE CERVEAU PROPOSE. L HUMAIN SIGNE. CETTE LIGNE EST LA GARDE.
// ================================================================================================
// ⛔⛔ POURQUOI CE FICHIER EXISTE (2026-09-22). `relais-cerveaux.js` annonce depuis le 2026-09-14 :
//     « chaque outil rendu porte `signeParUtilisateur: true` ET UN TEST SCANNE LE MODULE ».
//     `metiers.js` annonce la meme chose deux fois.
//     ⇒ CE TEST N EXISTAIT PAS. Verifie : aucun `test-*.mjs` n importait ni l un ni l autre.
//     Une garde annoncee dans un commentaire ne borne RIEN — elle rassure celui qui la lit et ne
//     touche personne. Et c etait la garde de l invariant CENTRAL du produit.
//
// ⛔ CE QUE L INVARIANT DIT, ET IL EST DE PHIL, PAS DE MOI. Il est ecrit dans chaque module :
//     `cerveau.js`        « il VIT, il se NOURRIT, il peut MOURIR — et il NE TRADE PAS »
//     `journal-cerveau.js` « LE BLOCK NE SIGNE RIEN. Il ecrit ; un humain agit. »
//     `regles-cerveau.js` « Aucun `eval`, aucun `Function` […] elle ne signe rien, n envoie rien »
//     `brain-tasks.js`    « Agents READ; user wallet SIGNS. »
//    C est aussi ce qui se vend : un agent qui ne peut pas bouger d argent. Un invariant qui se
//    vend et qui n est garde par rien est la premiere chose qu on perd.
//
// ⛔ LA LISTE DES MODULES SE DECOUVRE TOUTE SEULE. Une liste ecrite a la main laisserait passer le
//    PROCHAIN fichier — et le prochain fichier est justement celui qu on ajoute le jour ou on
//    demande au cerveau de faire quelque chose de nouveau. Tout `*cerveau*.js` du dossier est
//    scanne, plus une liste nommee pour ceux qui ne portent pas le mot.
//
// ⛔ LES COMMENTAIRES SONT RETIRES AVANT LE SCAN. Ce qui est interdit, c est une CAPACITE, pas un
//    mot. Sans ca, la phrase « ce module n appelle jamais eth_sendTransaction » ferait rougir le
//    test — et quelqu un supprimerait l explication pour le faire passer, ce qui est exactement le
//    contraire du but.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

/** Les modules qui forment le cerveau : decouverts, plus ceux qui ne portent pas le mot. */
const NOMMES = ['brain-tasks.js', 'metiers.js', 'pointsdevie.js'];
const MODULES = [...new Set([
  ...readdirSync('.').filter((f) => /cerveau/i.test(f) && f.endsWith('.js')),
  ...NOMMES,
])].sort();

/* ⛔ SI LA DECOUVERTE NE TROUVE RIEN, LE TEST DOIT ROUGIR, PAS PASSER. Une boucle sur une liste
 *    vide ne leve aucune assertion et rend un vert parfait — c est le retour neutre qui avale
 *    l echec, et il a deja coute une garde dans ce projet. */
ok(MODULES.length >= 8, MODULES.length + ' module(s) de cerveau decouverts : ' + MODULES.join(', '));

/** Ce qu un module du cerveau ne doit JAMAIS pouvoir faire, avec la raison de chaque interdit. */
const CAPACITES = [
  { re: /\beth_sendTransaction\b|\bsendTransaction\s*\(|\bsendCalls\b/,
    quoi: 'envoyer une transaction — le cerveau proposerait ET executerait' },
  { re: /\bpersonal_sign\b|\beth_sign(Typed)?(Data)?\b|\bsignTransaction\s*\(|\b_signTypedData\b/,
    quoi: 'signer — une signature est un acte, pas une proposition' },
  { re: /\bprivateKey\b|\bPRIVATE_KEY\b|\bmnemonic\b|\bnew\s+Wallet\s*\(/i,
    quoi: 'porter une cle — un cerveau qui detient une cle est un wallet, et le produit devient custodial' },
  { re: /\beval\s*\(|new\s+Function\s*\(/,
    quoi: 'executer du texte — les regles que le block ecrit sont LISIBLES et ne s executent pas' },
  { re: /\bwindow\.ethereum\b|\bprovider\.request\s*\(/,
    quoi: 'atteindre le wallet directement, en contournant le chemin ou l humain voit ce qu il signe' },
  { re: /\bfetch\s*\(|XMLHttpRequest/,
    quoi: 'lire le reseau lui-meme — le cerveau raisonne sur des faits qu on lui DONNE, sinon il '
      + 'devient sa propre source et plus personne ne peut recalculer ce qu il a vu' },
];

/** Retire commentaires et chaines : on cherche une CAPACITE, pas une occurrence du mot.
 * ⛔ Les chaines partent aussi — un `'eth_sendTransaction'` dans un catalogue de noms est une
 *    DONNEE, pas un appel. `brain-tasks.js` est precisement un catalogue. */
function codeSeul(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

const fautes = [];
let octetsScannes = 0;
for (const f of MODULES) {
  let src;
  /* ⛔ UN FICHIER ILLISIBLE EST UNE FAUTE, PAS UN SAUT. Le sauter en silence rendrait la garde
   *    verte sur un module qu elle n a pas regarde — exactement ce qu elle existe pour empecher. */
  try { src = readFileSync(f, 'utf8'); } catch (e) {
    fautes.push({ f, quoi: 'ILLISIBLE (' + e.code + ') — un module non lu n est pas un module sain' });
    continue;
  }
  octetsScannes += src.length;
  const code = codeSeul(src);
  for (const c of CAPACITES) {
    const m = code.match(c.re);
    if (m) fautes.push({ f, quoi: c.quoi, extrait: m[0] });
  }
}
ok(octetsScannes > 20000, octetsScannes + ' octets de code scannes — la garde a vraiment lu');
ok(fautes.length === 0,
  fautes.length + ' capacite(s) interdite(s) dans le cerveau :\n'
  + fautes.map((x) => '      ' + x.f + ' — ' + x.quoi + (x.extrait ? '  [' + x.extrait + ']' : '')).join('\n'));

/* ══ LE TEMOIN — sans lui, un scanner qui ne trouverait JAMAIS rien passerait aussi ══════════
 * ⛔ C est le defaut le plus probable ici : une regexp mal ecrite, un `codeSeul` trop gourmand qui
 *    mange tout le fichier, et la garde devient un decor. On lui donne donc du code dont on SAIT
 *    qu il doit rougir, et on exige qu elle le voie. */
{
  const piege = [
    ['const k = privateKey;', 'porter une cle'],
    ['await window.ethereum.request({ method: "eth_sendTransaction" });', 'envoyer'],
    ['const r = eval(regle);', 'executer du texte'],
    ['await fetch("https://exemple");', 'lire le reseau'],
    ['await signer.signTransaction(tx);', 'signer'],
  ];
  for (const [ligne, nom] of piege) {
    const vu = CAPACITES.some((c) => c.re.test(codeSeul(ligne)));
    ok(vu, 'temoin : « ' + ligne.slice(0, 44) + '… » EST attrape (' + nom + ')');
  }
  /* ⛔ ET LE TEMOIN INVERSE : du code sain et de la PROSE qui parle des interdits ne doivent PAS
   *    rougir. Une garde qui accuse les explications se fait desamorcer en supprimant les
   *    explications — et on perd les deux. */
  for (const sain of [
    '/* ce module n appelle jamais eth_sendTransaction ni eval */',
    "// LE BLOCK NE SIGNE RIEN : pas de privateKey, pas de window.ethereum",
    "const CATALOGUE = ['eth_sendTransaction', 'personal_sign'];",
    'return { genre, texte, parce_que, signeParUtilisateur: true };',
  ]) {
    const vu = CAPACITES.some((c) => c.re.test(codeSeul(sain)));
    ok(!vu, 'temoin inverse : du commentaire ou une donnee ne rougit PAS — « ' + sain.slice(0, 40) + '… »');
  }
}

/* ══ TOUTE PROPOSITION PORTE SA MARQUE ═══════════════════════════════════════════════════════
 * ⛔ C est l autre moitie de la promesse, et elle se verifie sur les modules qui PROPOSENT. Un
 *    module qui rendrait un outil sans `signeParUtilisateur: true` laisserait croire a l appelant
 *    qu il peut l executer tel quel. */
{
  const proposeurs = ['relais-cerveaux.js', 'metiers.js'];
  let marques = 0;
  for (const f of proposeurs) {
    const src = readFileSync(f, 'utf8');
    const k = (src.match(/signeParUtilisateur:\s*true/g) || []).length;
    ok(k > 0, f + ' marque ses propositions : ' + k + ' x `signeParUtilisateur: true`');
    marques += k;
    /* ⛔ ET AUCUNE NE DOIT ETRE MARQUEE `false` — ce serait une proposition qui s annonce
     *    executable, ce que rien dans ce produit n a le droit d etre. */
    eq(/signeParUtilisateur:\s*false/.test(src), false,
      f + " : aucune proposition ne s annonce signable sans l humain");
  }
  ok(marques >= 5, marques + ' proposition(s) marquees au total — pas une seule vitrine');
}

console.log('test-cerveau-ne-signe-pas : ' + n + ' assertions, ' + MODULES.length + ' module(s), '
  + octetsScannes + ' octets scannes, OK');
