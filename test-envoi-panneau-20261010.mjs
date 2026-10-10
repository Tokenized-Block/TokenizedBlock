/* test-envoi-panneau-20261010.mjs - le Send du panneau S EXECUTE (4558a13 avait ajoute `note.className = ...` dans bcProposerEnvoi, ou
 * aucune `note` n existe : ReferenceError, Send casse en prod 20261010-qa2-live-usdc sur ses DEUX entrees ; les epingles de texte « 3d »
 * restaient vertes). EXECUTE bcProposerEnvoi EXTRAITE d app.html (TB_APP = ancienne version pour le ROUGE) en mode strict, avec des stubs
 * pour ce qu elle appelle. AFFIRME : (1) commande de la personne -> pas d erreur, le destinataire s affiche EN ENTIER, boutons
 * « Prepare it » / « Dismiss » ; (2) envoi propose par un agent -> le clic de plus « I checked the address » ; (3) decimales illisibles ->
 * libelle en unites brutes, pas d erreur ; (4) destinataire = le jeton lui-meme -> refus, aucun bouton.
 * NE PROUVE PAS : la signature, le solde relu, ni le rendu dans un vrai navigateur.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const debut = html.indexOf('async function bcProposerEnvoi(');
const apres = html.slice(debut).search(/\r?\nfunction bcProposerTache\(/);
const fin = debut + apres;
assert.ok(debut > 0 && apres > 0, 'bcProposerEnvoi introuvable');
const corps = html.slice(debut, fin);

const JETON = { adr: '0x' + '11'.repeat(20), sym: 'USDC' };
const DEST = '0x' + 'ab'.repeat(20);
let n = 0;
const lancer = async ({ qui, deLAgent, decimales, destinataire = DEST }) => {
  const trace = { messages: [], etapes: [], boutons: [], ops: [] };
  const stubs = {
    bcAvecDelai: (p) => p,
    bcDecimales: async () => { if (decimales === null) throw new Error('illisible'); return decimales; },
    bcUnites: (m, d) => (Number(m) / 10 ** d).toString(),
    bcMessage: (q, c, libelle) => { const m = { libelle, append() {} }; trace.messages.push(libelle); return m; },
    bcOp: (t) => { trace.ops.push(t); return {}; },
    bcVue: () => {}, bcNoter: () => {}, bcOpMaj: () => {},
    bcEtape: (m, t) => trace.etapes.push(t),
    bcBoutons: (m, bs) => trace.boutons.push(bs.map((b) => b[0])),
  };
  const noms = Object.keys(stubs);
  const f = new Function(...noms, '"use strict";' + corps + '; return bcProposerEnvoi;')(...noms.map((k) => stubs[k]));
  await f(qui, '', { jeton: JETON, montant: '1500000', destinataire }, null, deLAgent);
  return trace;
};

const a = await lancer({ qui: 'You', deLAgent: false, decimales: 6 });
assert.equal(a.messages.length, 1); assert.ok(a.messages[0].includes(DEST), 'destinataire tronque : ' + a.messages[0]);
assert.ok(a.messages[0].startsWith('1.5 USDC'), a.messages[0]);
assert.deepEqual(a.boutons.at(-1), ['Prepare it', 'Dismiss']); n++;

const b = await lancer({ qui: 'Your agent', deLAgent: true, decimales: 6 });
assert.deepEqual(b.boutons.at(-1), ['I checked the address — prepare it', 'Dismiss']); n++;

const c = await lancer({ qui: 'You', deLAgent: false, decimales: null });
assert.ok(c.messages[0].startsWith('1500000 raw units of USDC'), c.messages[0]); n++;

const d = await lancer({ qui: 'You', deLAgent: false, decimales: 6, destinataire: JETON.adr });
assert.ok(d.etapes.some((t) => /token’s own address/.test(t)), 'refus du jeton-destinataire absent');
assert.equal(d.boutons.length, 0, 'un bouton est propose pour un envoi au jeton lui-meme'); n++;

console.log('ok envoi-panneau ' + n + '/4 - bcProposerEnvoi s execute sur ses deux entrees ; NE PROUVE PAS la signature ni le rendu navigateur');
