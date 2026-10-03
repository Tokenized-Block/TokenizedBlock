/* test-7030-sel-createpaid-20261003.mjs — HOOK 7030 : LE HOOK DICTE LE FRAIS DE NAISSANCE, ET LE SEL DE createPaid VOYAGE AVEC.
 *
 * ⛔⛔ CE QUI ETAIT CASSE (drapeau allume en 3c89dba, trouve par Grok, verifie ici a la source ET sur la chaine) :
 *   TBlockLaunchLockHook._du : sans preuve, la 1re inscription doit fraisVie + fraisCreation ; avec un sel qui redonne l adresse
 *   du block (neDuRouteur), fraisVie seul. Lu sur 0x32F3…64cc : fraisVie = 3e14, fraisCreation = 7e14, createRouter = notre
 *   CreateRouter. L app n encodait que la surcharge a 3 arguments : apres createPaid (0,0007) l Instant Birth envoyait 0,0003 ->
 *   MontantInsuffisant -> AUCUN Create ne naissait sur le 7030. Les bancs d alors simulaient un hook qui rendait 0 partout.
 * A. le module : selecteurs, encodage a 4 arguments, le hook dicte (prouve -> fraisVie + sel ; non prouve -> fraisVie + fraisCreation,
 *    REFUSE avant signature si l appelant comptait payer moins), lectures ratees -> NON_MESURE.
 * B. l index du routeur GARDE le sel (il le lisait puis le jetait) : graine, index servi, block cree en session, input enveloppe.
 * C. app.html : les deux naissances 7030 passent le sel ; selRouteurPour EXTRAITE et EXECUTEE ; la reecriture « prepaye » et les
 *    deux controles de solde ne touchent plus une etape dont le frais vient du hook.
 * D. MUTANTS (copie de travail) : chacun doit faire rougir A ou B.
 * E. TEMOIN ON-CHAIN (lecture seule) : fraisVie, fraisCreation, createRouter, neDuRouteur (vrai sel / faux sel), les deux
 *    selecteurs dans le bytecode. Si le contrat ne disait pas ca, ce banc rougirait.
 * ⛔ BORNE : hors reseau sauf E. Ne prouve PAS une naissance executee — c est le role de banc-naissance-7030-fork-20261003.mjs. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
const { selecteur } = await imp('pool.js');
const T = await imp('tokenomics.js'), F = await imp('frais-creation.js');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const H = T.HOOK_7030.toLowerCase(), ETH = '0x' + '0'.repeat(40), USDC = F.USDC_BASE.toLowerCase();
const VIE = 300000000000000n, CREATION = 700000000000000n, TOTAL = 1000000000000000n;
const w = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
const compte = '0x' + '4'.repeat(40), MIN = 375110845363267n;
const SEL = '0x' + '00'.repeat(23) + '7030' + 'ab'.repeat(7);

/* le jeu d assertions A+B, rejouable sur une copie mutee des modules */
async function jeu(dir, dire) {
  const L2 = await imp('lancer-pool-v2.js', dir), R = await imp('index-routeur.js', dir);
  const S3 = '0x' + selecteur(L2.SIG_INSCRIRE_CAUTION), S4 = '0x' + selecteur(L2.SIG_INSCRIRE_CAUTION_SEL || 'x()');
  const BLOC = R.adresseNeeDuRouteur(SEL);
  /* un hook simule qui REPOND COMME LE VRAI : frais lus, neDuRouteur par la formule, `appels` garde ce qu on lui a demande */
  const hook = ({ prouve = true, vie = VIE, creation = CREATION, casse = null, payee = false } = {}) => {
    const appels = [];
    const rpc = async (m, p) => {
      const d = String(p[0].data).slice(2, 10); appels.push(d);
      if (casse && d === selecteur(casse)) throw new Error('rpc down');
      if (d === selecteur('neDuRouteur(address,bytes32)')) return w(prouve && R.neDuRouteur('0x' + p[0].data.slice(34, 74), '0x' + p[0].data.slice(74, 138)) ? 1 : 0);
      if (d === selecteur('fraisVie()')) return w(vie);
      if (d === selecteur('fraisCreation()')) return w(creation);
      if (d === selecteur('payee(bytes32)')) return w(payee ? 1 : 0);
      return w(0);
    };
    rpc.appels = appels;
    return rpc;
  };
  const cle = (dev) => { const [a, b] = [dev, BLOC].sort(); return { currency0: a, currency1: b, fee: 0, tickSpacing: 200, hooks: H }; };
  const plan = (dev) => ({ etat: 'APPROBATIONS', etapes: [], cle: cle(dev), sqrtVise: 79228162514264337593543950336n, tx: {} });
  const insc = (r) => (r.etapes || []).find((x) => L2.estEtapeInscription(x.data));
  const go = (o) => L2.completerInscriptionPayee({ plan: plan(ETH), compte, hook: H, caution: { minimum: MIN, devise: ETH }, ...o });

  dire(S3 === '0xfde76f6a' && S4 === '0x8beeda0f', 'A selecteurs : 3 arguments 0xfde76f6a, 4 arguments 0x8beeda0f (keccak des signatures)');
  const e3 = L2.encodeInscrireAvecCaution(cle(ETH), 1n << 96n, MIN);
  let e4 = ''; try { e4 = L2.encodeInscrireAvecCaution(cle(ETH), 1n << 96n, MIN, SEL); } catch (_) {}
  dire(e4.startsWith(S4) && e4.length === e3.length + 64 && e4.slice(-64) === SEL.slice(2) && e4.slice(10, -64) === e3.slice(10), 'A encodage 4 arguments = les mots du 3 arguments + le mot du sel');
  dire(L2.estEtapeInscription(e4) && L2.estEtapeInscription(e3), 'A estEtapeInscription connait les deux surcharges');
  let jete = false; try { L2.encodeInscrireAvecCaution(cle(ETH), 1n << 96n, MIN, '0x1234'); } catch (_) { jete = true; }
  dire(jete, 'A un sel qui n est pas un bytes32 est refuse par l encodeur');

  /* Instant Birth : l app compte payer 0,001 - createPaid = 0,0003 */
  const ib = await go({ rpc: hook(), fraisWei: TOTAL - CREATION, sel: SEL });
  const s1 = insc(ib) || { data: '', value: '0x0' };
  dire(s1.data.startsWith(S4) && s1.data.slice(-64) === SEL.slice(2), 'A IB ETH prouve : inscrireAvecCaution a 4 arguments, le sel de createPaid en dernier mot');
  dire(BigInt(s1.value) === VIE + MIN && s1.du === VIE && s1.selRouteur === SEL, 'A IB ETH prouve : valeur = fraisVie (0,0003) + caution ; createPaid 0,0007 + 0,0003 = 0,001 au total');
  dire(/0\.0003 ETH here, the rest was paid at Create/.test(String(s1.nom)), 'A IB : le libelle dit 0.0003 ETH ici, pas 0.001 (' + s1.nom + ')');
  /* Launch a 0,001 d un block ne du routeur : le hook ne demande que fraisVie — jamais 0,0017 */
  const lv = await go({ rpc: hook(), fraisWei: TOTAL, sel: SEL });
  dire(insc(lv) && insc(lv).data.startsWith(S4) && BigInt(insc(lv).value) - MIN === VIE, 'A Launch (l appelant offre 0,001) prouve : on ne paie que fraisVie -> 0,001 au total avec Create, jamais 0,0017');
  /* USDC : la caution part en USDC, la valeur ETH = le frais seul, approve(hook) d abord */
  const us = await L2.completerInscriptionPayee({ rpc: hook(), plan: plan(USDC), compte, fraisWei: TOTAL - CREATION, hook: H, caution: { minimum: 1000000n, devise: USDC }, sel: SEL });
  dire(insc(us) && insc(us).data.startsWith(S4) && BigInt(insc(us).value) === VIE && us.etapes.some((x) => x.data.startsWith('0x095ea7b3')), 'A IB USDC prouve : 4 arguments, valeur ETH = 0,0003 seul, approve(hook) avant');
  /* sans sel, block hors routeur : 3 arguments, fraisVie + fraisCreation = 0,001, une fois */
  const sans = await go({ rpc: hook(), fraisWei: TOTAL });
  dire(insc(sans) && insc(sans).data.startsWith(S3) && BigInt(insc(sans).value) === TOTAL + MIN && insc(sans).du === VIE + CREATION && insc(sans).selRouteur === null,
    'A sans sel : 3 arguments, 0,001 (fraisVie + fraisCreation lus), une fois');
  /* ⛔ LE CAS QUI REVERTAIT : IB sans sel prouve. On REFUSE avant toute signature, on n envoie pas un MontantInsuffisant. */
  const rev = await go({ rpc: hook(), fraisWei: TOTAL - CREATION });
  dire(rev.etat === 'REFUSE' && (rev.etapes || []).length === 0 && rev.fraisDu === VIE + CREATION && /nothing was asked/.test(rev.pourquoi), 'A IB SANS sel (le cas casse) : REFUSE avant signature, aucune etape, raison nommee');
  const faux = await go({ rpc: hook({ prouve: false }), fraisWei: TOTAL - CREATION, sel: SEL });
  dire(faux.etat === 'REFUSE' && (faux.etapes || []).length === 0, 'A sel NON prouve par le hook + 0,0003 : REFUSE (jamais un PasNeDuRouteur envoye)');
  const faux2 = await go({ rpc: hook({ prouve: false }), fraisWei: TOTAL, sel: SEL });
  dire(insc(faux2) && insc(faux2).data.startsWith(S3) && BigInt(insc(faux2).value) === TOTAL + MIN, 'A sel non prouve + 0,001 : 3 arguments, le sel n est PAS envoye');
  const hp = hook(); await go({ rpc: hp, fraisWei: TOTAL, sel: SEL });
  dire(hp.appels.includes(selecteur('neDuRouteur(address,bytes32)')) && hp.appels.includes(selecteur('fraisVie()')) && hp.appels.includes(selecteur('fraisCreation()')),
    'A TEMOIN : la preuve et les deux frais sont DEMANDES AU HOOK (neDuRouteur, fraisVie, fraisCreation)');
  for (const c of ['fraisVie()', 'fraisCreation()', 'neDuRouteur(address,bytes32)']) {
    const r = await go({ rpc: hook({ casse: c }), fraisWei: TOTAL, sel: SEL });
    dire(r.etat === 'NON_MESURE' && (r.etapes || []).length === 0, 'A lecture ' + c + ' ratee : NON_MESURE, rien demande');
  }
  const zero = await go({ rpc: hook({ vie: 0n }), fraisWei: TOTAL, sel: SEL });
  dire(zero.etat === 'NON_MESURE', 'A fraisVie lu a 0 (noeud a reponse vide) : NON_MESURE, jamais une naissance gratuite supposee');
  const dp = await go({ rpc: hook({ payee: true }), fraisWei: TOTAL, sel: SEL });
  dire(insc(dp) && BigInt(insc(dp).value) === MIN && insc(dp).payant === false && insc(dp).data.startsWith(S3), 'A deja payee : aucune valeur de frais (DejaPayee evite), caution seule');
  /* V8 : rien ne change, et le sel est ignore */
  const v8 = await L2.completerInscriptionPayee({ rpc: hook(), plan: { ...plan(ETH), cle: { ...cle(ETH), hooks: T.HOOK_V8 } }, compte, fraisWei: TOTAL, hook: T.HOOK_V8, sel: SEL });
  dire(v8.etapes.length === 1 && v8.etapes[0].data.startsWith('0xbb920fed') && BigInt(v8.etapes[0].value) === TOTAL && v8.etapes[0].du === undefined, 'A V8 inchange : inscrire 0xbb920fed, 0,001, le sel ignore');

  /* B. l index garde le sel */
  const g = R.GRAINE_ROUTEUR[0];
  dire(typeof R.selDuRouteur === 'function' && R.selDuRouteur(g.jeton.toUpperCase().replace('0X', '0x')) === g.sel.toLowerCase(), 'B graine : selDuRouteur rend le sel du block (casse indifferente)');
  dire(typeof R.selDuRouteur === 'function' && R.selDuRouteur(BLOC) === null, 'B block inconnu : null');
  const anc = R.GRAINE_ANCIENS_ROUTEURS[0];
  dire(typeof R.selDuRouteur === 'function' && R.estNeDuRouteur(anc.jeton) && R.selDuRouteur(anc.jeton) === null, 'B block d un ANCIEN routeur : dans nos blocks, mais aucun sel rendu (le hook ne connait que le routeur actuel)');
  R.chargerIndexRouteur({ ok: true, blocks: [{ jeton: BLOC, sel: SEL }, { jeton: '0xb2' + '0'.repeat(37) + '9', sel: SEL }] });
  dire(typeof R.selDuRouteur === 'function' && R.selDuRouteur(BLOC) === SEL && R.selDuRouteur('0xb2' + '0'.repeat(37) + '9') === null, 'B index servi : le sel entre s il redonne l adresse ; une entree au sel faux n entre pas');
  const SEL2 = '0x' + 'cd'.repeat(32), BLOC2 = R.adresseNeeDuRouteur(SEL2);
  dire(R.ajouterNeDuRouteur(BLOC2, SEL2) && typeof R.selDuRouteur === 'function' && R.selDuRouteur(BLOC2) === SEL2 && !R.ajouterNeDuRouteur(BLOC2.slice(0, -1) + '0', SEL2), 'B block cree en session : sel garde ; mauvais couple refuse');
  const direct = R.SELECTEUR_CREATE_PAID + '0'.repeat(64) + SEL.slice(2) + '0'.repeat(128);
  dire(typeof R.selDansInput === 'function' && R.selDansInput(BLOC, direct) === SEL, 'B selDansInput : createPaid direct');
  dire(typeof R.selDansInput === 'function' && R.selDansInput(BLOC, '0xb61d27f6' + '0'.repeat(56) + direct.slice(2)) === SEL, 'B selDansInput : createPaid enveloppe (smart wallet, decalage de 4 octets)');
  dire(typeof R.selDansInput === 'function' && R.selDansInput(BLOC2, direct) === null && R.selDansInput(BLOC, '0x') === null, 'B selDansInput : autre block ou input vide -> null');
  return { L2, R, BLOC };
}

console.log('— A/B. modules');
const { R, BLOC } = await jeu(ICI, ok);

console.log('— C. app.html');
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
ok(/caution: await cautionCreateurPour\(hook, devise\), sel: selDansInput\(adresse, appelCreate\.data\) \}\);/.test(html), 'C pre-controle Instant Birth : sel = selDansInput(adresse, appelCreate.data)');
ok(/const selNe = estHook7030\(hooks\) \? await selRouteurPour\(adr\) : null;\n\s+if \(estHook7030\(hooks\) && selNe === null && !indexRouteurLu\(\)\) \{\n\s+plan = \{ \.\.\.plan, etat: 'NON_MESURE', etapes: \[\]/.test(html)
  && /caution: await cautionCreateurPour\(hooks, deviseLancement \|\| null\), sel: selNe \}\);/.test(html), 'C Launch : sel lu ; inconnu ET index non lu -> NON_MESURE (on ne fait pas payer deux fois), sinon passe au plan');
ok(/if \(plan && plan\.etat === 'REFUSE' && plan\.pourquoi\) return \{ etat: 'REFUSE', pourquoi: plan\.pourquoi \};/.test(html), 'C le refus nomme du module remonte au pre-controle');
ok(/if \(isInscrire && et\.du != null\) return et;\n\s+if \(isInscrire && !hookPayee\) \{/.test(html), 'C reecriture « prepaye » : une etape dont le frais vient du hook (du) n est pas touchee');
ok((html.match(/et && et\.payant && et\.du != null \? BigInt\(et\.du\) : a\), null\)/g) || []).length === 2, 'C les deux controles de solde lisent le frais de l etape (du), pas 0,0003 suppose');
ok(/import \{[^}]*selDuRouteur, selDansInput, indexRouteurLu \} from '\.\/index-routeur\.js';/.test(html), 'C imports');
const i0 = html.indexOf('async function selRouteurPour(adr) {'), i1 = html.indexOf('\n}\n', i0) + 2;
ok(i0 > 0, 'C selRouteurPour est defini');
const mk = ({ prepaye = null, input = '0x', connu = null, compteur = { tx: 0 } } = {}) => new Function('ctx', 'const { rpc, prepayePour, selDuRouteur, selDansInput, ajouterNeDuRouteur } = ctx;\n' + html.slice(i0, i1) + '\nreturn selRouteurPour;')({
  rpc: async (m) => { if (m === 'eth_getTransactionByHash') { compteur.tx += 1; return { input }; } return null; }, prepayePour: () => prepaye,
  selDuRouteur: () => connu, selDansInput: R.selDansInput, ajouterNeDuRouteur: R.ajouterNeDuRouteur });
const directC = R.SELECTEUR_CREATE_PAID + '0'.repeat(64) + SEL.slice(2) + '0'.repeat(128);
const cpt = { tx: 0 };
ok(await mk({ connu: SEL, compteur: cpt })(BLOC) === SEL && cpt.tx === 0, 'C selRouteurPour : sel connu de l index -> rendu SANS aucune lecture reseau');
ok(await mk({ prepaye: { hash: '0xa' }, input: directC })(BLOC) === SEL, 'C selRouteurPour : index muet, tx de creation gardee -> sel de createPaid');
ok(await mk({ prepaye: { hash: '0xa' }, input: '0xb61d27f6' + '0'.repeat(56) + directC.slice(2) })(BLOC) === SEL, 'C selRouteurPour : createPaid enveloppe (smart wallet) -> sel trouve');
ok(await mk({ prepaye: { hash: '0xa' }, input: directC })('0xb2' + '0'.repeat(37) + '1') === null && await mk({})(BLOC) === null, 'C selRouteurPour : autre block, ou aucune trace -> null');

/* le cout dit a l ecran : « 0.001 ETH, once » ne suffit pas sur le 7030 — le minimum du createur est annonce AVANT le wallet */
ok(/<p class="note" id="cCautionNote" hidden><\/p>/.test(html), 'C ecran Create : une ligne pour le minimum du createur (#cCautionNote)');
const iN = html.indexOf('async function majNoteCaution() {'), noteSrc = html.slice(iN, html.indexOf('\n}\n', iN));
ok(iN > 0 && /if \(!estHook7030\(hook\)\) \{ el\.hidden = true; return; \}/.test(noteSrc) && /const c = await cautionCreateurPour\(hook, devise\);/.test(noteSrc),
  'C la ligne n apparait que sur le hook 7030, avec le montant de cautionCreateurPour (la meme source que la transaction)');
/* 2026-10-04 : la sortie EST proposee, sur la page du block (peindreCautionProfil) — la ligne ne dit plus « not offered yet » */
ok(/It is not a fee: it stays yours/.test(noteSrc) && /0\.03% of each trade/.test(noteSrc) && /a request and then 7 days/.test(noteSrc)
  && /done from the block’s own page here, and your share stops as soon as you ask/.test(noteSrc) && !/does not offer/.test(noteSrc),
  'C la ligne dit : pas un frais, 0,03 % par echange, sortie = demande + 7 jours depuis la page du block, la part s arrete a la demande');
/* la carte « Creator minimum » de la page du block */
const iP = html.indexOf('async function peindreCautionProfil(adr, v) {'), profSrc = html.slice(iP, html.indexOf('\n}\n', iP));
ok(iP > 0 && /<div class="pJeu" id="pCaution" hidden>/.test(html) && (html.match(/peindreVerrouMarche\(v, origineProfil\);\n\s+void peindreCautionProfil\(adr, v\);/g) || []).length === 2,
  'C page du block : la carte #pCaution existe et se peint a chaque lecture du marche (2 sites)');
ok(/!estHook7030\(v\.cle\.hooks\)\) return;/.test(profSrc) && /etatCautionCreateur\(\{ rpc, hook, cle, maintenantSec \}\)/.test(profSrc) && /if \(!etat \|\| etat\.etat !== 'LUE'\) return;/.test(profSrc),
  'C la carte ne lit que le contrat du marche (7030), et reste CACHEE sur une lecture ratee (jamais « rien a reprendre »)');
ok(/const moi = !!compte && String\(compte\)\.toLowerCase\(\) === etat\.createur;/.test(profSrc) && /if \(!moi\) return;\n\s+const sortie = sortieCautionPour\(/.test(profSrc),
  'C le bouton n existe que pour le createur QUE LE CONTRAT NOMME');
ok(/your 0\.03% share stops at once, and the deposit can only be taken back 7 days later/.test(profSrc) && /b\.textContent = 'Yes, ask now'; b\.onclick = envoyer;/.test(profSrc),
  'C demander = deux clics : le premier dit le cout (part arretee, 7 jours), le second envoie');
const srvC = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8');
ok(/'caution-createur\.js',/.test(srvC) && /import \{ etatCautionCreateur, sortieCautionPour \} from '\.\/caution-createur\.js';/.test(html), 'C caution-createur.js est importe par l app ET servi (sinon 404 = app morte)');
ok(/function majFundWalletPourPaire\(\) \{\n[^\n]*\n[^\n]*\n\s+void majNoteCaution\(\);/.test(html), 'C la ligne est recalculee a chaque changement de paire');

console.log('— D. mutants');
const MUTANTS = [
  { nom: 'le 4e mot (sel) n est pas encode', f: 'lancer-pool-v2.js', de: " + (sel === null ? '' : String(sel).slice(2).toLowerCase());", a: ';' },
  { nom: 'toujours la signature a 3 arguments', f: 'lancer-pool-v2.js', de: 'selecteur(sel === null ? SIG_INSCRIRE_CAUTION : SIG_INSCRIRE_CAUTION_SEL)', a: 'selecteur(SIG_INSCRIRE_CAUTION)' },
  { nom: 'le sel est envoye sans preuve du hook', f: 'lancer-pool-v2.js', de: '}, \'latest\'])) === 1n;\n          }', a: '}, \'latest\'])) >= 0n;\n          }' },
  { nom: 'prouve mais on paie quand meme fraisWei (0,0017)', f: 'lancer-pool-v2.js', de: 'const frais = payee ? 0n : (selProuve ? du : fraisWei);', a: 'const frais = payee ? 0n : fraisWei;' },
  { nom: 'du ne compte pas fraisCreation (le bug d origine)', f: 'lancer-pool-v2.js', de: 'du = prouve ? vie : vie + creation;', a: 'du = vie;' },
  { nom: 'pas de refus quand fraisWei < du (on envoie le revert)', f: 'lancer-pool-v2.js', de: 'if (fraisWei < du) {', a: 'if (false) {' },
  { nom: 'frais lu a 0 accepte', f: 'lancer-pool-v2.js', de: 'if (vie <= 0n || creation <= 0n) return', a: 'if (false) return' },
  { nom: 'l index rejette le sel a nouveau', f: 'index-routeur.js', de: '      if (neDuRouteur(b.jeton, b.sel)) sels.set(bas(b.jeton), bas(b.sel));\n', a: '' },
  { nom: 'le sel d un ancien routeur est rendu', f: 'index-routeur.js', de: 'const sels = new Map(GRAINE_ROUTEUR.filter((g) => neDuRouteur(g.jeton, g.sel)).map((g) => [bas(g.jeton), bas(g.sel)]));',
    a: 'const sels = new Map([...GRAINE_ROUTEUR, ...GRAINE_ANCIENS_ROUTEURS].map((g) => [bas(g.jeton), bas(g.sel)]));' },
  { nom: 'selDansInput rend un mot sans le prouver', f: 'index-routeur.js', de: "const w = '0x' + inp.slice(k, k + 64); if (neDuRouteur(jeton, w)) return w; }", a: "const w = '0x' + inp.slice(k, k + 64); if (k > 8) return w; }" },
];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sel7030-'));
const FICHIERS = fs.readdirSync(ICI).filter((f) => f.endsWith('.js'));
for (const mu of MUTANTS) {
  const dir = fs.mkdtempSync(path.join(tmp, 'm-'));
  for (const f of FICHIERS) fs.copyFileSync(path.join(ICI, f), path.join(dir, f));
  const src = fs.readFileSync(path.join(dir, mu.f), 'utf8').replace(/\r\n/g, '\n');
  if (src.split(mu.de).length !== 2) { ok(false, 'D mutant « ' + mu.nom + ' » : motif introuvable ou multiple dans ' + mu.f); continue; }
  fs.writeFileSync(path.join(dir, mu.f), src.replace(mu.de, mu.a));
  let rouges = 0, total = 0, plante = null;
  try { await jeu(dir, (c) => { total += 1; if (!c) rouges += 1; }); } catch (e) { plante = String(e && e.message).slice(0, 60); }
  ok(rouges > 0 || plante !== null, 'D mutant « ' + mu.nom + ' » : ROUGE (' + (plante ? 'plante : ' + plante : rouges + '/' + total) + ')');
}
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}

console.log('— E. temoin on-chain (lecture seule)');
const lire = async (data, methode = 'eth_call') => {
  for (let e = 0; e < 5; e += 1) {
    for (const u of ['https://mainnet.base.org', 'https://base.gateway.tenderly.co']) {
      try {
        const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: methode, params: methode === 'eth_call' ? [{ to: H, data }, 'latest'] : [H, 'latest'] }) }).then((x) => x.json());
        if (r.result) return r.result;
      } catch (_) {}
    }
    await new Promise((o) => setTimeout(o, 700 * (e + 1)));
  }
  return null;
};
const cVie = await lire('0x' + selecteur('fraisVie()')), cCre = await lire('0x' + selecteur('fraisCreation()')), cRt = await lire('0x' + selecteur('createRouter()'));
ok(cVie !== null && BigInt(cVie) === VIE && cCre !== null && BigInt(cCre) === CREATION, 'E hook reel : fraisVie = ' + (cVie && BigInt(cVie)) + ' wei, fraisCreation = ' + (cCre && BigInt(cCre)) + ' wei (null = non lu, jamais un vert)');
ok(cRt !== null && '0x' + cRt.slice(26).toLowerCase() === F.CREATE_ROUTER.toLowerCase(), 'E hook reel : createRouter() = le CreateRouter de l app');
const gE = R.GRAINE_ROUTEUR[0];
const vrai = await lire('0x' + selecteur('neDuRouteur(address,bytes32)') + gE.jeton.slice(2).padStart(64, '0') + gE.sel.slice(2));
const fauxE = await lire('0x' + selecteur('neDuRouteur(address,bytes32)') + gE.jeton.slice(2).padStart(64, '0') + 'ab'.repeat(32));
ok(vrai !== null && BigInt(vrai) === 1n && fauxE !== null && BigInt(fauxE) === 0n, 'E hook reel : neDuRouteur(block de la graine, son sel) = 1 ; faux sel = 0 — notre formule et celle du contrat concordent');
const cDelai = await lire('0x' + selecteur('DELAI_RETRAIT()')), cPart = await lire('0x' + selecteur('PART_CREATEUR()'));
ok(cDelai !== null && BigInt(cDelai) === 604800n && cPart !== null && BigInt(cPart) === 300n,
  'E hook reel : DELAI_RETRAIT = ' + (cDelai && BigInt(cDelai)) + ' s (7 jours), PART_CREATEUR = ' + (cPart && BigInt(cPart)) + ' ppm (0,03 %) — les deux chiffres de la ligne a l ecran');
const code = await lire(null, 'eth_getCode');
ok(code !== null && code.includes(selecteur('inscrireAvecCaution((address,address,uint24,int24,address),uint160,uint128,bytes32)')) && code.includes('fde76f6a'), 'E bytecode : les deux surcharges d inscrireAvecCaution sont presentes');

console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
