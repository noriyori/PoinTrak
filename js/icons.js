/* ============================================================
   icons.js — lightweight inline SVG icon set (SF Symbols–style)
   Replaces default emoji with clean, consistent line icons.
   Usage: icon("bed"), icon("plane", { cls: "lg" })
   ============================================================ */

const ICONS = {
  // item types
  bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3"/>',
  ticket: '<path d="M2 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-4.5"/>',
  circle: '<circle cx="12" cy="12" r="8.5"/>',

  // travel modes
  car: '<path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13"/><path d="M5 13h14a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1"/><path d="M6 18H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>',
  train: '<rect x="5" y="3" width="14" height="13" rx="3"/><path d="M5 10h14"/><path d="M9 16l-2 4M15 16l2 4"/><circle cx="9" cy="13" r=".6" fill="currentColor" stroke="none"/><circle cx="15" cy="13" r=".6" fill="currentColor" stroke="none"/>',
  plane: '<path d="M10.5 19.5 9 22l-1.2-.4.6-3.3-3.6-2.1-2.4 1-.9-.9 2-2.7-1-2.3.9-.5 2.2 1.2 3.2-2.9.9-3.6 1-.3 0 3.8 3.4-3.1c.7-.6 1.7-.6 2.2.2.5.7.3 1.6-.4 2.2L15 13.6l.1 3.9-.5 0-2.4-2.9-2.7 2.4Z"/>',
  bike: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l4-7h5"/><path d="M10 10 8 7H6"/><path d="m15 10 3 7"/><circle cx="15" cy="6" r="1"/>',
  walk: '<circle cx="12" cy="4" r="1.4"/><path d="M11 21l1.2-5.5L10 13V9l3 .8 2 2.2"/><path d="M12.2 15.5 15 18l1 3"/><path d="M10 9 7 10l-1 3"/>',

  // tabs / sections
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M9.5 21v-6h5v6"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/>',
  map: '<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
  sparkles: '<path d="M12 3.5 13.6 8 18 9.5 13.6 11 12 15.5 10.4 11 6 9.5 10.4 8 12 3.5Z"/><path d="M18.5 14.5 19.4 17l2.6.9-2.6.9-.9 2.5-.9-2.5L15 17.9l2.6-.9.9-2.5Z"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H14a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h5.5"/>',
  city: '<path d="M3 21h18"/><path d="M6 21V8l5-3 5 3v13"/><path d="M16 21V11l3 2v8"/><path d="M9 9h.01M9 12h.01M9 15h.01M13 9h.01M13 12h.01M13 15h.01"/>',

  // detail glyphs
  pin: '<path d="M12 21s-6.5-5.7-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.3 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3 1.8"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5a13 13 0 0 1 0 17 13 13 0 0 1 0-17Z"/>',
  link: '<path d="M9 15l6-6"/><path d="M11 7l1-1a4 4 0 0 1 6 6l-1 1"/><path d="M13 17l-1 1a4 4 0 0 1-6-6l1-1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13a1.6 1.6 0 0 0 .3 1.8 2 2 0 1 1-2.7 2.9 1.6 1.6 0 0 0-2.7 1.1 2 2 0 1 1-4 0 1.6 1.6 0 0 0-2.7-1.1 2 2 0 1 1-2.7-2.9A1.6 1.6 0 0 0 4.6 13a2 2 0 1 1 0-2 1.6 1.6 0 0 0-.3-1.8 2 2 0 1 1 2.7-2.9A1.6 1.6 0 0 0 9.7 5.3a2 2 0 1 1 4 0 1.6 1.6 0 0 0 2.7 1.1 2 2 0 1 1 2.7 2.9 1.6 1.6 0 0 0 .3 1.8 2 2 0 1 1 0 2Z"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.2 3.5L17 11H5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.1 5.1l1.8 1.8M17.1 17.1l1.8 1.8M18.9 5.1l-1.8 1.8M6.9 17.1l-1.8 1.8"/>',
  moon: '<path d="M20.5 13A8.5 8.5 0 1 1 11 3.5 6.6 6.6 0 0 0 20.5 13Z"/>',
  arrive: '<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
  depart: '<path d="M12 20V9"/><path d="m7 13 5-5 5 5"/><path d="M5 4h14"/>',
  hourglass: '<path d="M6 3h12M6 21h12"/><path d="M17 3v3.5a2 2 0 0 1-.6 1.4L13 12l3.4 4.1a2 2 0 0 1 .6 1.4V21"/><path d="M7 3v3.5a2 2 0 0 0 .6 1.4L11 12l-3.4 4.1a2 2 0 0 0-.6 1.4V21"/>',
  comment: '<path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z"/>',
  star: '<path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.6 6.8 19.2l1-5.8L3.5 9.2l5.9-.9L12 3Z"/>',
  seat: '<path d="M5 5v7a3 3 0 0 0 3 3h6"/><path d="M5 19h11a3 3 0 0 0 3-3v-1a2 2 0 0 0-2-2"/><path d="M9 5h3a2 2 0 0 1 2 2v5"/>',
  ticketAlt: '<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4Z"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.3"/>',
  images: '<rect x="3" y="3" width="14" height="14" rx="2.5"/><circle cx="8" cy="8" r="1.4"/><path d="m3 13 3.5-3 4 3.5"/><path d="M21 8v11a2 2 0 0 1-2 2H8"/>',
};

/** Render an inline SVG icon. Sizes to 1em by default (control via font-size). */
function icon(name, opts = {}) {
  const path = ICONS[name];
  if (!path) return "";
  const cls = "ico" + (opts.cls ? " " + opts.cls : "");
  const sw = opts.weight || 1.8;
  return (
    `<svg class="${cls}" viewBox="0 0 24 24" width="1em" height="1em" fill="none" ` +
    `stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
  );
}
