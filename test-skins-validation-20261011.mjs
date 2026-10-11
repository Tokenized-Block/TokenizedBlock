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

/* B : bcEnrichirValidations execute */
const i = html.indexOf('async function bcEnrichirValidations(liste, moi) {');
vu(i > 0, 'bcEnrichirValidations absente');
const f = /\n\}\n/.exec(html.slice(i));
const src = html.slice(i, i + f.index + f[0].length);
function noeud({ validations, journaux = [], journauxCassent = false, soldes = {}, autorisations = {}, annonceId = 4 }) {
  return async (m, p) => {
    if (m === 'eth_getLogs') { if (journauxCassent) throw new Error('429'); return journaux; }
    const d = String(p[0].data);
    if (d.startsWith('0x' + selecteur('listingOf(uint256)'))) return hexAnnonce({ vendeur: A, devise: S.ETH, prix: 1000, debut: 0, fin: 0, id: annonceId, encherisseur: S.ETH, offre: 0 });
    if (d.startsWith('0x' + selecteur('validated(uint256,address)'))) { const qui = '0x' + d.slice(-40); return '0x' + mot(validations[qui] || 0) + mot(0); }
    if (d.startsWith('0xdd62ed3e')) { const qui = '0x' + d.slice(34, 74); return '0x' + mot(autorisations[qui] || 0); }
    throw new Error('appel inattendu ' + d.slice(0, 10));
  };
}
const lancer = async (liste, moi, rpc, soldes = {}) => {
  const fn = new Function('rpc', 'BLOCKSKINS', 'BLOCKSKINS_BLOC', 'SUJET_ACHAT_VALIDE', 'ETH_SKIN', 'decoderAnnonce', 'appelAnnonce', 'decoderValidation', 'appelValidation', 'validationCourante', 'acheteursValides', 'bcSolde',
    src + '\nreturn bcEnrichirValidations;')(rpc, S.BLOCKSKINS, S.BLOCKSKINS_BLOC, S.SUJET_ACHAT_VALIDE, S.ETH, S.decoderAnnonce, S.appelAnnonce, S.decoderValidation, S.appelValidation, S.validationCourante, S.acheteursValides,
    async (j2, q) => BigInt(soldes[q] || 0));
  await fn(liste, moi);
  return liste;
};
{
  const [s] = await lancer([{ tokenId: 7n, detenteur: A, devise: S.ETH, prix: 1000n }], MOI, noeud({ validations: { [MOI]: 4 } }));
  vu(s.maValidation === true && s.acheteursPrets.length === 0, 'annonce d un autre + ma validation de CETTE annonce : maValidation');
  const [s2] = await lancer([{ tokenId: 7n, detenteur: A, devise: S.ETH, prix: 1000n }], MOI, noeud({ validations: { [MOI]: 3 } }));
  vu(s2.maValidation === false, 'ma validation d une annonce PRECEDENTE : pas courante');
}
{
  const [s] = await lancer([{ tokenId: 7n, detenteur: MOI, devise: S.ETH, prix: 1000n }], MOI, noeud({ validations: { [B]: 4, [B2]: 3 }, journaux: j }));
  vu(JSON.stringify(s.acheteursPrets) === JSON.stringify([B]), 'MON annonce : B (courant) pret, B2 (perime) ecarte (' + s.acheteursPrets.join(',') + ')');
}
{
  const [s] = await lancer([{ tokenId: 7n, detenteur: MOI, devise: USDC, prix: 1000n }], MOI, noeud({ validations: { [B]: 4, [B2]: 4 }, journaux: j, autorisations: { [B]: 1000, [B2]: 999 } }), { [B]: 5000, [B2]: 5000 });
  vu(JSON.stringify(s.acheteursPrets) === JSON.stringify([B]), 'en jeton : B2 n a approuve que 999 < 1000 -> ecarte (executeValidated reverterait)');
}
{
  const [s] = await lancer([{ tokenId: 7n, detenteur: MOI, devise: S.ETH, prix: 1000n }], MOI, noeud({ validations: {}, journauxCassent: true }));
  vu(s.validationsNonLues === true && s.acheteursPrets.length === 0, 'journaux illisibles : validationsNonLues (DIT), jamais « personne »');
}
/* C : le cablage */
vu(/if \(moi\) \{ await bcEnrichirValidations\(enVente\.filter\(\(s\) => !s\.enchere\), moi\); if \(!z\.isConnected\) return; \}\n\s+for \(const s of enVente\) z\.append\(bcLigneSkin\(s, moi, t\)\);/.test(html),
  'bcPeindreMarche enrichit les annonces a prix fixe AVANT de peindre les lignes');
vu(/bouton\(s\.maValidation \? 'Revoke my validation' : 'Validate at this price', s\.maValidation \? 'REVOQUER' : 'VALIDER'\);/.test(html), 'ligne : Validate / Revoke');
vu(/for \(const b of s\.acheteursPrets \|\| \[\]\) bouton\('Complete the sale to ' \+ court\(b\) \+ ' \(validated\)', 'COMPLETER', \{ acheteur: b \}\);/.test(html), 'ligne : Complete pour chaque acheteur CONFIRME');
vu(/genre === 'VALIDER' \? appelValiderAchat\(s\.tokenId, s\.devise, montant\)/.test(html) && /appels = \[appelRevoquerAchat\(s\.tokenId\)\];/.test(html) && /appels = \[appelExecuterValide\(s\.tokenId, x\.acheteur\)\];/.test(html),
  'gestes VALIDER / REVOQUER / COMPLETER -> les bons appels');
console.log('ok skins-validation - ' + n + ' assertions ; NE PROUVE PAS le rendu navigateur');
