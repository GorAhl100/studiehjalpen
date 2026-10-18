"use strict";
// Små ljud som skapas direkt i telefonen, så att inga ljudfiler behövs.
// Ett annat ljudtema = byt ut tonerna nedan.
const Ljud = (() => {
  let ctx = null;
  const påslaget = () => typeof profil === "undefined" || profil?.ljud !== false;

  // noter: [frekvens, start (s), längd (s), vågform]
  function spela(noter) {
    if (!påslaget()) return;
    try {
      ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      const t = ctx.currentTime;
      for (const [frekvens, start, längd, form = "sine"] of noter) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = form;
        o.frequency.value = frekvens;
        g.gain.setValueAtTime(0.0001, t + start);
        g.gain.exponentialRampToValueAtTime(0.2, t + start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + start + längd);
        o.connect(g).connect(ctx.destination);
        o.start(t + start);
        o.stop(t + start + längd + 0.05);
      }
    } catch {}
  }

  return {
    rätt: () => spela([[660, 0, 0.15], [880, 0.12, 0.3]]),
    fel: () => spela([[247, 0, 0.22, "triangle"], [196, 0.16, 0.35, "triangle"]]),
    kan: () => spela([[784, 0, 0.12], [988, 0.1, 0.12], [1175, 0.2, 0.4]]),
    klistermärke: () => spela([[523, 0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.14], [1047, 0.36, 0.5]]),
  };
})();
