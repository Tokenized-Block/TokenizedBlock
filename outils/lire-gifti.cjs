// lire-gifti.cjs — reads GIfTI surfaces (downloaded data, never executed): vertices + triangles, as numbers only.
// Usage: node lire-gifti.cjs <file.gii>  -> prints a summary; require() it for readGifti(path).
const fs = require('fs'), zlib = require('zlib');
function readGifti(path) {
  const x = fs.readFileSync(path, 'utf8'), arrays = [];
  const re = /<DataArray([^>]*)>([\s\S]*?)<\/DataArray>/g; let m;
  while ((m = re.exec(x))) {
    const attr = m[1], body = m[2], get = (k) => (new RegExp(k + '="([^"]*)"').exec(attr) || [])[1];
    const intent = get('Intent'), type = get('DataType'), enc = get('Encoding'), dims = [get('Dim0'), get('Dim1')].filter(Boolean).map(Number);
    const data = (/<Data>([\s\S]*?)<\/Data>/.exec(body) || [])[1].trim();
    let buf;
    if (enc === 'GZipBase64Binary') buf = zlib.inflateSync(Buffer.from(data, 'base64'));
    else if (enc === 'Base64Binary') buf = Buffer.from(data, 'base64');
    else throw new Error('encoding not handled: ' + enc);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const arr = type === 'NIFTI_TYPE_FLOAT32' ? new Float32Array(ab) : type === 'NIFTI_TYPE_INT32' ? new Int32Array(ab) : null;
    if (!arr) throw new Error('type not handled: ' + type);
    arrays.push({ intent, type, dims, order: get('ArrayIndexingOrder'), arr });
  }
  const pts = arrays.find((a) => a.intent === 'NIFTI_INTENT_POINTSET'), tri = arrays.find((a) => a.intent === 'NIFTI_INTENT_TRIANGLE');
  return { vertices: pts && pts.arr, nVertices: pts && pts.dims[0], triangles: tri && tri.arr, nTriangles: tri && tri.dims[0], arrays };
}
module.exports = { readGifti };
if (require.main === module) {
  const g = readGifti(process.argv[2]);
  const v = g.vertices, mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { mins[k] = Math.min(mins[k], v[i + k]); maxs[k] = Math.max(maxs[k], v[i + k]); }
  console.log(JSON.stringify({ nVertices: g.nVertices, nTriangles: g.nTriangles, min: mins.map((x) => +x.toFixed(1)), max: maxs.map((x) => +x.toFixed(1)), intents: g.arrays.map((a) => a.intent + ':' + a.dims.join('x')) }));
}
