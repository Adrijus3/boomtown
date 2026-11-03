/* Boomtown board art: hand-drawn two-tone "sticker" icons on a 32-unit grid.
   Each icon has a darker base for depth, a main fill and a small highlight. */
(function (root) {
  'use strict';
  const svg = (body, label) => `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"${label ? ` data-art="${label}"` : ''}>${body}</svg>`;

  const PLANE = 'M16 3C17.3 3 18.2 4.3 18.2 6V12.2L27.5 17.6C28 17.9 28.3 18.4 28.3 19V20.6L18.2 17.5V23.8L21.2 26V28L16 26.5L10.8 28V26L13.8 23.8V17.5L3.7 20.6V19C3.7 18.4 4 17.9 4.5 17.6L13.8 12.2V6C13.8 4.3 14.7 3 16 3Z';
  const BOLT = 'M19.2 2.8 7.4 17.6h7.3l-2.4 11.6 12.3-16h-7.6z';
  const DROP = 'M16 3.2c4.4 5.6 8.8 10.4 8.8 15.4a8.8 8.8 0 0 1-17.6 0c0-5 4.4-9.8 8.8-15.4z';
  const GEM = 'M9.2 6h13.6l6.2 7.2L16 27.6 3 13.2z';
  const ARROW = 'M4.6 11.6h11.2V7.2c0-1.1 1.3-1.7 2.1-1l10.2 8.9c.6.5.6 1.4 0 1.9L17.9 25.9c-.8.7-2.1.1-2.1-1v-4.4H4.6c-.7 0-1.2-.5-1.2-1.2v-6.5c0-.7.5-1.2 1.2-1.2z';

  const ART = {
    surprise: svg(`<g transform="rotate(-8 16 16)">
      <rect x="5" y="6.8" width="22" height="22" rx="6.5" fill="#A8326F"/>
      <rect x="5" y="5" width="22" height="22" rx="6.5" fill="#F062A5"/>
      <path d="M8.6 10q.9-2.3 3.4-2.6" stroke="#FFC2DE" stroke-width="1.6" stroke-linecap="round" fill="none"/>
      <path d="M12.7 13.1c0-2.2 1.6-3.7 3.6-3.7s3.6 1.4 3.6 3.2c0 1.5-.9 2.3-2 3-.9.6-1.4 1.1-1.4 2.1v.5" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <circle cx="16.5" cy="22.3" r="1.85" fill="#fff"/></g>`, 'surprise'),

    treasure: svg(`<rect x="4.5" y="13.8" width="23" height="14.4" rx="3" fill="#8A560F"/>
      <rect x="4.5" y="12" width="23" height="14.4" rx="3" fill="#E39A2D"/>
      <path d="M4.5 13.5v-2A6.5 6.5 0 0 1 11 5h10a6.5 6.5 0 0 1 6.5 6.5v2z" fill="#F7C25E"/>
      <rect x="4.5" y="12.4" width="23" height="2.2" fill="#A86A16"/>
      <rect x="9.5" y="5.4" width="2.6" height="21" fill="#A86A16"/>
      <rect x="19.9" y="5.4" width="2.6" height="21" fill="#A86A16"/>
      <rect x="13.2" y="10.4" width="5.6" height="7" rx="1.6" fill="#FFF4D8"/>
      <path d="M16 12.7v2.4" stroke="#8A560F" stroke-width="1.7" stroke-linecap="round"/>
      <path d="M7.4 9.6q1.1-2.3 3.5-2.7" stroke="#FFE6AE" stroke-width="1.4" stroke-linecap="round" fill="none"/>`, 'treasure'),

    airport: svg(`<g transform="rotate(45 16 16)">
      <path d="${PLANE}" fill="#6F7DA0" transform="translate(1.3 1.3)"/>
      <path d="${PLANE}" fill="#E4EAF7"/>
      <path d="M16 5.2v8" stroke="#A9B8D8" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M19.6 14.6l6.2 3.6" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round" opacity=".9"/></g>`, 'airport'),

    power: svg(`<path d="${BOLT}" fill="#B9781B" transform="translate(.6 1.8)"/>
      <path d="${BOLT}" fill="#FFD23F"/>
      <path d="M17.6 6.6l-6.8 9" stroke="#FFF3B0" stroke-width="1.6" stroke-linecap="round"/>`, 'power'),

    water: svg(`<path d="${DROP}" fill="#2668B8" transform="translate(0 1.7)"/>
      <path d="${DROP}" fill="#4FB3FF"/>
      <path d="M11.6 18.6a4.6 4.6 0 0 0 3.2 4.4" stroke="#DDF2FF" stroke-width="2.1" stroke-linecap="round" fill="none"/>`, 'water'),

    incomeTax: svg(`${[21.5, 16.5, 11.5].map((y, k) => `
      <ellipse cx="16" cy="${y + 3.2}" rx="9.5" ry="3.7" fill="#9A6A12"/>
      <rect x="6.5" y="${y}" width="19" height="3.2" fill="#9A6A12"/>
      <ellipse cx="16" cy="${y}" rx="9.5" ry="3.7" fill="${k === 2 ? '#FFD467' : '#F2BC48'}"/>
      <ellipse cx="16" cy="${y}" rx="6.3" ry="2.3" fill="none" stroke="#D2961E" stroke-width="1.2"/>`).join('')}
      <path d="M16 9.9v3.2" stroke="#9A6A12" stroke-width="1.5" stroke-linecap="round"/>`, 'incomeTax'),

    luxuryTax: svg(`<path d="${GEM}" fill="#1F7F9B" transform="translate(0 1.6)"/>
      <path d="${GEM}" fill="#46C2E0"/>
      <path d="M9.2 6h13.6l6.2 7.2H3z" fill="#8FE3F5"/>
      <path d="M12.6 6h6.8l2 7.2h-10.8z" fill="#CFF6FD"/>
      <path d="M10.8 13.2h10.4L16 27.6z" fill="#2FA9CA"/>
      <path d="M6.4 9.8l1.8-2" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>`, 'luxuryTax'),

    start: svg(`<path d="${ARROW}" fill="#1E8A5E" transform="translate(0 1.8)"/>
      <path d="${ARROW}" fill="#4AD69B"/>
      <path d="M6 14.2h9" stroke="#C6F7E1" stroke-width="1.6" stroke-linecap="round"/>`, 'start'),

    gotojail: svg(`<path d="M10.4 14.5V10.6a5.6 5.6 0 0 1 11.2 0v3.9" stroke="#7D89A8" stroke-width="3.6" fill="none" stroke-linecap="round" transform="translate(0 1)"/>
      <path d="M10.4 14.5V10.6a5.6 5.6 0 0 1 11.2 0v3.9" stroke="#D5DCEC" stroke-width="3.6" fill="none" stroke-linecap="round"/>
      <rect x="6" y="15.4" width="20" height="13.6" rx="4" fill="#A93434"/>
      <rect x="6" y="13.6" width="20" height="13.6" rx="4" fill="#FF6E6E"/>
      <circle cx="16" cy="19.4" r="2.3" fill="#5A1414"/>
      <rect x="14.9" y="19.6" width="2.2" height="4.4" rx="1.1" fill="#5A1414"/>
      <path d="M8.8 16.4h4" stroke="#FFC0C0" stroke-width="1.4" stroke-linecap="round"/>`, 'gotojail'),

    vacation: svg(`<path d="M2.8 27.4c4.2-3.4 22.2-3.4 26.4 0V29H2.8z" fill="#E9C246"/>
      <path d="M15.4 11.5l2.6 15.2" stroke="#DCE3F2" stroke-width="1.8" stroke-linecap="round"/>
      <g transform="rotate(-10 15 12)">
        <path d="M3.5 13.4C4.4 7.6 9.4 3.6 15 3.6s10.6 4 11.5 9.8c-1.9-1-3.8-1-5.7 0-1.9-1-3.9-1-5.8 0-1.9-1-3.9-1-5.8 0-1.9-1-3.8-1-5.7 0z" fill="#B23C78" transform="translate(0 1.4)"/>
        <path d="M3.5 13.4C4.4 7.6 9.4 3.6 15 3.6s10.6 4 11.5 9.8c-1.9-1-3.8-1-5.7 0-1.9-1-3.9-1-5.8 0-1.9-1-3.9-1-5.8 0-1.9-1-3.8-1-5.7 0z" fill="#F062A5"/>
        <path d="M9.2 13.4C9.4 8.6 11.8 5 15 3.6c-1.4 2.6-2.1 6-2.1 9.8-1.2-.6-2.5-.6-3.7 0z" fill="#FFFFFF"/>
        <path d="M20.8 13.4C20.6 8.6 18.2 5 15 3.6c1.4 2.6 2.1 6 2.1 9.8 1.2-.6 2.5-.6 3.7 0z" fill="#FFFFFF"/></g>`, 'vacation'),

    die: svg(`<rect x="4" y="5.6" width="24" height="24" rx="6" fill="#B9C2D8"/>
      <rect x="4" y="4" width="24" height="24" rx="6" fill="#FFFFFF"/>
      <circle cx="10.5" cy="10.5" r="2.2" fill="#161B2A"/><circle cx="16" cy="16" r="2.2" fill="#161B2A"/><circle cx="21.5" cy="21.5" r="2.2" fill="#161B2A"/>`, 'die'),
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
  const UJ = '<path d="M0 0L60 30M60 0L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0L60 30M60 0L0 30" stroke="#C8102E" stroke-width="2"/><path d="M30 0V30M0 15H60" stroke="#fff" stroke-width="10"/><path d="M30 0V30M0 15H60" stroke="#C8102E" stroke-width="6"/>';
  const usStars = (() => {
    let o = '';
    for (let r = 0; r < 9; r++) {
      const odd = r % 2, cols = odd ? 5 : 6;
      for (let c = 0; c < cols; c++) o += `<circle cx="${(1.05 + (odd ? 1.05 : 0) + c * 2.1).toFixed(2)}" cy="${(0.62 + r * 1.19).toFixed(2)}" r=".38" fill="#fff"/>`;
    }
    return o;
  })();
  const flag = (body, name) => `<svg viewBox="0 0 30 20" preserveAspectRatio="none" role="img" aria-label="Flag of ${name}">${body}</svg>`;
  ART.flags = {
    ma: flag('<rect width="30" height="20" fill="#C1272D"/><path d="M15 5.9L17.59 13.86L10.82 8.94H19.18L12.41 13.86Z" fill="none" stroke="#006233" stroke-width="1" stroke-linejoin="round"/>', 'Morocco'),
    pt: flag('<rect width="12" height="20" fill="#046A38"/><rect x="12" width="18" height="20" fill="#DA291C"/><circle cx="12" cy="10" r="3.6" fill="none" stroke="#FFE11A" stroke-width="1.1"/><path d="M10.6 8.1h2.8v2.6a1.4 1.4 0 0 1-2.8 0z" fill="#fff" stroke="#DA291C" stroke-width=".55"/><circle cx="12" cy="9.9" r=".5" fill="#003399"/>', 'Portugal'),
    mx: flag('<rect width="10" height="20" fill="#006847"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#CE1126"/><path d="M12.6 10.6a2.6 2.6 0 0 0 4.8 0" fill="none" stroke="#5E8C3A" stroke-width=".7" stroke-linecap="round"/><path d="M13.6 9.6q.9-2.2 2.6-1.1.6.8-.2 1.9-.9.9-1.7.3z" fill="#8A5A2B"/>', 'Mexico'),
    es: flag('<rect width="30" height="20" fill="#AA151B"/><rect y="5" width="30" height="10" fill="#F1BF00"/><rect x="6.3" y="7.6" width=".7" height="4.2" fill="#BDBDBD"/><rect x="11.1" y="7.6" width=".7" height="4.2" fill="#BDBDBD"/><path d="M7.5 7.8h3.2v2.6a1.6 1.6 0 0 1-3.2 0z" fill="#AA151B"/><path d="M8.4 8.6h1.4v1.6a.7.7 0 0 1-1.4 0z" fill="#F1BF00" opacity=".75"/><path d="M7.6 7.4h3l-.3-.9h-2.4z" fill="#C8A04A"/>', 'Spain'),
    jp: flag('<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#BC002D"/>', 'Japan'),
    au: flag('<rect width="30" height="20" fill="#012169"/><g transform="scale(.25 .3333)">' + UJ + '</g>' + starPts(7.5, 15, 2.1, 7, 0.45) + starPts(22.5, 16.4, 1.15, 7, 0.45) + starPts(22.5, 4.2, 1.15, 7, 0.45) + starPts(18.7, 8.6, 1.1, 7, 0.45) + starPts(26.1, 7.5, 1.1, 7, 0.45) + starPts(24.4, 10.9, .6, 5, 0.45), 'Australia'),
    li: flag('<rect width="15" height="10" fill="#00965E"/><rect x="15" width="15" height="10" fill="#0033A0"/><rect y="10" width="15" height="10" fill="#0033A0"/><rect x="15" y="10" width="15" height="10" fill="#00965E"/>'
      + '<rect x="12.2" width="5.6" height="20" fill="#FFD100"/><rect y="7.2" width="30" height="5.6" fill="#FFD100"/><rect x="13.1" width="3.8" height="20" fill="#C8102E"/><rect y="8.1" width="30" height="3.8" fill="#C8102E"/>'
      + '<g transform="translate(15 10) scale(.43)" fill="#FFD100" stroke="#7A5A00" stroke-width=".35" stroke-linejoin="round"><path d="M0-5.4C1.5-3.9 1.6-1.6 0 .2C-1.6-1.6-1.5-3.9 0-5.4Z"/><path d="M-.5-.2C-1.4-2.9-4.6-3.1-4.6-.6C-4.6 1.1-2.9 1.6-1.9.6C-2.9.5-3.2-.5-2.5-1.1C-1.8-1.6-1-1.1-.5-.2Z"/><path d="M.5-.2C1.4-2.9 4.6-3.1 4.6-.6C4.6 1.1 2.9 1.6 1.9.6C2.9.5 3.2-.5 2.5-1.1C1.8-1.6 1-1.1.5-.2Z"/><rect x="-2.6" y=".3" width="5.2" height="1.2" rx=".4"/><path d="M-1 1.6H1L0 4.6Z"/></g>', 'Lincolnshire'),
    yk: flag('<rect width="30" height="20" fill="#0062B4"/><g transform="translate(15 10)">'
      + [0, 72, 144, 216, 288].map((a) => `<path d="M0 0 1.2-3.9 0-5.9-1.2-3.9Z" fill="#3E8E3A" transform="rotate(${a + 36})"/>`).join('')
      + [0, 72, 144, 216, 288].map((a) => `<circle cx="0" cy="-2.55" r="2.35" fill="#fff" stroke="#C9D3E6" stroke-width=".25" transform="rotate(${a})"/>`).join('')
      + '<circle r="2.2" fill="#fff"/><circle r="1.15" fill="#F2C230" stroke="#C9952A" stroke-width=".25"/></g>', 'Yorkshire'),
  };

  // ---- prison cell: plain steel bars. They float above tokens so prisoners appear behind them.
  ART.jailWall = '';
  const BAR_C = [6, 18, 30, 42, 54];
  ART.jailBars = `<svg viewBox="0 0 60 60" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="bt-bv" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7B87A6"/><stop offset=".4" stop-color="#D3DAEA"/><stop offset="1" stop-color="#6A7594"/></linearGradient></defs>
    ${BAR_C.map((c) => `<rect x="${c - 1.5}" y="3" width="3" height="54" rx="1.5" fill="url(#bt-bv)"/>`).join('')}
    <rect x="0" y="1.6" width="60" height="3" rx="1.2" fill="#A9B3CC"/>
    <rect x="0" y="55.4" width="60" height="3" rx="1.2" fill="#A9B3CC"/></svg>`;

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
