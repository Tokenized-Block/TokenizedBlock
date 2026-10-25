/* test-bridge-pas-de-frais-sans-echange.mjs — LE FRAIS EST DANS L ECHANGE, OU IL N EST PAS.
 *
 * ⛔⛔ LE DEFAUT D ORIGINE, mesure le 2026-09-24 en lecture du code LIVE. Le bouton de confirmation
 *     du Bridge construisait UNE seule transaction — un transfert de frais vers le puits — et
 *     l envoyait. Aucun echange nulle part dans le chemin. L ecran affichait « You receive: <net> »
 *     juste au-dessus du bouton, et la reserve « not live yet » n arrivait qu APRES la signature.
 *     Des gens payaient et ne recevaient rien.
 *
 * ⛔⛔ CETTE GARDE A CHANGE DE MECANISME LE MEME JOUR, ET C EST LA LE POINT INTERESSANT.
 *     Ma premiere version verifiait qu un refus (`if (!HUB_SWAP_LIVE)`) precedait la construction
 *     du frais. Phil, le meme jour : « tu charges avec les relais existants d echange de pool ». Le
 *     Bridge s est donc mis a VENDRE le block par sa propre pool (`planEchange`), frais dedans.
 *
 * ⛔⛔⛔ 2026-10-25 — TROISIEME FORME, ET IL FAUT DIRE CE QUI A CHANGE. Phil a fait RETIRER la carte de vente
 *      du Bridge (« remove that ») et ajouter un Swap au Wallet. Le gestionnaire `#brConfirm` que ce banc
 *      lisait N EXISTE PLUS. Le supprimer avec lui laisserait le defaut revenir sans un cri ; ce banc garde
 *      donc la MEME propriete sur le chemin qui reste :
 *        · plus aucun gestionnaire de vente dans le Bridge (s il revient, il doit revenir avec ses gardes) ;
 *        · `buildBridgeFeeCall` n est appele NULLE PART dans l ecran — plus fort qu avant (on ne lisait que le
 *          gestionnaire) : aucun transfert de frais autonome ne peut etre construit ou que ce soit ;
 *        · le Swap du Wallet ne construit AUCUNE transaction : il ecrit une commande du Chat ;
 *        · le chemin du Chat (`bcProposerSwap`) n envoie rien si le plan n est ni PRET ni APPROBATIONS, et le net
 *          qu il annonce vient du MEME plan que les appels qu il fait signer.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que la transaction reussit on-chain, ni que le frais arrive
 *    vraiment a destination. Il lit du code.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

/* ⛔ commentaires retires du cote LU : ce depot documente ses defauts corriges en toutes lettres. */
const src = html.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');
/** Le corps d une fonction, borne par ses accolades (pas par un compte d octets). */
const corps = (sig) => {
  const i = src.indexOf(sig);
  if (i < 0) return '';
  /* l accolade du CORPS (apres `) {` ou `=> {`), pas celle d un parametre destructure */
  const m = /\)\s*\{|=>\s*\{/.exec(src.slice(i));
  if (!m) return '';
  const j = i + m.index + m[0].length - 1;
  for (let k = j, p = 0; k < src.length; k += 1) {
    if (src[k] === '{') p += 1; else if (src[k] === '}') { p -= 1; if (p === 0) return src.slice(i, k + 1); }
  }
  return '';
};

v('TEMOIN — le depouillement garde le code vivant', () => {
  assert.ok(src.length < html.length && src.length > 200000 && src.includes("$('#brFundWallet')"),
    'depouillement casse : ce banc ne lirait plus rien (' + src.length + '/' + html.length + ')');
});

v('⛔ le Bridge ne porte plus de gestionnaire de vente (retire le 2026-10-25)', () => {
  assert.doesNotMatch(src, /\$\('#brConfirm'\)/, 'un gestionnaire `#brConfirm` est revenu : reecrire ce banc AVANT, avec ses gardes');
  assert.doesNotMatch(src, /id="brConfirm"/, 'le bouton de vente du Bridge est revenu');
});

v('⛔ LE CAS CENTRAL : aucun transfert de frais autonome ne peut etre construit dans l ecran', () => {
  /* ⛔⛔ `buildBridgeFeeCall` fabriquait un transfert de frais tout seul. Il reste IMPORTE (bancs du module), jamais APPELE. */
  assert.doesNotMatch(src, /buildBridgeFeeCall\s*\(/,
    'l ecran reconstruit un transfert de frais autonome : il peut de nouveau encaisser sans rien echanger (defaut du 2026-09-24)');
});

const ws = corps("$('#wsGo').addEventListener('click', async () =>");
v('TEMOIN — le gestionnaire du Swap du Wallet est trouve', () => {
  assert.ok(ws.length > 400 && /bcExecuterTexte\(/.test(ws), 'gestionnaire #wsGo introuvable ou vide (' + ws.length + ' car.)');
});

v('⛔ le Swap du Wallet ne construit AUCUNE transaction : il ecrit une commande du Chat', () => {
  assert.doesNotMatch(ws, /envoyer\w*\(|eth_sendTransaction|wallet_sendCalls|planEchange\(|\/api\/rails\/plan|buildBridgeFeeCall|aSigner/,
    'le Swap du Wallet appelle une primitive d argent lui-meme : il doit passer par bcExecuterTexte, le chemin du Chat');
});

const swap = corps('async function bcProposerSwap(');
v('⛔ le chemin du Chat n envoie rien si le plan n est ni PRET ni APPROBATIONS', () => {
  assert.ok(swap.length > 3000, 'bcProposerSwap introuvable (' + swap.length + ')');
  const i = swap.indexOf("if (p.etat !== 'PRET' && p.etat !== 'APPROBATIONS') {");
  assert.ok(i > 0, 'le refus d un plan non pret a disparu de bcProposerSwap');
  assert.match(swap.slice(i, i + 400), /return;/, 'le refus sur un plan non pret ne sort pas de la fonction');
  assert.ok(i < swap.indexOf('const signer = async'), 'le refus vient APRES la definition de la signature');
});

v('⛔ le net annonce vient du MEME plan que les appels signes', () => {
  assert.match(swap, /const rs = p\.resume \|\| \{\};/, 'le resume lu n est plus celui du plan p');
  assert.match(swap, /'You receive at least ' \+ [^;]*rs\.recoitAuMoins/, '« You receive at least » ne vient plus de rs.recoitAuMoins');
  assert.match(swap, /bcSigner\(m, p\.aSigner, 'swap_action'\)/, 'les appels signes ne sont plus p.aSigner');
});

v('le texte lu avant la signature ne decrit pas un frais seul, ni un prenom', () => {
  assert.doesNotMatch(swap, /fee only/i, 'le chemin du Chat annonce « fee only »');
  assert.doesNotMatch(ws, /\bPhil\b|BridgeRouter|\bbps\b/i, 'jargon interne dans le Swap du Wallet');
});

assert.equal(n, 8,'compte de cas inattendu : ' + n);
console.log('ok bridge-pas-de-frais-sans-echange — ' + n + ' cas : aucun transfert de frais autonome dans l ecran,');
console.log('   le Swap du Wallet ecrit une commande, et le chemin du Chat ne signe que le plan qu il a montre.');
console.log('⚠️ NE PROUVE PAS que la transaction aboutit ni que le frais arrive : ceci lit du code.');
