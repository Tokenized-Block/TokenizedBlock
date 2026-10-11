/* test-skins-marche-20261011.mjs - LE MARCHE DES SKINS dans la boutique du panneau (Phil, 2026-10-11 : « le market des skins … enchères …
 * des fees de l app pour chaque achat vente »). Lit app.html (TB_APP = une autre version, pour la preuve rouge).
 * AFFIRME (cablage) : la boutique pose #bcMarche et le peint ; une lecture ratee le DIT (jamais une vitrine vide) ; chaque ligne ne
 *   propose que actionsSkin (logique pure, testee dans test-blockskins-module) ; en jeton, solde ET autorisation relus AVANT de signer,
 *   approbation EXACTE du montant, jamais illimitee ; un envoi diffuse sans confirmation ne se relance pas ; un credit n est un montant
 *   que si la reponse est UN mot de 32 octets ; aucun texte d ecran ne dit « NFT » ni ne montre l adresse de frais.
 * PROUVE AILLEURS (navigateur, 2026-10-11, vitrine simulee de 3 skins, soldes reels) : Buy 2 USDC -> « holds 0.147422 USDC — this needs
 *   2 USDC. Nothing was asked. » ; Bid -> bid(2, 1.05e15) valeur 1.05e15 vers v2 ; Sell 0.5 USDC -> list(3, USDC, 500000) ; 0.0000001 refuse.
 * NE PROUVE PAS : un vrai wallet, une vraie vente on-chain (le banc app fork 24/0 joue les memes appels). */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const corps = (nom) => { const i = html.indexOf(nom); if (i < 0) return ''; const j = html.slice(i + 10).search(/\n(async )?function /); return html.slice(i, j > 0 ? i + 10 + j : i + 6000); };
const boutique = corps('function bcPeindreBoutique('), marche = corps('async function bcPeindreMarche('), ligne = corps('function bcLigneSkin('), action = corps('async function bcActionMarche(');
vu(marche.length > 0 && ligne.length > 0 && action.length > 0, 'app.html n a pas le marche des skins (bcPeindreMarche / bcLigneSkin / bcActionMarche)');
vu(/z\.append\(bcEl\('div', \{ cls: 'bcMarche', id: 'bcMarche' \}\)\);\s*void bcPeindreMarche\(\);/.test(boutique), 'la boutique ne pose pas le marche');
vu(/if \(r\.etat !== 'LU'\) \{[\s\S]{0,120}could not be read right now — nothing is listed rather than a wrong list/.test(marche), 'une lecture ratee du marche doit etre DITE');
vu(/const acts = actionsSkin\(s, moi, t\);/.test(ligne) && !/ACHETER'|ENCHERIR'/.test(ligne.replace(/acts\.includes\('(ACHETER|ENCHERIR|REGLER|RETIRER|METTRE_EN_VENTE)'\)/g, '').replace(/bouton\([^;]*\);/g, '')),
  'les boutons d une ligne doivent venir de actionsSkin (ce que le contrat accepterait), pas d une regle a cote');
const iSolde = action.indexOf('bcSolde(s.devise, compte)'), iAutorise = action.indexOf("'0xdd62ed3e'"), iApprob = action.indexOf('appels.push(appelApprouver(s.devise, montant,'), iSigner = action.indexOf('await bcSigner(m, appels)');
vu(iSolde > 0 && iAutorise > 0 && iApprob > iSolde && iApprob > iAutorise && iSigner > iApprob, 'en jeton : solde ET autorisation relus AVANT l approbation, elle-meme avant la signature');
vu(/if \(autorise < montant\) appels\.push\(appelApprouver\(s\.devise, montant,/.test(action) && !/MAX_UINT|ffffffffffffffff|2n \*\* 256n/.test(action), 'approbation EXACTE du montant, seulement si besoin, jamais illimitee');
vu(/if \(r\.diffusee\) \{ bcEtape\(m, 'Sent, not confirmed yet/.test(action), 'un envoi diffuse sans confirmation ne doit pas etre relance');
vu(/\/\^0x\[0-9a-f\]\{64\}\$\/i\.test\(brut\) \? BigInt\(brut\) : null/.test(marche), 'un credit n est un montant que si la reponse est UN mot de 32 octets');
const ecran = [marche, ligne, action].join('\n').match(/(?:bcEtape|bcMessage)\([^;]*?\);|text: '[^']*'|textContent = [^;]*;/g) || [];
vu(ecran.length > 10, 'textes d ecran du marche introuvables');
for (const l of ecran) vu(!/\bNFTs?\b|FEE_WALLET|beneficiaire|0xa6cf/i.test(l), 'texte d ecran interdit : ' + l.slice(0, 120));
console.log('ok skins-marche - ' + n + ' assertions (cablage) ; gestes prouves au navigateur sur vitrine simulee, pas avec un vrai wallet');
