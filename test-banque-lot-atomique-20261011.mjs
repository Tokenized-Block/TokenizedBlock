/* test-banque-lot-atomique-20261011.mjs - LE FRAIS DE LA BANK DANS LA MEME SIGNATURE QUAND LE WALLET SAIT DEJA GROUPER.
 * Avant : chaque appel du plan partait seul (bcSigner) ; le frais (0,1 %), dernier pas SEPARE, se refusait apres l emprunt
 *   (contre-test de Grok du 2026-10-11 demande, frais NON atomique note dans le handoff).
 * EXECUTE (fonctions extraites de app.html, TB_APP = autre copie pour une mutation) :
 *   bcPeutGrouper : < 2 appels, pas de provider, pas de compte, peutGrouper qui leve -> false ; sinon la reponse de peutGrouper, chaine 0x2105 ;
 *   bcSignerBanque : chaque issue de envoyerLotAtomique ->
 *     CONFIRME (tous)            -> ok, faits = N, aucun envoi separe ;
 *     CONFIRME (pas tous)        -> echec « diffusee » (on ne sait pas), jamais de repli ;
 *     sendCallsUnsupported       -> RIEN n est parti -> repli sur les etapes (bcSigner), dit avant ;
 *     garde chaine/compte        -> rien n est parti, faits 0, pas diffusee ;
 *     refus explicite du wallet  -> refuse, pas diffusee ;
 *     sans reponse / PARTIEL / EN_ATTENTE / exception -> diffusee, AUCUN repli (rejouer = emprunter deux fois) ;
 *   bcBanqueApresEchec sur ces issues : « Start again » seulement quand rien n est parti.
 * AFFIRME le cablage : les DEUX cartes Bank decident `enLot` AVANT de peindre la ligne du frais, et signent par bcSignerBanque.
 * NE PROUVE PAS : qu un vrai wallet groupe (Coinbase Smart Wallet / Base Account declarent `supported` - NON MESURE ici), ni le rendu. */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const fonction = (entete) => { const i = html.indexOf(entete); assert.ok(i > 0, 'introuvable : ' + entete); const f = /\r?\n\}/.exec(html.slice(i)); return html.slice(i, i + f.index + f[0].length); };
const ligneRienParti = (html.match(/const BC_RIEN_PARTI = \[[^\]]*\];/) || [])[0];
vu(!!ligneRienParti, 'BC_RIEN_PARTI introuvable');

/* 1. bcPeutGrouper EXECUTE */
const demandes = [];
const fabriquerPeut = ({ eth = {}, compte = '0xc', reponse = true, leve = false, banque = {} } = {}) => new Function('window', 'compte', 'CHAINE', 'peutGrouper', 'bcBanque',
  fonction('async function bcPeutGrouper(appels) {') + '\nreturn bcPeutGrouper;')({ ethereum: eth }, compte, 8453,
  async (a) => { demandes.push(a); if (leve) throw new Error('boom'); return reponse; }, banque);
const deux = [{ to: '0xa' }, { to: '0xb' }];
vu(await fabriquerPeut()(deux) === true && demandes.at(-1).chaineHex === '0x2105' && demandes.at(-1).compte === '0xc', 'bcPeutGrouper : ne demande pas au wallet sur Base');
const avant = demandes.length;
vu(await fabriquerPeut()([{ to: '0xa' }]) === false && demandes.length === avant, 'bcPeutGrouper : un seul appel ne devrait rien demander');
vu(await fabriquerPeut({ eth: null })(deux) === false && await fabriquerPeut({ compte: null })(deux) === false, 'bcPeutGrouper : sans provider ou sans compte -> false');
vu(await fabriquerPeut({ leve: true })(deux) === false && await fabriquerPeut({ reponse: false })(deux) === false, 'bcPeutGrouper : une question qui leve ou un « non » -> false');
/* 2026-10-11 (revue adverse) : un wallet qui a refuse le lot 2.0.0 (methode inconnue) dans cette visite garde les etapes au « Start again » */
vu(await fabriquerPeut({ banque: { lotRefusePour: '0xc' } })(deux) === false && await fabriquerPeut({ banque: { lotRefusePour: '0xautre' } })(deux) === true,
  'bcPeutGrouper : le refus du lot n est pas retenu pour ce compte (ou bloque un autre compte)');

/* 2. bcSignerBanque EXECUTE, une issue de lot a la fois */
const PLAN = [{ to: '0x' + '1'.repeat(40), data: '0xaa', nom: 'supplyCollateral' }, { to: '0x' + '2'.repeat(40), data: '0xbb', nom: 'borrow' },
  { to: '0x' + '3'.repeat(40), data: '0xcc', value: '0x0', nom: 'fee', frais: true }];
const essai = async (issueLot, enLot = true, appels = PLAN) => {
  const trace = { lots: [], separes: 0, etapes: [], banque: {} };
  trace.payes = [];
  const f = new Function('bcEtape', 'bcSigner', 'envoyerLotAtomique', 'messageEnvoi', 'window', 'rpc', 'CHAINE', 'compte', 'bcBanque', 'signalerPaye',
    ligneRienParti + '\n' + fonction('async function bcSignerBanque(m, appels, enLot) {') + '\nreturn bcSignerBanque;')(
    (m, t, k) => trace.etapes.push([t, k]),
    async (m, a, l) => { trace.separes += 1; trace.ligneSeparee = l; return { ok: true, hash: '0xsep', hashOperation: '0xsep', faits: a.length, sequentiel: true }; },
    async (o) => { trace.lots.push(o); if (issueLot instanceof Error) throw issueLot; return issueLot; },
    (r) => 'msg:' + r.etat, { ethereum: {} }, null, 8453, '0xc', trace.banque, (h, l) => trace.payes.push([h, l]));
  const s = await f({}, appels, enLot);
  return { s, trace };
};
let r = await essai({ etat: 'CONFIRME', hash: '0xlot', tousConfirmes: true });
vu(r.s.ok && r.s.faits === 3 && r.s.hashOperation === '0xlot' && r.trace.separes === 0 && r.trace.lots.length === 1, 'CONFIRME : ' + JSON.stringify(r.s));
vu(r.trace.lots[0].calls.length === 3 && r.trace.lots[0].calls[2].to === PLAN[2].to && r.trace.lots[0].calls[2].data === '0xcc' && r.trace.lots[0].calls[0].value === '0x0'
  && r.trace.lots[0].chaineAttendue === 8453 && r.trace.lots[0].compte === '0xc', 'le lot n emporte pas les 3 appels (frais compris) tels quels');
vu(JSON.stringify(r.trace.payes) === JSON.stringify([['0xlot', 'banque']]), 'lot CONFIRME : son hash part au compteur de revenu en ligne banque : ' + JSON.stringify(r.trace.payes));
{ const p = await essai({ etat: 'CONFIRME', hash: '0xlot' }, false, PLAN.slice(0, 1)); vu(p.trace.separes === 1 && p.trace.ligneSeparee === 'banque', 'hors lot : bcSigner recoit la ligne banque (' + p.trace.ligneSeparee + ')'); }
r = await essai({ etat: 'CONFIRME', hash: '0xlot', tousConfirmes: false });
vu(r.trace.payes.length === 0, 'lot PARTIEL : rien n est poste au compteur');
r = await essai({ etat: 'CONFIRME', hash: '0xlot', tousConfirmes: null });
vu(r.s.ok, 'CONFIRME sans compte des recus (null) = succes, comme le swap');
r = await essai({ etat: 'CONFIRME', hash: '0xlot', tousConfirmes: false });
vu(!r.s.ok && r.s.diffusee === true && r.trace.separes === 0, 'CONFIRME partiel : doit etre « on ne sait pas », sans repli : ' + JSON.stringify(r.s));
/* 2026-10-11 (revue adverse, 3/3) : plus de repli AUTOMATIQUE (il rouvrait l emprunt sous « nothing was sent ») - rien n est parti,
 *   le refus est retenu pour ce compte, la personne relance (« Start again ») et le plan se repeint en etapes */
r = await essai({ etat: 'ECHEC_ENVOI', sendCallsUnsupported: true, pourquoi: 'method not supported' });
vu(!r.s.ok && r.s.diffusee === false && r.s.refuse === false && r.s.faits === 0 && r.trace.separes === 0 && r.trace.banque.lotRefusePour === '0xc'
  && /nothing was sent/.test(r.trace.etapes.map((e) => e[0]).join(' ')), 'ROUGE->VERT : wallet sans lot 2.0.0 : repli automatique ou refus non retenu : ' + JSON.stringify(r.s));
vu(r.trace.lots[0].sansRepliV1 === true, 'la Bank laisse envoi.js relancer en 1.0 (non atomique) sous une carte « all or none »');
for (const etat of ['MAUVAISE_CHAINE', 'AUTRE_COMPTE', 'CHAINE_ILLISIBLE', 'COMPTE_ILLISIBLE', 'REFUSE', 'DESTINATION_INVALIDE']) {
  r = await essai({ etat, pourquoi: 'nothing was sent' });
  vu(!r.s.ok && r.s.diffusee === false && r.s.faits === 0 && r.trace.separes === 0, etat + ' : rien n est parti, mais ' + JSON.stringify(r.s));
}
r = await essai({ etat: 'ECHEC_ENVOI', sendCallsUnsupported: false, pourquoi: 'the wallet did not answer this batch, and we will NOT re-open it (User rejected the request.)' });
vu(!r.s.ok && r.s.refuse === true && r.s.diffusee === false && r.trace.separes === 0, 'refus explicite : ' + JSON.stringify(r.s));
for (const issue of [{ etat: 'ECHEC_ENVOI', sendCallsUnsupported: false, pourquoi: 'the wallet did not answer this batch (timeout)' },
  { etat: 'PARTIEL', partiel: true }, { etat: 'EN_ATTENTE', hash: '0xatt' }, { etat: 'ANNULE_SUR_CHAINE', hash: '0xrev' }, new Error('provider crashed')]) {
  r = await essai(issue);
  vu(!r.s.ok && r.s.diffusee === true && r.s.refuse === false && r.trace.separes === 0, 'issue inconnue ' + (issue.etat || issue.message) + ' : repli ou « rien n est parti » = double emprunt possible : ' + JSON.stringify(r.s));
}
r = await essai({ etat: 'EN_ATTENTE', hash: '0xatt' });
vu(r.s.hash === '0xatt', 'EN_ATTENTE : le hash du lot est perdu');
r = await essai({ etat: 'CONFIRME', hash: '0xlot', tousConfirmes: true }, false);
vu(r.s.sequentiel && r.trace.lots.length === 0, 'enLot = false : le lot part quand meme');
r = await essai({ etat: 'CONFIRME', hash: '0xlot', tousConfirmes: true }, true, [PLAN[0]]);
vu(r.s.sequentiel && r.trace.lots.length === 0, 'un seul appel : le lot part quand meme');

/* 3. bcBanqueApresEchec EXECUTE sur ces issues : « Start again » seulement si rien n est parti */
const apres = (s) => { const b = []; new Function('bcApresOperation', 'bcEtape', 'bcBoutons', fonction('function bcBanqueApresEchec(m, s, total, planifier) {') + '\nreturn bcBanqueApresEchec;')(
  () => {}, () => {}, (m, x) => b.push(...x))({}, s, 3, () => {}); return b.some((x) => x[0] === 'Start again'); };
vu(apres((await essai({ etat: 'ECHEC_ENVOI', pourquoi: '(User rejected the request.)' })).s) === true, 'un lot refuse ne propose pas de recommencer');
vu(apres((await essai({ etat: 'MAUVAISE_CHAINE' })).s) === true, 'mauvaise chaine (rien envoye) ne propose pas de recommencer');
vu(apres((await essai({ etat: 'ECHEC_ENVOI', pourquoi: 'timeout' })).s) === false, 'lot sans reponse : « Start again » referait l emprunt');
vu(apres((await essai({ etat: 'PARTIEL' })).s) === false, 'lot PARTIEL : « Start again » referait l emprunt');

/* 4. cablage : les DEUX cartes decident AVANT la ligne du frais, et signent par bcSignerBanque */
for (const ent of ['async function bcBanqueProposer({', 'async function bcBanqueProposerPanier(lignes) {']) {
  const f = fonction(ent);
  const iDecide = f.indexOf('const enLot = await bcPeutGrouper(p.aSigner);');
  const iFrais = f.search(/fee (in total)?: ' \+ bcUnites|fee: ' \+ bcUnites/);
  vu(iDecide > 0 && iFrais > iDecide, ent.slice(15, 40) + ' : enLot decide APRES la ligne du frais (ou jamais)');
  vu(/await bcSignerBanque\(m, p\.aSigner, enLot\)/.test(f) && !/await bcSigner\(m, p\.aSigner\)/.test(f), ent.slice(15, 40) + ' : signe encore etape par etape sans regarder enLot');
  vu(/enLot \? 'Sign once in my wallet \(' \+ p\.aSigner\.length \+ ' steps\)'/.test(f), ent.slice(15, 40) + ' : le bouton ne dit pas « une signature »');
}
console.log('ok banque-lot-atomique - ' + n + ' assertions (bcPeutGrouper, bcSignerBanque, bcBanqueApresEchec executes) ; NE PROUVE PAS un vrai wallet');
