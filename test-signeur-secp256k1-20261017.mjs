// 2026-10-17 signeur-secp256k1.js : octet pour octet egal a vm.sign de Foundry, s bas, refus bruyants. Cles de TEST PUBLIQUES seulement.
// Les 30 vecteurs FOUNDRY sont la sortie de `forge test --match-contract SigneurParite -vv` (contracts/test/SigneurSecp256k1.t.sol),
// recopiee par programme depuis le journal, jamais a la main. Les signatures CLAIMS sont celles que SigneurClaim (meme fichier .sol)
// fait accepter par BlockMissionsV3.claim : ce test prouve qu elles sortent bien de CE signeur.
import { readFileSync } from 'node:fs';
import { adresseDe, signerDigest, signerDigestDetail, recupererAdresse, N, P, G } from './signeur-secp256k1.js';
import { keccak256Hex } from './keccak.js';

let ko = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok  ' : 'KO  ') + m); if (!c) ko++; };
const jette = (f, motif) => { try { f(); return false; } catch (e) { return motif ? motif.test(e.message) : true; } };
const message = (f) => { try { f(); return ''; } catch (e) { return e.message; } };

// [cle, digest, vm.sign -> r || s || v, vm.addr(cle)]
const FOUNDRY = [
  ['0x1', '0x1e38c1fc746f16ff1229a8b41111ab27a648e4d84cd3d1c0e0b3119e6632672e', '0xffe173d6ad34488263cf55fb3486485f486cba54f2b8346e0df81d86ad5b5ba253ace05e719639a389e1b2faa91f971f1939f0380bdb6d22b8e5f0ecf5ec0b7c1b', '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'],
  ['0x1', '0x7b8d5aaa9d52d390db3ed633584f2f9ef91c6f7501c763a1d546b049476d30fa', '0x9d7c4e2fa551162351debedcd4a2215f196375d555a7d1a3f23f2910db7eee813db7b81932f7a1ef58a86e89aa6c432f9a609abca6bf6cc58cdfe6bf24022bbb1b', '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'],
  ['0x1', '0x0000000000000000000000000000000000000000000000000000000000000000', '0xa0b37f8fba683cc68f6574cd43b39f0343a50008bf6ccea9d13231d9e7e2e1e411edc8d307254296264aebfc3dc76cd8b668373a072fd64665b50000e9fcce521c', '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'],
  ['0x1', '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', '0x3f8fe493cf305a7f02b2d2c060ba66a8f7bd13a7a64d5200c0655ad069bd85b51cf94236c3857e33a1023a5216cbc81b1dc3adcc1c71f4212df1997ffdfb140a1c', '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'],
  ['0x1', '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141', '0x584d928bc02fb43cb889788304f47adb538f03a963fbe649a4112398adca0b704dd3158c4f4d7e45a5ec3a41bd407d2822e0302a4342ec5279dde7cf90175eef1c', '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'],
  ['0x2', '0x1e38c1fc746f16ff1229a8b41111ab27a648e4d84cd3d1c0e0b3119e6632672e', '0xa5ec43b3a0b4104cbe69474e1e1e8a41833e3181459ca048542e49ed8779897c731cc1d25c19f70364a3ca817bf5ffcd1c171c5f302233ff3e648abeed7152031c', '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF'],
  ['0x2', '0x7b8d5aaa9d52d390db3ed633584f2f9ef91c6f7501c763a1d546b049476d30fa', '0xf9f9673b7dce66aa714c1ee4d3bf6a234bb4afe112276500740b93b6d365f9133e47e11367dba1069528f32b9232dcd8653d2bd6f5952b54ca8ec8e07cd3b0e71c', '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF'],
  ['0x2', '0x0000000000000000000000000000000000000000000000000000000000000000', '0x3fdeb205601c7501de0436c322579c131efd2f45bb1106f6711c906b3ace405d022801050bee091ac1b8e4a20c9190730346c3c459f54a0fa5c28a520f94db1f1b', '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF'],
  ['0x2', '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', '0x270c504ade45b9bf70ed7dd54f2f253671c4568e3b2a2319d2efc6942b58f796076b9b8b0449bc498635d324e2f50365964e65ef0fcbcec9b9941e69f91b0aaa1c', '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF'],
  ['0x2', '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141', '0xd08d92dc4c06665726138b5f12d74330a9b69e149a43ebb2c574b7b38b0755c41138dca26cc62e9809ac2de03ee175fac9f662fc2983d138eef6ca54bdd33c7c1b', '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF'],
  ['0x3', '0x1e38c1fc746f16ff1229a8b41111ab27a648e4d84cd3d1c0e0b3119e6632672e', '0x761a54d3e764df060c43f9c39d24f8537218f4c6f828e1a4e1d1b7814966ae3b17d7f42756429c99ec3b9a40a2c1b386c2ebd1a68016775ea3d8658ab30a07371c', '0x6813Eb9362372EEF6200f3b1dbC3f819671cBA69'],
  ['0x3', '0x7b8d5aaa9d52d390db3ed633584f2f9ef91c6f7501c763a1d546b049476d30fa', '0x5aa732162ed5cdf149a9004e0fb399cf013e8a3f702c0008b20e46d7d6c72254585748c5a8c7b45b5611d34699446ea4ed5d28285143e2d451a13c08735e49ef1b', '0x6813Eb9362372EEF6200f3b1dbC3f819671cBA69'],
  ['0x3', '0x0000000000000000000000000000000000000000000000000000000000000000', '0xe95058f48325b8b37415edd898822fcfc83d8fdc5e257d3c370c0304c42dd5f26836450f27b3ccd9d0e86629627b28b61fcdaeab49d9099f4170ccd3b3258e811b', '0x6813Eb9362372EEF6200f3b1dbC3f819671cBA69'],
  ['0x3', '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', '0x91f89f7120268487d00e7eae2a723ffcbaf24b30512e25fe62bff3c568311bde170af7bcb6d9a32769d65f7728842dfb5484447d9d488a4506243f208e83ee7f1c', '0x6813Eb9362372EEF6200f3b1dbC3f819671cBA69'],
  ['0x3', '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141', '0x88f750eb6e9649bab74271f32770a6d6805544a65eec2f36a2f740d46cc33a942e489fa973935efca375c789f30a6d4f2d7e9e7ac7e4fdc91a9f9bd5720d15581c', '0x6813Eb9362372EEF6200f3b1dbC3f819671cBA69'],
  ['0xa11ce', '0x1e38c1fc746f16ff1229a8b41111ab27a648e4d84cd3d1c0e0b3119e6632672e', '0x8e8e2c5d1fb718f95d92851957e19fac1232f5ba545861cd2591930c38987f13356c6e595740bf2dc8cfc50a7b262e120a97a5b7a62b9469f56738ea1cb412b41c', '0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7'],
  ['0xa11ce', '0x7b8d5aaa9d52d390db3ed633584f2f9ef91c6f7501c763a1d546b049476d30fa', '0x1adafdba0f39065704e891ab8db6b2a4686e98217b0c88cfccad90f84fbe1a9434067ea9b0470bbe7db082ba1160db856b03bf5c5157166e37cd9928ed6dc7321b', '0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7'],
  ['0xa11ce', '0x0000000000000000000000000000000000000000000000000000000000000000', '0x09a24b130f65c0ac07196a559f91d6f81ac980c09c44c4f224bf7e722dbde1462159dfd4caedcc0f3203a2498a8f495dfc17eddac5add2385ca0faadd7b04f7f1b', '0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7'],
  ['0xa11ce', '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', '0xa96dc87bcc38f9650c4bfa5d95ae9e825c2d92fc26cc5740b60b54b2342e312a492afb80c497f037e051396b4817589fd41d715078a29778b402a60ac39caa181c', '0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7'],
  ['0xa11ce', '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141', '0x803ad23f3f99aadc11241ddbc48a025fc9a06f9e5843c23219f393319ad59c5b4503a7ec8f6e33b5f641707208a6ebd9c5168d5c4b60f2679178837a96e05dfa1b', '0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7'],
  ['0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0', '0x1e38c1fc746f16ff1229a8b41111ab27a648e4d84cd3d1c0e0b3119e6632672e', '0xfc95d9a9202c0437c09dc7cd84f118301a4c5ede48bbf1e2c273077f996d374647063543c9c3670381fd64a38d5546821f7ea4d7a35557acd2a6eed9c1915e461b', '0x3B3c67F57f74CE72a02978b0492620b1a661DA43'],
  ['0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0', '0x7b8d5aaa9d52d390db3ed633584f2f9ef91c6f7501c763a1d546b049476d30fa', '0xf50bd89b83ac4f8d5d5be65d113aae495761e86812ccd43b7e91cbb8102b232206a37671cc644ec8b7db6a249a2ba38bfebe8216f8dcf6454f4782e33e6ce6461b', '0x3B3c67F57f74CE72a02978b0492620b1a661DA43'],
  ['0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0', '0x0000000000000000000000000000000000000000000000000000000000000000', '0xd73785d5d865715b959d6b0dc6bf6a159a04a0ad3179ab342df4c25c7ba2eb3930ade6eee3d45ed3f1cbb10c1dd2a15b8eeb00817fbd818e1210742e3b067c8a1b', '0x3B3c67F57f74CE72a02978b0492620b1a661DA43'],
  ['0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0', '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', '0xee30f78d03e1c2e5d1897e84c2b5766cecdcd1707e764a3ac4b5e72e6ba6a53015c1345e281182ede729ff974e3ab8203f60055d7e5dd12c92c8fe0ebe67c2851c', '0x3B3c67F57f74CE72a02978b0492620b1a661DA43'],
  ['0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0', '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141', '0xa73c7e0ec874c1f0439f1f5c658c6cda928a3bd2e92bf80188d4112d9dadca234033679eeffa42d6882729d41158c7f372ec34fcd5c25c363a1b8f487b41a1061b', '0x3B3c67F57f74CE72a02978b0492620b1a661DA43'],
  ['0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140', '0x1e38c1fc746f16ff1229a8b41111ab27a648e4d84cd3d1c0e0b3119e6632672e', '0x155b2f44412e686138c34bd690491e88cd28b366f3093ea58a04aba6b88e1fd45043a9d7d5bb639ffbfce2d53181962cb612b555d77f7a5cb6456981527ab3351c', '0x80C0dbf239224071c59dD8970ab9d542E3414aB2'],
  ['0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140', '0x7b8d5aaa9d52d390db3ed633584f2f9ef91c6f7501c763a1d546b049476d30fa', '0x1db81873cea18f3ab2d5c09891b1650eb14f65e7b710fdee5b4f28a13dee8d53374dbd23ca6f074ade178de2855b3b56e03a3d5b1a4dfb0d27e5951fb24cf5611b', '0x80C0dbf239224071c59dD8970ab9d542E3414aB2'],
  ['0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140', '0x0000000000000000000000000000000000000000000000000000000000000000', '0x919026f3e239ea52cf530eb6d345dc2b56ef0928f1e9ad20d8f360284dc6504814395e7137e2204f15b69239010f3c34fbb3c858a29b0d106b1fa65bc00472631b', '0x80C0dbf239224071c59dD8970ab9d542E3414aB2'],
  ['0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140', '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', '0x2d0b04a7560652f419e2542ea7d27f2c4afb0e111bb409cfe9f34b7ff7d3315850118e90fcfe28abd0635a2e90f00db72bdbfcedbf56dad4049de85798031b381b', '0x80C0dbf239224071c59dD8970ab9d542E3414aB2'],
  ['0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140', '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141', '0xccedf9058419be4bf0d0aaf55b20072bcf6acb16621ac4ab90a3ed20b83a85ce6c2444f18d6069e828b3ce0e4e5f2f20a2d7e701042bb4bf9361b228f0091ac61c', '0x80C0dbf239224071c59dD8970ab9d542E3414aB2'],
];
// [digest = m.claimDigest(...) imprime par SigneurClaim, signature 0xA11CE epinglee dans SigneurClaim, s bascule ?]
const CLAIMS = [
  ['0x3d0d0c507db36b62d445446a64e1edb2890e5e14256e0bb9a2cc9a941999ed3a', '0x0fca428893253aee0ee5e8b8c2822b39a0725173b9b33eac9f3eac96016058b02efab0fb36c5f6fec5e2c2f4fb3c8f73a64cbd265e3bd3cc3d1ba611d405a5561b', true],
  ['0xa06ea660b96a1d5e96190177d5624b1ff0df9a9e9e5e62d59069ccb4ea357a8c', '0xcd0c905b49371e4f6d3e8b74819083e6d200eb1572a511fc6c75e490f844b18f7b30f4bcdefe0f912f91822630c03009fe57c5af42a7148dfc87c3b7eb2413c61c', false],
  ['0x061e7c02909d167581d2fd7b21e9630e5a7db6e1b083078b231f82eced907ac3', '0xbd6033867c5b49891ebe362d7b9fd8a07afa7fb26504705472c6fe9fec6de17d0f12720cf9ba6ba58cb4d9feccece7e4e9e54134f8277e0808b103523ea9f1021c', false],
  ['0xbebdc92e7c3184eea3afbd5efb4fb61ab0dd44a82157e5e6e578468a9dd8b7da', '0xe7d82bbb10f75dc65adc46937cc04f873874f5a57908d64c230798d2afde65cb53785cd78c1ed28ffc4b104e5fcc5bd12bea8ad0cdb56ed2fad13d45754910801c', false],
  ['0xb5f18293a88ec233d113fbaaae47e4ceafc3f9217b2ab40edd4c1bc7d0362a2b', '0x404df927fd5d2e06eb29604b6a0319e13f54a1b75c105c8d9523129de5b3bbb27719436a6ff8607f145d79f3e28a7432f0f6a19d2decfe945c7ad4e6855c94b41b', false],
  ['0x2f01db85416d4705e756fd74365f12b3bf4bacd5fa02a84dea5d183eb8fd5234', '0x55364cb14dd73534663ae6c00d54d01d400f528136808ef3963ab1fb03449f653d1a039a32c41d0dcc1b4d7b6f1a5887f9c63bc9bfb9a391d4365e2c43fad0571b', false],
  ['0x1664df2bef144f006263eb484753e4b08a430c2ce9d2c5ca852dd1d3d13295ee', '0xaed99bf3a72db5ea4758d5e310a1b2e4565f58de172ce373356f02024a82d82755a316254270e2a9a2a4db5f176dea4a2828fc452e3466356ca5af9d8b181c1b1b', false],
  ['0x264760a58673d0adcad0c2d0da5745fded409192e901be39dcd71ed6283ea48c', '0x77783ee9373a3323283835b6e69ee5855c9fb6674463d33ea4aa3a0d985424824f6711fedb5af23fb73141c7a430927ad53e31b67bc645ba5021d336883fd4fe1b', true],
];

// ── 0. les constantes de la courbe ne sont pas crues sur parole
const sol = readFileSync(new URL('./contracts/src/BlockMissionsV3.sol', import.meta.url), 'utf8');
const demiN = /uint256\(s\) > (0x[0-9A-Fa-f]{64})/.exec(sol);
ok(demiN && BigInt(demiN[1]) === N >> 1n, 'n/2 = la constante low-s de BlockMissionsV3._recover');
ok((G.y * G.y - G.x ** 3n - 7n) % P === 0n, 'G est sur y^2 = x^3 + 7 mod p');
ok(FOUNDRY[0][0] === '0x1' && adresseDe('0x1') === FOUNDRY[0][3],'adresseDe(1) = vm.addr(1) : G est le bon generateur');

// ── 1. parite Foundry, octet pour octet
let bascules = 0; const vus = { 27: 0, 28: 0 };
ok(FOUNDRY.length === 30, FOUNDRY.length + ' vecteurs Foundry');
for (const [k, d, sig, addr] of FOUNDRY) {
  const det = signerDigestDetail(k, d);
  ok(det.signature === sig, 'vm.sign(' + k.slice(0, 10) + ', ' + d.slice(0, 10) + ') = ' + sig.slice(0, 18) + '... v=' + parseInt(sig.slice(-2), 16) + (det.sBascule ? ' (s bascule)' : ''));
  ok(adresseDe(k) === addr, '  adresseDe = vm.addr ' + addr);
  ok(recupererAdresse(d, sig) === addr, '  recupererAdresse(sig Foundry) = vm.addr');
  ok(signerDigest(k, d) === det.signature, '  deterministe (2e appel identique)');
  if (det.sBascule) bascules++;
  vus[parseInt(sig.slice(-2), 16)]++;
}
ok(bascules > 0 && bascules < FOUNDRY.length, 'normalisation low-s exercee : ' + bascules + '/' + FOUNDRY.length + ' s bascules');
ok(vus[27] > 0 && vus[28] > 0, 'les deux v : 27 x' + vus[27] + ', 28 x' + vus[28]);

// ── 2. les signatures que le contrat a acceptees sortent de ce signeur
ok(CLAIMS.length >= 2 && CLAIMS.some((c) => c[2]) && CLAIMS.some((c) => !c[2]), CLAIMS.length + ' claims, avec et sans bascule de s');
const VERIF = adresseDe('0xa11ce');
for (const [d, sig, b] of CLAIMS) {
  const det = signerDigestDetail('0xa11ce', d);
  ok(det.signature === sig && det.sBascule === b, 'claim ' + d.slice(0, 12) + ' : signature epinglee dans SigneurClaim' + (b ? ' (s bascule)' : ''));
  ok(recupererAdresse(d, sig) === VERIF, '  recupere le verifier ' + VERIF);
}

// ── 3. negatifs
const [, d0, sig0, addr0] = FOUNDRY.find((v) => v[0] === '0xa11ce');
const r0 = sig0.slice(2, 66), s0 = BigInt('0x' + sig0.slice(66, 130)), v0 = parseInt(sig0.slice(130), 16);
const haut = '0x' + r0 + (N - s0).toString(16).padStart(64, '0') + (55 - v0).toString(16); // la jumelle mal leable (n - s, v inverse)
ok(jette(() => recupererAdresse(d0, haut), /s haut/), 's haut (n - s, v inverse) : REFUSE comme le contrat');
ok(recupererAdresse(d0, '0x' + r0 + sig0.slice(66, 130) + (55 - v0).toString(16)) !== addr0, 'mauvais v (27<->28) : autre adresse');
for (const v of [0, 1, 26, 29]) ok(jette(() => recupererAdresse(d0, sig0.slice(0, 130) + v.toString(16).padStart(2, '0')), /v hors/), 'v = ' + v + ' : refuse');
ok(jette(() => recupererAdresse(d0, sig0.slice(0, 130)), /mal formee/), '64 octets : refuse');
ok(jette(() => recupererAdresse(d0, sig0 + '00'), /mal formee/), '66 octets : refuse');
ok(jette(() => recupererAdresse(d0, sig0.slice(2)), /mal formee/), 'sans 0x : refuse');
const altere = '0x' + d0.slice(2, 65) + (parseInt(d0[65], 16) ^ 1).toString(16);
ok(recupererAdresse(altere, sig0) !== addr0, 'digest altere d un bit : autre adresse');
ok(jette(() => recupererAdresse(d0, '0x' + '0'.repeat(64) + sig0.slice(66)), /r ou s/), 'r = 0 : refuse');
ok(jette(() => recupererAdresse(d0, '0x' + N.toString(16) + sig0.slice(66)), /r ou s/), 'r = n : refuse');

// cles et digests invalides : refus BRUYANT, et le message ne cite jamais la valeur
const cleN1 = '0x' + (N + 1n).toString(16);
// le MOTIF du refus est exige : une cle n qui passerait la garde jetterait quand meme plus loin (point a l infini), par accident
for (const [k, nom, motif] of [['0x0', '0', /hors de/], ['0x' + N.toString(16), 'n', /hors de/], [cleN1, 'n+1', /hors de/], ['0x' + 'f'.repeat(64), '2^256-1', /hors de/],
  ['0x' + '1'.repeat(65), '65 hex', /mal formee/], ['0x', 'vide', /mal formee/], ['a11ce', 'sans 0x', /mal formee/], ['0xzz', 'non hex', /mal formee/],
  [1, 'nombre', /mal formee/], [null, 'null', /mal formee/]]) {
  ok(jette(() => signerDigest(k, d0), motif) && jette(() => adresseDe(k), motif), 'cle ' + nom + ' : refusee (' + motif.source + ')');
}
ok(!message(() => signerDigest(cleN1, d0)).includes(cleN1.slice(2, 20)), 'le message de refus ne cite pas la cle');
for (const [d, nom] of [[d0.slice(0, 64), '31,5 octets'], [d0 + '00', '33 octets'], [d0.slice(2), 'sans 0x'], [42n, 'BigInt']]) {
  ok(jette(() => signerDigest('0x1', d), /digest mal forme/), 'digest ' + nom + ' : refuse');
}

// ── 4. coherence interne sur 200 digests (pas une parite : la parite, c est le bloc 1)
let coherents = 0, bas = 0;
for (let i = 0; i < 200; i++) {
  const d = keccak256Hex(Buffer.from('banc ' + i));
  const sig = signerDigest('0xa11ce', d);
  if (recupererAdresse(d, sig) === VERIF) coherents++;
  if (BigInt('0x' + sig.slice(66, 130)) <= N >> 1n) bas++;
}
ok(coherents === 200 && bas === 200, '200/200 digests : recuperes et s bas (' + coherents + ', ' + bas + ')');

// ── 5. aucun secret journalise
const src = readFileSync(new URL('./signeur-secp256k1.js', import.meta.url), 'utf8');
ok(!/console\.|process\.std/.test(src), 'le signeur n ecrit rien sur la console');

console.log(n + ' assertions, ' + ko + ' KO'); process.exit(ko ? 1 : 0);
