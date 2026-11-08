/* PoorDown board art: hand-drawn two-tone "sticker" icons on a 32-unit grid.
   Each icon has a darker base for depth, a main fill and a small highlight. */
(function (root) {
  'use strict';
  const svg = (body, label) => `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"${label ? ` data-art="${label}"` : ''}>${body}</svg>`;

  const PLANE = 'M16 3C17.3 3 18.2 4.3 18.2 6V12.2L27.5 17.6C28 17.9 28.3 18.4 28.3 19V20.6L18.2 17.5V23.8L21.2 26V28L16 26.5L10.8 28V26L13.8 23.8V17.5L3.7 20.6V19C3.7 18.4 4 17.9 4.5 17.6L13.8 12.2V6C13.8 4.3 14.7 3 16 3Z';
  const BOLT = 'M19.2 2.8 7.4 17.6h7.3l-2.4 11.6 12.3-16h-7.6z';
  const DROP = 'M16 3.2c4.4 5.6 8.8 10.4 8.8 15.4a8.8 8.8 0 0 1-17.6 0c0-5 4.4-9.8 8.8-15.4z';
  const GEM = 'M9.2 6h13.6l6.2 7.2L16 27.6 3 13.2z';
  const ARROW = 'M4.6 11.6h11.2V7.2c0-1.1 1.3-1.7 2.1-1l10.2 8.9c.6.5.6 1.4 0 1.9L17.9 25.9c-.8.7-2.1.1-2.1-1v-4.4H4.6c-.7 0-1.2-.5-1.2-1.2v-6.5c0-.7.5-1.2 1.2-1.2z';

  // Board icons: Lucide outlines, one colour (the text colour), 2px stroke. No fills, shadows or highlights.
  const line = (body, label) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" data-art="${label}">${body}</svg>`;
  const ART = {
    surprise: line('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>', 'surprise'),
    treasure: line('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>', 'treasure'),
    airport: line('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>', 'airport'),
    power: line('<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>', 'power'),
    water: line('<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>', 'water'),
    incomeTax: line('<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>', 'incomeTax'),
    luxuryTax: line('<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>', 'luxuryTax'),
    start: line('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>', 'start'),
    gotojail: line('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', 'gotojail'),
    vacation: line('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>', 'parking'),
    die: line('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 8h.01M16 16h.01M12 12h.01"/>', 'die'),
  };

  // ---- country flags, drawn on a uniform 3:2 frame (30 x 20)
  const starPts = (cx, cy, r, n, inner) => {
    const pts = [];
    for (let k = 0; k < n * 2; k++) {
      const rr = k % 2 ? r * inner : r, a = -Math.PI / 2 + (k * Math.PI) / n;
      pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="#fff"/>`;
  };
  const UJ = '<rect width="60" height="30" fill="#012169"/><path d="M0 0 60 30M60 0 0 30" stroke="#fff" stroke-width="6"/><path d="M0 0 30 15 29.106 16.789-.894 1.789ZM30 15 60 30 60.894 28.211 30.894 13.211ZM30 15 60 0 59.106-1.789 29.106 13.211ZM30 15 0 30 .894 31.789 30.894 16.789Z" fill="#C8102E"/><path d="M30 0V30M0 15H60" stroke="#fff" stroke-width="10"/><path d="M30 0V30M0 15H60" stroke="#C8102E" stroke-width="6"/>';
  const usStars = (() => {
    let o = '';
    for (let r = 0; r < 9; r++) {
      const odd = r % 2, cols = odd ? 5 : 6;
      for (let c = 0; c < cols; c++) o += `<circle cx="${(1.05 + (odd ? 1.05 : 0) + c * 2.1).toFixed(2)}" cy="${(0.62 + r * 1.19).toFixed(2)}" r=".38" fill="#fff"/>`;
    }
    return o;
  })();
  // A heraldic rose (five petals with sepals between them), drawn at the centre of a 30 x 20 flag.
  const rose = (petal, edge, centre, centreEdge, sepal) => '<g transform="translate(15 10)">'
    + [0, 72, 144, 216, 288].map((a) => `<path d="M0 0 1.2-3.9 0-5.9-1.2-3.9Z" fill="${sepal}" transform="rotate(${a + 36})"/>`).join('')
    + [0, 72, 144, 216, 288].map((a) => `<circle cx="0" cy="-2.55" r="2.35" fill="${petal}" stroke="${edge}" stroke-width=".25" transform="rotate(${a})"/>`).join('')
    + `<circle r="2.2" fill="${petal}"/><circle r="1.15" fill="${centre}" stroke="${centreEdge}" stroke-width=".25"/></g>`;
  const georgeCross = '<rect width="30" height="20" fill="#fff"/><rect x="13" width="4" height="20" fill="#CE1124"/><rect y="8" width="30" height="4" fill="#CE1124"/>';
  // The red dragon of Wales, walking towards the flagpole, with one forepaw raised.
  const dragon = '<g fill="#D30731" stroke="#D30731" stroke-linejoin="round" stroke-linecap="round" transform="scale(.5)">'
    + '<path d="M19.5 23.5Q22 18.4 33 18.2Q44.5 18 46.5 22.8Q47 28 40.5 29.3L25 29.4Q19 28.6 19.5 23.5Z" stroke-width=".6"/>'
    + '<path d="M21.5 23Q17.6 19.4 16.6 14.6L20.6 12.6Q22.4 17.2 26.2 19.8Z" stroke-width=".6"/>'
    + '<path d="M17.2 15.2Q15.6 10.2 10.6 10.6L6.6 11.8L9.8 13.1L6.8 14.6L10.6 15.4Q14.2 16.4 17.2 15.2Z" stroke-width=".6"/>'
    + '<path d="M6.8 13.2 3.4 12.4M3.4 12.4 4.6 11.3M3.4 12.4 4.3 13.6" fill="none" stroke-width=".7"/>'
    + '<path d="M28 19Q23.6 12.6 25.6 5.6Q28.4 8.6 31.2 7.8Q31.6 12.4 32.6 18.6Z" stroke-width=".5"/>'
    + '<path d="M33 18.6Q35.4 10.4 44.6 5Q44.4 9.4 41.6 11.6Q43.8 12.8 41 15.4Q42 17.6 38.6 19.2Z" stroke-width=".5"/>'
    + '<path d="M23.4 27.2 19.6 30.2 17.4 29.4M26.6 29 25.6 34.4 23.2 34.6M38.4 29.2 39.4 34.4 41.8 34.6M43.4 27 46.4 32.2 48.8 32.4" fill="none" stroke-width="2.1"/>'
    + '<path d="M45.4 23.2Q53.4 23.4 53.2 15.4Q53 10.8 48.4 10.6" fill="none" stroke-width="2.1"/>'
    + '<path d="M48.6 7.6 45.6 10.9 49.8 12Z" stroke-width=".5"/>'
    + '<circle cx="13.2" cy="12.4" r=".7" fill="#fff" stroke="none"/></g>';
  const flag = (body, name) => `<svg viewBox="0 0 30 20" preserveAspectRatio="none" role="img" aria-label="Flag of ${name}">${body}</svg>`;
  ART.flags = {
    // Wales: the red dragon on white over green.
    wa: flag('<rect width="30" height="10" fill="#fff"/><rect y="10" width="30" height="10" fill="#00B140"/>' + dragon, 'Wales'),
    // Devon: a centred white cross edged in black, on green.
    dv: flag('<rect width="30" height="20" fill="#00843D"/><rect x="12.4" width="5.2" height="20" fill="#000"/><rect y="7.4" width="30" height="5.2" fill="#000"/><rect x="13.4" width="3.2" height="20" fill="#fff"/><rect y="8.4" width="30" height="3.2" fill="#fff"/>', 'Devon'),
    // Lancashire: the red rose on gold.
    lc: flag('<rect width="30" height="20" fill="#FFCD00"/>' + rose('#DA291C', '#9D2235', '#FFCD00', '#9D2235', '#00B140'), 'Lancashire'),
    // The Midlands: the St George's cross of England.
    md: flag(georgeCross, 'England'),
    // Yorkshire: the white rose on blue.
    yk: flag('<rect width="30" height="20" fill="#0062B4"/>' + rose('#fff', '#C9D3E6', '#F2C230', '#C9952A', '#3E8E3A'), 'Yorkshire'),
    // Scotland: the white saltire on blue.
    sc: flag('<rect width="30" height="20" fill="#005EB8"/><path d="M0 0 30 20M30 0 0 20" stroke="#fff" stroke-width="3.6"/>', 'Scotland'),
    // Lincolnshire: quartered green and blue, a red cross edged in yellow, a yellow fleur-de-lys.
    li: flag('<rect width="15" height="10" fill="#00965E"/><rect x="15" width="15" height="10" fill="#0033A0"/><rect y="10" width="15" height="10" fill="#0033A0"/><rect x="15" y="10" width="15" height="10" fill="#00965E"/>'
      + '<rect x="12.2" width="5.6" height="20" fill="#FFD100"/><rect y="7.2" width="30" height="5.6" fill="#FFD100"/><rect x="13.1" width="3.8" height="20" fill="#C8102E"/><rect y="8.1" width="30" height="3.8" fill="#C8102E"/>'
      + '<g transform="translate(15 10) scale(.43)" fill="#FFD100" stroke="#7A5A00" stroke-width=".35" stroke-linejoin="round"><path d="M0-5.4C1.5-3.9 1.6-1.6 0 .2C-1.6-1.6-1.5-3.9 0-5.4Z"/><path d="M-.5-.2C-1.4-2.9-4.6-3.1-4.6-.6C-4.6 1.1-2.9 1.6-1.9.6C-2.9.5-3.2-.5-2.5-1.1C-1.8-1.6-1-1.1-.5-.2Z"/><path d="M.5-.2C1.4-2.9 4.6-3.1 4.6-.6C4.6 1.1 2.9 1.6 1.9.6C2.9.5 3.2-.5 2.5-1.1C1.8-1.6 1-1.1.5-.2Z"/><rect x="-2.6" y=".3" width="5.2" height="1.2" rx=".4"/><path d="M-1 1.6H1L0 4.6Z"/></g>', 'Lincolnshire'),
    // London: the Union flag, as the capital.
    ln: flag('<g transform="scale(.5 .6667)">' + UJ + '</g>', 'the United Kingdom'),
  };

  // ---- prison cell: plain steel bars. They float above tokens so prisoners appear behind them.
  ART.jailWall = '';
  const BAR_C = [6, 18, 30, 42, 54];
  ART.jailBars = `<svg viewBox="0 0 60 60" preserveAspectRatio="none" aria-hidden="true" fill="currentColor">
    ${BAR_C.map((c) => `<rect x="${c - 1}" y="3" width="2" height="54"/>`).join('')}
    <rect x="0" y="2" width="60" height="2"/><rect x="0" y="56" width="60" height="2"/></svg>`;

  // ---- houses and hotels: classic green house, red hotel; dark outline so they read on any owner colour
  ART.house = `<svg viewBox="0 0 20 20" aria-hidden="true">
    <path d="M10 .9 19.4 9.1 17.7 9.1V19H2.3V9.1H.6Z" fill="#062716"/>
    <rect x="3.9" y="8.6" width="12.2" height="9" fill="#3CD58A"/>
    <rect x="3.9" y="8.6" width="12.2" height="1.4" fill="#2BB873"/>
    <path d="M10 2.9 17.2 8.9H2.8Z" fill="#1E9A5A"/>
    <path d="M10 2.9 13.6 5.9 12.9 6.4 10 4Z" fill="#7FF0B8"/>
    <rect x="8.5" y="12.2" width="3" height="5.4" rx=".7" fill="#0A3A22"/>
    <rect x="5.4" y="11" width="2.2" height="2.2" rx=".4" fill="#D9FFF0"/></svg>`;
  ART.hotel = `<svg viewBox="0 0 30 20" aria-hidden="true">
    <path d="M1 4.2H29V19H1Z" fill="#3A0A10"/>
    <rect x="2.4" y="6.6" width="25.2" height="11" fill="#EF4A55"/>
    <rect x="1.6" y="3.6" width="26.8" height="3.4" rx=".8" fill="#A51F2C"/>
    <rect x="1.6" y="3.6" width="26.8" height="1" rx=".5" fill="#FF8F98"/>
    ${[5, 9, 19, 23].map((x) => `<rect x="${x}" y="8.4" width="2.4" height="2.4" rx=".4" fill="#FFE7A3"/><rect x="${x}" y="12.4" width="2.4" height="2.4" rx=".4" fill="#FFE7A3"/>`).join('')}
    <rect x="13" y="10.6" width="4" height="7" rx=".8" fill="#4A0D14"/>
    <rect x="12.2" y="9.2" width="5.6" height="1.2" rx=".5" fill="#FFD46B"/></svg>`;

  // ---- one-colour building glyphs for the ownership slot (take the text colour)
  ART.houseGlyph = `<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M10 1.8 19.2 9.6h-2.8V18.4H3.6V9.6H.8Zm-1.7 16.6h3.4v-5.1H8.3Z"/><path fill="currentColor" d="M14 3.2h2.2v4.1L14 5.4Z"/></svg>`;
  ART.hotelGlyph = `<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M1.6 1.8h16.8v3H1.6ZM3 5.6h14v12.8H3Zm2.2 2.2v2.2h2.4V7.8Zm3.6 0v2.2h2.4V7.8Zm3.6 0v2.2h2.4V7.8Zm-7.2 3.6v2.2h2.4v-2.2Zm7.2 0v2.2h2.4v-2.2ZM8.7 18.4h2.6v-4.9H8.7Z"/></svg>`;
  root.BoomArt = ART;
})(typeof window !== 'undefined' ? window : globalThis);
