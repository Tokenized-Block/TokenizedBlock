/* test-create-reserve-gaz-dite-20261004.mjs — CREATE : la somme que l ecran DIT est la somme que la garde EXIGE.
 *
 * LE CONSTAT (QA wallet reel de Grok, 2026-10-04, P1 « e ») : « Create affiche 0.001 ETH alors qu il faut ~0.0015 ETH ».
 * CE QUI A ETE LU DANS LE CODE : l ecart est celui de NOTRE garde d avant-wallet (`preflightInstantBirthEthFixe`), qui exige
 *   frais + seed + reserve de gaz (`GAZ_NAISSANCE_WEI`). La reserve n etait dite par aucune phrase de Create avant le clic, et
 *   le refus ecrivait « (0.001 fee + seed … + gas) » : un frais en dur a cote d un total calcule, « gas » sans montant.
 * CE QUI EST GARDE ICI :
 *   A. frais-creation.js : une somme (`besoinNaissance`), deux phrases qui en DERIVENT.
 *   B. app.html : la garde calcule son besoin par cette fonction ; le refus et la ligne d avant-clic lisent les MEMES
 *      constantes ; aucune somme ecrite a cote ; la constante est initialisee avant le premier appel de haut niveau.
 *   C. COMPORTEMENT : le vrai texte source des deux fonctions d app.html, EXECUTE dans un bac a sable.
 *      Solde 0,0012 ETH -> refus clair AVANT le wallet, qui nomme les « network fees » ; solde non lu -> troisieme etat,
 *      jamais confondu avec « trop court » ; et la somme dite AVANT le clic est celle que la garde rend.
 *   D. MUTANTS : chaque garde retiree fait rougir un juge precis.
 * ⛔ BORNES — ce que ce fichier NE prouve PAS :
 *   · aucun wallet n est ouvert, aucune transaction n est simulee : le frais de reseau REEL d une naissance n est PAS mesure
 *     ici, et la reserve de 0,0005 ETH n est pas jugee (trop haute ou trop basse) — elle est seulement DITE ;
 *   · le rendu a l ecran n est pas regarde (aucun navigateur) : c est le texte ecrit dans `innerHTML` qui est lu ;
 *   · pour une paire autre qu une action, le seed est lu au clic : la ligne d avant-clic dit un MINIMUM (« at least »). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
let n = 0, ko = 0;
const ok = (c, m, vu) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m + (vu === undefined ? '' : '   vu: ' + String(vu).slice(0, 260))); } };
/* ⛔ fin de ligne NORMALISEE a la lecture : app.html est en CRLF sur un checkout Windows, en LF ailleurs. */
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const ETH = (s) => { const [a, b = ''] = String(s).split('.'); return BigInt(a) * 10n ** 18n + BigInt((b + '0'.repeat(18)).slice(0, 18)); };

const F = await imp('frais-creation.js');
const HTML = lire('app.html');
/* ⛔ LA RESERVE EST LUE DANS app.html, jamais recopiee : une arithmetique de test sur une copie ne garde que la copie
 *   (lecon ecrite dans test-repli-plancher-atteignable.mjs, apres une mutation survivante). */
const lireGaz = (html) => { const m = html.match(/\nconst GAZ_NAISSANCE_WEI = (\d+)n;/); return m ? BigInt(m[1]) : null; };
const GAZ = lireGaz(HTML);
ok(GAZ !== null && GAZ > 0n, '0 TEMOIN la reserve de gaz est declaree une fois dans app.html et LUE ici', GAZ);
const FRAIS = F.FRAIS_OUVERTURE_WEI, PLANCHER = F.CREATE_FEE_WEI_FLOOR;

console.log('— A. le module : une somme, deux phrases derivees');
{
  const b = F.besoinNaissance({ fraisWei: 10n, seedWei: 3n, gazWei: 5n });
  ok(b.frais === 10n && b.seed === 3n && b.gaz === 5n && b.total === 18n, 'A la somme est frais + seed + reserve, et ses trois termes sont rendus', JSON.stringify(b, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
  ok(F.besoinNaissance({ fraisWei: 10n, gazWei: 5n }).total === 15n, 'A sans seed passe, le seed vaut zero (pas un plancher invente)');
}
const bAction = F.besoinNaissance({ fraisWei: FRAIS, seedWei: 0n, gazWei: GAZ });
const bAutre = F.besoinNaissance({ fraisWei: FRAIS, seedWei: PLANCHER, gazWei: GAZ });
const dire = (w) => F.formaterEthCourt(w);
ok(F.phraseAvoirPourNaitre(bAction) === 'Network fees come on top: before your wallet opens, this app checks that it holds '
  + dire(FRAIS + GAZ) + ' ETH, of which ' + dire(GAZ) + ' ETH is a reserve for network fees.',
'A avant le clic, paire action : la somme exacte (frais + reserve) et la reserve, toutes deux derivees', F.phraseAvoirPourNaitre(bAction));
ok(F.phraseAvoirPourNaitre(bAutre, { auMoins: true }).includes('holds at least ' + dire(FRAIS + PLANCHER + GAZ) + ' ETH, of which ' + dire(GAZ) + ' ETH'),
  'A avant le clic, autre paire : « at least » + la somme au plancher du seed', F.phraseAvoirPourNaitre(bAutre, { auMoins: true }));
ok(!F.phraseAvoirPourNaitre(bAction).includes('at least'), 'A « at least » n apparait que si l appelant le demande (une paire action a une somme exacte)');
{
  const autre = F.besoinNaissance({ fraisWei: 2000000000000000n, seedWei: 0n, gazWei: 250000000000000n });
  ok(F.phraseAvoirPourNaitre(autre).includes('holds 0.00225 ETH, of which 0.00025 ETH'), 'A d autres montants donnent une autre phrase : rien n est ecrit en dur', F.phraseAvoirPourNaitre(autre));
}
/* le cas du constat, rejoue avec les constantes REELLES : un wallet a 0,0012 ETH devant une paire action */
const REFUS_0012 = F.phraseManquePourNaitre(bAction, ETH('0.0012'));
ok(REFUS_0012 === 'Need ≈ ' + F.arrondiAffichage(FRAIS + GAZ) + ' ETH (' + F.arrondiAffichage(FRAIS) + ' Birth fee + ' + F.arrondiAffichage(GAZ)
  + ' reserve for network fees). This account holds 0.0012 ETH — short by ' + F.arrondiAffichage(FRAIS + GAZ - ETH('0.0012')) + '. Nothing was started.',
'A le refus : total, frais, reserve, solde et manque — chacun DERIVE', REFUS_0012);
ok(/network fee/.test(REFUS_0012) && !/\+ gas\)/.test(REFUS_0012) && !/seed/.test(REFUS_0012),
  'A le refus nomme les « network fees » avec leur montant ; plus de « + gas) » ; pas de « seed » quand il n y en a pas');
{
  const r = F.phraseManquePourNaitre(F.besoinNaissance({ fraisWei: PLANCHER, seedWei: 375000000000000n, gazWei: GAZ }), ETH('0.001'));
  ok(r.includes('(' + F.arrondiAffichage(PLANCHER) + ' Birth fee + seed 0.000375 + ' + F.arrondiAffichage(GAZ) + ' reserve for network fees)')
    && !r.includes('0.001 Birth fee') && !r.includes('0.001 fee'),
  'A avec un frais effectif au plancher et un seed, le refus dit CE frais et CE seed — pas « 0.001 » ecrit a cote', r);
  const s = F.phraseManquePourNaitre(bAction, FRAIS + GAZ + 1n);
  ok(s.includes('short by 0.'), 'A un solde suffisant ne donne jamais un manque negatif', s);
}

console.log('— B. le cablage dans app.html');
function extraire(src, entete) {
  const i = src.indexOf(entete);
  if (i < 0) return null;
  const m = /\n\}\n/.exec(src.slice(i));
  return m ? src.slice(i, i + m.index + 2) : null;
}
const srcPorte = extraire(HTML, 'async function preflightInstantBirthEthFixe(');
const srcIndice = extraire(HTML, 'function majFundWalletPourPaire() {');
ok(!!srcPorte && /return \{ ok: true, solde, besoin, frais, seed, gas: gasBuf \};\n\}$/.test(srcPorte), 'B TEMOIN la garde est extraite jusqu a son dernier `return`');
ok(!!srcIndice && /and Coinbase shows you its total before you confirm\.';\n  \}\n\}$/.test(srcIndice), 'B TEMOIN la ligne d avant-clic est extraite jusqu a sa derniere branche');
ok(/import \{[^}]*\bbesoinNaissance, phraseAvoirPourNaitre, phraseManquePourNaitre \} from '\.\/frais-creation\.js';/.test(HTML), 'B app.html importe la somme et ses deux phrases');
ok(/const besoinDit = besoinNaissance\(\{ fraisWei: frais, seedWei: seed, gazWei: gasBuf \}\);\n  const besoin = besoinDit\.total;/.test(srcPorte)
  && /const gasBuf = GAZ_NAISSANCE_WEI;/.test(srcPorte), 'B la garde calcule son besoin par `besoinNaissance`, avec SA reserve');
ok(/e\.innerHTML = enTexte\(phraseManquePourNaitre\(besoinDit, solde\)\)\n\s+\+ ' <a href="#cFundWallet" id="cFundShort">Fund wallet<\/a>\.';/.test(srcPorte), 'B le refus lit la somme exigee (le lien Fund wallet reste)');
ok(!/'[^'\n]*0\.001 fee \+ seed/.test(HTML) && !/frais \+ BigInt\(seed\) \+ gasBuf/.test(HTML)
  && /e\.textContent = 'Instant Birth preflight — checking ETH balance…';/.test(HTML),
'B plus de « 0.001 fee + seed … » dans une phrase (refus, ligne d attente), plus d addition faite a cote de la somme');
ok(/gazWei: GAZ_NAISSANCE_WEI \}\), \{ auMoins: !sansSeed \}\)/.test(srcIndice) && /besoinNaissance\(\{ fraisWei: FRAIS_OUVERTURE_WEI,/.test(srcIndice),
  'B la ligne d avant-clic lit les MEMES constantes que la garde (frais, reserve)');
ok(!/0\.001/.test(srcIndice.replace(/\/\*[\s\S]*?\*\//g, '')), 'B aucun « 0.001 » ecrit en dur dans la ligne d avant-clic (commentaires ecartes)');
ok(/const sansSeed = !!\(p && p\.type === 'ACTION'\);/.test(srcIndice) && /const p = paireChoisie;/.test(srcIndice)
  && /const sansSeed = !!\(paireChoisie && paireChoisie\.type === 'ACTION'\);/.test(HTML)
  && /\.\.\.\(sansSeed \? \{ seedWei: 0n \} : \{\}\) \}\);/.test(HTML), 'B meme regle de seed aux deux endroits : seule une paire action se lance sans seed');
ok(/if \(seed == null\) seed = CREATE_FEE_WEI_FLOOR;/.test(srcPorte) && /const SEED_FIXE_SANS_ORACLE = CREATE_FEE_WEI_FLOOR;/.test(HTML)
  && /if \(w == null \|\| w < SEED_FIXE_SANS_ORACLE\) w = SEED_FIXE_SANS_ORACLE;/.test(HTML) && /seedWei: sansSeed \? 0n : CREATE_FEE_WEI_FLOOR,/.test(srcIndice),
'B le « at least » dit le VRAI plancher : le seed lu au clic ne descend jamais sous `CREATE_FEE_WEI_FLOOR`');
{
  /* ⛔ LA CONSTANTE EST UN `const` DE MODULE : lue avant sa ligne, elle JETTE (zone morte temporelle) et tout le script de la
   *   page meurt. La ligne d avant-clic est peinte par `majFraisEtRecap` / `majPaire` : aucun appel de haut niveau a ces
   *   fonctions (ni a `peindrePaires` / `allerA`, qui y menent) ne doit preceder la declaration.
   * ⚠️ BORNE : seuls les appels DIRECTS en colonne 0 sont vus ; la fermeture transitive a ete lue a la main le 2026-10-04
   *   (aucune instruction de haut niveau avant la constante ne peint Create). */
  const iConst = HTML.search(/^const GAZ_NAISSANCE_WEI = /m);
  const hauts = [...HTML.matchAll(/^(?:void )?(majFraisEtRecap|majPaire|majFundWalletPourPaire|peindrePaires|allerA)\(/gm)].map((m) => m.index);
  ok(iConst > 0 && hauts.length >= 1 && hauts.every((i) => i > iConst), 'B la reserve est initialisee AVANT le premier appel de haut niveau qui peint Create (' + hauts.length + ' appel(s) vus)', hauts.filter((i) => i <= iConst));
}

console.log('— C. comportement : le texte source d app.html, execute dans un bac a sable');
const echap = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** La garde REELLE, executee : rend ce qu elle rend + ce qu elle a ecrit et compte. */
async function jouerPorte(html, mod, { solde, seedWei, seedLu = null, fraisWei } = {}) {
  const src = extraire(html, 'async function preflightInstantBirthEthFixe(');
  const e = { className: '', innerHTML: '', textContent: '' };
  const etapes = [];
  const ctx = vm.createContext({
    GAZ_NAISSANCE_WEI: lireGaz(html), FRAIS_OUVERTURE_WEI: mod.FRAIS_OUVERTURE_WEI, CREATE_FEE_WEI_FLOOR: mod.CREATE_FEE_WEI_FLOOR,
    besoinNaissance: mod.besoinNaissance, phraseManquePourNaitre: mod.phraseManquePourNaitre,
    ethLisible: (w) => mod.arrondiAffichage(w, 6), enTexte: echap, BigInt,
    $: () => null, montrerFundWalletCourt() {}, etape: (nom) => { etapes.push(nom); },
    preparerQuoteEthDefaut: async () => seedLu, lireSoldeEthAppRobuste: async () => solde,
  });
  vm.runInContext(src, ctx);
  ctx.__args = { e, ...(seedWei !== undefined ? { seedWei } : {}), ...(fraisWei !== undefined ? { fraisWei } : {}) };
  const r = await vm.runInContext('preflightInstantBirthEthFixe(__args)', ctx);
  return { r, e, etapes };
}
/** La ligne d avant-clic REELLE, executee : rend le texte ecrit sous le bouton. */
function jouerIndice(html, mod, { paire, chaine = 8453 }) {
  const src = extraire(html, 'function majFundWalletPourPaire() {');
  const a = { textContent: '' }, h = { innerHTML: '' };
  const ctx = vm.createContext({
    GAZ_NAISSANCE_WEI: lireGaz(html), FRAIS_OUVERTURE_WEI: mod.FRAIS_OUVERTURE_WEI, CREATE_FEE_WEI_FLOOR: mod.CREATE_FEE_WEI_FLOOR,
    besoinNaissance: mod.besoinNaissance, phraseAvoirPourNaitre: mod.phraseAvoirPourNaitre,
    ethLisible: (w) => mod.arrondiAffichage(w, 6), enTexte: echap, Number,
    $: (q) => (q === '#cFundWallet' ? a : q === '#cFundHint' ? h : null), majNoteCaution: async () => {},
    paireChoisie: paire, CHAINE: chaine,
  });
  vm.runInContext(src, ctx);
  vm.runInContext('majFundWalletPourPaire()', ctx);
  return h.innerHTML;
}
const ACTION = { type: 'ACTION', symbole: 'NVDAc', adr: '0x' + 'a'.repeat(40) };
const PAIRE_ETH = { type: 'NATIF', symbole: 'ETH', adr: '0x' + '0'.repeat(40) };
const PAIRE_USDC = { type: 'STABLE', symbole: 'USDC', adr: F.USDC_BASE };

/* ── LES JUGES : chacun rend vrai / faux sur un couple (app.html, module). Ils servent au vert ET aux mutants. ── */
const juges = {
  /* le cas du constat : 0,0012 ETH, paire action -> refus AVANT le wallet, phrase derivee qui nomme les frais de reseau */
  async refus0012(html, mod) {
    const { r, e, etapes } = await jouerPorte(html, mod, { solde: ETH('0.0012'), seedWei: 0n });
    return r.ok === false && r.pourquoi === 'balance_short' && r.besoin === mod.FRAIS_OUVERTURE_WEI + lireGaz(html)
      && r.manque === r.besoin - ETH('0.0012') && e.className === 'note wKo' && etapes.join() === 'ib_balance_short';
  },
  async refusDitLeReseau(html, mod) {
    const { r, e } = await jouerPorte(html, mod, { solde: ETH('0.0012'), seedWei: 0n });
    const attendu = echap(mod.phraseManquePourNaitre(mod.besoinNaissance({ fraisWei: r.frais, seedWei: r.seed, gazWei: r.gas }), ETH('0.0012')));
    return e.innerHTML === attendu + ' <a href="#cFundWallet" id="cFundShort">Fund wallet</a>.' && /network fees/.test(e.innerHTML)
      && e.innerHTML.includes(mod.arrondiAffichage(r.besoin) + ' ETH (') && e.innerHTML.includes(mod.arrondiAffichage(r.gas) + ' reserve for network fees');
  },
  /* la borne exacte : au wei pres, des deux cotes */
  async borneExacte(html, mod) {
    const seuil = mod.FRAIS_OUVERTURE_WEI + lireGaz(html);
    const juste = await jouerPorte(html, mod, { solde: seuil, seedWei: 0n });
    const court = await jouerPorte(html, mod, { solde: seuil - 1n, seedWei: 0n });
    return juste.r.ok === true && juste.e.innerHTML === '' && juste.etapes.join() === 'ib_preflight_ok' && court.r.ok === false && court.r.manque === 1n;
  },
  /* TROIS ETATS : un solde NON LU n est ni « assez » ni « trop court » — sa phrase et son compteur sont a lui */
  async nonLuEstUnTroisiemeEtat(html, mod) {
    const { r, e, etapes } = await jouerPorte(html, mod, { solde: null, seedWei: 0n });
    return r.ok === false && r.pourquoi === 'balance_unread' && /Could not read your ETH balance/.test(e.innerHTML)
      && !/short by|Need ≈/.test(e.innerHTML) && etapes.join() === 'ib_preflight_fail';
  },
  /* une paire autre qu une action : le seed LU au clic entre dans la somme, et le refus le nomme */
  async seedLuCompte(html, mod) {
    const { r, e } = await jouerPorte(html, mod, { solde: ETH('0.0018'), seedLu: 375000000000000n });
    return r.ok === false && r.besoin === mod.FRAIS_OUVERTURE_WEI + 375000000000000n + lireGaz(html) && /\+ seed 0\.000375 \+ /.test(e.innerHTML);
  },
  /* ⭐ L INVARIANT : la somme dite AVANT le clic est celle que la garde REND pour la meme paire */
  async ditEgaleExige(html, mod) {
    const porte = await jouerPorte(html, mod, { solde: 0n, seedWei: 0n });
    const dit = jouerIndice(html, mod, { paire: ACTION });
    return dit.includes('this app checks that it holds ' + mod.formaterEthCourt(porte.r.besoin) + ' ETH, of which '
      + mod.formaterEthCourt(porte.r.gas) + ' ETH is a reserve for network fees.') && dit.startsWith('Birth fee is ' + mod.arrondiAffichage(porte.r.frais) + ' ETH. Network fees come on top');
  },
  /* autre paire : le minimum dit est ce que la garde exige quand le seed est a son plancher, et jamais plus que ce qu elle exige */
  async minimumDitEstUnMinimum(html, mod) {
    const auPlancher = await jouerPorte(html, mod, { solde: 0n, seedLu: null });
    const auDessus = await jouerPorte(html, mod, { solde: 0n, seedLu: 375000000000000n });
    const ditEth = jouerIndice(html, mod, { paire: PAIRE_ETH }), ditUsdc = jouerIndice(html, mod, { paire: PAIRE_USDC });
    const attendu = 'holds at least ' + mod.formaterEthCourt(auPlancher.r.besoin) + ' ETH, of which ';
    return ditEth.includes(attendu) && ditUsdc.includes(attendu) && ditUsdc.startsWith('This pair needs USDC, plus ' + mod.arrondiAffichage(auPlancher.r.frais) + ' ETH for the Birth fee. ')
      && auDessus.r.besoin > auPlancher.r.besoin;
  },
  /* hors Base la garde ne tourne pas, et sans paire on ne sait pas quelle regle jouera : la ligne ne dit alors aucune somme */
  async muetQuandLaGardeNeJouePas(html, mod) {
    const practice = jouerIndice(html, mod, { paire: ACTION, chaine: 84532 }), sansPaire = jouerIndice(html, mod, { paire: null });
    return !/network fees|checks that it holds/i.test(practice) && !/network fees|checks that it holds/i.test(sansPaire)
      && /^Birth fee is /.test(practice) && /^Birth fee is /.test(sansPaire);
  },
};
const LIBELLES = {
  refus0012: 'C solde 0,0012 ETH, paire action : REFUS avant le wallet, besoin = frais + reserve, manque exact, compteur `ib_balance_short`',
  refusDitLeReseau: 'C ce refus dit la somme, le frais et la reserve « for network fees » — le texte EXACT de la phrase derivee',
  borneExacte: 'C la borne est exacte au wei : frais + reserve passe (rien n est ecrit), un wei de moins est refuse',
  nonLuEstUnTroisiemeEtat: 'C un solde NON LU est un troisieme etat : « Could not read… », jamais « short by »',
  seedLuCompte: 'C autre paire : le seed lu au clic (0,000375) entre dans la somme et le refus le nomme',
  ditEgaleExige: 'C ⭐ paire action : la somme dite AVANT le clic == le besoin que la garde REND (et le frais dit == son frais)',
  minimumDitEstUnMinimum: 'C autre paire (ETH, USDC) : « at least » == le besoin de la garde au plancher du seed ; un seed plus haut exige plus',
  muetQuandLaGardeNeJouePas: 'C en Practice ou sans paire choisie, la ligne ne dit aucune somme (la garde ne joue pas / regle inconnue)',
};
for (const k of Object.keys(juges)) {
  let v; try { v = await juges[k](HTML, F); } catch (err) { v = 'a jete : ' + (err && err.message); }
  ok(v === true, LIBELLES[k], v);
}

console.log('— D. mutants : chaque garde retiree fait rougir SON juge');
/** vrai si le juge rend FAUX (ou jette) sur la source mutee — c est-a-dire si le mutant est tue. */
const tue = async (k, html, mod) => { try { return (await juges[k](html, mod)) !== true; } catch (_) { return true; } };
const muter = (src, de, vers) => (src.split(de).length === 2 ? src.replace(de, vers) : null);
const muterTout = (src, de, vers, combien) => (src.split(de).length - 1 === combien ? src.split(de).join(vers) : null);
{
  const m = muter(HTML, 'const besoin = besoinDit.total;', 'const besoin = frais + seed;');
  ok(m !== null && await tue('refus0012', m, F) && await tue('borneExacte', m, F), 'D mutant « la garde n exige plus la reserve » : ROUGE (0,0012 ETH passerait, et la phrase dirait une somme qu on n exige pas)');
}
{
  const m = muter(HTML, 'e.innerHTML = enTexte(phraseManquePourNaitre(besoinDit, solde))',
    "e.innerHTML = 'Need ≈ ' + ethLisible(besoin) + ' ETH (0.001 fee + seed ' + ethLisible(seed) + ' + gas). This account holds ' + ethLisible(solde) + ' ETH — short by ' + ethLisible(manque) + '. Nothing was started.'");
  ok(m !== null && await tue('refusDitLeReseau', m, F) && !(await tue('refus0012', m, F)), 'D mutant « le refus d avant (0.001 fee + seed … + gas) revient » : ROUGE sur la phrase — la garde, elle, refuse toujours');
}
{
  const m = muterTout(HTML, " ETH. ' + avoir", " ETH. '", 2);
  ok(m !== null && await tue('ditEgaleExige', m, F) && await tue('minimumDitEstUnMinimum', m, F), 'D mutant « la ligne d avant-clic ne dit plus la somme » : ROUGE');
}
{
  const m = muter(HTML, 'seedWei: sansSeed ? 0n : CREATE_FEE_WEI_FLOOR, gazWei: GAZ_NAISSANCE_WEI }), { auMoins: !sansSeed }))',
    'seedWei: sansSeed ? 0n : CREATE_FEE_WEI_FLOOR, gazWei: 250000000000000n }), { auMoins: !sansSeed }))');
  ok(m !== null && await tue('ditEgaleExige', m, F), 'D mutant « la ligne lit une AUTRE reserve que la garde » (un chiffre ecrit a cote) : ROUGE sur l invariant');
}
{
  const m = muter(HTML, 'seedWei: sansSeed ? 0n : CREATE_FEE_WEI_FLOOR, gazWei: GAZ_NAISSANCE_WEI', 'seedWei: 0n, gazWei: GAZ_NAISSANCE_WEI');
  ok(m !== null && await tue('minimumDitEstUnMinimum', m, F) && !(await tue('ditEgaleExige', m, F)), 'D mutant « le seed oublie pour les autres paires » : ROUGE (la ligne dirait moins que ce que la garde exige)');
}
{
  const m = muter(HTML, "const avoir = (p && Number(CHAINE) === 8453)", 'const avoir = (true)');
  ok(m !== null && await tue('muetQuandLaGardeNeJouePas', m, F), 'D mutant « la somme est dite meme en Practice / sans paire » : ROUGE');
}
{
  const m = muter(HTML, "return { ok: false, solde: null, besoin, frais, seed, gas: gasBuf, pourquoi: 'balance_unread' };\n  }", "}\n  if (solde === null) {\n    return { ok: true, solde, besoin, frais, seed, gas: gasBuf };\n  }");
  ok(m !== null && await tue('nonLuEstUnTroisiemeEtat', m, F), 'D mutant « un solde non lu laisse passer » : ROUGE');
}
/* le module : copie dans un dossier temporaire, mutee, importee */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-reserve-'));
const srcMod = lire('frais-creation.js');
const modMute = async (de, vers) => {
  const s = muter(srcMod, de, vers);
  if (s === null) return null;
  const dir = fs.mkdtempSync(path.join(tmp, 'm-'));
  fs.writeFileSync(path.join(dir, 'frais-creation.js'), s);
  return imp('frais-creation.js', dir);
};
{
  /* ⛔ L INVARIANT « dit == exige », lui, RESTE VERT sous ce mutant — et c est attendu : la garde et la ligne lisent la
   *   meme somme fausse. Ce sont les juges de MONTANT (0,0012 refuse, borne au wei) qui le tuent. Ecrit ici parce que ma
   *   premiere version attendait le rouge de l invariant : un invariant d egalite ne garde pas la valeur. */
  const Mm = await modMute('return { frais, seed, gaz, total: frais + seed + gaz };', 'return { frais, seed, gaz, total: frais + seed };');
  ok(Mm !== null && await tue('refus0012', HTML, Mm) && await tue('borneExacte', HTML, Mm) && !(await tue('ditEgaleExige', HTML, Mm)),
    'D mutant « la somme oublie la reserve » (module) : ROUGE sur les montants (0,0012 passerait) — l egalite dit/exige seule ne le verrait pas');
}
{
  const Mm = await modMute("' ETH (' + arrondiAffichage(b.frais) + ' Birth fee'", "' ETH (0.001 Birth fee'");
  const r = Mm && Mm.phraseManquePourNaitre(Mm.besoinNaissance({ fraisWei: PLANCHER, seedWei: 0n, gazWei: GAZ }), 0n);
  ok(Mm !== null && r.includes('(0.001 Birth fee') && r !== F.phraseManquePourNaitre(F.besoinNaissance({ fraisWei: PLANCHER, seedWei: 0n, gazWei: GAZ }), 0n),
    'D mutant « le frais reecrit en dur dans le refus » (module) : ROUGE des que le frais effectif n est pas 0,001');
}
{
  /* la reserve CHANGE dans app.html : la garde ET la ligne suivent ensemble — l ecran ne peut plus dire autre chose que la constante */
  const m = muter(HTML, '\nconst GAZ_NAISSANCE_WEI = ' + GAZ + 'n;', '\nconst GAZ_NAISSANCE_WEI = 250000000000000n;');
  const porte = m && await jouerPorte(m, F, { solde: 0n, seedWei: 0n });
  const dit = m && jouerIndice(m, F, { paire: ACTION });
  ok(m !== null && GAZ !== 250000000000000n && porte.r.besoin === FRAIS + 250000000000000n && dit.includes('holds ' + dire(FRAIS + 250000000000000n) + ' ETH, of which 0.00025 ETH')
    && await juges.ditEgaleExige(m, F) === true, 'D la reserve passe a 0,00025 : la garde ET la ligne SUIVENT ensemble (l invariant reste vert)');
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
console.log('⚠️ NE PROUVE PAS le frais de reseau reel d une naissance (aucune transaction ici), ni que 0,0005 ETH est la bonne reserve.');
if (n !== 40) { console.log('KO  compte d assertions inattendu : ' + n + ' (attendu 40) — un cas a ete retire ou ajoute sans le dire'); process.exit(1); }
process.exit(ko ? 1 : 0);
