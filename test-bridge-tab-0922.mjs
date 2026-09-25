// test-bridge-tab-0922.mjs — Bridge tab + fee skim plan (tip 20260923-nav-boot-fix)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BRIDGE_FEE_BPS, BRIDGE_FEE_RATE, BRIDGE_FEE_LABEL, quoteBridge, formatBridgeAmount,
  confirmerBridgeStub, planBridgeFeeSkim, buildBridgeFeeCall, unitsFromHuman,
} from './bridge.js';
import { encodeTransfer } from './envoi.js';
import { FEE_WALLET, USDC_BASE } from './frais-creation.js';

/* ⛔⛔ 0,5 % DEPUIS LE 2026-09-24 (decision de Phil). Le panneau annoncait 0,01 % alors que le
 *     chemin reellement cable en preleve 0,5 % — sortir un block par sa pool est exactement ce que
 *     fait Buy/Sell, et l annoncer moins cher ailleurs etait faux.
 *   ⛔⛔ ET LA GARDE QUI COMPTE VRAIMENT EST CELLE D EN DESSOUS : le taux AFFICHE doit egaler le
 *     taux PRELEVE. Epingler « 0.5% » tout seul ne protegerait de rien — c est leur DIVERGENCE qui
 *     ferait mentir l ecran, et c est elle qu on interdit. */
assert.equal(BRIDGE_FEE_BPS, 50n);
assert.equal(BRIDGE_FEE_RATE, 0.005);
assert.equal(BRIDGE_FEE_LABEL, '0.5%');

const { FRAIS_INTERFACE_BPS } = await import('./echange.js');
assert.equal(BRIDGE_FEE_BPS, FRAIS_INTERFACE_BPS,
  'le taux AFFICHE par le Bridge (' + BRIDGE_FEE_BPS + ' bps) a diverge du taux reellement PRELEVE '
  + 'par le chemin de sortie (' + FRAIS_INTERFACE_BPS + ' bps). Un tarif affiche qui derive du tarif '
  + 'reel est la forme la plus banale du mensonge dans une app.');
assert.equal(BRIDGE_FEE_RATE, Number(FRAIS_INTERFACE_BPS) / 10000,
  'le taux decimal ne correspond plus aux bps : une des deux ecritures a ete oubliee');

const q = quoteBridge({ amount: 1000, fromSym: 'ETH', toSym: 'USDC' });
assert.equal(q.ok, true);
assert.equal(q.fee, 5); // 1000 * 0.005
assert.equal(q.net, 995);
assert.equal(q.feeLabel, '0.5%');
assert.equal(q.settleSym, 'ETH');

const q0 = quoteBridge({ amount: 0, fromSym: 'USDC', toSym: 'AAPLc' });
assert.equal(q0.ok, true);
assert.equal(q0.fee, 0);
assert.equal(q0.settleSym, 'USDC');

const bad = quoteBridge({ amount: 'nope' });
assert.equal(bad.ok, false);

assert.match(formatBridgeAmount(0.1, 'ETH'), /0\.1 ETH/);
assert.equal(formatBridgeAmount(null, 'ETH'), '—');

const stub = confirmerBridgeStub(q);
assert.equal(stub.stub, true);
assert.equal(stub.ok, false);
/* ⛔⛔ CETTE LIGNE ACCEPTAIT « Phil » COMME REPONSE VALABLE, dans un texte qui arrive a l ecran par
 *     setEtat. C etait la TROISIEME garde du depot a le permettre — les autres etaient dans
 *     test-bridge-x402-brain-0923.mjs. Et plus bas dans CE MEME fichier, la ligne 110 INTERDIT le
 *     prenom dans le panneau Bridge : le fichier se contredisait, en interdisant cote HTML ce qu il
 *     exigeait cote module. Chaque garde se croyait couverte par l autre.
 *   ⇒ On exige maintenant ce que le texte doit DIRE, et on interdit le jargon partout. */
assert.match(stub.pourquoi, /not built yet/i,
  'le refus n explique plus pourquoi rien ne se passe');
assert.doesNotMatch(stub.pourquoi, /\bPhil\b|BridgeRouter|\bbps\b/i,
  'prenom de l equipe ou nom de contrat interne dans un texte affiche a l utilisateur');

/* units + skim plan */
assert.equal(unitsFromHuman('1.5', 18), 1500000000000000000n);
assert.equal(unitsFromHuman('1.5', 6), 1500000n);

const planEth = planBridgeFeeSkim({ amount: 1, fromSym: 'ETH', toSym: 'USDC' });
assert.equal(planEth.ok, true);
assert.equal(planEth.live, true);
assert.equal(planEth.asset, 'ETH');
/* ⛔ 50 bps : 1e18 * 50 / 10000. L ancienne valeur (1e18/10000) etait celle de 1 bp — elle a
 *   change avec le taux, et c est normal : ce qui ne doit PAS changer, c est l egalite entre le
 *   taux affiche et le taux preleve, verifiee plus haut. */
assert.equal(planEth.feeUnits, 5000000000000000n);
assert.equal(planEth.goPhil, true);

const callEth = buildBridgeFeeCall({
  plan: planEth, feeWallet: FEE_WALLET, usdc: USDC_BASE, encodeTransfer,
});
assert.equal(callEth.ok, true);
assert.equal(callEth.to.toLowerCase(), FEE_WALLET.toLowerCase());
assert.equal(callEth.data, '0x');
assert.equal(BigInt(callEth.value), planEth.feeUnits);

const planUsdc = planBridgeFeeSkim({ amount: 100, fromSym: 'USDC', toSym: 'ETH' });
assert.equal(planUsdc.ok, true);
assert.equal(planUsdc.feeUnits, 500000n); // 100e6 * 50 / 10000
const callUsdc = buildBridgeFeeCall({
  plan: planUsdc, feeWallet: FEE_WALLET, usdc: USDC_BASE, encodeTransfer,
});
assert.equal(callUsdc.ok, true);
assert.equal(callUsdc.to.toLowerCase(), USDC_BASE.toLowerCase());
assert.match(callUsdc.data, /^0x/);
assert.ok(callUsdc.data.toLowerCase().includes(FEE_WALLET.slice(2).toLowerCase()));

const planTok = planBridgeFeeSkim({ amount: 10, fromSym: 'AAPLc', toSym: 'USDC' });
assert.equal(planTok.ok, false);
assert.equal(planTok.stub, true);
assert.equal(planTok.goPhil, true);

const tiny = planBridgeFeeSkim({ amount: '0.000000000000001', fromSym: 'ETH', toSym: 'USDC' });
assert.equal(tiny.ok, false); // fee rounds to 0

const html = readFileSync('./app.html', 'utf8');
assert.match(html, /data-volet="bridge"/);
assert.match(html, /id="v-bridge"/);
assert.match(html, /from\s+'\.\/bridge\.js'/);
/* ⛔⛔ DEUX ASSERTIONS DE PLUS VERROUILLAIENT LE DEFAUT, et elles etaient les pires du lot :
 *     · `assert.match(html, /0\.01%/)` exigeait l ANCIEN tarif quelque part dans le fichier ;
 *     · `assert.match(html, /Confirm Bridge fee/)` exigeait l ANCIENNE etiquette du bouton — celle
 *       qui annonçait « un frais » pour un geste qui VEND les blocks de quelqu un.
 *     Apres correction de l ecran, toutes deux passaient encore — satisfaites par les COMMENTAIRES
 *     qui documentent justement le retrait. C est le piege decrit vingt lignes plus bas dans ce
 *     meme fichier, retombe a l identique : une garde satisfaite par le commentaire qui explique sa
 *     propre violation ne garde rien, et empeche en plus de corriger l ecran.
 *   ⇒ On garde ce qui compte : le cablage du module, et un tarif qui vient de la constante. */
assert.match(html, /planBridgeFeeSkim/);
assert.match(html, /buildBridgeFeeCall/);
assert.match(html, /data-frais-bridge/,
  'app.html n a plus d emplacement de tarif peint depuis la constante : le chiffre est revenu en dur');
const brStart = html.indexOf('id="v-bridge"');
const brEnd = html.indexOf('</section>', brStart) + '</section>'.length;
const bridgePanel = html.slice(brStart, brEnd);
/* ⛔⛔ CES CONTROLES LISAIENT LE FICHIER LA OU ILS VOULAIENT DIRE « L ECRAN », et ca les a rendus
 *     faux DANS LES DEUX SENS (constat du 2026-09-23).
 *     · `assert.match(bridgePanel, /Phil/i)` exigeait le mot « Phil ». Mesure : 5 occurrences dans
 *       le panneau, 0 a l ecran — les cinq sont dans des COMMENTAIRES, dont ceux qui expliquent
 *       qu on a justement retire « Phil » de l affichage. Le test passait AVANT le retrait et
 *       APRES : il n a jamais remarque que ce qu il gardait avait disparu. Une garde satisfaite par
 *       le commentaire qui documente sa propre violation ne garde rien.
 *     · `doesNotMatch(/Fees for Dev/)` avait le defaut MIROIR : il rougirait sur un commentaire qui
 *       explique un retrait, et il ne regardait qu un SLICE de `app.html` — jamais les modules
 *       `.js`, ou la chaine vivait dans quatre messages affiches a l utilisateur.
 *     ⇒ On depouille les commentaires, et on garde l INTENTION, pas le mot. */
const ecranBridge = bridgePanel.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
assert.ok(ecranBridge.length < bridgePanel.length, 'depouillement sans effet — temoin casse');
assert.ok(ecranBridge.length > 800, 'panneau Bridge suspect apres depouillement : ' + ecranBridge.length);

assert.doesNotMatch(ecranBridge, /0xa6cf|Fees for Dev|≈\s*\$1|≈\$1/i);
/* ⛔⛔ CETTE ASSERTION EXIGEAIT « 0.01% » — ET C EST ELLE QUI A PROTEGE LE FAUX TARIF.
 *     Le 2026-09-24 le prelevement est passe a 0,5 % (`BRIDGE_FEE_BPS = 50n`), et les lignes 11-18
 *     de CE FICHIER l ont acte. Mais ici, 110 lignes plus bas, on exigeait encore l ANCIEN chiffre
 *     a l ecran. Le test restait donc VERT sur un panneau qui annonçait un tarif cinquante fois
 *     trop bas : la bonne regle ecrite en tete, le litteral contraire garde en bas.
 *     Un test peut verrouiller un defaut tout en ayant l air de garder quelque chose — et pendant
 *     ce temps « tout vert » s affichait au-dessus d un ecran d argent qui mentait.
 *   ⇒ Ce qu on veut garder n a jamais ete « le panneau dit 0.01% » mais « le panneau annonce un
 *     tarif, et c est celui qui sera preleve ». Le chiffre vient donc de la constante. */
assert.match(ecranBridge, /[Ff]ee/, 'le panneau Bridge ne parle plus de frais du tout');
assert.ok(
  ecranBridge.includes(BRIDGE_FEE_LABEL) || /data-frais-bridge/.test(ecranBridge),
  'le panneau Bridge n annonce ni le tarif reel (' + BRIDGE_FEE_LABEL + ') ni un emplacement peint '
  + 'depuis la constante : il ne peut donc plus dire ce qui sera preleve');
/* ⛔ L INTENTION D ORIGINE : le panneau doit DIRE que l echange net via le hub n est pas livre.
 *    Elle est gardee — en mots qui se comprennent sans nous connaitre. */
assert.match(ecranBridge, /not live( yet)?/i,
  'le panneau Bridge ne dit plus que l echange net via le hub n est pas livre');
/* ⛔ ET LE CONTROLE INVERSE, QUI MANQUAIT : aucun prenom de l equipe a l ecran. Sans lui, remettre
 *    « Phil-blocked » demain ne ferait rougir personne ici. */
assert.doesNotMatch(ecranBridge, /\b(?:Phil|Rakhsa|Raksha|Zero\s?1|Clansy|VolKov)\b/i,
  'un prenom de l equipe est revenu a l ecran dans le panneau Bridge');

const servi = readFileSync('./serveur-web.js', 'utf8');
assert.match(servi, /bridge\.js/);

const build = /data-build="([^"]+)"/.exec(html);
/* ⛔ EPINGLE RETIREE LE 2026-09-23 — elle exigeait que le build CONTIENNE un tip precis.
 *    Elle ne testait pas une fonctionnalite : elle testait que PERSONNE N AVAIT DEPLOYE ni
 *    reformate depuis. Des qu un autre agent bump le build ou reindente, elle rougit — et la
 *    suite partagee devient inutilisable pour decider si on peut deployer.
 *    L intention est gardee sous une forme qui ne pourrit pas.
 *    ⛔ AUCUNE autre assertion de ce fichier n a ete touchee (compte verifie avant/apres). */
assert.ok(build && /^[\w-]+$/.test(build[1]), 'data-build present et bien forme, got ' + (build && build[1]));

/* plan helpers must not leak fee address into pourquoi */
assert.doesNotMatch(planEth.pourquoi || '', /0xa6cf/i);
assert.doesNotMatch(stub.pourquoi || '', /0xa6cf/i);

console.log('ok — bridge tab quote (' + BRIDGE_FEE_LABEL + ') + fee skim plan + UI wiring');
