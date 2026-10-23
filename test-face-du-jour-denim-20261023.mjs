// test-face-du-jour-denim-20261023.mjs — le bloc E (premier bloc horodate >= cloture + 120 s) doit rester EXACT a 200 ms/bloc.
// ⛔ LE DEFAUT : premierBlocApres estimait la cible a 2 s/bloc depuis la tete, puis descendait par pas croissants (au plus ~41 000 blocs).
//   A 200 ms, la cible est 10x plus loin en blocs : la descente ne l atteignait pas, et la dichotomie rendait un bloc FAUX (ts >= cible mais
//   pas le premier) — la face du jour et le gagnant du jour changeaient. Chaine simulee : ts = floor(T0 + b * pas), en secondes entieres.
import assert from 'node:assert/strict';
import { premierBlocApres } from './face-du-jour.js';

let n = 0;
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

function chaine({ tete, pas, T0 = 1700000000 }) {
  const ts = (b) => Math.floor(T0 + b * pas + 1e-9);
  let appels = 0;
  const rpc = async (m, p) => {
    appels++;
    if (m === 'eth_blockNumber') return '0x' + tete.toString(16);
    if (m === 'eth_getBlockByNumber') { const b = parseInt(p[0], 16); if (b > tete || b < 0) throw new Error('no block'); return { number: p[0], timestamp: '0x' + ts(b).toString(16), hash: '0x' + b.toString(16).padStart(64, '0') }; }
    throw new Error('methode ' + m);
  };
  /* la verite : le premier bloc dont ts >= cible (recherche lineaire bornee, hors rpc) */
  const verite = (cible) => { let b = Math.max(0, Math.floor((cible - T0) / pas) - 10); while (ts(b) < cible) b++; return b; };
  return { rpc, ts, verite, appels: () => appels, T0 };
}

for (const [pas, nom] of [[2, '2 s'], [0.2, '200 ms']]) {
  for (const reculS of [130, 3600, 20 * 3600, 3 * 86400]) {
    const tete = 60000000;
    const c = chaine({ tete, pas });
    const cible = c.ts(tete) - reculS;
    const e = await premierBlocApres(c.rpc, cible);
    eq(e && e.bloc, c.verite(cible), nom + ' / cible ' + reculS + ' s avant la tete : le PREMIER bloc >= cible');
    eq(e && e.ts >= cible, true, nom + ' / ' + reculS + ' s : son horodatage atteint la cible');
    eq(c.ts(e.bloc - 1) < cible, true, nom + ' / ' + reculS + ' s : le bloc d avant est AVANT la cible');
  }
}
/* le temps de bloc mesure, passe par l appelant, ne change pas le resultat (il ne fait que raccourcir la recherche) */
{
  const c = chaine({ tete: 60000000, pas: 0.2 });
  const cible = c.ts(60000000) - 20 * 3600;
  const e = await premierBlocApres(c.rpc, cible, { sParBloc: 0.2 });
  eq(e.bloc, c.verite(cible), '200 ms avec sParBloc mesure : exact');
  eq(c.appels() <= 16, true, '200 ms avec sParBloc mesure : ' + c.appels() + ' lectures (<= 16)');
  /* sans la mesure (estimation a 2 s), toujours exact, mais plus de lectures : c est ce que la mesure fait gagner */
  const c2 = chaine({ tete: 60000000, pas: 0.2 });
  const e2 = await premierBlocApres(c2.rpc, cible);
  eq(e2.bloc, c2.verite(cible), '200 ms sans sParBloc : exact quand meme');
  eq(c2.appels() > c.appels(), true, 'sans mesure : ' + c2.appels() + ' lectures, avec : ' + c.appels());
}
/* le bloc 0 deja apres la cible : c est lui */
{
  const c = chaine({ tete: 500, pas: 2 });
  const e = await premierBlocApres(c.rpc, c.T0 - 100);
  eq(e && e.bloc, 0, 'cible avant le bloc 0 : le bloc 0');
}
/* la cible pas encore atteinte -> null (rien d invente) */
{
  const c = chaine({ tete: 1000, pas: 0.2 });
  eq(await premierBlocApres(c.rpc, c.ts(1000) + 5), null, 'cible dans le futur -> null');
}
console.log('test-face-du-jour-denim : ' + n + ' assertions, OK');
