"use strict";
// Små ljud som skapas direkt i telefonen, så att inga ljudfiler behövs.
// Tonerna räknas fram som en WAV-fil och spelas med ett vanligt <audio>-element.
// Det hörs på iPhone även när telefonen står på ljudlöst (Web Audio gör inte det).
// Ett annat ljudtema = byt ut tonerna nedan.
const Ljud = (() => {
  const TAKT = 22050;
  const cache = {};
  const påslaget = () => typeof profil === "undefined" || profil?.ljud !== false;

  // Säg till iPhone att appen spelar upp ljud, inte bara "bakgrundsljud" (iOS 17 och senare).
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}

  // noter: [frekvens, start (s), längd (s), vågform]
  function tillWav(noter) {
    const slut = Math.max(...noter.map(([, s, l]) => s + l)) + 0.05;
    const n = Math.ceil(slut * TAKT);
    const prov = new Float32Array(n);
    for (const [frekvens, start, längd, form = "sine"] of noter) {
      const från = Math.floor(start * TAKT), antal = Math.floor(längd * TAKT);
      for (let i = 0; i < antal && från + i < n; i++) {
        const t = i / TAKT;
        const fas = (t * frekvens) % 1;
        const våg = form === "triangle" ? 1 - 4 * Math.abs(fas - 0.5) : Math.sin(2 * Math.PI * fas);
        const kuvert = Math.min(1, i / (0.01 * TAKT)) * Math.exp((-4 * i) / antal);
        prov[från + i] += 0.35 * våg * kuvert;
      }
    }
    const buf = new DataView(new ArrayBuffer(44 + n * 2));
    const skriv = (pos, text) => { for (let i = 0; i < text.length; i++) buf.setUint8(pos + i, text.charCodeAt(i)); };
    skriv(0, "RIFF"); buf.setUint32(4, 36 + n * 2, true); skriv(8, "WAVE");
    skriv(12, "fmt "); buf.setUint32(16, 16, true); buf.setUint16(20, 1, true); buf.setUint16(22, 1, true);
    buf.setUint32(24, TAKT, true); buf.setUint32(28, TAKT * 2, true); buf.setUint16(32, 2, true); buf.setUint16(34, 16, true);
    skriv(36, "data"); buf.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) buf.setInt16(44 + i * 2, Math.max(-1, Math.min(1, prov[i])) * 0x7fff, true);
    return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  }

  function spela(namn, noter) {
    if (!påslaget()) return;
    try {
      cache[namn] ??= tillWav(noter);
      const ljud = new Audio(cache[namn]);
      ljud.play().catch(() => {});
    } catch {}
  }

  return {
    rätt: () => spela("rätt", [[660, 0, 0.15], [880, 0.12, 0.3]]),
    fel: () => spela("fel", [[247, 0, 0.22, "triangle"], [196, 0.16, 0.35, "triangle"]]),
    kan: () => spela("kan", [[784, 0, 0.12], [988, 0.1, 0.12], [1175, 0.2, 0.4]]),
    klistermärke: () => spela("klistermärke", [[523, 0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.14], [1047, 0.36, 0.5]]),
  };
})();
