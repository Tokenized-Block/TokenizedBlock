/* test-draws-statuts-20261024.mjs — CHAQUE BOUTON PAYANT DE LA CARTE DRAWS A SA LIGNE D ETAT JUSTE SOUS SA RANGEE.
 * Revue adverse 2026-10-24 (FAIL, bloquant) : #rollsEtat etait monte sous la rangee du Roll, mais restait la SEULE ligne d etat du Week pass,
 *   de « Add to this week's pot », « Claim my share » et « Close the pot », restes en bas de la carte : a 375 x 812 avec la disposition d un
 *   wallet, #jourPass a 740 px et #rollsEtat a -246 px (la zone des Slots, 431 px, entre les deux). Leurs messages (signature, refus, recu)
 *   tombaient ~1 000 px au-dessus du bouton touche.
 * CE BANC, sur le VRAI texte de app.html :
 *   RANGEES  la carte #tirCarte est lue en arbre ; pour chaque bouton payant, sa rangee (.jourEtapes) et la « suite d etat » de cette rangee :
 *            les <p class="note"> qui la suivent IMMEDIATEMENT (memes parent, aucun autre element entre) ;
 *   FLUX     le flux de chaque bouton (lu dans son addEventListener('click')) est EXECUTE jusqu a son premier message (stubs : pass
 *            illisible, montant refuse, plan refuse…) ; les elements ou il ecrit sont releves : au moins un est dans la suite d etat de SA
 *            rangee, aucun dans celle d une autre rangee. + montrerSettled (le recu des rolls) : dans la suite du Roll.
 *   ROLL     #dernierMoi (« Your roll matched N/5 ») et #dernierQuand (« Last rolls ») sont dans la suite d etat de la rangee du Roll ;
 *   REGLE    placerRegleSlots EXECUTE sur l arbre : avec un wallet, #slotsRegle est juste AU-DESSUS de la rangee Spin | Settle | Accept (meme
 *            zone, hors du pli) ; sans wallet, en tete du pli « How the slots work » (avant #slotsComment).
 *   JETON    (2026-10-24, « Pay with ») un jeton choisi : Roll, Auto-roll, Week pass et Spin executes jusqu au refus de la preparation du
 *            paiement en jeton — le message est dans la suite d etat de SA rangee (la meme que le chemin USDC), jamais dans une autre.
 * Chaque affirmation est rejouee sur une COPIE MUTEE de app.html (en memoire) et doit alors rougir.
 * ⛔ NE PROUVE PAS : les pixels (mesures au navigateur, a part), un wallet reel, les chemins de succes de chaque flux (seul le premier
 *   message est execute ; les autres ecrivent par la MEME variable `e`/`p`/`etat`, verifie ici par le premier). */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('app.html');
const entre = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };

/* ---------------------------------------------------------------- un petit arbre HTML (la carte seulement) */
const VIDES = new Set(['input', 'br', 'img', 'hr', 'meta', 'source']);
function noeud(tag, attrs = {}) {
  const x = { tag, attrs, id: attrs.id || null, kids: [], parentNode: null };
  x.classe = (c) => String(attrs.class || '').split(/\s+/).includes(c);
  Object.defineProperty(x, 'nextElementSibling', { get() { const p = x.parentNode; if (!p) return null; const i = p.kids.indexOf(x); return p.kids[i + 1] || null; } });
  Object.defineProperty(x, 'previousElementSibling', { get() { const p = x.parentNode; if (!p) return null; const i = p.kids.indexOf(x); return i > 0 ? p.kids[i - 1] : null; } });
  x.insertBefore = (m, ref) => {
    if (m.parentNode) m.parentNode.kids.splice(m.parentNode.kids.indexOf(m), 1);
    const i = ref ? x.kids.indexOf(ref) : x.kids.length;
    x.kids.splice(i < 0 ? x.kids.length : i, 0, m); m.parentNode = x; return m;
  };
  return x;
}
function arbre(html) {
  const racine = noeud('#racine');
  let cur = racine;
  const re = /<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  for (const m of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(re)) {
    if (m[1]) { let k = cur; while (k !== racine && k.tag !== m[1].toLowerCase()) k = k.parentNode; if (k !== racine) cur = k.parentNode; continue; }
    const attrs = {};
    for (const a of m[3].matchAll(/([^\s=]+)(?:\s*=\s*"([^"]*)")?/g)) attrs[a[1]] = a[2] === undefined ? '' : a[2];
    const x = noeud(m[2].toLowerCase(), attrs);
    cur.insertBefore(x, null);
    if (!VIDES.has(x.tag) && !m[4]) cur = x;
  }
  const parId = new Map();
  const tous = (x) => { if (x.id) parId.set(x.id, x); x.kids.forEach(tous); };
  tous(racine);
  return { racine, parId };
}
const carteDe = (t) => entre(t, '<div class="carte" id="tirCarte">', '<div class="carte" id="brainJeuCarte">');
/* la suite d etat d une rangee : les <p class="note"> qui la suivent immediatement */
function suiteDetat(rangee) {
  const s = [];
  for (let x = rangee.nextElementSibling; x && x.tag === 'p' && x.classe('note'); x = x.nextElementSibling) s.push(x.id);
  return s;
}

/* ---------------------------------------------------------------- les flux, executes (le vrai code, des stubs) */
/* une declaration de fonction au niveau du module : de « debut » en tete de ligne a la premiere accolade fermante en tete de ligne (CRLF ou LF) */
function fonction(t, debut) {
  const d = new RegExp('(?:^|\\r?\\n)(' + debut.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')').exec(t);
  if (!d) return '';
  const i = d.index + d[0].length - d[1].length;
  const fin = /\r?\n\}(?=\r?\n)/g; fin.lastIndex = i;
  const m = fin.exec(t);
  return m ? t.slice(i, m.index + m[0].length) + '\n' : '';
}
const NOMS_FLUX = ['rollPaye', 'passPaye', 'fondPot', 'reclamerPot', 'fermerPot', 'autoRoll', 'autoRollLot', 'reglerRollsEnAttente', 'tirerJourPass', 'slotsAgir', 'roll', 'montrerSettled', 'phraseSettle'];
const CONTRAT = '0x' + 'cc'.repeat(20), MOI = '0x' + 'a1'.repeat(20);
async function executer(t, appel, extra = {}) {
  const src = NOMS_FLUX.map((k) => fonction(t, 'async function ' + k + '(') || fonction(t, 'function ' + k + '(')).join('\n');
  const ecrits = new Set(), textes = [];
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) {
      const e = { id, hidden: true, disabled: false, value: 'x', innerHTML: '', dataset: {}, setAttribute() {} };
      Object.defineProperty(e, 'textContent', { get() { return this._t || ''; }, set(v) { this._t = String(v); ecrits.add(id); textes.push({ id, v: String(v) }); } });
      els.set(id, e);
    }
    return els.get(id);
  };
  const refuse = () => ({ etat: 'REFUSE', pourquoi: 'stub', appels: [] });
  const ctx = {
    $: (s) => (s.startsWith('#') ? el(s.slice(1)) : null), compte: MOI,
    rollsCfg: { contrat: CONTRAT, prixRoll: '500000', prixPass: '10000000', passRolls: 3, bloc: 900 },
    potCfg: { contrat: CONTRAT, semaine: null }, potAFermer: { day: 1, jourId: 'J2026-10-23', owner: null, ferme: false, reste: '0' },
    maPartPot: { wallet: MOI, contrat: CONTRAT, day: 1, jourId: 'J2026-10-23', amount: '1', ticket: '0x', deadline: 1, signature: '0x' },
    slotsCfg: { j: { ok: true, contrat: CONTRAT, prixSpin: '500000' }, enCours: false, vue: null, spins: new Map() },
    slotsContrat: (j) => (j && j.contrat) || null, Slots: { planSpin: refuse }, USDC_BASE: '0x' + '83'.repeat(20), motSettle: () => 'BAS',
    nouvelleFaceRoll: () => null, lirePassSur: async () => ({ ok: false }), bjUsdc: () => null, dejaReclamePot: async () => true,
    planClaimPot: refuse, planClosePot: refuse, verifierRollsEnAttente: async () => null, peindreTirageJourPass: async () => null,
    peindreTirage: () => {}, peindreSlots: () => {}, usdcTexte: (x) => String(x), jb: () => {}, signalerRoll: async () => true,
    logoSvg: () => '', paramsLogoDepuisApparence: () => ({}), faceRevelee: () => null, rollDerniers: [],
    rpc: async (m) => (m === 'eth_blockNumber' ? '0x10' : null), setTimeout: (f) => { f(); return 0; }, clearTimeout: () => {},
    /* 2026-10-24 « Pay with » : USDC par defaut (aucun jeton choisi) — le scenario JETON en choisit un */
    jetonChoisi: () => null, preparerPaiementJeton: async () => ({ ok: false, pourquoi: 'stub.' }), envoyerPaiementJeton: async () => null,
  };
  Object.assign(ctx, extra);
  const noms = Object.keys(ctx);
  const f = new Function(...noms, 'let rollEnCours = false;\n' + src + '\nreturn { ' + NOMS_FLUX.join(', ') + ' };');
  const api = f(...noms.map((k) => ctx[k]));
  try { await appel(api); } catch (e) { return { ecrits, textes, jete: String(e && e.message) }; }
  return { ecrits, textes };
}
/* le flux de chaque bouton : lu dans son ecouteur de clic (jamais suppose) */
function fluxDe(t, id) {
  const m = t.match(new RegExp("\\$\\('#" + id + "'\\)\\.addEventListener\\('click', \\(\\) => \\{ void (\\w+)\\(([^)]*)\\); \\}\\);"));
  return m ? { nom: m[1], arg: m[2] } : null;
}
const PAYANTS = ['jourRoll', 'jourRollPaye', 'jourAuto', 'rollsRegler', 'slotsSpin', 'slotsRegler', 'slotsAccepter', 'jourPass', 'jourTirerJour', 'jourFondPot', 'jourReclamerPot', 'jourFermerPot'];

const S = {};
S.RANGEES = async (t) => {
  const { parId } = arbre(carteDe(t));
  const rangees = new Map(), suites = new Map();
  for (const id of PAYANTS) {
    const b = parId.get(id);
    if (!b || !b.parentNode || !b.parentNode.classe('jourEtapes')) return { ok: false, pourquoi: 'bouton sans rangee', id };
    rangees.set(id, b.parentNode); suites.set(b.parentNode, suiteDetat(b.parentNode));
  }
  /* toutes les lignes d etat d une AUTRE rangee que celle du bouton */
  const autres = (id) => new Set([...suites.entries()].filter(([r]) => r !== rangees.get(id)).flatMap(([, s]) => s));
  const res = {};
  for (const id of PAYANTS) {
    const fl = fluxDe(t, id);
    if (!fl) return { ok: false, pourquoi: 'ecouteur introuvable', id };
    const r = await executer(t, (api) => (fl.arg ? api[fl.nom](JSON.parse(fl.arg.replace(/'/g, '"'))) : api[fl.nom]()));
    const ecrits = [...r.ecrits], suite = suites.get(rangees.get(id)), o = autres(id);
    const dedans = ecrits.filter((x) => suite.includes(x)), ailleurs = ecrits.filter((x) => o.has(x));
    res[id] = { flux: fl.nom, ecrits, suite, ok: !r.jete && dedans.length > 0 && ailleurs.length === 0, jete: r.jete };
  }
  /* le recu des rolls (montrerSettled, appele par Auto-roll et « Settle pending rolls ») : ses lignes sont dans la suite du Roll */
  const rs = await executer(t, (api) => api.montrerSettled([{ rollId: 1n, score: 2, payout: 0n, blockHash: '0x' + '11'.repeat(32), potAfter: 0n }], null));
  const suiteRoll = suites.get(rangees.get('jourRoll'));
  const recu = [...rs.ecrits].filter((x) => x !== 'dernierNom').every((x) => suiteRoll.includes(x)) && rs.ecrits.has('rollsEtat') && !rs.jete;
  const tous = PAYANTS.every((id) => res[id].ok);
  return { ok: tous && recu, recu, recuEcrits: [...rs.ecrits], recuJete: rs.jete, ko: Object.fromEntries(Object.entries(res).filter(([, v]) => !v.ok)) };
};
S.ROLL = async (t) => {
  const { parId } = arbre(carteDe(t));
  const s = suiteDetat(parId.get('jourRoll').parentNode);
  const zone = parId.get('slotsZone');
  return { ok: s[0] === 'rollsEtat' && s.includes('dernierMoi') && s.includes('dernierQuand') && s.includes('rollsAttente') && !!zone && parId.get('dernierMoi').nextElementSibling !== null, s };
};
S.REGLE = async (t) => {
  const { parId } = arbre(carteDe(t));
  const src = fonction(t, 'function placerRegleSlots(');
  if (!src) return { ok: false, pourquoi: 'placerRegleSlots introuvable' };
  const placer = new Function('$', src + '\nreturn placerRegleSlots;')((s) => parId.get(s.slice(1)) || null);
  const rg = parId.get('slotsRegle'), rangee = parId.get('slotsSpin').parentNode, zone = parId.get('slotsZone');
  placer(true);
  const avec = rg.parentNode === zone && rg.nextElementSibling === rangee;
  placer(false);
  const sans = rg.parentNode.tag === 'details' && rg.nextElementSibling === parId.get('slotsComment');
  placer(true);
  const retour = rg.nextElementSibling === rangee;
  return { ok: avec && sans && retour, avec, sans, retour };
};

/* JETON (2026-10-24, « Pay with ») : un jeton choisi, les quatre gestes payables en jeton (Roll, Auto-roll, Week pass, Spin) executes
 *   jusqu au refus de la preparation (stub) : le message va a la ligne d etat de SA rangee — la meme que le chemin USDC — jamais ailleurs */
const JETONS = { jourRollPaye: 'rollPaye', jourAuto: 'autoRoll', jourPass: 'passPaye', slotsSpin: 'slotsAgir' };
S.JETON = async (t) => {
  const { parId } = arbre(carteDe(t));
  const suites = new Map(PAYANTS.map((id) => [parId.get(id).parentNode, suiteDetat(parId.get(id).parentNode)]));
  const PRET = (k = 2) => ({ etat: 'PRET', prix: '500000', appels: Array.from({ length: k }, () => ({ to: CONTRAT, data: '0x00' })) });
  const extra = {
    jetonChoisi: () => ({ jeton: '0x' + 'b2'.repeat(20), symbole: 'NVDAc', tailles: [] }), preparerPaiementJeton: async () => ({ ok: false, pourquoi: 'stub refusal.' }),
    nouvelleFaceRoll: () => ({ guess: [0, 0, 0, 0, 0] }), tirerFaceDeRoll: () => ({ guess: [0, 0, 0, 0, 0] }), peindreFaceRoll: () => {},
    lirePassSur: async () => ({ ok: true, pass: null }), passActif: () => false, lireAvantRoll: async () => ({ pot: 0n, phrase: '' }), lirePotRolls: async () => 0n,
    planRoll: () => PRET(), planRolls: () => PRET(6), planPass: () => PRET(), Slots: { planSpin: () => PRET() },
  };
  const res = {};
  for (const [id, nom] of Object.entries(JETONS)) {
    const fl = fluxDe(t, id);
    if (!fl || fl.nom !== nom) return { ok: false, pourquoi: 'ecouteur', id, fl };
    let texte = null;
    const r = await executer(t, (api) => (fl.arg ? api[fl.nom](JSON.parse(fl.arg.replace(/'/g, '"'))) : api[fl.nom]()), extra);
    const rangee = parId.get(id).parentNode, suite = suites.get(rangee);
    const autres = new Set([...suites.entries()].filter(([x]) => x !== rangee).flatMap(([, s]) => s));
    const ecrits = [...r.ecrits];
    /* le refus du chemin JETON (« stub refusal. ») est ecrit dans la suite d etat de la rangee : le chemin jeton a bien ete pris */
    texte = r.textes.find((x) => suite.includes(x.id) && x.v.includes('stub refusal.')) || null;
    res[id] = { ecrits, suite, ok: !r.jete && !!texte && ecrits.every((x) => !autres.has(x)), jete: r.jete };
  }
  return { ok: Object.values(res).every((x) => x.ok), ko: Object.fromEntries(Object.entries(res).filter(([, v]) => !v.ok)) };
};

for (const k of Object.keys(S)) { const r = await S[k](APP); vu(r.ok === true, 'scenario ' + k + (r.ok ? '' : ' ' + JSON.stringify(r).slice(0, 1200))); }

/* ---------------------------------------------------------------- les mutants (copies en memoire) */
const deplacer = (ligne, avant) => (t) => { vu(t.split(ligne).length === 2 && t.split(avant).length === 2, 'deplacement : ancres uniques'); return t.replace(ligne, '').replace(avant, ligne + avant); };
const MUT = [
  ['RANGEES', 'Week pass ecrit dans la ligne du Roll', "  const e = $('#potEtat'), b = $('#jourPass');", "  const e = $('#rollsEtat'), b = $('#jourPass');"],
  ['RANGEES', 'Add to pot ecrit dans la ligne du Roll', "  const e = $('#potEtat'), b = $('#jourFondPot');", "  const e = $('#rollsEtat'), b = $('#jourFondPot');"],
  ['RANGEES', 'Claim ecrit dans la ligne du Roll', "  const e = $('#potEtat'), b = $('#jourReclamerPot');", "  const e = $('#rollsEtat'), b = $('#jourReclamerPot');"],
  ['RANGEES', 'Close the pot ecrit dans la ligne du Roll', "  const e = $('#potEtat'), b = $('#jourFermerPot');", "  const e = $('#rollsEtat'), b = $('#jourFermerPot');"],
  ['RANGEES', 'le roll paye ecrit dans la ligne du pot', "  const e = $('#rollsEtat'), b = $('#jourRollPaye');", "  const e = $('#potEtat'), b = $('#jourRollPaye');"],
  ['RANGEES', 'Settle pending rolls ecrit dans la ligne du pot', "  const bt = $('#rollsRegler'), e = $('#rollsEtat');", "  const bt = $('#rollsRegler'), e = $('#potEtat');"],
  ['RANGEES', 'le tirage du pot des pass ecrit dans la ligne du Roll', "  const bt = $('#jourTirerJour'), p = $('#jourPassEtat');\n  let c = null; try { c = compte; } catch (_) { c = null; }\n  if (!rollsCfg || !c || !bt || bt.disabled) return;", "  const bt = $('#jourTirerJour'), p = $('#rollsEtat');\n  let c = null; try { c = compte; } catch (_) { c = null; }\n  if (!rollsCfg || !c || !bt || bt.disabled) return;"],
  ['RANGEES', 'les Slots ecrivent sous la liste (#slotsMoi)', "  const j = slotsCfg.j, contrat = slotsContrat(j), etat = $('#slotsEtat');", "  const j = slotsCfg.j, contrat = slotsContrat(j), etat = $('#slotsMoi');"],
  ['RANGEES', 'la ligne du pot remontee sous le Roll', null, deplacer('      <p class="note" id="potEtat" style="margin:6px 0 0" hidden></p>\n', '      <p class="note" id="rollsEtat" style="margin:6px 0 0" hidden></p>\n')],
  ['RANGEES', 'la ligne du Roll redescendue sous les Slots', null, deplacer('      <p class="note" id="rollsEtat" style="margin:6px 0 0" hidden></p>\n', '      <div class="jourTicket">\n')],
  ['RANGEES', 'la ligne des Slots sous la liste des spins', null, deplacer('        <p class="note" id="slotsEtat" style="margin:6px 0 0">Reading the slots on chain…</p>\n', '        <p class="note" id="slotsMoi" style="margin:4px 0 0"></p>\n')],
  ['ROLL', '« Your roll matched » redescendu sous les Slots', null, deplacer('      <p class="note" id="dernierMoi" style="margin:4px 0 0"></p>\n', '      <div class="tirBarre" aria-hidden="true">')],
  ['ROLL', '« Last rolls » redescendu sous les Slots', null, deplacer('      <p class="note" id="dernierQuand" style="margin:2px 0 0"></p>\n', '      <div class="tirBarre" aria-hidden="true">')],
  ['REGLE', 'avec un wallet la regle sous #slotsMoi (sous Spin)', '    if (moi) { if (rangee.previousElementSibling !== rg) rangee.parentNode.insertBefore(rg, rangee); }',
    "    if (moi) { const mien = $('#slotsMoi'); if (mien.nextElementSibling !== rg) mien.parentNode.insertBefore(rg, mien.nextElementSibling); }"],
  ['JETON', 'le roll paye en jeton ecrit dans la ligne du pot', "      if (!pj.ok) { dit('Not rolled: ' + pj.pourquoi + ' Nothing was sent.'); return; }\n      r = await envoyerPaiementJeton(pj, c, dit, av.phrase);",
    "      if (!pj.ok) { $('#potEtat').textContent = 'Not rolled: ' + pj.pourquoi + ' Nothing was sent.'; return; }\n      r = await envoyerPaiementJeton(pj, c, dit, av.phrase);"],
  ['JETON', 'l auto-roll en jeton ecrit dans la ligne des Slots', "    if (!pj.ok) { dit('Not rolled: ' + pj.pourquoi + ' Nothing was sent.'); return; }\n    r = await envoyerPaiementJeton(pj, c, dit, av.phrase);",
    "    if (!pj.ok) { $('#slotsEtat').textContent = 'Not rolled: ' + pj.pourquoi + ' Nothing was sent.'; return; }\n    r = await envoyerPaiementJeton(pj, c, dit, av.phrase);"],
  ['JETON', 'le Week pass en jeton ecrit dans la ligne du Roll', "      if (!pj.ok) { dit('No pass bought: ' + pj.pourquoi + ' Nothing was sent.'); return; }", "      if (!pj.ok) { $('#rollsEtat').textContent = 'No pass bought: ' + pj.pourquoi + ' Nothing was sent.'; return; }"],
  ['JETON', 'le Spin en jeton ecrit dans la ligne du Roll', "      if (!pj.ok) { dit(refus + ': ' + pj.pourquoi + ' Nothing was sent.'); return; }", "      if (!pj.ok) { $('#rollsEtat').textContent = refus + ': ' + pj.pourquoi + ' Nothing was sent.'; return; }"],
  ['JETON', 'le Spin ignore le jeton choisi', "    const jt = quoi === 'spin' ? jetonChoisi() : null;", '    const jt = null;'],
  ['REGLE', 'la regle reste dans le pli avec un wallet', '    if (moi) { if (rangee.previousElementSibling !== rg) rangee.parentNode.insertBefore(rg, rangee); }', '    if (moi) { /* rien */ }'],
];
let tues = 0;
for (const [s, nom, de, vers] of MUT) {
  let copie;
  if (de === null) copie = vers(APP);
  else { vu(APP.split(de).length === 2, 'mutant « ' + nom + ' » : ancre unique'); copie = APP.replace(de, () => vers); }
  vu(copie !== APP, 'mutant « ' + nom + ' » : la copie differe');
  let r; try { r = await S[s](copie); } catch (e) { r = { ok: false, jete: String(e && e.message), syntaxe: e instanceof SyntaxError }; }
  vu(r.syntaxe !== true, 'mutant « ' + nom + ' » : code valide');
  vu(r.ok === false, 'MUTANT « ' + nom + ' » : ' + s + ' ROUGIT');
  tues += 1;
}
console.log('ok draws-statuts - ' + n + ' assertions, ' + Object.keys(S).length + ' scenarios, ' + PAYANTS.length + ' boutons payants (flux executes jusqu au 1er message), ' + tues + '/' + MUT.length
  + ' mutants tues ; NE PROUVE PAS les pixels (mesure au navigateur a part), les chemins de succes de chaque flux');
