/* test-revenu-externe-20261016.mjs - LE COMPTEUR DE REVENU EXTERNE : verifie, exclut les notres, compte par ligne et par devise.
 * AFFIRME (EXECUTE, pur) : (1) un recu status 0x1 avec un Transfer USDC vers a6cf emis par le contrat USDC compte ; un Transfer vers
 *   a6cf emis par un AUTRE contrat ne compte PAS (un evenement n est pas une transaction) ; (2) le payeur = tx.from, sauf UserOperation
 *   (sender indexe) ; (3) nos wallets (a6cf, legacy, declares) tombent dans `interne`, le reste dans `externe` ; (4) l ETH natif passe
 *   par `ethRecu` (delta verifie ailleurs) ; (5) compterRevenu est pur, somme en BigInt, une ligne inconnue va dans `autre`.
 * NE PROUVE PAS : la lecture des recus en prod (serveur) ni le delta ETH (veille-frais.js). */
import { strict as assert } from 'node:assert';
import { verifierFrais, compterRevenu, walletsInternes, payeurDe, devisesComptees, LIGNES_FRAIS, TOPICS_SWAP } from './revenu-externe.js';
import { FEE_WALLET, USDC_BASE } from './frais-creation.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const adr = (a) => '0x' + a.slice(2).toLowerCase().padStart(64, '0');
const T = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const A6CF = FEE_WALLET.toLowerCase(), USDC = USDC_BASE.toLowerCase();
const PAYEUR = '0x' + '11'.repeat(20), GROK = '0x' + '22'.repeat(20), BUNDLER = '0x' + '33'.repeat(20), SENDER = '0x' + '44'.repeat(20);
const H = '0x' + 'ab'.repeat(32);
const transfert = (contrat, de, vers, m) => ({ address: contrat, topics: [T, adr(de), adr(vers)], data: '0x' + mot(m) });
/* 2026-10-17 (chasse) : un frais nait d un ECHANGE — chaque recu de test porte un log Swap v4, sauf le cas qui prouve le refus */
const SWAP_V4 = [...TOPICS_SWAP][0];
const swap = { address: '0x498581ff718922c3f8e6a244956af099b2652b2b', topics: [SWAP_V4, '0x' + '12'.repeat(32), '0x' + '0'.repeat(64)], data: '0x' };
const recuDe = (logs, status = '0x1', avecSwap = true) => ({ status, transactionHash: H, blockNumber: '0x320a207', logs: avecSwap ? [swap, ...logs] : logs });
const txDe = (from) => ({ hash: H, from, to: USDC });

const ok1 = verifierFrais({ tx: txDe(PAYEUR), recu: recuDe([transfert(USDC, PAYEUR, A6CF, 40000)]) });
vu(ok1.ok && ok1.payeur === PAYEUR && ok1.externe === true && ok1.bloc === 52470279 && ok1.recus.length === 1 && ok1.recus[0].devise === USDC && ok1.recus[0].montant === '40000', 'transfer USDC du contrat USDC vers a6cf, payeur externe : compte (' + JSON.stringify(ok1) + ')');
const faux = verifierFrais({ tx: txDe(PAYEUR), recu: recuDe([transfert('0x' + '99'.repeat(20), PAYEUR, A6CF, 40000)]) });
vu(!faux.ok && faux.etat === 'REFUSE' && /nothing reached/.test(faux.pourquoi), 'un Transfer vers a6cf emis par un AUTRE contrat : REFUSE - ce n est pas la devise qui parle');
const ACTION = '0x' + '77'.repeat(20);
const parAction = verifierFrais({ tx: txDe(PAYEUR), recu: recuDe([transfert(ACTION, PAYEUR, A6CF, 9900)]), devises: devisesComptees([ACTION]) });
vu(parAction.ok && parAction.recus[0].devise === ACTION && parAction.recus[0].montant === '9900', 'frais Aerodrome en SORTIE dans le jeton d une action : compte si le serveur l a admise');
vu(!verifierFrais({ tx: txDe(PAYEUR), recu: recuDe([transfert(ACTION, PAYEUR, A6CF, 9900)]) }).ok, 'la meme action NON admise : refusee (la liste vient du serveur, pas de la requete)');
vu(verifierFrais({ tx: txDe(PAYEUR), recu: recuDe([transfert(USDC, PAYEUR, A6CF, 40000)], '0x0') }).etat === 'REFUSE', 'status 0x0 : REFUSE');
vu(verifierFrais({ tx: null, recu: null }).etat === 'NON_LU', 'recu absent : NON_LU, jamais un refus');
vu(verifierFrais({ tx: txDe(PAYEUR), recu: recuDe([transfert(USDC, PAYEUR, '0x' + '55'.repeat(20), 40000)]) }).etat === 'REFUSE', 'transfer vers un autre destinataire : rien pour a6cf');
/* payeur : UserOperation */
const UO = '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f';
const EP7 = '0x0000000071727de22e5e9d8baf0edac6f37da032'; /* lu sur Base le 2026-10-17, voir revenu-externe.js */
const op = (emetteur, sender) => ({ address: emetteur, topics: [UO, '0x' + '0'.repeat(64), adr(sender), '0x' + '0'.repeat(64)], data: '0x' });
const recuUo = recuDe([op(EP7, SENDER), transfert(USDC, SENDER, A6CF, 20000)]);
const uo = verifierFrais({ tx: txDe(BUNDLER), recu: recuUo });
vu(uo.ok && uo.payeur === SENDER, 'UserOperation : le payeur est le sender indexe, pas le bundler (' + uo.payeur + ')');
/* audit Grok 2026-10-17 : un UserOperationEvent IMITE (emis par un autre contrat) ne designe plus le payeur */
/* ⛔ 2026-10-17 soir : le repli sur tx.from etait le BUNDLER des qu un EntryPoint n etait pas liste (v0.8 manquait). Un UserOperationEvent
 *   d un contrat non liste rend desormais le payeur INCONNU -> REFUSE (rien compte), jamais le bundler ni le sender imite. */
const imite = verifierFrais({ tx: txDe(BUNDLER), recu: recuDe([op('0x' + '66'.repeat(20), SENDER), transfert(USDC, SENDER, A6CF, 20000)]) });
vu(!imite.ok && imite.etat === 'REFUSE' && /payer could not be read/.test(imite.pourquoi), 'UserOperationEvent d un contrat NON liste : payeur inconnu -> REFUSE, ni bundler ni sender imite');
const EP8 = '0x4337084d9e255ff0702461cf8895ce9e3b5ff108'; /* verifie sur Base le 2026-10-17 (21 738 o de code, tx 0xc18dc17c… l emet) */
const v08 = verifierFrais({ tx: txDe(BUNDLER), recu: recuDe([op(EP8, SENDER), transfert(USDC, SENDER, A6CF, 20000)]) });
vu(v08.ok && v08.payeur === SENDER, 'EntryPoint v0.8 : le payeur est le sender, pas le bundler (' + v08.payeur + ')');
vu(payeurDe({ tx: txDe(BUNDLER), recu: recuDe([op(EP8, SENDER)]) }) === SENDER, 'payeurDe v0.8 seul : le sender');
/* plusieurs operations : celle dont le sender a paye le frais lui-meme ; sinon AMBIGU -> refus */
const AUTRE = '0x' + '88'.repeat(20);
/* chasse 2026-10-17 (MED, PoC) : dans un lot multi-ops, un 1 wei vers a6cf faisait de son auteur le payeur de TOUT le lot -> plusieurs senders = REFUSE */
const multi = verifierFrais({ tx: txDe(BUNDLER), recu: recuDe([op(EP7, AUTRE), op(EP7, SENDER), transfert(USDC, SENDER, A6CF, 20000)]) });
vu(!multi.ok && multi.etat === 'REFUSE', 'lot multi-operations : AMBIGU -> REFUSE, jamais un payeur choisi (' + JSON.stringify(multi) + ')');
const don = verifierFrais({ tx: txDe(PAYEUR), recu: recuDe([transfert(USDC, PAYEUR, A6CF, 40000)], '0x1', false) });
vu(!don.ok && don.etat === 'REFUSE' && /no swap/.test(don.pourquoi), 'un simple virement vers a6cf (sans echange) n est PAS un frais');
const ambigu = verifierFrais({ tx: txDe(BUNDLER), recu: recuDe([op(EP7, AUTRE), op(EP7, SENDER), transfert(USDC, '0x' + '99'.repeat(20), A6CF, 20000)]) });
vu(!ambigu.ok && ambigu.etat === 'REFUSE' && /several operations/.test(ambigu.pourquoi), 'lot multi-operations sans payeur identifiable : REFUSE, jamais un payeur invente');
vu(payeurDe({ tx: txDe(BUNDLER), recu: recuDe([]) }) === BUNDLER, 'sans UserOperation : tx.from');
/* internes */
const internes = walletsInternes([GROK, 'pas-une-adresse']);
vu(internes.has(A6CF) && internes.has(GROK) && internes.size === 3, 'walletsInternes : a6cf + legacy + declares valides (' + internes.size + ')');
const deGrok = verifierFrais({ tx: txDe(GROK), recu: recuDe([transfert(USDC, GROK, A6CF, 40000)]), internes });
vu(deGrok.ok && deGrok.externe === false, 'un frais paye par Grok : verifie, mais INTERNE');
const deA6cf = verifierFrais({ tx: txDe(A6CF), recu: recuDe([transfert(USDC, A6CF, A6CF, 1)]), internes });
vu(deA6cf.ok && deA6cf.externe === false, 'a6cf qui se paie lui-meme : interne');
/* ETH natif */
const eth = verifierFrais({ tx: txDe(PAYEUR), recu: recuDe([]), ethRecu: 700000000000000n });
vu(eth.ok && eth.recus[0].devise === '0x' + '0'.repeat(40) && eth.recus[0].montant === '700000000000000', 'ETH natif via ethRecu (delta verifie par l appelant)');
/* compteur pur */
let etat = {};
const e1 = compterRevenu(etat, { ligne: 'swap_action', verif: ok1 });
vu(JSON.stringify(etat) === '{}' && e1.externe.swap_action.n === 1 && e1.externe.swap_action.parDevise[USDC] === '40000', 'compterRevenu ne mute pas, compte externe/swap_action');
const e2 = compterRevenu(e1, { ligne: 'swap_action', verif: ok1 });
vu(e2.externe.swap_action.n === 2 && e2.externe.swap_action.parDevise[USDC] === '80000' && e1.externe.swap_action.n === 1, 'somme BigInt, l etat precedent intact');
const e3 = compterRevenu(e2, { ligne: 'swap_action', verif: deGrok });
vu(e3.interne.swap_action.n === 1 && e3.externe.swap_action.n === 2, 'un frais interne va dans le seau interne');
const e4 = compterRevenu(e3, { ligne: 'inconnue', verif: ok1 });
vu(e4.externe.autre && e4.externe.autre.n === 1, 'ligne inconnue -> autre');
vu(LIGNES_FRAIS.includes('naissance') && LIGNES_FRAIS.includes('skin_mint') && LIGNES_FRAIS.includes('banque'), 'les lignes nommees existent');
console.log('ok revenu-externe - ' + n + ' assertions ; NE PROUVE PAS la lecture des recus en prod');
