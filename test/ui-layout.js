'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...css.matchAll(new RegExp(escaped + '\\s*\\{([^{}]*)\\}', 'g'))];
  assert.equal(matches.length, 1, `Expected exactly one CSS rule for: ${selector}`);
  return matches[0][1];
}

function assertDeclaration(selector, declaration) {
  assert.match(ruleBody(selector), declaration, `Missing ${declaration} in ${selector}`);
}

function checkBalancedCss(source) {
  let depth = 0;
  let quote = null;
  let comment = false;
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i], next = source[i + 1];
    if (comment) {
      if (ch === '*' && next === '/') { comment = false; i++; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\\\') { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '*') { comment = true; i++; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      assert.ok(depth >= 0, 'CSS contains an unmatched closing brace');
    }
  }
  assert.equal(depth, 0, 'CSS contains unclosed blocks');
  assert.equal(comment, false, 'CSS contains an unclosed comment');
  assert.equal(quote, null, 'CSS contains an unclosed string');
}

checkBalancedCss(css);

// Long titles must wrap at spaces, never break a final character onto its own line.
assertDeclaration('.postcard .pc-city.long', /white-space:\\s*normal/);
assertDeclaration('.postcard .pc-city.long', /overflow-wrap:\\s*normal/);
assertDeclaration('.postcard .pc-city.long', /word-break:\\s*normal/);
assertDeclaration('.auction-property .pc-city', /white-space:\\s*normal/);
assertDeclaration('.auction-property .pc-city', /overflow-wrap:\\s*normal/);
assertDeclaration('.auction-property .pc-city.long', /font-size:\\s*clamp\\(10px/);

// The prison options have enough width for their labels, on narrow and wide screens.
assertDeclaration('.jail-routes', /grid-template-columns:\\s*minmax\\(0,\\s*1fr\\)/);
assertDeclaration('.jail-route', /grid-template-columns:\\s*30px\\s+minmax\\(0,\\s*1fr\\)/);
assertDeclaration('.jail-route', /min-width:\\s*0/);

// The prison sheet must remain inside the viewport and scroll its own content.
assertDeclaration('#modal > .sheet.deed.plain.space-jail', /max-height:\\s*calc\\(100dvh\\s*-\\s*48px\\)/);
assertDeclaration('#modal > .sheet.deed.plain.space-jail', /overflow-y:\\s*auto/);
assertDeclaration('#modal > .sheet.deed.plain.space-jail .deed-head', /position:\\s*sticky/);

// Ensure the UI markup and the CSS remain connected.
assert.match(app, /class="jail-info"/);
assert.match(app, /class="jail-status"/);
assert.match(app, /class="jail-routes"/);
assert.match(app, /class="jail-reminder"/);
assert.match(app, /const longName = t\\.name\\.length > 14/);
assert.match(app, /pc-city \\${longName \\? 'long' : ''\\}/);

console.log('UI layout regression checks passed.');
