/* test-skins-validation-20261011.mjs - « LES DEUX COCHENT » dans l app (spec de Phil 2026-10-04 ; « fini le Skinbrain market » 2026-10-11).
 * AFFIRME (EXECUTE) :
 *   A. blockskins.js : validateBuy porte la valeur = prix en ETH, 0 en jeton ; executeValidated(tokenId, acheteur) ; revokeBuy ; les
 *      decodeurs de listingOf / validated ; validationCourante (numero d annonce, prix fixe) ; acheteursValides (journaux, par skin) ;
 *   B. bcEnrichirValidations (extrait d app.html, faux noeud) : ma validation courante sur l annonce d un autre ; sur MON annonce les
 *      acheteurs CONFIRMES seulement (validation perimee ecartee ; en jeton, autorisation insuffisante ecartee) ; journaux illisibles = DIT ;
 *   C. le cablage : marche enrichi avant la peinture, boutons Validate / Revoke / Complete, gestes VALIDER / REVOQUER / COMPLETER.
 * PROUVE AILLEURS (execution) : banc-skins-validation-fork-20261011.mjs 38/0 contre le contrat v2 deploye.
 * NE PROUVE PAS : le rendu navigateur ; un vrai wallet. */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const S = await import(new URL('./blockskins.js', import.meta.url).href);
const { selecteur } = await import(new URL('./encodeur.js', import.meta.url).href);
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const adr = (a) => a.slice(2).padStart(64, '0');
const USDC = Object.keys(S.DEVISES_SKIN).find((k) => S.DEVISES_SKIN[k].sym === 'USDC');
const A = '0x' + 'aa'.repeat(20), B = '0x' + 'bb'.repeat(20), B2 = '0x' + 'cc'.repeat(20), MOI = '0x' + 'dd'.repeat(20);

/* A */
const v = S.appelValiderAchat(7n, S.ETH, 1000n);
vu(v.to === S.BLOCKSKINS && v.data === '0x' + selecteur('validateBuy(uint256)') + mot(7) && v.value === '0x3e8', 'validateBuy en ETH : la valeur EST le prix (tenu par le contrat)');
vu(S.appelValiderAchat(7n, USDC, 1000n).value === '0x0', 'validateBuy en jeton : valeur 0 (le prix se prend a l execution)');
vu(S.appelExecuterValide(7n, B).data === '0x' + selecteur('executeValidated(uint256,address)') + mot(7) + adr(B), 'executeValidated(tokenId, acheteur)');
vu(S.appelRevoquerAchat(7n).data === '0x' + selecteur('revokeBuy(uint256)') + mot(7), 'revokeBuy(tokenId)');
vu(!/NFT/.test(v.nom + S.appelExecuterValide(7n, B).nom + S.appelRevoquerAchat(7n).nom), 'jamais « NFT » dans le nom d une etape');
const hexAnnonce = (o) => '0x' + adr(o.vendeur) + adr(o.devise) + mot(o.prix) + mot(o.debut) + mot(o.fin) + mot(o.id) + adr(o.encherisseur) + mot(o.offre);
const an = S.decoderAnnonce(hexAnnonce({ vendeur: A, devise: S.ETH, prix: 1000, debut: 0, fin: 0, id: 4, encherisseur: S.ETH, offre: 0 }));
vu(an.vendeur === A && an.prix === 1000n && an.id === 4n && an.debut === 0n, 'decoderAnnonce : 8 mots du getter listingOf');
const val = (annonce, eth) => S.decoderValidation('0x' + mot(annonce) + mot(eth));
vu(S.validationCourante(val(4, 1000), an), 'validation de l annonce 4 sur l annonce 4 : courante');
vu(!S.validationCourante(val(3, 1000), an), 'validation de l annonce 3 sur l annonce 4 : PERIMEE (le contrat : ListingChanged)');
vu(!S.validationCourante(val(0, 0), an), 'aucune validation');
vu(!S.validationCourante(val(4, 0), { ...an, debut: 5n }), 'une enchere n a pas de validation');
const t7 = '0x' + mot(7), t8 = '0x' + mot(8), pad = (a) => '0x' + adr(a);
const j = [{ topics: [S.SUJET_ACHAT_VALIDE, t7, pad(B)] }, { topics: [S.SUJET_ACHAT_VALIDE, t7, pad(B)] }, { topics: [S.SUJET_ACHAT_VALIDE, t8, pad(B2)] }, { topics: [S.SUJET_ACHAT_VALIDE, t7, pad(B2)] }];
vu(JSON.stringify(S.acheteursValides(j, 7n)) === JSON.stringify([B, B2]), 'acheteursValides : les acheteurs de CETTE skin, sans doublon');
vu(/^0x[0-9a-f]{64}$/.test(S.SUJET_ACHAT_VALIDE) && Number.isInteger(S.BLOCKSKINS_BLOC) && S.BLOCKSKINS_BLOC > 0, 'sujet du journal et bloc de naissance du contrat');

/* A bis : le verificateur du RECU (index serveur) - un journal n est cru que s il vient du contrat */
{
  const data = '0x' + adr(USDC) + mot(5000000);
  const log = (address) => ({ address, topics: [S.SUJET_ACHAT_VALIDE, t7, pad(B)], data });
  const ok1 = S.verifierValidation({ recu: { status: '0x1', blockNumber: '0x10', logs: [log(S.BLOCKSKINS)] } });
  vu(ok1.ok && ok1.validations.length === 1 && ok1.validations[0].tokenId === '7' && ok1.validations[0].acheteur === B && ok1.validations[0].devise === USDC && ok1.validations[0].prix === '5000000' && ok1.bloc === 16,
    'verifierValidation : tokenId, acheteur (indexe), devise et prix (data) du journal du CONTRAT');
  vu(S.verifierValidation({ recu: { status: '0x1', logs: [log('0x' + '99'.repeat(20))] } }).etat === 'REFUSE', 'un BuyValidated emis par un AUTRE contrat : REFUSE (un evenement n est pas une transaction)');
  vu(S.verifierValidation({ recu: { status: '0x0', logs: [log(S.BLOCKSKINS)] } }).etat === 'REFUSE', 'transaction echouee : REFUSE');
  vu(S.verifierValidation({ recu: null }).etat === 'NON_LU', 'recu pas encore lisible : NON_LU (le client reessaie), jamais un refus');
}

/* B : bcEnrichirValidations execute - candidats de l INDEX serveur (plus de getLogs), confirmes sur la chaine */
const i = html.indexOf('async function bcValidationsIndexees(param) {');
vu(i > 0, 'bcValidationsIndexees absente');
const iE = html.indexOf('async function bcEnrichirValidations(liste, moi) {');
const f = /\n\}\n/.exec(html.slice(iE));
const src = html.slice(i, iE + f.index + f[0].length);
vu(!/eth_getLogs/.test(src), 'plus aucun eth_getLogs dans la lecture des validations (revue adverse : aucun noeud ne le sert depuis la naissance du contrat)');
const indexB = [{ acheteur: B }, { acheteur: B }, { acheteur: B2 }];
function noeud({ validations, soldes = {}, autorisations = {}, annonceId = 4 }) {
  return async (m, p) => {
    const d = String(p[0].data);
    if (d.startsWith('0x' + selecteur('listingOf(uint256)'))) return hexAnnonce({ vendeur: A, devise: S.ETH, prix: 1000, debut: 0, fin: 0, id: annonceId, encherisseur: S.ETH, offre: 0 });
    if (d.startsWith('0x' + selecteur('validated(uint256,address)'))) { const qui = '0x' + d.slice(-40); return '0x' + mot(validations[qui] || 0) + mot(0); }
    if (d.startsWith('0xdd62ed3e')) { const qui = '0x' + d.slice(34, 74); return '0x' + mot(autorisations[qui] || 0); }
    throw new Error('appel inattendu ' + d.slice(0, 10));
  };
}
const lancer = async (liste, moi, rpc, { soldes = {}, index = indexB, indexCasse = false } = {}) => {
  const fetchFaux = async (url) => { if (indexCasse) throw new Error('429'); vu(/^\/api\/skins\/validations\?token=7$/.test(url), 'l index est lu par skin (' + url + ')'); return { json: async () => ({ ok: true, validations: index }) }; };
  const fn = new Function('rpc', 'fetch', 'BLOCKSKINS', 'ETH_SKIN', 'decoderAnnonce', 'appelAnnonce', 'decoderValidation', 'appelValidation', 'validationCourante', 'bcSolde',
    src + '\nreturn bcEnrichirValidations;')(rpc, fetchFaux, S.BLOCKSKINS, S.ETH, S.decoderAnnonce, S.appelAnnonce, S.decoderValidation, S.appelValidation, S.validationCourante,
    async (j2, q) => BigInt(soldes[q] || 0));
  await fn(liste, moi);
  return liste;
};
{
  const [s] = await lancer([{ tokenId: 7n, detenteur: A, devise: S.ETH, prix: 1000n }], MOI, noeud({ validations: { [MOI]: 4 } }));
  vu(s.maValidation === true && s.acheteursPrets.length === 0 && s.pour === MOI, 'annonce d un autre + ma validation de CETTE annonce : maValidation ; la ligne retient son compte');
  const [s2] = await lancer([{ tokenId: 7n, detenteur: A, devise: S.ETH, prix: 1000n }], MOI, noeud({ validations: { [MOI]: 3 } }));
  vu(s2.maValidation === false, 'ma validation d une annonce PRECEDENTE : pas courante');
  const casse = async () => { throw new Error('429'); };
  const [s3] = await lancer([{ tokenId: 7n, detenteur: A, devise: S.ETH, prix: 1000n }], MOI, casse);
  vu(s3.maValidation === null && s3.validationsNonLues === true, 'lecture ratee cote acheteur : maValidation NULL (non lu), jamais false (revue adverse : on ne propose pas de repayer a l aveugle)');
}
{
  const [s] = await lancer([{ tokenId: 7n, detenteur: MOI, devise: S.ETH, prix: 1000n }], MOI, noeud({ validations: { [B]: 4, [B2]: 3 } }));
  vu(JSON.stringify(s.acheteursPrets) === JSON.stringify([B]), 'MON annonce : B (courant) pret, B2 (perime) ecarte, B en double dans l index compte une fois (' + s.acheteursPrets.join(',') + ')');
}
{
  const [s] = await lancer([{ tokenId: 7n, detenteur: MOI, devise: USDC, prix: 1000n }], MOI, noeud({ validations: { [B]: 4, [B2]: 4 }, autorisations: { [B]: 1000, [B2]: 999 } }), { soldes: { [B]: 5000, [B2]: 5000 } });
  vu(JSON.stringify(s.acheteursPrets) === JSON.stringify([B]), 'en jeton : B2 n a approuve que 999 < 1000 -> ecarte (executeValidated reverterait)');
}
{
  const [s] = await lancer([{ tokenId: 7n, detenteur: MOI, devise: S.ETH, prix: 1000n }], MOI, noeud({ validations: {} }), { indexCasse: true });
  vu(s.validationsNonLues === true && s.acheteursPrets.length === 0, 'index illisible : validationsNonLues (DIT), jamais « personne »');
}
/* C : la ligne, EXECUTEE (revue adverse : Buy a cote d une validation = payer deux fois ; non lu = pas de Validate) */
{
  const k = html.indexOf('function bcLigneSkin(s, moi, t) {');
  const fk = /\n\}\n/.exec(html.slice(k));
  const srcL = html.slice(k, k + fk.index + fk[0].length);
  const ligne = (s) => {
    const el = (tag, o = {}, enf = []) => ({ tag, ...o, enfants: [...enf], append(...e) { this.enfants.push(...e); }, addEventListener() {} });
    const li = new Function('bcEl', 'bcResoudre', 'bcMontantSkin', 'bcPastilleSkin', 'actionsSkin', 'offreMinimale', 'court', 'bcDevisesSkin', 'BC_DUREES_ENCHERE', 'montantVersBrut', 'bcActionMarche', 'document', 'bcDureeSkin',
      srcL + '\nreturn bcLigneSkin;')(el, () => ({ sym: 'BLK' }), (m) => String(m), () => el('i'), S.actionsSkin, S.offreMinimale, (a) => a.slice(0, 6), () => ({}), [], S.montantVersBrut, () => {}, { createTextNode: (x) => ({ text: x }) }, () => '1h')(s, MOI, 100);
    return li.enfants.filter((e) => e.tag === 'button').map((e) => e.text).concat(li.enfants.filter((e) => e.tag === 'small').map((e) => 'NOTE:' + e.text));
  };
  const base = { tokenId: 7n, detenteur: A, block: A, recette: {}, enVente: true, enchere: false, devise: S.ETH, prix: 1000n, fin: 0 };
  const v1 = ligne({ ...base, maValidation: true });
  vu(JSON.stringify(v1) === JSON.stringify(['Complete it yourself', 'Revoke my validation']), 'validee : « Complete it yourself » + « Revoke », PAS de « Buy » (' + v1.join(' | ') + ')');
  const v0 = ligne({ ...base, maValidation: false });
  vu(v0.length === 2 && /^Buy for /.test(v0[0]) && v0[1] === 'Validate at this price', 'non validee : Buy + Validate (' + v0.join(' | ') + ')');
  const vn = ligne({ ...base, maValidation: null, validationsNonLues: true });
  vu(vn.length === 2 && /^Buy for /.test(vn[0]) && /^NOTE:Your validation of this skin could not be read/.test(vn[1]), 'non lue : PAS de Validate, la note le dit (' + vn.join(' | ') + ')');
  const ve = ligne({ ...base, enchere: true, fin: 999, maValidation: false });
  vu(!ve.includes('Validate at this price'), 'une enchere : jamais Validate');
  const vm = ligne({ ...base, detenteur: MOI, acheteursPrets: [B], maValidation: null });
  vu(vm.includes('Complete the sale to ' + B.slice(0, 6) + ' (validated)') && !vm.includes('Validate at this price'), 'MON annonce : Complete pour l acheteur confirme, jamais Validate');
}
/* C bis : les gardes de bcActionMarche et la section « Your validations » */
vu(/if \(s && s\.pour !== undefined && String\(compte \|\| ''\)\.toLowerCase\(\) !== String\(s\.pour \|\| ''\)\) \{/.test(html), 'garde de compte : une ligne peinte pour un autre compte est refusee, le marche relu');
vu(/if \(an\.prix !== BigInt\(s\.prix\) \|\| an\.devise !== String\(s\.devise\)\.toLowerCase\(\) \|\| an\.debut !== 0n \|\| an\.vendeur !== String\(s\.detenteur\)\.toLowerCase\(\)\) \{/.test(html), 'Validate relit l annonce juste avant (prix, devise, prix fixe, vendeur)');
vu(/if \(autres > 0\) \{ bcEtape\(m, 'You already have a live validation paid in /.test(html), 'en jeton : une seule validation vivante par devise (une autorisation = une validation)');
vu(/fetch\('\/api\/skins\/validation', \{ method: 'POST'/.test(html) && /if \(genre === 'VALIDER' && r\.hash\) \{/.test(html), 'apres signature : la validation est envoyee a l index (echec DIT)');
vu(/miennesV = await bcValidationsIndexees\('acheteur=' \+ moi\)/.test(html) && /if \(validationCourante\(va, an\)\) continue;/.test(html) && /' and still holds ' \+ bcMontantSkin\(va\.ethTenu, ETH_SKIN\) \+ ': revoke it, then withdraw that ETH below\.'/.test(html),
  'section « Your validations » : une validation perimee qui tient de l ETH est montree, avec Revoke');
vu((html.match(/const zm = \$\('#bcMarche'\); if \(zm && zm\.childElementCount\) void bcPeindreMarche\(\);/g) || []).length === 2, 'connexion et changement de compte : le marche deja peint est relu');
vu(/genre === 'VALIDER' \? appelValiderAchat\(s\.tokenId, s\.devise, montant\)/.test(html) && /appels = \[appelRevoquerAchat\(s\.tokenId\)\];/.test(html) && /appels = \[appelExecuterValide\(s\.tokenId, x\.acheteur\)\];/.test(html),
  'gestes VALIDER / REVOQUER / COMPLETER -> les bons appels');
/* le serveur : l index des validations */
{
  const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
  vu(/import \{ verifierValidation \} from '\.\/blockskins\.js';/.test(srv) && /const v = verifierValidation\(\{ recu \}\);/.test(srv) && /rpcActivite\('eth_getTransactionReceipt', \[h\]\)/.test(srv),
    'serveur : POST /api/skins/validation lit le RECU et le verifie (journal du contrat)');
  vu(/if \(chemin === '\/api\/skins\/validation'\) \{/.test(srv) && /if \(chemin === '\/api\/skins\/validations'\) \{/.test(srv)
    && srv.indexOf("if (chemin === '/api/skins/validations') {") < srv.search(/if \(req\.method !== 'GET'\) \{ rendreS\(405, \{ ok: false, pourquoi: 'GET only' \}\); return; \}\r?\n\s+\/\* les skins d UN ACHETEUR/),
  'serveur : les deux routes passent AVANT le refus « GET only » du bloc skins');
}
/* le brain (S.I, regle « Suggest skins ») propose de COMPLETER une vente validee - avant ses propositions d achat */
{
  const k = html.indexOf('async function bcAifiProposerSkin() {');
  const corps = html.slice(k, k + 3500);
  vu(k > 0 && /const aCompleter = r\.skins\.filter\(\(x\) => x\.enVente && !x\.enchere && x\.detenteur === moiS && x\.block === blocS && !bcAifiSkins\.proposes\.has\('c' \+ x\.tokenId\)\);/.test(corps),
    'S.I : seulement MES annonces a prix fixe des skins de CE block, une fois par skin');
  vu(/Date\.now\(\) - \(bcAifiSkins\.validationsLues \|\| 0\) > 120000/.test(corps), 'S.I : les journaux relus au plus toutes les 2 minutes');
  vu(/void bcActionMarche\('COMPLETER', pret, \{ acheteur: pret\.acheteursPrets\[0\] \}, 'Its brain · S\.I'\);/.test(corps), 'S.I : la carte « Complete » - la personne signe');
  vu(corps.indexOf("bcActionMarche('COMPLETER'") < corps.indexOf('const p = propositionSkin('), 'S.I : completer une vente passe AVANT de proposer un achat');
}
console.log('ok skins-validation - ' + n + ' assertions ; NE PROUVE PAS le rendu navigateur');
