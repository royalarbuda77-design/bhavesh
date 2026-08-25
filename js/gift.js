/* ============================================================
   GIFT SURPRISE ENTRANCE — flow controller
   Entrance layer only. The existing site underneath is never
   touched, rebuilt or reloaded — the gate simply reveals it.
   ============================================================ */
(() => {
  "use strict";

  const KEY = "ss_gift_entered";
  const $ = id => document.getElementById(id);
  const gate = $("giftGate");
  if (!gate) return;

  const doc = document.documentElement;
  const store = {
    get() { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } },
    set() { try { sessionStorage.setItem(KEY, "1"); } catch (e) { /* private mode — graceful */ } }
  };

  /* Already entered during this session → behave exactly like the plain site */
  if (store.get() === "1") {
    doc.classList.remove("gift-show");
    gate.remove();
    return;
  }

  doc.classList.add("gift-show");   // safety net (head snippet usually set this)
  document.body.classList.add("gift-locked");

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const T = reduced
    ? { open: 520, swap: 120, leave: 170, exit: 260 }
    : { open: 1700, swap: 430, leave: 380, exit: 780 };

  const stage    = $("giftStage"),
        box      = $("giftBox"),
        openBtn  = $("giftOpenBtn"),
        question = $("giftQuestion"),
        burst    = $("giftBurst"),
        dust     = $("giftDust");

  /* Ambient floating gold dust (pure CSS motion, JS only spawns nodes) */
  if (dust && !reduced) {
    for (let i = 0; i < 16; i++) {
      const s = document.createElement("span");
      s.style.setProperty("--x",   (Math.random() * 100).toFixed(2) + "%");
      s.style.setProperty("--dx",  (Math.random() * 140 - 70).toFixed(0) + "px");
      s.style.setProperty("--s",   (Math.random() * 3 + 1.6).toFixed(1) + "px");
      s.style.setProperty("--dur", (Math.random() * 8 + 9).toFixed(1) + "s");
      s.style.setProperty("--del", (-Math.random() * 16).toFixed(1) + "s");
      dust.appendChild(s);
    }
  }

  let state = "closed", busy = false;

  function spawnBurst() {
    if (reduced || !burst) return;
    burst.innerHTML = "";
    for (let i = 0; i < 16; i++) {
      const s = document.createElement("span");
      const a = Math.random() * Math.PI * 2;
      const r = 90 + Math.random() * 130;
      s.style.setProperty("--dx",  (Math.cos(a) * r).toFixed(0) + "px");
      s.style.setProperty("--dy",  (Math.sin(a) * r).toFixed(0) + "px");
      s.style.setProperty("--s",   (Math.random() * 5 + 3).toFixed(1) + "px");
      s.style.setProperty("--dur", (0.9 + Math.random() * 0.7).toFixed(2) + "s");
      s.style.setProperty("--del", (Math.random() * 0.25).toFixed(2) + "s");
      burst.appendChild(s);
    }
    setTimeout(() => { if (burst) burst.innerHTML = ""; }, 1800);
  }

  /* ---- Step 1 → 2: open the gift, then reveal the question ---- */
  function openGift() {
    if (state !== "closed" || busy) return;
    busy = true; state = "opening";
    gate.classList.add("is-opening");
    spawnBurst();
    setTimeout(() => {
      state = "ask"; busy = false;
      stage.classList.add("is-done");
      setTimeout(() => {
        stage.hidden = true;
        question.hidden = false;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => question.classList.add("is-in")));
      }, T.swap);
    }, T.open);
  }

  /* ---- YES → fade card, fade gate, reveal the untouched site ---- */
  function answerYes() {
    if (state !== "ask" || busy) return;
    busy = true; state = "entering";
    question.classList.remove("is-in");
    question.classList.add("is-leaving");
    setTimeout(() => {
      gate.classList.add("is-exiting");
      setTimeout(finish, T.exit);
    }, T.leave);
  }

  /* ---- NO → close the question, gift returns to its closed state ---- */
  function answerNo() {
    if (state !== "ask" || busy) return;
    busy = true; state = "leavingQ";
    question.classList.remove("is-in");
    question.classList.add("is-leaving");
    setTimeout(() => {
      question.hidden = true;
      question.classList.remove("is-leaving");
      if (burst) burst.innerHTML = "";
      stage.hidden = false;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          gate.classList.remove("is-opening");   // lid & glow smoothly reverse
          stage.classList.remove("is-done");
          state = "closed"; busy = false;
          openBtn.focus({ preventScroll: true });
        }));
    }, T.leave);
  }

  function finish() {
    store.set();
    doc.classList.remove("gift-show");
    document.body.classList.remove("gift-locked");
    if (window.scrollY > 0) window.scrollTo(0, 0);
    gate.remove();   // the existing website remains, exactly as before
  }

  box.addEventListener("click", openGift);
  box.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openGift(); }
  });
  openBtn.addEventListener("click", openGift);
  $("giftYes").addEventListener("click", answerYes);
  $("giftNo").addEventListener("click", answerNo);
})();
