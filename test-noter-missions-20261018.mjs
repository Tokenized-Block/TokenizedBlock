/* test-noter-missions-20261018.mjs - LA FICHE MISSIONS N EST INSCRITE QUE SI LE RECU, LA DONNEE SIGNEE ET LES LIENS CONCORDENT.
 * AFFIRME (noter(), pur, stubs ; la vraie fiche n est PAS prete aujourd hui et ce test le dit) : (1) la fiche reelle -> refus « not ready » ;
 *   (2) une fiche prete + recu 0x1 + input == creation + factory.missions()/rail() + liens croises + 7 immuables = fiche -> factory + adresse
 *   ecrits, rien d autre ne change ; (3) refus si : adresse deja ecrite, input different d un octet, status 0x0, missions() nul, V3.RAIL()
 *   != rail, rail.MISSIONS() != V3, verifier relu different, un immuable non lu.
 * NE PROUVE PAS : un deploiement reel. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { noter, IMMUABLES_V3 } from './contracts/noter-deploiement-missions.mjs';
import { MISSIONS_DEPLOIEMENT as R } from './missions-deploiement.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const texte = readFileSync(new URL('./missions-deploiement.js', import.meta.url), 'utf8');
const A = (h) => '0x' + h.repeat(20), H = '0x' + '66'.repeat(32), CRE = '0x60806040' + 'ab'.repeat(40);
/* (1) */
const r0 = noter({ fiche: R, texte, tx: { input: CRE }, recu: { status: '0x1' }, lectures: {} });
/* 2026-10-18 soir : la fiche reelle est PRETE (adresses de Phil : reserve = Brain UNIT, verifier, guardian) mais NON deployee — un input etranger
 *   est refuse ; tant qu elle n etait pas prete, le refus disait « not ready » */
if (R.pret === false) vu(r0.ok === false && /not ready/.test(r0.pourquoi), 'la fiche reelle n est pas prete : refus dit (manquants : ' + R.manquants.join(', ') + ')');
else vu(r0.ok === false && R.adresse === null && /^0x[0-9a-f]{40}$/.test(String(R.constructeur.communityReserve)), 'la fiche reelle est prete et non deployee : un input qui n est pas sa creation est refuse (' + String(r0.pourquoi).slice(0, 60) + ')');
/* (2) */
const C = { ...R.constructeur, communityReserve: A('c0'), verifier: A('e0'), guardian: A('9d') };
const fiche = { ...R, pret: true, manquants: [], constructeur: C, creation: CRE, factory: null, adresse: null };
const FAC = A('fa'), V3 = A('33'), RAIL = A('4a');
const v3 = () => Object.fromEntries(Object.entries(IMMUABLES_V3).map(([champ, sig]) => [sig, C[champ]]));
const bon = () => ({ fiche, texte, tx: { hash: H, from: A('de'), to: null, input: CRE }, recu: { status: '0x1', contractAddress: FAC, blockNumber: '0x3253f4b' }, lectures: { missions: V3, rail: RAIL, v3Rail: RAIL, railMissions: V3, v3: v3() } });
const v = noter(bon());
vu(v.ok === true && v.factory === FAC && v.adresse === V3 && v.rail === RAIL && v.bloc === 52772683, 'inscrit : factory, missions, rail, bloc');
vu(v.texte.includes("  factory: '" + FAC + "', /* block 52772683, tx " + H) && v.texte.includes("  adresse: '" + V3 + "',") && v.texte.split('\n').length === texte.split('\n').length, 'deux lignes reecrites, rien d autre');
/* (3) */
const refuse = (patch, m) => { const x = bon(); patch(x); const r = noter(x); vu(r.ok === false && typeof r.pourquoi === 'string', m + ' : refuse (' + (r.pourquoi || '').slice(0, 60) + ')'); };
refuse((x) => { x.fiche = { ...fiche, adresse: V3, factory: FAC }; }, 'adresse deja ecrite');
refuse((x) => { x.tx.input = CRE.slice(0, -2) + 'ac'; }, 'input different d un octet');
refuse((x) => { x.recu.status = '0x0'; }, 'status 0x0');
refuse((x) => { x.lectures.missions = A('00'); }, 'missions() nul');
refuse((x) => { x.lectures.v3Rail = A('4b'); }, 'V3.RAIL() != rail');
refuse((x) => { x.lectures.railMissions = A('34'); }, 'rail.MISSIONS() != V3');
refuse((x) => { x.lectures.v3['verifier()'] = A('e1'); }, 'verifier relu different');
refuse((x) => { x.lectures.v3['guardian()'] = null; }, 'immuable non lu');
console.log('ok noter-missions - ' + n + ' assertions ; NE PROUVE PAS un deploiement reel');
