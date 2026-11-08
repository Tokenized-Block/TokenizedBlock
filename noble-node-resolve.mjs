/* noble-node-resolve.mjs — for node only (tests, fork bench): the vendored @noble files keep their own bare imports
 * (`@noble/hashes/sha2.js`), byte for byte as published. The browser resolves them with an import map in fly-brain.html; node uses
 * this resolve hook, which maps them to lib/noble/ next to this file. Import it FIRST: `import './noble-node-resolve.mjs';` */
import { register } from 'node:module';
const lib = new URL('./lib/noble/', import.meta.url).href;
const hook = `const LIB = ${JSON.stringify(lib)};
export async function resolve(spec, ctx, next) {
  const m = /^@noble\\/(hashes|curves)\\/(.+)$/.exec(spec);
  return m ? { url: LIB + m[1] + '/' + m[2], shortCircuit: true } : next(spec, ctx);
}`;
register('data:text/javascript,' + encodeURIComponent(hook));
