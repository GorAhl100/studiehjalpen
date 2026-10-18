"use strict";
// Studiehjälpen, Övningsappen (testversion).
// Allt sparas lokalt i telefonen. Material och resultat flyttas med länkar (#m=… och #r=…).

// ---------- Hjälpare ----------
const app = document.getElementById("app");

function h(tagg, attr = {}, ...barn) {
  const el = document.createElement(tagg);
  for (const [k, v] of Object.entries(attr)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const b of barn.flat()) if (b !== null && b !== undefined && b !== false) el.append(b);
  return el;
}
function visa(...delar) { app.replaceChildren(...delar.filter((d) => d != null && d !== false)); window.scrollTo(0, 0); }
const blanda = (lista) => { const a = [...lista]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const nyttId = () => Math.random().toString(36).slice(2, 10);

// ---------- Lagring ----------
const NYCKEL = "studiehjalpen.v1";
const tomtLager = () => ({ profiler: [], material: {}, framsteg: {}, belöning: {}, papperskorg: {}, importerade: [], inställningar: {} });
let lager = tomtLager();
try { lager = { ...tomtLager(), ...JSON.parse(localStorage.getItem(NYCKEL) || "{}") }; } catch {}
function spara() { try { localStorage.setItem(NYCKEL, JSON.stringify(lager)); } catch {} }

const GÄST = { id: "gäst", namn: "Gäst", avatar: "🙂", språk: "en", uppläsning: "manuell", tema: "sol", ljud: true };
let profil = null; // aktiv profil
const materialFör = (pid) => (lager.material[pid] ??= []);
const framstegFör = (pid) => (lager.framsteg[pid] ??= {});
const papperskorgFör = (pid) => (lager.papperskorg[pid] ??= []);

// ---------- Teman ----------
// Varje tema är ett [data-tema]-block i style.css. Ett nytt tema = ett nytt block + en rad här.
const TEMAN = { sol: "☀️ Sol", hav: "🌊 Hav", skog: "🌲 Skog", rymd: "🚀 Rymd" };
function aktivera(p) {
  profil = p;
  document.body.dataset.tema = TEMAN[p?.tema] ? p.tema : "sol";
}

// ---------- Belöningar (utbytbar modul) ----------
// Ett annat belöningssystem = en ny implementation med samma tre funktioner.
const Belöning = {
  KLISTERMÄRKEN: ["🦄", "🐙", "🦖", "🐢", "🦊", "🐼", "🚀", "🌈", "🍕", "⚽", "🎸", "🦋", "🐳", "🌵", "🍩", "🐝", "🦁", "🎈", "🏰", "🐧"],
  stjärnorFör(rätt, totalt) {
    const andel = totalt ? rätt / totalt : 0;
    return andel >= 0.9 ? 3 : andel >= 0.7 ? 2 : 1;
  },
  ge(pid, stjärnor, nyaKan = 0) {
    const b = (lager.belöning[pid] ??= { stjärnor: 0, album: [] });
    const nya = [];
    const föreTio = Math.floor(b.stjärnor / 10);
    b.stjärnor += stjärnor;
    const antal = Math.floor(b.stjärnor / 10) - föreTio + nyaKan;
    for (let i = 0; i < antal; i++) {
      const m = this.KLISTERMÄRKEN[b.album.length % this.KLISTERMÄRKEN.length];
      b.album.push(m); nya.push(m);
    }
    return nya;
  },
  status(pid) { return lager.belöning[pid] ?? { stjärnor: 0, album: [] }; },
  tillNästa(pid) { return 10 - (this.status(pid).stjärnor % 10); },
};

// ---------- Nivåer ----------
// 0 Ny, 1 Lär sig, 2 Kan nästan, 3 Kan!
const NIVÅER = [
  { namn: "Ny", ikon: "🥚", alternativ: 3, uppEfter: 2 },
  { namn: "Lär sig", ikon: "🐣", alternativ: 4, uppEfter: 3 },
  { namn: "Kan nästan", ikon: "🐥", alternativ: 5, uppEfter: 3 },
  { namn: "Kan!", ikon: "🦅", alternativ: 6, uppEfter: Infinity },
];
function registrera(pid, nyckel, ok) {
  const f = framstegFör(pid);
  const p = (f[nyckel] ??= { nivå: 0, iRad: 0, rätt: 0, fel: 0 });
  const föreNivå = p.nivå;
  if (ok) {
    p.rätt++; p.iRad++;
    if (p.iRad >= NIVÅER[p.nivå].uppEfter) { p.nivå = Math.min(3, p.nivå + 1); p.iRad = 0; }
  } else {
    p.fel++; p.iRad = 0; p.nivå = Math.max(0, p.nivå - 1);
  }
  return { blevKan: föreNivå < 3 && p.nivå === 3 };
}

// ---------- Uppläsning ----------
const RÖSTSPRÅK = { sv: "sv-SE", en: "en-GB", es: "es-ES", tyska: "de-DE", franska: "fr-FR", italienska: "it-IT", finska: "fi-FI", norska: "nb-NO", danska: "da-DK", arabiska: "ar-SA", kinesiska: "zh-CN" };
let röster = [];
function laddaRöster() { röster = speechSynthesis?.getVoices?.() ?? []; }
if ("speechSynthesis" in window) { laddaRöster(); speechSynthesis.onvoiceschanged = laddaRöster; }
// iPhone har många röster per språk, en del är skämtröster eller låter robotaktigt. De sorteras bort.
const DÅLIGA_RÖSTER = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Kathy|Ralph|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i;
const BRA_RÖSTER = /^(Daniel|Kate|Serena|Arthur|Martha|Samantha|Ava|Alex|Allison|Tom|Evan|Nathan|Zoe|Karen|Moira|Tessa|M[oó]nica|Paulina|Jorge|Marisol|Alva|Klara|Oskar)\b/i;
function röstKandidater(kod) {
  const lang = RÖSTSPRÅK[kod] || kod;
  const prefix = lang.slice(0, 2).toLowerCase();
  const poäng = (r) => (r.lang.replace("_", "-") === lang ? 3 : 0)
    + (/enhanced|premium|förbättrad|siri/i.test(r.name) ? 5 : 0)
    + (BRA_RÖSTER.test(r.name) ? 4 : 0)
    + (DÅLIGA_RÖSTER.test(r.name) ? -20 : 0)
    + (r.localService ? 1 : 0);
  return röster.filter((r) => r.lang.toLowerCase().startsWith(prefix)).sort((a, b) => poäng(b) - poäng(a));
}
function röstFör(kod) {
  const vald = lager.inställningar.röster?.[kod];
  const kandidater = röstKandidater(kod);
  return kandidater.find((r) => r.voiceURI === vald) || kandidater[0] || null;
}
function läsUpp(text, kod) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = RÖSTSPRÅK[kod] || kod;
  const r = röstFör(kod); if (r) u.voice = r;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}
const lyssnaKnapp = (text, kod) => h("button", { class: "lyssna", "aria-label": "Läs upp", onclick: (e) => { e.stopPropagation(); läsUpp(text, kod); } }, "🔊");

// ---------- Packa och packa upp länkar ----------
function b64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function frånB64url(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function packa(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === "function") {
    const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return "z" + b64url(new Uint8Array(await new Response(s).arrayBuffer()));
  }
  return "j" + b64url(bytes);
}
async function packaUpp(kod) {
  kod = kod.trim();
  let bytes = frånB64url(kod.slice(1));
  if (kod[0] === "z") {
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    bytes = new Uint8Array(await new Response(s).arrayBuffer());
  } else if (kod[0] !== "j") throw new Error("okänd kod");
  return JSON.parse(new TextDecoder().decode(bytes));
}
const appAdress = () => location.href.replace(/#.*$/, "");

// ---------- Övningsfrågor ----------
// Varje material blir en lista "kort". Ett kort vet hur det ska ställas som fråga på en viss nivå.
// Nyckeln bygger på glosans/frågans id, så att framstegen följer med när listan ändras.
// Äldre material saknar id och använder platsen i listan, vilket ger samma nyckel som förut.
function kortFör(m) {
  if (m.typ === "glosor") {
    return m.glosor.map((g, i) => ({ nyckel: `${m.id}:${g.id ?? i}`, glosa: g })).filter((k) => !k.glosa.dold);
  }
  return m.fragor.map((f, i) => ({ nyckel: `${m.id}:${f.id ?? i}`, fråga: f })).filter((k) => !k.fråga.dold);
}
function geId(m) {
  m.glosor?.forEach((g, i) => { g.id ??= String(i); });
  m.fragor?.forEach((f, i) => { f.id ??= String(i); });
  return m;
}

// Hur lika två svar ser ut. Används för att välja svårare felalternativ på högre nivåer.
const ARTIKEL = /^(el|la|los|las|the|a|an) /i;
function avstånd(a, b) {
  const rad = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let förra = rad[0]; rad[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = rad[j];
      rad[j] = Math.min(rad[j] + 1, rad[j - 1] + 1, förra + (a[i - 1] === b[j - 1] ? 0 : 1));
      förra = tmp;
    }
  }
  return rad[b.length];
}
function likhet(a, b) {
  const x = a.toLowerCase(), y = b.toLowerCase();
  const ax = x.match(ARTIKEL)?.[1], ay = y.match(ARTIKEL)?.[1];
  const kx = x.replace(ARTIKEL, ""), ky = y.replace(ARTIKEL, "");
  return (ax && ax === ay ? 2 : 0) + (kx[0] === ky[0] ? 2 : 0) + (kx.slice(-2) === ky.slice(-2) ? 1 : 0)
    + Math.max(0, 3 - Math.abs(kx.length - ky.length)) + Math.max(0, 4 - avstånd(kx, ky));
}

// Nivå 0–1: slumpade felalternativ. Nivå 2–3: de som liknar rätt svar mest.
// Spanska på nivå 3: ett av felalternativen är rätt ord med fel artikel (la perro).
function väljAlternativ(rätt, kandidater, nivå, svarsSpråk, likna = true) {
  const behov = NIVÅER[nivå].alternativ - 1;
  let pool = [...new Set(kandidater)].filter((x) => x && x !== rätt);
  const fel = [];
  if (nivå >= 3 && svarsSpråk === "es") {
    const byt = { el: "la", la: "el", los: "las", las: "los" };
    const träff = rätt.match(/^(el|la|los|las) (.+)$/i);
    const variant = träff && `${byt[träff[1].toLowerCase()]} ${träff[2]}`;
    if (variant && !pool.includes(variant)) fel.push(variant);
  }
  if (likna && nivå >= 2) pool = blanda(pool.sort((a, b) => likhet(rätt, b) - likhet(rätt, a)).slice(0, behov * 2));
  else pool = blanda(pool);
  fel.push(...pool.slice(0, behov - fel.length));
  return blanda([rätt, ...fel]);
}

function byggFråga(m, kort, nivå) {
  if (kort.glosa) {
    const tillSv = Math.random() < 0.5;
    const fråga = tillSv ? kort.glosa.ut : kort.glosa.sv;
    const rätt = tillSv ? kort.glosa.sv : kort.glosa.ut;
    const svarsSpråk = tillSv ? "sv" : m.språk.till;
    const andra = m.glosor.filter((g) => g !== kort.glosa && !g.dold).map((g) => (tillSv ? g.sv : g.ut));
    return {
      text: tillSv ? `Vad betyder "${fråga}" på svenska?` : `Vad heter "${fråga}" på ${m.språk.namn}?`,
      upplästText: fråga, upplästSpråk: tillSv ? m.språk.till : "sv", svarsSpråk,
      rätt, alternativ: väljAlternativ(rätt, andra, nivå, svarsSpråk),
    };
  }
  const f = kort.fråga;
  if (f.typ === "santfalskt") {
    return { text: f.pastaende, upplästText: f.pastaende, upplästSpråk: "sv", svarsSpråk: "sv",
      rätt: f.sant ? "Sant" : "Falskt", alternativ: ["Sant", "Falskt"], källa: f.kalla };
  }
  // Claudes felalternativ är redan rimliga, så här styr nivån bara antalet.
  return { text: f.fraga, upplästText: f.fraga, upplästSpråk: "sv", svarsSpråk: "sv",
    rätt: f.ratt, alternativ: väljAlternativ(f.ratt, f.fel, nivå, "sv", false), källa: f.kalla };
}

// Lägre nivå och fler fel = större chans att komma.
function väljKort(kortlista, pid, förra) {
  const f = framstegFör(pid);
  const vikter = kortlista.map((k) => {
    if (kortlista.length > 1 && k.nyckel === förra) return 0;
    const p = f[k.nyckel];
    if (!p) return 6;
    return [6, 4, 2, 1][p.nivå] + Math.min(p.fel, 3);
  });
  let r = Math.random() * vikter.reduce((a, b) => a + b, 0);
  for (let i = 0; i < kortlista.length; i++) { r -= vikter[i]; if (r <= 0) return kortlista[i]; }
  return kortlista[kortlista.length - 1];
}

// ---------- Vyer ----------
function vyStart() {
  aktivera(null);
  const kort = lager.profiler.map((p) =>
    h("button", { class: "profil", onclick: () => { aktivera(p); vyHem(); } },
      h("span", { class: "avatar" }, p.avatar), h("span", {}, p.namn)));
  visa(
    h("h1", {}, "Vem pluggar?"),
    h("div", { class: "stapel" }, ...kort,
      h("button", { class: "profil", onclick: () => { aktivera(GÄST); vyHem(); } }, h("span", { class: "avatar" }, GÄST.avatar), h("span", {}, "Gäst (lånad telefon)")),
      h("button", { class: "profil", onclick: () => vyNyProfil() }, h("span", { class: "avatar" }, "➕"), h("span", {}, "Ny profil"))),
    h("div", { class: "rad" },
      h("button", { class: "liten-knapp", onclick: () => vyKlistraIn() }, "📋 Klistra in"),
      h("button", { class: "liten-knapp", onclick: () => vyTestinfo() }, "Testinfo")),
  );
}

const AVATARER = ["🦊", "🐼", "🐯", "🐸", "🦉", "🐙", "🦄", "🐶", "🐱", "🐵", "🐧", "🦁"];
function vyNyProfil() {
  let avatar = AVATARER[0];
  const namn = h("input", { type: "text", id: "namn", autocomplete: "off" });
  const född = h("input", { type: "date", id: "fodd" });
  const språk = h("select", { id: "sprak" }, h("option", { value: "en" }, "Engelska"), h("option", { value: "es" }, "Spanska"));
  const uppl = h("select", { id: "uppl" }, h("option", { value: "manuell" }, "När jag trycker på 🔊"), h("option", { value: "auto" }, "Automatiskt"));
  const tema = temaVäljare("tema", "sol");
  const val = h("div", { class: "avatarval" }, ...AVATARER.map((a) =>
    h("button", { "aria-pressed": String(a === avatar), "aria-label": a, onclick: (e) => {
      avatar = a; val.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
    } }, a)));
  const fel = h("p", { class: "inte-ok", hidden: true });
  visa(
    h("h1", {}, "Ny profil"),
    h("div", { class: "kort" },
      h("label", { for: "namn" }, "Namn", namn),
      h("div", { class: "stapel" }, h("strong", {}, "Välj figur"), val),
      h("label", { for: "fodd" }, "Födelsedag", född),
      h("label", { for: "sprak" }, "Glosspråk", språk),
      h("label", { for: "uppl" }, "Läs upp frågor", uppl),
      h("label", { for: "tema" }, "Färgtema", tema),
      fel,
      h("button", { class: "primär", onclick: () => {
        if (!namn.value.trim()) { fel.hidden = false; fel.textContent = "Skriv ett namn."; return; }
        const p = { id: nyttId(), namn: namn.value.trim(), avatar, född: född.value || null, språk: språk.value, uppläsning: uppl.value, tema: tema.value, ljud: true };
        lager.profiler.push(p); spara(); aktivera(p); vyHem();
      } }, "Skapa profil")),
    h("button", { class: "liten-knapp", onclick: vyStart }, "← Tillbaka"),
  );
}

// Byter tema direkt när man väljer, så att man ser hur det blir.
function temaVäljare(id, nuvarande) {
  const val = h("select", { id, onchange: () => { document.body.dataset.tema = val.value; } },
    ...Object.entries(TEMAN).map(([k, namn]) => h("option", { value: k }, namn)));
  val.value = TEMAN[nuvarande] ? nuvarande : "sol";
  return val;
}

function ålder(p) {
  if (!p.född) return null;
  const f = new Date(p.född), n = new Date();
  return n.getFullYear() - f.getFullYear() - (n < new Date(n.getFullYear(), f.getMonth(), f.getDate()) ? 1 : 0);
}

function vyHem() {
  const b = Belöning.status(profil.id);
  const lista = materialFör(profil.id);
  const korg = papperskorgFör(profil.id);
  const å = ålder(profil);
  const kvar = Belöning.tillNästa(profil.id);
  visa(
    h("div", { class: "rad mellan" },
      h("h1", {}, h("span", { class: "rubrik-avatar" }, profil.avatar), ` Hej ${profil.namn}!`),
      h("button", { class: "liten-knapp", onclick: vyStart }, "Byt")),
    å !== null ? h("p", { class: "liten" }, `${å} år`) : null,
    h("button", { class: "kort stjärnkort", onclick: vyAlbum },
      h("div", { class: "rad mellan" }, h("strong", {}, `⭐ ${b.stjärnor} stjärnor`), h("span", {}, `📒 Album (${b.album.length})`)),
      h("div", { class: "mätare guld", "aria-label": `${kvar} stjärnor kvar till nästa klistermärke` }, h("div", { style: `width:${(10 - kvar) * 10}%` })),
      h("span", { class: "liten" }, `${kvar} ⭐ kvar till nästa klistermärke`)),
    h("h2", {}, "Mina övningar"),
    lista.length
      ? h("div", { class: "stapel" }, ...lista.map((m) => h("button", { class: "övning", onclick: () => vyMaterial(m) },
          h("span", { class: "övning-ikon" }, m.typ === "glosor" ? "📘" : "🌍"),
          h("span", { class: "övning-text" }, h("strong", {}, m.titel), h("span", { class: "liten" }, sammanfattaFramsteg(m))))))
      : h("p", { class: "liten" }, "Inga övningar än. Skriv in egna glosor, öppna en länk från en förälder eller klistra in en kod."),
    h("div", { class: "knapprad" },
      profil === GÄST ? null : h("button", { onclick: () => vyRedigeraGlosor(null) }, "➕ Egna glosor"),
      h("button", { onclick: () => vyKlistraIn() }, "📋 Klistra in")),
    h("div", { class: "rad" },
      profil === GÄST ? null : h("button", { class: "liten-knapp", onclick: () => vyInställningar() }, "⚙️ Inställningar"),
      korg.length ? h("button", { class: "liten-knapp", onclick: vyPapperskorg }, `🗑️ Papperskorg (${korg.length})`) : null),
  );
}

function vyAlbum() {
  const b = Belöning.status(profil.id);
  const antal = {};
  for (const k of b.album) antal[k] = (antal[k] || 0) + 1;
  const kvar = Belöning.tillNästa(profil.id);
  visa(
    h("button", { class: "liten-knapp", onclick: vyHem }, "← Tillbaka"),
    h("h1", {}, "📒 Mitt album"),
    h("p", {}, `${Object.keys(antal).length} av ${Belöning.KLISTERMÄRKEN.length} klistermärken. ${kvar} ⭐ kvar till nästa.`),
    h("div", { class: "albumrutnät" }, ...Belöning.KLISTERMÄRKEN.map((k) => antal[k]
      ? h("div", { class: "klistermärke" }, h("span", {}, k), antal[k] > 1 ? h("span", { class: "antal" }, `×${antal[k]}`) : null)
      : h("div", { class: "klistermärke tomt", "aria-label": "Inte hittat än" }, "?"))),
    h("div", { class: "kort" },
      h("strong", {}, "Så får du klistermärken"),
      h("ul", { class: "lista" },
        h("li", {}, "1–3 ⭐ för varje omgång du övar."),
        h("li", {}, "Ett klistermärke för var tionde ⭐."),
        h("li", {}, "Ett extra klistermärke varje gång du kan något 🦅."))),
  );
}

function vyPapperskorg() {
  const korg = papperskorgFör(profil.id);
  if (!korg.length) return vyHem();
  visa(
    h("button", { class: "liten-knapp", onclick: vyHem }, "← Tillbaka"),
    h("h1", {}, "🗑️ Papperskorg"),
    h("p", { class: "liten" }, "Övningar ligger här i 30 dagar innan de försvinner."),
    ...korg.map((post, i) => h("div", { class: "kort" },
      h("strong", {}, post.m.titel),
      h("span", { class: "liten" }, `Borttagen ${post.borttagen}`),
      h("button", { class: "primär", onclick: () => {
        korg.splice(i, 1); materialFör(profil.id).unshift(post.m); spara(); vyPapperskorg();
      } }, "↩️ Ta tillbaka"),
      hållInKnapp("Håll in för att ta bort för alltid", () => { korg.splice(i, 1); spara(); vyPapperskorg(); }))),
  );
}

function sammanfattaFramsteg(m) {
  const f = framstegFör(profil.id);
  const k = kortFör(m);
  const kan = k.filter((x) => f[x.nyckel]?.nivå === 3).length;
  return `${k.length} ${m.typ === "glosor" ? "glosor" : "frågor"} · ${kan} kan du 🦅`;
}

function vyInställningar() {
  const uppl = h("select", { id: "uppl2" }, h("option", { value: "manuell" }, "När jag trycker på 🔊"), h("option", { value: "auto" }, "Automatiskt"));
  uppl.value = profil.uppläsning;
  const ljud = h("select", { id: "ljud" }, h("option", { value: "på" }, "På"), h("option", { value: "av" }, "Av"));
  ljud.value = profil.ljud === false ? "av" : "på";
  const tema = temaVäljare("tema2", profil.tema);
  const tillbaka = () => { aktivera(profil); vyHem(); };
  visa(
    h("h1", {}, "Inställningar"),
    h("div", { class: "kort" },
      h("label", { for: "uppl2" }, "Läs upp frågor", uppl),
      h("label", { for: "ljud" }, "Ljud vid rätt och fel svar", ljud),
      h("label", { for: "tema2" }, "Färgtema", tema),
      h("p", { class: "liten" }, "Hörs inget ljud? Kontrollera att telefonen inte står på ljudlöst."),
      h("button", { class: "primär", onclick: () => {
        profil.uppläsning = uppl.value; profil.ljud = ljud.value === "på"; profil.tema = tema.value;
        spara(); tillbaka();
      } }, "Spara")),
    h("div", { class: "kort" },
      h("strong", {}, "Ta bort profilen"),
      h("p", { class: "liten" }, "Profilens övningar, framsteg och klistermärken försvinner också."),
      hållInKnapp(`Håll in för att ta bort ${profil.namn}`, () => {
        const id = profil.id;
        lager.profiler = lager.profiler.filter((p) => p.id !== id);
        delete lager.material[id]; delete lager.framsteg[id]; delete lager.belöning[id]; delete lager.papperskorg[id];
        spara(); vyStart();
      })),
    h("button", { class: "liten-knapp", onclick: tillbaka }, "← Tillbaka"),
  );
}

// En knapp som bara gör något om man håller inne den i 2 sekunder.
function hållInKnapp(text, klar) {
  const fyllning = h("span", { class: "håll-fyllning" });
  const knapp = h("button", { class: "håll" }, fyllning, h("span", { class: "håll-text" }, text));
  let timer = null;
  const starta = (e) => {
    e.preventDefault();
    knapp.classList.add("håller");
    timer = setTimeout(() => { knapp.classList.remove("håller"); klar(); }, 2000);
  };
  const avbryt = () => { clearTimeout(timer); knapp.classList.remove("håller"); };
  knapp.addEventListener("pointerdown", starta);
  ["pointerup", "pointerleave", "pointercancel"].forEach((t) => knapp.addEventListener(t, avbryt));
  knapp.addEventListener("contextmenu", (e) => e.preventDefault());
  return knapp;
}

function vyMaterial(m) {
  const f = framstegFör(profil.id);
  const kort = kortFör(m);
  const räkna = (n) => kort.filter((k) => (f[k.nyckel]?.nivå ?? 0) === n).length;
  let antal = "10";
  const val = h("div", { class: "rad" }, ...["5", "10", "20", "∞"].map((a) =>
    h("button", { class: "liten-knapp", "aria-pressed": String(a === antal), onclick: (e) => {
      antal = a; val.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
      val.querySelectorAll("button").forEach((b) => b.classList.toggle("primär", b === e.currentTarget));
    } }, a === "∞" ? "∞ Oändligt" : `${a} frågor`)));
  val.querySelectorAll("button")[1].classList.add("primär");
  visa(
    h("button", { class: "liten-knapp", onclick: vyHem }, "← Tillbaka"),
    h("h1", {}, m.titel),
    h("div", { class: "kort" },
      h("div", { class: "rad" }, ...NIVÅER.map((n, i) => h("span", { class: "nivå" }, `${n.ikon} ${n.namn}: ${räkna(i)}`)))),
    m.sammanfattning ? h("div", { class: "kort" },
      h("div", { class: "rad mellan" }, h("h2", {}, "Sammanfattning"), lyssnaKnapp(m.sammanfattning, "sv")),
      h("p", {}, m.sammanfattning),
      m.begrepp?.length ? h("ul", { class: "lista" }, ...m.begrepp.map((b) => h("li", {}, h("strong", {}, b.ord), ` – ${b.forklaring}`))) : null) : null,
    h("div", { class: "kort" }, h("strong", {}, "Hur många frågor?"), val,
      h("button", { class: "primär stor", onclick: () => vyÖva(m, antal === "∞" ? Infinity : Number(antal)) }, "Starta ▶")),
    h("div", { class: "knapprad" },
      m.typ === "glosor" ? h("button", { onclick: () => vyRedigeraGlosor(m) }, "✏️ Ändra glosor") : null,
      h("button", { onclick: () => vyDela(m) }, "📤 Skicka till någon")),
    h("div", { class: "kort" },
      h("p", { class: "liten" }, "Övningen hamnar i papperskorgen och kan tas tillbaka i 30 dagar."),
      hållInKnapp("Håll in för att ta bort övningen", () => {
        const lista = materialFör(profil.id);
        lista.splice(lista.indexOf(m), 1);
        papperskorgFör(profil.id).unshift({ m, borttagen: new Date().toISOString().slice(0, 10) });
        spara(); vyHem();
      })),
  );
}

// Skickar en kopia av övningen som länk, till exempel från en förälders profil till ett barns telefon.
async function vyDela(m) {
  const kopia = { ...m, glosor: m.glosor?.filter((g) => !g.dold), fragor: m.fragor?.filter((f) => !f.dold) };
  const länk = appAdress() + "#m=" + (await packa(kopia));
  const status = h("p", { class: "liten", hidden: true });
  visa(
    h("button", { class: "liten-knapp", onclick: () => vyMaterial(m) }, "← Tillbaka"),
    h("h1", {}, "📤 Skicka till någon"),
    h("p", {}, `Skicka "${m.titel}" som en länk i ett sms. Den som öppnar länken får en egen kopia att öva på.`),
    h("p", { class: "liten" }, "Framstegen följer inte med, bara själva övningen."),
    navigator.share ? h("button", { class: "primär", onclick: async () => {
      try { await navigator.share({ title: m.titel, url: länk }); } catch {}
    } }, "📤 Dela") : null,
    h("button", { onclick: async () => {
      status.hidden = false;
      try { await navigator.clipboard.writeText(länk); status.textContent = "Länken är kopierad. Klistra in den i ett sms."; }
      catch { status.replaceChildren("Kopiera länken:", h("p", { class: "kod" }, länk)); }
    } }, "📋 Kopiera länken"),
    status,
  );
}

// Egna glosor: skapa nya (m = null) eller ändra befintliga.
function vyRedigeraGlosor(m) {
  const SPRÅK = { en: "engelska", es: "spanska" };
  if (m) geId(m);
  const rader = m ? m.glosor.filter((g) => !g.dold).map((g) => ({ ...g })) : [];
  while (rader.length < 3) rader.push({ id: nyttId(), sv: "", ut: "" });

  const titel = h("input", { type: "text", id: "g-titel", value: m?.titel ?? "", placeholder: "t.ex. Spanska vecka 12" });
  const startspråk = m ? (SPRÅK[m.språk.till] ? m.språk.till : "annat") : (profil.språk || "en");
  const språk = h("select", { id: "g-språk", onchange: uppdatera },
    h("option", { value: "en" }, "Engelska"), h("option", { value: "es" }, "Spanska"), h("option", { value: "annat" }, "Annat språk…"));
  språk.value = startspråk;
  const annat = h("input", { type: "text", id: "g-annat", value: startspråk === "annat" ? m.språk.namn : "", placeholder: "t.ex. tyska" });
  const annatRad = h("label", { for: "g-annat" }, "Vilket språk?", annat);
  const tips = h("p", { class: "liten" }, "Skriv spanska substantiv med artikel: el perro, la casa.");
  const lista = h("div", { class: "stapel" });
  const fel = h("p", { class: "inte-ok", hidden: true });
  const klistra = h("textarea", { id: "g-lista", rows: 4, placeholder: "hund – el perro\nkatt – el gato" });

  function språkNamn() {
    return språk.value === "annat" ? (annat.value.trim() || "det andra språket") : SPRÅK[språk.value];
  }
  function uppdatera() {
    annatRad.hidden = språk.value !== "annat";
    tips.hidden = språk.value !== "es";
    lista.querySelectorAll("[data-ut]").forEach((el) => { el.placeholder = språkNamn(); });
  }
  function radEl(r) {
    const sv = h("input", { type: "text", value: r.sv, placeholder: "svenska", "aria-label": "Svenska", autocapitalize: "none",
      oninput: () => { r.sv = sv.value; } });
    const ut = h("input", { type: "text", value: r.ut, placeholder: språkNamn(), "aria-label": "Översättning", "data-ut": "", autocapitalize: "none",
      oninput: () => { r.ut = ut.value; } });
    const el = h("div", { class: "glosrad" }, sv, ut,
      h("button", { class: "lyssna", "aria-label": "Ta bort raden", onclick: () => { rader.splice(rader.indexOf(r), 1); el.remove(); } }, "✕"));
    return el;
  }
  function läggTillRad(r) { rader.push(r); const el = radEl(r); lista.append(el); return el; }
  rader.forEach((r) => lista.append(radEl(r)));

  visa(
    h("button", { class: "liten-knapp", onclick: () => (m ? vyMaterial(m) : vyHem()) }, "← Tillbaka"),
    h("h1", {}, m ? "✏️ Ändra glosor" : "➕ Egna glosor"),
    h("div", { class: "kort" },
      h("label", { for: "g-titel" }, "Namn på övningen", titel),
      h("label", { for: "g-språk" }, "Språk", språk),
      annatRad, tips),
    h("div", { class: "kort" },
      h("strong", {}, "Glosor"),
      lista,
      h("button", { onclick: () => läggTillRad({ id: nyttId(), sv: "", ut: "" }).querySelector("input").focus() }, "➕ Lägg till ord"),
      h("details", {},
        h("summary", {}, "Klistra in en hel lista"),
        h("div", { class: "stapel" },
          h("p", { class: "liten" }, "Ett ordpar per rad, med streck, kolon eller likhetstecken emellan."),
          klistra,
          h("button", { onclick: () => {
            for (const rad of klistra.value.split("\n")) {
              const delar = rad.split(/\s*(?:\t|–|—|=|:|;|\s-\s)\s*/);
              if (delar.length >= 2 && delar[0].trim() && delar[1].trim()) läggTillRad({ id: nyttId(), sv: delar[0].trim(), ut: delar.slice(1).join(" ").trim() });
            }
            klistra.value = "";
          } }, "Lägg till från listan")))),
    fel,
    h("button", { class: "primär stor", onclick: () => {
      const klara = rader.map((r) => ({ id: r.id, sv: r.sv.trim(), ut: r.ut.trim() })).filter((r) => r.sv && r.ut);
      if (!klara.length) { fel.hidden = false; fel.textContent = "Skriv minst ett ordpar, både svenska och översättning."; return; }
      if (språk.value === "annat" && !annat.value.trim()) { fel.hidden = false; fel.textContent = "Skriv vilket språk det är."; return; }
      const nyttSpråk = { från: "sv", till: språk.value === "annat" ? annat.value.trim().toLowerCase() : språk.value, namn: språkNamn() };
      const namn = titel.value.trim() || `Egna glosor (${nyttSpråk.namn})`;
      if (m) {
        // Borttagna glosor sparas som dolda, så att deras framsteg inte blandas ihop med nya.
        const kvar = new Set(klara.map((g) => g.id));
        const dolda = m.glosor.filter((g) => !kvar.has(g.id)).map((g) => ({ ...g, dold: true }));
        Object.assign(m, { titel: namn, språk: nyttSpråk, glosor: [...klara, ...dolda] });
      } else {
        m = { v: 1, id: nyttId(), typ: "glosor", titel: namn, skapad: new Date().toISOString().slice(0, 10), språk: nyttSpråk, glosor: klara };
        materialFör(profil.id).unshift(m);
      }
      spara(); vyMaterial(m);
    } }, "💾 Spara"),
  );
  uppdatera();
}

function vyÖva(m, totalt) {
  const kortlista = kortFör(m);
  if (!kortlista.length) return vyHem();
  const omgång = { rätt: 0, svarade: 0, logg: [], nyaKan: 0, förra: null };

  function nästa() {
    if (omgång.svarade >= totalt) return avsluta();
    const kort = väljKort(kortlista, profil.id, omgång.förra);
    omgång.förra = kort.nyckel;
    const nivå = framstegFör(profil.id)[kort.nyckel]?.nivå ?? 0;
    const q = byggFråga(m, kort, nivå);
    const åter = h("div", { hidden: true });
    const vidare = h("button", { class: "primär", hidden: true, onclick: nästa }, "Nästa ▶");
    const knappar = q.alternativ.map((alt) => h("button", { onclick: () => svara(alt) }, alt));

    function svara(alt) {
      const ok = alt === q.rätt;
      knappar.forEach((k) => {
        k.disabled = true;
        if (k.textContent === q.rätt) k.classList.add("rätt");
        else if (k.textContent === alt) k.classList.add("fel");
      });
      const { blevKan } = registrera(profil.id, kort.nyckel, ok);
      if (blevKan) omgång.nyaKan++;
      if (!ok) Ljud.fel(); else if (blevKan) Ljud.kan(); else Ljud.rätt();
      omgång.svarade++; if (ok) omgång.rätt++;
      omgång.logg.push([kort.nyckel, ok ? 1 : 0]);
      spara();
      åter.hidden = false;
      åter.className = "återkoppling " + (ok ? "rätt" : "fel");
      åter.replaceChildren(...[
        ok ? (blevKan ? "Rätt! Nu kan du den här 🦅" : "Rätt! 🎉") : `Inte riktigt. Rätt svar: ${q.rätt}`,
        !ok && q.källa ? h("p", { class: "källa" }, `Så här står det i texten: "${q.källa}"`) : null].filter(Boolean));
      vidare.hidden = false;
      vidare.focus();
    }

    const mätare = Number.isFinite(totalt)
      ? h("div", { class: "mätare", role: "progressbar", "aria-valuenow": omgång.svarade, "aria-valuemax": totalt }, h("div", { style: `width:${(omgång.svarade / totalt) * 100}%` }))
      : null;

    visa(
      h("div", { class: "rad mellan" },
        h("span", { class: "liten" }, Number.isFinite(totalt) ? `Fråga ${omgång.svarade + 1} av ${totalt}` : `Fråga ${omgång.svarade + 1} · ${omgång.rätt} rätt`),
        h("button", { class: "liten-knapp", onclick: avsluta }, Number.isFinite(totalt) ? "Avbryt" : "Klar")),
      mätare,
      h("div", { class: "kort" },
        h("span", { class: "nivå" }, `${NIVÅER[nivå].ikon} ${NIVÅER[nivå].namn}`),
        h("div", { class: "rad mellan" }, h("p", { class: "fråga-text" }, q.text), lyssnaKnapp(q.upplästText, q.upplästSpråk)),
        h("div", { class: "alternativ" }, ...knappar.map((k, i) => h("div", { class: "rad", style: "flex-wrap:nowrap" },
          h("div", { style: "flex:1;min-width:0;display:grid" }, k), lyssnaKnapp(q.alternativ[i], q.svarsSpråk)))),
        åter, vidare),
      h("button", { class: "liten-knapp diskret", onclick: () => vyRätta(m, kort, nästa) }, "✏️ Rätta"),
    );
    if (profil.uppläsning === "auto") läsUpp(q.upplästText, q.upplästSpråk);
  }

  function avsluta() {
    if (!omgång.svarade) return vyMaterial(m);
    const stjärnor = Belöning.stjärnorFör(omgång.rätt, omgång.svarade);
    const nya = Belöning.ge(profil.id, stjärnor, omgång.nyaKan);
    spara();
    vyResultat(m, omgång, stjärnor, nya);
  }
  nästa();
}

function vyResultat(m, omgång, stjärnor, nya) {
  const skickaStatus = h("p", { class: "liten", hidden: true });
  const gästdel = profil === GÄST ? h("div", { class: "kort" },
    h("strong", {}, "Lånad telefon?"),
    h("p", {}, "Skicka resultatet till din egen telefon så hamnar stjärnorna i din profil."),
    h("button", { class: "primär", onclick: async () => {
      const paket = { v: 1, typ: "resultat", id: nyttId(), stjärnor, nyaKan: omgång.nyaKan, logg: omgång.logg };
      const länk = appAdress() + "#r=" + (await packa(paket));
      skickaStatus.hidden = false;
      if (navigator.share) {
        try { await navigator.share({ title: "Mitt resultat", url: länk }); skickaStatus.textContent = "Skickat."; return; }
        catch (e) { if (e.name === "AbortError") return; }
      }
      try { await navigator.clipboard.writeText(länk); skickaStatus.textContent = "Länken är kopierad. Klistra in den i ett sms till dig själv."; }
      catch { skickaStatus.replaceChildren("Kopiera länken:", h("p", { class: "kod" }, länk)); }
    } }, "📲 Det här var jag! Skicka till min telefon"),
    skickaStatus) : null;
  visa(
    h("h1", {}, "Bra jobbat!"),
    h("div", { class: "kort" },
      h("p", { class: "stjärnor", "aria-label": `${stjärnor} av 3 stjärnor` }, "⭐".repeat(stjärnor) + "☆".repeat(3 - stjärnor)),
      h("p", { style: "text-align:center;font-weight:700" }, `${omgång.rätt} av ${omgång.svarade} rätt`),
      nya.length ? h("button", { class: "nytt-klistermärke", onclick: vyAlbum }, `Nytt klistermärke! `, h("span", { class: "studs" }, nya.join(" ")), h("span", { class: "liten" }, " Se albumet")) : null),
    gästdel,
    h("button", { class: "primär", onclick: () => vyÖva(m, omgång.svarade || 10) }, "Öva igen"),
    h("button", { onclick: vyHem }, "Till startsidan"),
  );
  if (nya.length) Ljud.klistermärke();
}

function vyRätta(m, kort, fortsätt) {
  const fel = h("p", { class: "inte-ok", hidden: true });
  const delar = [];
  let sparaÄndring;
  if (kort.glosa) {
    const sv = h("input", { type: "text", id: "r-sv", value: kort.glosa.sv });
    const ut = h("input", { type: "text", id: "r-ut", value: kort.glosa.ut });
    delar.push(h("label", { for: "r-sv" }, "Svenska", sv), h("label", { for: "r-ut" }, m.språk.namn, ut));
    sparaÄndring = () => {
      if (!sv.value.trim() || !ut.value.trim()) { fel.hidden = false; fel.textContent = "Båda fälten behöver fyllas i."; return false; }
      kort.glosa.sv = sv.value.trim(); kort.glosa.ut = ut.value.trim(); kort.glosa.osaker = false; return true;
    };
  } else {
    delar.push(h("p", {}, kort.fråga.fraga || kort.fråga.pastaende));
  }
  visa(
    h("h1", {}, "Rätta"),
    h("div", { class: "kort" }, ...delar, fel,
      sparaÄndring ? h("button", { class: "primär", onclick: () => { if (sparaÄndring()) { spara(); fortsätt(); } } }, "Spara rättelsen") : null,
      h("button", { onclick: () => { (kort.glosa || kort.fråga).dold = true; spara(); fortsätt(); } }, "Ta bort frågan från övningen"),
      h("button", { class: "liten-knapp", onclick: fortsätt }, "Avbryt")),
  );
}

// ---------- Import av material och resultat ----------
function vyKlistraIn() {
  const fält = h("textarea", { id: "kod", rows: 5, placeholder: "Klistra in koden här" });
  const fel = h("p", { class: "inte-ok", hidden: true });
  const läggTill = async () => {
    const text = fält.value.trim();
    const match = text.match(/#([mr])=([A-Za-z0-9_-]+)/);
    try {
      if (match) await hanteraPaket(match[1], match[2]);
      else await hanteraPaket("m", text);
    } catch { fel.hidden = false; fel.textContent = "Koden gick inte att läsa. Kontrollera att hela koden kom med."; }
  };
  const kanLäsaUrklipp = !!navigator.clipboard?.readText;
  visa(
    h("h1", {}, "Klistra in"),
    kanLäsaUrklipp ? h("button", { class: "primär", onclick: async () => {
      try { fält.value = await navigator.clipboard.readText(); await läggTill(); }
      catch { fel.hidden = false; fel.textContent = "Kunde inte hämta det kopierade. Tryck länge i rutan nedan och välj Klistra in."; }
    } }, "📋 Klistra in det jag kopierade") : null,
    h("div", { class: "kort" },
      h("label", { for: "kod" }, "Kod eller länk", fält), fel,
      h("button", { onclick: läggTill }, "Lägg till")),
    h("button", { class: "liten-knapp", onclick: () => (profil ? vyHem() : vyStart()) }, "← Tillbaka"),
  );
}

async function hanteraPaket(slag, kod) {
  const paket = await packaUpp(kod);
  if (slag === "r" || paket.typ === "resultat") return vyTaEmotResultat(paket);
  if (!paket.id || !paket.typ || !(paket.glosor || paket.fragor)) throw new Error("inte ett material");
  vyTaEmotMaterial(paket);
}

function väljProfil(rubrik, beskrivning, medGäst, klar) {
  const val = [...lager.profiler, ...(medGäst ? [GÄST] : [])];
  visa(
    h("h1", {}, rubrik),
    h("p", {}, beskrivning),
    val.length
      ? h("div", { class: "stapel" }, ...val.map((p) => h("button", { class: "profil", onclick: () => klar(p) }, h("span", { class: "avatar" }, p.avatar), h("span", {}, p.namn))))
      : h("p", { class: "liten" }, "Det finns inga profiler på den här telefonen än."),
    h("button", { class: "profil", onclick: () => vyNyProfil() }, h("span", { class: "avatar" }, "➕"), h("span", {}, "Skapa profil först")),
  );
}

function vyTaEmotMaterial(m) {
  const antal = m.typ === "glosor" ? `${m.glosor.length} glosor` : `${m.fragor.length} frågor`;
  väljProfil(`${m.typ === "glosor" ? "📘" : "🌍"} ${m.titel}`, `${antal}. Vem ska öva på det här?`, true, (p) => {
    const lista = materialFör(p.id);
    m = geId(structuredClone(m));
    const finns = lista.findIndex((x) => x.id === m.id);
    if (finns >= 0) lista[finns] = m; else lista.unshift(m);
    spara(); aktivera(p); vyHem();
  });
}

function vyTaEmotResultat(r) {
  if (lager.importerade.includes(r.id)) {
    return visa(h("h1", {}, "Redan inlagt"), h("p", {}, "Det här resultatet har redan lagts in."), h("button", { class: "primär", onclick: vyStart }, "OK"));
  }
  väljProfil("Resultat från en lånad telefon", `${r.logg.length} svar och ${r.stjärnor} ⭐. Vem var det som övade?`, false, (p) => {
    const kända = new Set(materialFör(p.id).flatMap((m) => kortFör(m).map((k) => k.nyckel)));
    let saknas = 0;
    for (const [nyckel, ok] of r.logg) { if (kända.has(nyckel)) registrera(p.id, nyckel, ok === 1); else saknas++; }
    const nya = Belöning.ge(p.id, r.stjärnor, r.nyaKan || 0);
    lager.importerade.push(r.id); spara(); aktivera(p);
    visa(
      h("h1", {}, "Klart! 🎉"),
      h("p", {}, `${r.stjärnor} ⭐ har lagts till hos ${p.namn}.`),
      nya.length ? h("p", {}, "Nya klistermärken: ", nya.join(" ")) : null,
      saknas ? h("p", { class: "liten" }, `${saknas} svar gällde övningar som inte finns på den här telefonen och hoppades över.`) : null,
      h("button", { class: "primär", onclick: vyHem }, "Till startsidan"));
  });
}

// ---------- Testinfo ----------
async function vyTestinfo() {
  const rader = [];
  const rad = (namn, ok, info = "") => rader.push(h("li", {}, h("span", { class: ok ? "ok" : "inte-ok" }, ok ? "✓ " : "✗ "), `${namn}${info ? ": " + info : ""}`));
  const sw = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : null;
  rad("Offline-stöd installerat", !!sw?.active);
  rad("Sidan styrs av offline-stödet", !!navigator.serviceWorker?.controller, navigator.serviceWorker?.controller ? "" : "ladda om sidan en gång");
  rad("Öppnad från hemskärmen", matchMedia("(display-mode: standalone)").matches || navigator.standalone === true, "rekommenderas på iPhone");
  let varaktig = false; try { varaktig = await navigator.storage?.persisted?.(); } catch {}
  rad("Lagring skyddad mot rensning", !!varaktig);
  rad("Lokal lagring fungerar", (() => { try { localStorage.setItem("_t", "1"); localStorage.removeItem("_t"); return true; } catch { return false; } })());
  rad("Komprimering av länkar", typeof CompressionStream === "function" && typeof DecompressionStream === "function");
  rad("Uppkopplad just nu", navigator.onLine, navigator.onLine ? "" : "offline – bra test!");
  laddaRöster();
  const röstrader = ["sv", "en", "es"].map((k) => {
    const r = röstFör(k);
    const exempel = { sv: "Hej! Nu ska vi plugga.", en: "Hello! The dog is happy.", es: "¡Hola! El perro está contento." }[k];
    const namn = { sv: "Svenska", en: "Engelska", es: "Spanska" }[k];
    const kandidater = röstKandidater(k);
    if (!kandidater.length) return h("p", {}, `${namn}: `, h("span", { class: "inte-ok" }, "ingen röst hittad"));
    const val = h("select", { id: `röst-${k}`, onchange: () => {
      (lager.inställningar.röster ??= {})[k] = val.value; spara(); läsUpp(exempel, k);
    } }, ...kandidater.map((v) => h("option", { value: v.voiceURI }, `${v.name} (${v.lang})`)));
    val.value = r.voiceURI;
    return h("div", { class: "stapel" },
      h("label", { for: `röst-${k}` }, namn, val),
      h("button", { class: "liten-knapp", onclick: () => läsUpp(exempel, k) }, `🔊 Testa ${namn.toLowerCase()}`));
  });
  visa(
    h("h1", {}, "Testinfo"),
    h("div", { class: "kort" }, h("ul", { class: "lista" }, ...rader)),
    h("div", { class: "kort" }, h("strong", {}, "Uppläsning"),
      h("p", { class: "liten" }, "Välj den röst som låter bäst. Fler och bättre röster kan laddas ned i iPhone under Inställningar → Hjälpmedel → Uppläst innehåll → Röster."),
      ...röstrader),
    h("div", { class: "kort" },
      h("strong", {}, "Prova utan att vänta på en förälder"),
      h("button", { onclick: () => vyTaEmotMaterial(EXEMPEL_GLOSOR) }, "Lägg till exempelglosor (spanska)"),
      h("button", { onclick: () => vyTaEmotMaterial(EXEMPEL_FAKTA) }, "Lägg till exempelfakta (vikingar)")),
    h("button", { class: "liten-knapp", onclick: () => (profil ? vyHem() : vyStart()) }, "← Tillbaka"),
  );
}

const EXEMPEL_GLOSOR = { v: 1, id: "exempel-g", typ: "glosor", titel: "Exempel: spanska djur", språk: { från: "sv", till: "es", namn: "spanska" },
  glosor: [["hund", "el perro"], ["katt", "el gato"], ["häst", "el caballo"], ["ko", "la vaca"], ["fågel", "el pájaro"], ["fisk", "el pez"], ["mus", "el ratón"], ["gris", "el cerdo"]]
    .map(([sv, ut]) => ({ sv, ut, osaker: false })) };
const EXEMPEL_FAKTA = { v: 1, id: "exempel-f", typ: "fakta", titel: "Exempel: vikingatiden",
  sammanfattning: "Vikingatiden var ungefär år 800 till 1050. Vikingarna bodde i Norden. De var bönder, handelsmän och ibland krigare. De reste långt med sina snabba skepp.",
  begrepp: [{ ord: "träl", forklaring: "en slav på vikingatiden" }, { ord: "runsten", forklaring: "en sten med inristad text" }],
  fragor: [
    { typ: "flerval", fraga: "Ungefär när var vikingatiden?", ratt: "800–1050", fel: ["500–700", "1200–1400", "1500–1600", "100–300", "1700–1800"], niva: 1, kalla: "Vikingatiden var ungefär år 800 till 1050." },
    { typ: "flerval", fraga: "Vad kallades vikingarnas slavar?", ratt: "Trälar", fel: ["Jarlar", "Bönder", "Skalder", "Hövdingar", "Riddare"], niva: 1, kalla: "träl – en slav på vikingatiden" },
    { typ: "santfalskt", pastaende: "Vikingarna reste med snabba skepp.", sant: true, niva: 1, kalla: "De reste långt med sina snabba skepp." },
    { typ: "santfalskt", pastaende: "Alla vikingar var krigare.", sant: false, niva: 2, kalla: "De var bönder, handelsmän och ibland krigare." },
  ] };

// ---------- Start ----------
// På iPhone öppnas sms-länkar i Safari, som har annan lagring än appen på hemskärmen.
const iIphoneSafari = () => navigator.standalone === false;

function vyÖppnaIAppen(slag, kod) {
  const status = h("p", { class: "liten", hidden: true });
  const hela = appAdress() + "#" + slag + "=" + kod;
  visa(
    h("h1", {}, "Öppna i Studiehjälpen"),
    h("div", { class: "kort" },
      h("ol", { class: "lista" },
        h("li", {}, "Tryck på knappen nedan."),
        h("li", {}, "Öppna Studiehjälpen från hemskärmen."),
        h("li", {}, "Tryck på ", h("strong", {}, "Klistra in"), " och sedan ", h("strong", {}, "📋 Klistra in det jag kopierade"), ".")),
      h("button", { class: "primär", onclick: async () => {
        status.hidden = false;
        try { await navigator.clipboard.writeText(hela); status.textContent = "Kopierat! Öppna appen från hemskärmen nu."; }
        catch { status.replaceChildren("Kunde inte kopiera. Markera och kopiera texten:", h("p", { class: "kod" }, hela)); }
      } }, "📋 Kopiera"),
      status),
    h("button", { class: "liten-knapp", onclick: () => hanteraPaket(slag, kod).catch(() => vyStart()) }, "Jag har inte appen på hemskärmen, lägg till här"),
  );
}

async function hanteraLänk() {
  const m = location.hash.match(/^#([mr])=([A-Za-z0-9_-]+)$/);
  if (!m) return false;
  history.replaceState(null, "", location.pathname + location.search);
  if (iIphoneSafari()) { vyÖppnaIAppen(m[1], m[2]); return true; }
  try { await hanteraPaket(m[1], m[2]); }
  catch { visa(h("h1", {}, "Länken gick inte att läsa"), h("p", {}, "Be om en ny länk, eller använd Klistra in kod."), h("button", { class: "primär", onclick: vyStart }, "OK")); }
  return true;
}
window.addEventListener("hashchange", hanteraLänk);

(async () => {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  try { await navigator.storage?.persist?.(); } catch {}
  // Töm papperskorgen på sådant som legat där längre än 30 dagar.
  const gräns = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  for (const pid of Object.keys(lager.papperskorg)) lager.papperskorg[pid] = lager.papperskorg[pid].filter((p) => p.borttagen >= gräns);
  spara();
  if (!(await hanteraLänk())) vyStart();
})();
