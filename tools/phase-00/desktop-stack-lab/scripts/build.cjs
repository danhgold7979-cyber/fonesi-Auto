require('./verify-dependencies.cjs');
const { buildSync } = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
fs.mkdirSync('build', {recursive:true});
for (const entry of ['main','preload','contracts']) buildSync({entryPoints:[`src/${entry}.ts`],
  outfile:`build/${entry}.cjs`, bundle:true, platform:'node', format:'cjs', target:'node24', external:['electron']});
buildSync({entryPoints:['src/renderer.tsx'],outfile:'build/renderer.js',bundle:true,platform:'browser',
  format:'iife',target:'chrome150',define:{'process.env.NODE_ENV':'"production"'}});
const csp="default-src 'none'; script-src 'self'; style-src 'none'; img-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
fs.writeFileSync('build/index.html', `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Disposable lab</title></head><body><div id="root"></div><script src="renderer.js"></script></body></html>`);
fs.writeFileSync('build/untrusted.html', `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body>Untrusted synthetic sender</body></html>`);
fs.writeFileSync('build/THIRD_PARTY_NOTICES.txt',['react','react-dom','scheduler'].map(name =>
  `${name}\n${fs.readFileSync(path.join('node_modules',name,'LICENSE'),'utf8')}`).join('\n\n'));
console.log('PASS LAB_BUILD');
