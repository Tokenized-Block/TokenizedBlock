/* test-banque-revue-adverse-20261011.mjs - LES 9 DEFAUTS CONFIRMES PAR LA REVUE ADVERSE (workflow, 24 agents, 20 constats / 20 confirmes).
 * EXECUTE bcSigner (app.html, TB_APP = ancienne) avec un faux wallet qui CONFIRME l emprunt puis REFUSE le frais : faits = 1, le hash de
 *   l OPERATION est celui de l emprunt (pas du frais). AFFIRME le cablage des 8 autres : jamais « Start again » apres une etape passee ;
 *   frais marque cote serveur ; le net (pas le brut) dans les raccourcis ; aucun « same batch » ; d ou vient chaque chiffre du panier ;
 *   le Bridge relit ses sources ; un seul actif prete dans le panier ; le drapeau du panier toujours consomme ; le compte du Wallet = la
 *   regle de la Bank ; « aucune action acceptee » nomme les acceptees. NE PROUVE PAS : un vrai wallet.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const banque = readFileSync(new URL('./banque-morpho.js', import.meta.url), 'utf8');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const fonction = (entete) => { const i = html.indexOf(entete); assert.ok(i > 0, 'introuvable : ' + entete); const f = /\r?\n\}/.exec(html.slice(i)); return html.slice(i, i + f.index + f[0].length); };
/* 1. bcSigner EXECUTE : emprunt confirme, frais refuse */
const etapes = [];
const signer = new Function('bcEtape', 'envoyerDepuisWallet', 'window', 'rpc', 'CHAINE', 'compte', 'estRefusWallet', 'aEteDiffusee', fonction('async function bcSigner(m, appels) {') + '\nreturn bcSigner;')(
  (m, t) => etapes.push(t), async ({ to }) => (to === '0xemprunt' ? { etat: 'CONFIRME', hash: '0xh1' } : { etat: 'REFUSE', refuse: true }), { ethereum: {} }, null, 8453, '0xc',
  (r) => r.etat === 'REFUSE', () => false);
const s = await signer({}, [{ to: '0xemprunt', nom: 'borrow' }, { to: '0xfrais', nom: 'fee', frais: true }]);
vu(s.ok === false && s.faits === 1 && s.hashOperation === '0xh1', 'bcSigner : faits / hash de l operation faux : ' + JSON.stringify(s));
const s2 = await signer({}, [{ to: '0xemprunt' }, { to: '0xemprunt', frais: true }]);
vu(s2.ok === true && s2.faits === 2 && s2.hashOperation === '0xh1', 'bcSigner : le lien montrerait le frais, pas l operation : ' + JSON.stringify(s2));
/* 2. jamais « Start again » apres une etape passee */
const ae = fonction('function bcBanqueApresEchec(m, s, total, planifier) {');
vu(/if \(\(s && s\.faits > 0\) \|\| \(s && s\.diffusee\)\) \{[\s\S]*?Do not sign this plan again\.[\s\S]*?bcBoutons\(m, \[\]\);\s*return;/.test(ae) && /bcBoutons\(m, \[\['Start again', planifier, true\]\]\);/.test(ae), 'un plan a moitie passe peut etre rejoue');
for (const ent of ['async function bcBanqueProposer({', 'async function bcBanqueProposerPanier(lignes) {']) {
  const f = fonction(ent);
  vu(/if \(!s\.ok\) \{ bcBanqueApresEchec\(m, s, p\.aSigner\.length, planifier\); return; \}/.test(f) && !/if \(!s\.ok\) \{ bcBoutons\(m, \[\['Start again'/.test(f), ent.slice(15, 40) + ' : « Start again » nu apres un echec');
  vu(/court\(s\.hashOperation\)/.test(f) && /'\/tx\/' \+ s\.hashOperation/.test(f), ent.slice(15, 40) + ' : le lien ne montre pas l operation');
}
/* 3. le frais marque cote serveur */
vu(/appelTransfer\(DESTINATAIRE_FRAIS_BANQUE, frais\), value: '0x0', frais: true,/.test(banque), 'la transaction du frais n est pas marquee');
/* 4. le net dans les raccourcis */
const prop = fonction('async function bcBanqueProposer({');
vu(/const netM = /.test(prop) && !/montant: String\(brutM\)/.test(prop) && (prop.match(/montant: String\(netM\)/g) || []).length === 2, 'un raccourci apres emprunt propose encore le brut');
/* 5. aucun « same batch » */
vu(!/same batch/i.test(html.replace(/\/\*[\s\S]*?\*\//g, ' ')), '« same batch » est de nouveau affiche');
/* 6. le panier dit d ou viennent ses chiffres */
/* sans ses commentaires : ils citent l ancienne phrase fausse, expres (ma premiere version de ce test s y est prise) */
const tp = fonction('function tbPanierPeindre(actions, p, nonLu, acceptees = []) {').replace(/\/\*[\s\S]*?\*\//g, ' ');
vu(!/Read on chain just now/.test(tp) && /Wallet balances are read on chain \(up to a minute old\); what is posted and what each stock backs come from the Morpho API/.test(tp), 'le panier pretend encore « Read on chain just now »');
/* 7. le Bridge relit ses sources */
const br = fonction('async function peindreBridgeBlocks() {');
vu(/for \(const a of actifs \|\| \[\]\) if \(a && a\.bloc/.test(br) && /#mesBlocks \[data-block\]/.test(br) && /fetch\('\/api\/blocks-de\?adr='/.test(br) && !/\[data-adr\]/.test(br), 'le choix du hub du Bridge n a pas de source automatique (ou lit data-adr)');
/* 8. un seul actif prete ; drapeau toujours consomme */
const pp = fonction('function bcPanierPeindre(listes) {');
vu(/if \(mk\.pret\.symbole !== 'USDC' \|\| !\['ok', 'bas'\]\.includes\(bcBanqueChiffres\(mk\)\.etat\)\) continue;/.test(pp), 'le panier additionne des actifs pretes differents');
vu(/if \(bcBanque\.panierDemande\) \{ bcBanque\.panierDemande = false;/.test(pp), 'le drapeau du panier peut rester arme');
/* 9. le Wallet compte comme la Bank ; « aucune action acceptee » nomme les acceptees */
const tb = fonction('async function tbBanquePeindre() {');
vu(/\['ok', 'bas'\]\.includes\(bcBanqueChiffres\(mk\)\.etat\) && \(!parActionPanier\.has\(k\)/.test(tb) && /tbPanierPeindre\(\[\.\.\.parActionPanier\.values\(\)\], p, nonLu, acceptees\);/.test(tb), 'le Wallet ne compte pas les actions comme le panier de la Bank');
vu(/'None of the stocks the Bank can lend against right now is in this wallet'/.test(tp) && /\(accepted: ' \+ acceptees\.join\(', '\)/.test(tp) && !/No tokenized stock in this wallet yet/.test(tp), '« aucune action » ne nomme pas les actions acceptees');
console.log('ok banque-revue-adverse - ' + n + ' assertions (bcSigner execute) ; NE PROUVE PAS un vrai wallet');
