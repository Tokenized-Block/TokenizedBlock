// test-bridge-x402-brain-0923.mjs — tip 20260923-bridge-x402-brain self-QA
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BRIDGE_LEGS, phraseBridgeLegs, confirmerBridgeStub, planBridgeFeeSkim, quoteBridge,
} from './bridge.js';
import {
  mayUseX402, recordPropose, recordPay, recordJournalHook, feeAlreadyRecognized,
  assertNoDoubleChargeWithBridge, phraseOptionA, assertCleanCopy, X402_FEE_MATRIX,
} from './x402-pay.js';
import { entreeBotAction } from './journal-cerveau.js';

assert.equal(BRIDGE_LEGS.length, 4);
assert.ok(BRIDGE_LEGS.some((l) => l.id === 'fund' && l.live));
/* ⛔⛔ CETTE LIGNE EXIGEAIT `skim.live === true`, ET ELLE GARDAIT UN MENSONGE.
 *     Mesure du 2026-09-24 : ce prelevement partait bel et bien — mais SEUL, sans aucun echange en
 *     face, jamais. « Live » disait « ce prelevement fonctionne » la ou l utilisateur lisait « cet
 *     echange fonctionne ». Le test verrouillait donc la propriete exacte qui faisait payer les
 *     gens pour rien : tant qu il passait au vert, personne n allait regarder.
 *   ⇒ Un test peut etre VERT et tenir la mauvaise moitie. Celui-ci en est l exemple. */
assert.ok(BRIDGE_LEGS.some((l) => l.id === 'skim' && !l.live),
  'la jambe « skim » est de nouveau annoncee vivante : elle preleverait sans rien echanger');
assert.ok(BRIDGE_LEGS.some((l) => l.id === 'hub' && l.goPhil));
assert.ok(BRIDGE_LEGS.some((l) => l.id === 'equity' && !l.live));
/* ⛔⛔ ET CELLE-CI AUTORISAIT LE PRENOM A L ECRAN : le motif `/Phil|later|0.01%/` etait SATISFAIT
 *     par « Phil ». Le test n a donc pas seulement laisse passer « Phil-blocked » dans un texte
 *     public — il l acceptait explicitement comme une reponse valable. La garde anti-jargon d a
 *     cote ne lisait, elle, que le HTML statique, et cette phrase-ci est injectee a l execution :
 *     les deux gardes se croyaient couvertes par l autre. */
assert.doesNotMatch(phraseBridgeLegs(), /\bPhil\b|BridgeRouter|\bbps\b/i,
  'jargon interne ou prenom de l equipe dans une phrase affichee aux utilisateurs');
assert.doesNotMatch(phraseBridgeLegs(), /0xa6cf|Fees for Dev|≈\s*\$1|\b2x\b|leverage|FINRA/i);
assert.match(phraseBridgeLegs(), /not a broker/i);
/* la phrase doit dire ce qui se passe VRAIMENT : rien n est preleve tant que l echange n existe pas */
assert.match(phraseBridgeLegs(), /nothing is charged|not built yet/i,
  'la phrase ne dit plus que rien n est preleve tant que l echange n existe pas');

const stub = confirmerBridgeStub(quoteBridge({ amount: 1, fromSym: 'AAPLc', toSym: 'USDC' }));
assert.equal(stub.goPhil, true);
assert.match(stub.pourquoi, /Phil|blocked|later/i);
assert.doesNotMatch(stub.pourquoi, /ready to swap|atomic net is live|swap is live/i);

const tiny = planBridgeFeeSkim({ amount: '0.000000000000001', fromSym: 'ETH', toSym: 'USDC' });
assert.equal(tiny.ok, false);

assert.equal(mayUseX402('brain_data_tool').ok, true);
assert.equal(mayUseX402('buy_sell_05').ok, false);
assert.equal(mayUseX402('instant_birth_0001').ok, false);
assert.equal(mayUseX402('bridge_skim_001').ok, false);

assert.equal(assertNoDoubleChargeWithBridge({ x402Used: true, bridgeSkimUsed: true }).ok, false);
assert.equal(assertNoDoubleChargeWithBridge({ x402Used: true, bridgeSkimUsed: false }).ok, true);

/* localStorage polyfill for node */
if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
}

const prop = recordPropose({ action: 'watch_feed', rail: 'brain_data_tool', asset: 'ETH' });
assert.equal(prop.ok, true);
assert.equal(prop.event.brainSigns, false);
assert.equal(prop.event.signeParUtilisateur, true);

const badAsset = recordPropose({ action: 'tool', rail: 'brain_data_tool', asset: 'TBGAS' });
assert.equal(badAsset.ok, false);

/* ⛔⛔ CE BLOC AFFIRMAIT L INVERSE, ET IL PROUVAIT L ABSENCE DE VERIFICATION.
 *     Il appelait `recordPay` SANS hash de transaction et exigeait `ok === true`. Autrement dit,
 *     le test verrouillait la possibilite d enregistrer un paiement dont rien ne prouvait
 *     l existence — et l evenement ecrit portait `signeParUtilisateur: true`. Tant qu il passait
 *     au vert, personne n allait regarder. C est le meme motif que la jambe « skim » du Bridge
 *     annoncee `live` : un test peut etre VERT et tenir exactement la mauvaise moitie.
 *   ⇒ Un paiement est une transaction, pas une case cochee. */
const sansPreuve = recordPay({ proposeId: prop.event.id, asset: 'ETH' });
assert.equal(sansPreuve.ok, false, 'un paiement sans hash est de nouveau accepte');
assert.match(sansPreuve.pourquoi, /transaction hash is required/i);

const HASH_TEST = '0x' + 'b'.repeat(64);
const faussePreuve = recordPay({ proposeId: prop.event.id, asset: 'ETH', txHash: HASH_TEST });
assert.equal(faussePreuve.ok, false, 'un hash sans verdict de verification a ete accepte');
assert.match(faussePreuve.pourquoi, /no verified payment/i);

/* ⛔ le verdict doit parler de CETTE transaction : une preuve valable empruntee a un autre
 *   paiement ne vaut rien. */
const preuveEmpruntee = recordPay({ proposeId: prop.event.id, asset: 'ETH', txHash: HASH_TEST,
  preuve: { etat: 'PAYE', paye: '5', txHash: '0x' + 'c'.repeat(64) } });
assert.equal(preuveEmpruntee.ok, false, 'une preuve decrivant une AUTRE transaction a ete acceptee');

const pay = recordPay({ proposeId: prop.event.id, asset: 'ETH', txHash: HASH_TEST,
  preuve: { etat: 'PAYE', paye: '1000', confirmations: 20, bloc: 900, txHash: HASH_TEST } });
assert.equal(pay.ok, true, pay.pourquoi || '');
/* ⛔ le montant enregistre est celui CONSTATE sur la chaine, pas celui annonce par l appelant */
assert.equal(pay.event.montantConstate, '1000');

/* ⛔⛔ REJEU : le meme paiement ne compte qu une fois. Sans ce controle, un hash valide servirait
 *     indefiniment — le paiement serait reel, et compte autant de fois qu on le recolle. */
const rejeu = recordPay({ proposeId: prop.event.id, asset: 'ETH', txHash: HASH_TEST,
  preuve: { etat: 'PAYE', paye: '1000', txHash: HASH_TEST } });
assert.equal(rejeu.ok, false, 'le meme paiement a ete reconnu deux fois');
assert.match(rejeu.pourquoi, /already recognized/i);

const recog = feeAlreadyRecognized('brain_data_tool', 'watch_feed');
assert.equal(recog.recognized, true);

const hook = recordJournalHook({ proposeId: prop.event.id });
assert.equal(hook.ok, true);
assert.equal(hook.paid, true);

const line = entreeBotAction({ action: 'watch_feed', paid: true });
assert.equal(line.signeParUtilisateur, true);
assert.equal(line.bot, true);
assert.match(line.texte, /pay recognized/i);
assert.doesNotMatch(line.texte, /Brain signs|freestyle-sign markets/i);

/* ⛔⛔ CE CAS EXIGEAIT LE MOT « Option A » — un nom interne qui ne dit rien a quelqu un qui ouvre
 *     l app. Verrouiller un libelle de conception dans une phrase d ecran empeche de la rendre
 *     lisible, ce qui etait precisement la demande de Phil. On exige donc ce que la phrase doit
 *     AFFIRMER, pas le vocabulaire de l equipe. */
assert.doesNotMatch(phraseOptionA(), /Option A|x402|rail\b/i,
  'jargon interne dans une phrase affichee : « Option A », « x402 » et « rail » ne veulent rien dire '
  + 'pour quelqu un qui decouvre l app');
assert.match(phraseOptionA(), /never signs a market/i,
  'la phrase ne dit plus que le cerveau ne signe jamais un marche — c est la garantie la plus importante');
/* ⛔ et elle doit dire que le paiement est LU sur la chaine : avant, le bouton ecrivait « paye »
 *   sans rien verifier, et la phrase laissait croire l inverse. */
assert.match(phraseOptionA(), /read the transaction on chain/i,
  'la phrase ne dit plus que le paiement est verifie sur la chaine');
assert.doesNotMatch(phraseOptionA(), /0xa6cf|Fees for Dev|≈\s*\$1|Brain signs markets/i);
assert.equal(assertCleanCopy().ok, true);
assert.ok(X402_FEE_MATRIX.instant_birth_0001.x402 === false);

const html = readFileSync('./app.html', 'utf8');
/* ⛔ EPINGLE DE BUILD REDIRIGEE (C2, 2026-09-23) — PAS SUPPRIMEE.
 *    `data-build="20260923-bridge-x402-brain"` exigeait un numero de build PRECIS. Ce controle-la
 *    ne teste aucune fonctionnalite : il teste que PERSONNE n a deploye depuis. Il a rougi des le
 *    merge suivant, alors que tout le tip bridge-x402-brain etait intact — et un rouge qui ne
 *    designe aucun defaut apprend a ignorer les rouges.
 *    ⛔ CE QUI EST GARDE : la ligne doit exister et etre bien formee. Les controles de
 *      FONCTIONNALITE du tip (`bBotLoopCarte`, l import de `x402-pay.js`, la matrice de frais,
 *      le journal Option A) sont LAISSES INTACTS ci-dessous — eux gardent vraiment quelque chose. */
assert.match(html, /data-build="[\w-]+"/, 'ligne de build absente ou mal formee');
assert.match(html, /bBotLoopCarte/);
assert.match(html, /from '\.\/x402-pay\.js'/);
assert.match(html, /phraseBridgeLegs|brLegsNote/);
assert.match(html, /Option A/);
assert.doesNotMatch(html, /Brain signs markets/i);

const brStart = html.indexOf('id="v-bridge"');
const brEnd = html.indexOf('</section>', brStart) + '</section>'.length;
const bridgePanel = html.slice(brStart, brEnd);
assert.doesNotMatch(bridgePanel, /0xa6cf|Fees for Dev|≈\s*\$1|FINRA|C4A/i);
assert.doesNotMatch(bridgePanel, /\b2x\b/i);
assert.match(bridgePanel, /not a broker/i);
assert.match(bridgePanel, /no leveraged legs/i);
assert.match(bridgePanel, /Phil-blocked|Phil/);
assert.match(bridgePanel, /later/i);

const brainStart = html.indexOf('id="v-brain"');
const brainEnd = html.indexOf('id="v-bridge"'); // bridge follows? actually wallet etc — use bot card
assert.match(html.slice(brainStart, brainStart + 8000), /signs nothing/i);

const servi = readFileSync('./serveur-web.js', 'utf8');
assert.match(servi, /x402-pay\.js/);

const tasks = readFileSync('./brain-tasks.js', 'utf8');
assert.doesNotMatch(tasks, /Fees for Dev|≈\s*\$1|≈\$1/);
assert.match(tasks, /0\.001 ETH/);
assert.match(tasks, /option_a/);

const agent = readFileSync('./brain-agent.json', 'utf8');
assert.doesNotMatch(agent, /Fees for Dev/);
assert.doesNotMatch(agent, /≈\s*\$1|≈\$1/);
assert.match(agent, /20260923-bridge-x402-brain/);
assert.match(agent, /bot_loop_option_a/);

console.log('ok — bridge-x402-brain tip self-QA');
