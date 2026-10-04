/* test-message-prix-20261004.mjs — LE PRIX D UN MESSAGE VERS UN BLOCK : ce que l ecran dit = ce que le wallet debite.
 *
 * CE QUI A ETE TROUVE (2026-10-04, en lisant le code pour appliquer « fais payer 0.1 frais pour le dev ») : la carte « Public
 *   messages » affichait « 0.50 USDC » (option du menu, bouton, ligne « Fee: » juste avant la signature) alors que le plan
 *   debitait 0,01 USDC — la constante avait change le 2026-09-23, les textes ecrits en dur a cote, non. Onze jours d un prix faux
 *   sur un ecran de signature (cinquante fois le montant reel).
 * A. messagerie-blocks.js : le prix d envoi (0,10 USDC), le plancher de lecture (0,01), le texte derive.
 * B. app.html : AUCUN prix de message ecrit en dur ; le bouton et la ligne « Fee: » lisent la constante / le plan.
 * C. les TROIS lecteurs (deux dans messagerie-blocks.js, un dans fil-live.js) comparent au plancher de LECTURE — jumeaux qui ont
 *    deja diverge une fois dans ce depot.
 * D. MUTANTS.
 * ⛔ BORNE : rien ici n envoie de message. Aucun des trois prix successifs (0,50 / 0,01 / 0,10) n a ete mesure sur des envois reels. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');

console.log('— A. le module');
const M = await imp('messagerie-blocks.js');
const { FEE_WALLET } = await imp('frais-creation.js');
const { encodeTransferAvecMemo } = await imp('messages.js');
ok(M.FRAIS_MESSAGE_USDC === 100000n && M.DEVISES_MESSAGE.USDC.frais === 100000n && M.DEVISES_MESSAGE.USDC.decimales === 6, 'A envoyer un message coute 100 000 unites d USDC = 0,10 USDC');
ok(M.prixMessageLisible('USDC') === '0.10 USDC' && M.prixMessageLisible('TBLOCK') === '1,000 TBLOCK' && M.prixMessageLisible('?') === null, 'A le texte du prix est DERIVE de la constante (« 0.10 USDC », « 1,000 TBLOCK » ; devise inconnue = null)');
const COMPTE = '0x' + 'c'.repeat(40), DE = '0xb2' + '1'.repeat(38), A = '0xb2' + '2'.repeat(38);
const noeud = (solde) => async (m, p) => (m === 'eth_getCode' ? '0x' : '0x' + solde.toString(16).padStart(64, '0'));
{
  const p = await M.planMessagePaye({ rpc: noeud(100000n), compte: COMPTE, de: DE, a: A, texte: 'gm', detientDe: true, devise: 'USDC' });
  ok(p.etat === 'PRET' && p.frais === 100000n && p.devise === 'USDC' && p.decimales === 6
    && p.tx.data.toLowerCase().startsWith(encodeTransferAvecMemo(FEE_WALLET, 100000n, '').toLowerCase().slice(0, 138)),
  'A le plan envoie EXACTEMENT 0,10 USDC au wallet des frais du depot (transfer(wallet, 100000))');
  const q = await M.planMessagePaye({ rpc: noeud(99999n), compte: COMPTE, de: DE, a: A, texte: 'gm', detientDe: true, devise: 'USDC' });
  ok(q.etat === 'REFUSE' && q.manque === 1n, 'A avec 0,099999 USDC le plan REFUSE et dit ce qui manque (1 unite) — l ancien prix ne suffit plus a l envoi');
}
const memo = 'tbx1 de=' + DE + ' a=' + A + ' gm';
const t = (v) => ({ from: COMPTE, to: FEE_WALLET, value: v, tx: '0xabc' });
const tx = { from: COMPTE, to: M.DEVISES_MESSAGE.USDC.token, input: encodeTransferAvecMemo(FEE_WALLET, 10000n, memo) };
ok(M.messageDepuisTransfert(t(10000n), tx, 'USDC').etat === 'MESSAGE' && M.messageDepuisTransfert(t(9999n), tx, 'USDC').etat === 'REJETE',
  'A LECTURE : un message paye a l ancien prix (0,01) reste LU ; un wei dessous est rejete');

console.log('— B. l ecran');
const html = lire('app.html');
const carte = html.slice(html.indexOf('<div class="pJeu" id="pMessages">'), html.indexOf('<p class="titre">Blocks</p>'));
ok(carte.length > 800 && !/>\s*0\.\d+ USDC\s*</.test(carte) && !/<option[^>]*>[^<]*\d[^<]*<\/option>/.test(carte), 'B la carte ne contient AUCUN prix ecrit en dur (ni option, ni bouton)');
ok(!/'0\.50 USDC'|'0\.01 USDC'|'0\.10 USDC'|'1,000 TBLOCK'/.test(html), 'B aucun prix de message ecrit en dur dans le script (« 0.50 USDC » y etait)');
ok(/function prixMessageTexte\(\) \{\s+return prixMessageLisible\(\(\$\('#pmsgDevise'\) && \$\('#pmsgDevise'\)\.value\) \|\| 'USDC'\) \|\| 'the message fee';\s+\}/.test(html)
  && /import \{ planMessagePaye, prixMessageLisible \} from '\.\/messagerie-blocks\.js';/.test(html), 'B prixMessageTexte() rend le texte derive du module');
ok(/const libelle = 'Prepare the message · ' \+ prixMessageTexte\(\);/.test(html) && /b\.textContent = 'Connect → ' \+ libelle;/.test(html), 'B le prix est SUR le bouton, lu a chaque peinture');
ok(/const fraisBrut = bcDecimal\(p\.frais, p\.decimales\);/.test(html) && /'Fee: ' \+ fraisDuPlan \+ ' to the app’s fee wallet,/.test(html),
  'B la ligne « Fee: » juste avant la signature lit le montant DANS LE PLAN (celui que le wallet va debiter)');
ok(/apercuTransaction\(\{ chaine: CHAINE, tx: p\.tx, compte, jeton: p\.tx\.to, symbole: p\.devise, decimales: p\.decimales \}\)/.test(html), 'B l apercu de la transaction recoit le jeton, la devise et les decimales du plan');
ok(!/pays Holders|tip 2347\)\.'\]/.test(html.slice(html.indexOf("$('#pmsgPayeLignes').innerHTML"), html.indexOf("$('#pmsgPayeLignes').innerHTML") + 900)), 'B la ligne smart wallet ne dit plus « fee still pays Holders » (faux : le frais va au wallet des frais) ni un numero interne');
ok(/<label class="champ" hidden>Pay with<select id="pmsgDevise"><option value="USDC">USDC<\/option><\/select><\/label>/.test(html), 'B le menu a une seule option est masque ; il reste dans la page (le code lit sa valeur)');

console.log('— C. les trois lecteurs comparent au plancher de LECTURE');
const src = lire('messagerie-blocks.js'), fil = lire('fil-live.js');
ok((src.match(/t\.value < dev\.fraisLu/g) || []).length === 2 && !/t\.value < dev\.frais\b(?!Lu)/.test(src), 'C messagerie-blocks.js : ses deux lecteurs (filtre pur, conversations) lisent `fraisLu`');
ok((fil.match(/t\.value < dev\.fraisLu/g) || []).length === 1 && !/t\.value < dev\.frais\b(?!Lu)/.test(fil), 'C fil-live.js : le fil en direct lit `fraisLu` lui aussi');

console.log('— D. mutants');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-msg-'));
const copie = () => { const dir = fs.mkdtempSync(path.join(tmp, 'm-')); for (const f of fs.readdirSync(ICI)) if (/\.js$/.test(f) && !/^(serveur-web|vendor|mcp-ext-apps)/.test(f)) fs.copyFileSync(path.join(ICI, f), path.join(dir, f)); return dir; };
{
  const de = "if (typeof t.value !== 'bigint' || t.value < dev.fraisLu) return { etat: 'REJETE', pourquoi: 'below the message fee' };";
  const dir = copie(); fs.writeFileSync(path.join(dir, 'messagerie-blocks.js'), src.replace(de, de.replace('dev.fraisLu', 'dev.frais')));
  const Mm = await imp('messagerie-blocks.js', dir);
  ok(src.split(de).length === 2 && Mm.messageDepuisTransfert(t(10000n), tx, 'USDC').etat === 'REJETE', 'D mutant « le lecteur exige le NOUVEAU prix » : ROUGE (un message paye 0,01 disparait du fil)');
}
{
  const de = 'export const FRAIS_MESSAGE_USDC = 100_000n;';
  const dir = copie(); fs.writeFileSync(path.join(dir, 'messagerie-blocks.js'), src.replace(de, 'export const FRAIS_MESSAGE_USDC = 10_000n;'));
  const Mm = await imp('messagerie-blocks.js', dir);
  ok(src.split(de).length === 2 && Mm.prixMessageLisible('USDC') === '0.01 USDC', 'D mutant « le prix revient a 0,01 » : le texte derive SUIT (0.01 USDC) — l ecran ne peut plus dire autre chose que la constante');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
