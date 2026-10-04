/* test-secours-paire-20261004.mjs — APPARIER UN BLOCK A UN AUTRE BLOCK : la devise de secours, au lieu d un refus sec.
 *
 * ⛔⛔ CE QUI ETAIT CASSE (Phil, 2026-10-04 : « le paired b20 to b20 est casse ») : l option « Another block — paste its address »,
 *   le bouton « Pair a block with it » (carte et Market) et les « Live blocks » du selecteur menaient tous a un refus — la liste
 *   des devises du contrat de marche est figee, aucun block arbitraire n y est. Les « Live blocks » etaient en plus `disabled`
 *   et libelles « — soon » : une promesse que rien ne porte.
 * CE QUI EST FAIT : choisir un autre block propose la DEVISE DE CE BLOCK (celle de son marche, lue dans l index) si le contrat
 *   l admet, sinon ETH — un bouton, et la naissance repart. Rien n est promis sur l autre block.
 * A. deviseDeSecoursPour, EXTRAITE d app.html et EXECUTEE : devise du block si lancable, sinon ETH, jamais le block lui-meme,
 *    null si rien n est lancable.
 * B. le cablage : seulement pour une adresse tapee (SAISIE), bouton #cPaireSecours qui change la paire ; les options « Live
 *    blocks » ne sont plus desactivees ni « soon » ; la phrase de garde ne promet plus « our next contract » ni un compte recopie.
 * C. MUTANTS sur la fonction extraite.
 * ⛔ BORNE : hors reseau ; l ecran reel est verifie dans le navigateur (voir le message du commit). */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const P = await import(pathToFileURL(path.join(ICI, 'paires.js')).href);
const T = await import(pathToFileURL(path.join(ICI, 'tokenomics.js')).href);
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
const ETH = '0x0000000000000000000000000000000000000000', USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const NVDA = P.ACTIONS_COINBASE.find((a) => a.symbole === 'NVDAc').adr.toLowerCase();
const BLOC = '0xb2000000000000000000000000000000000000aa', AUTRE = '0xb2000000000000000000000000000000000000bb';

/* fin de la fonction : accolade seule sur sa ligne, cherchee par regexp (`\r?\n`) — regle de test-tests-portables */
const finFn = (s, i) => { const m = /\r?\n\}\r?\n/.exec(s.slice(i)); return m ? i + m.index + m[0].indexOf('}') : -1; };
const i0 = html.indexOf('function deviseDeSecoursPour(adr) {'), i1 = finFn(html, i0) + 1;
ok(i0 > 0, 'deviseDeSecoursPour est definie dans app.html');
const fabriquer = (src, { marche = new Map(), lancable = (a) => !!P.hookDeLancementPour(a, 8453, T.OPTIONS_LANCEMENT) } = {}) =>
  new Function('marcheParAdr', 'pairesProposees', 'estPaireLancable', 'CHAINE', 'ETH_ADR', src + '\nreturn deviseDeSecoursPour;')(marche, P.pairesProposees, lancable, 8453, ETH);
const jeu = (src, dire) => {
  const f = (m, l) => fabriquer(src, { marche: m, lancable: l });
  const sUsdc = f(new Map([[BLOC, { quoteAdr: USDC.toUpperCase().replace('0X', '0x'), sym: 'ALPHA' }]]))(BLOC);
  dire(sUsdc && String(sUsdc.adr).toLowerCase() === USDC && sUsdc.symbole === 'USDC' && sUsdc.saCote === true && sUsdc.symboleBlock === 'ALPHA', 'A un block cote en USDC : secours = USDC, « sa cote »');
  const sAct = f(new Map([[BLOC, { quoteAdr: NVDA, sym: 'MEME' }]]))(BLOC);
  dire(sAct && String(sAct.adr).toLowerCase() === NVDA && sAct.saCote === true, 'A un block cote en NVDAc (memestock) : secours = NVDAc');
  const sInc = f(new Map([[BLOC, { quoteAdr: AUTRE, sym: 'X' }]]))(BLOC);
  dire(sInc && String(sInc.adr).toLowerCase() === ETH && sInc.saCote === false, 'A un block cote dans une devise que le contrat n admet pas : secours = ETH, et on ne dit PAS « sa cote »');
  const sVide = f(new Map())(BLOC);
  dire(sVide && String(sVide.adr).toLowerCase() === ETH && sVide.saCote === false && sVide.symboleBlock === null, 'A un block absent de l index (adresse tapee) : secours = ETH');
  dire(f(new Map([[BLOC, { quoteAdr: USDC, sym: 'A' }]]), () => false)(BLOC) === null, 'A rien n est lancable (autre reseau, contrat illisible) : null — le refus reste seul');
  dire(f(new Map([[USDC, { quoteAdr: USDC, sym: 'USDC' }]]))(USDC) === null || String(f(new Map([[USDC, { quoteAdr: USDC }]]))(USDC).adr).toLowerCase() !== USDC, 'A jamais la devise elle-meme comme secours d elle-meme');
  const sUsdcSeul = f(new Map([[BLOC, { quoteAdr: USDC, sym: 'A' }]]), (a) => String(a).toLowerCase() === ETH)(BLOC);
  dire(sUsdcSeul && String(sUsdcSeul.adr).toLowerCase() === ETH && sUsdcSeul.saCote === false, 'A la cote du block n est pas lancable mais ETH l est : secours = ETH');
};
console.log('— A. la fonction extraite');
jeu(html.slice(i0, i1), ok);

console.log('— B. le cablage');
ok(/const secours = q\.paire\.type === 'SAISIE' \? deviseDeSecoursPour\(q\.paire\.adr\) : null;/.test(html), 'la devise de secours n est proposee que pour une adresse tapee / un block choisi (SAISIE)');
ok(/bS\.id = 'cPaireSecours';/.test(html) && /bS\.textContent = 'Pair with ' \+ secours\.symbole \+ ' instead';/.test(html)
  && /sP\.value = secours\.adr; sP\.dispatchEvent\(new Event\('change'\)\);/.test(html), 'un bouton « Pair with <devise> instead » change la paire du selecteur');
ok(/A new block is born against a currency, not directly against another block\./.test(html), 'la phrase dit le fait : une naissance se fait contre une devise');
/* on juge le CODE, pas les commentaires (ils citent l ancien texte pour dire pourquoi il a change) */
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const iG = html.indexOf('Live blocks — discovered on chain'), groupe = sansCommentaires(html.slice(iG, iG + 1800));
ok(iG > 0 && !/disabled/.test(groupe.slice(0, groupe.indexOf('</optgroup>'))) && !/— soon/.test(groupe.slice(0, groupe.indexOf('</optgroup>'))) && /through its currency/.test(groupe),
  '« Live blocks » : plus de `disabled`, plus de « soon » — choisissables, « through its currency »');
const code = sansCommentaires(html);
ok(!/opens with our next contract/.test(code) && !/and 10 tokenized stocks/.test(code), 'la phrase de garde ne promet plus « our next contract » et ne recopie plus « 10 tokenized stocks »');
ok(/This token is not on the market contract’s list — pick one of those\. Nothing was sent\./.test(html), 'la garde dit ce qui est : hors de la liste du contrat');
ok(/s\.value = AUTRE_PAIRE; const a = \$\('#cPaireAutre'\); if \(a\) a\.value = adr;/.test(html) && /Another block — paste its address \(checked on chain\)/.test(html),
  '« Pair a block with it » et « Another block » menent toujours a ce chemin (qui propose maintenant le secours)');

console.log('— C. mutants');
const SRC = html.slice(i0, i1);
for (const mu of [
  { nom: 'la cote du block est ignoree (toujours ETH)', de: '(cote && trouver(cote)) || trouver(ETH_ADR.toLowerCase())', a: 'trouver(ETH_ADR.toLowerCase())' },
  { nom: 'une devise non lancable est proposee', de: ' && estPaireLancable(p.adr)) || null;', a: ') || null;' },
  { nom: '« sa cote » annoncee a tort', de: "saCote: !!cote && String(p.adr).toLowerCase() === cote", a: 'saCote: true' },
  { nom: 'pas de repli sur ETH', de: ' || trouver(ETH_ADR.toLowerCase());', a: ';' },
]) {
  if (SRC.split(mu.de).length !== 2) { ok(false, 'mutant « ' + mu.nom + ' » : motif introuvable ou multiple'); continue; }
  let rouges = 0, plante = null;
  try { jeu(SRC.replace(mu.de, mu.a), (c) => { if (!c) rouges += 1; }); } catch (e) { plante = String(e && e.message).slice(0, 60); }
  ok(rouges > 0 || plante !== null, 'mutant « ' + mu.nom + ' » : ROUGE (' + (plante ? 'plante : ' + plante : rouges + ' assertion(s)') + ')');
}

console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
