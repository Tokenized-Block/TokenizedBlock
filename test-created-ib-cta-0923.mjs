import { readFileSync } from 'fs';
const h = readFileSync('./app.html', 'utf8');
if (!h.includes('data-build="20260923-created-ib-cta"')) throw new Error('tip');
if (!h.includes('tip 20260923-created-ib-cta: restore Instant Birth')) throw new Error('comment');
if (!h.includes('data-tf-act="instant-birth-tb">Instant Birth on TB · 0.001 ETH')) throw new Error('button');
if (h.includes('tip 20260922-2141 MINIMAL: Created unhooked = Open profile / tap to open ONLY')) throw new Error('old 2141 left');
console.log('ok created-ib-cta');
