// Builds UnOfficial into one HTML file (scripts and styles inlined) at ../public/unofficial/index.html.
// Run from this folder:  npm install && npm run build
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const out = path.join(__dirname, '..', 'public', 'unofficial', 'index.html');
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'unofficial-'));

execFileSync(process.execPath, [require.resolve('tailwindcss/lib/cli.js'), '-c', 'tailwind.config.js', '-i', 'src/index.css', '-o', path.join(tmp, 'app.css'), '--minify'], { cwd: __dirname, stdio: 'inherit' });
esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'src', 'main.jsx')],
  bundle: true, minify: true, format: 'iife', jsx: 'automatic',
  loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"production"' },
  outfile: path.join(tmp, 'app.js'),
  logLevel: 'warning',
});
const css = fs.readFileSync(path.join(tmp, 'app.css'), 'utf8');
const js = fs.readFileSync(path.join(tmp, 'app.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>UnOfficial · College Portal</title><meta name="theme-color" content="#E8E2D6"><style>${css}</style></head>
<body><div id="root"></div><script>${js}</script></body></html>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Wrote ${path.relative(process.cwd(), out)} (${Math.round(html.length / 1024)} KB)`);
