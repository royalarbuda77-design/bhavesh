/* ============================================================
   SAAD SAKHIDAS • NEET 2027 — interactive engine
   ============================================================ */
(() => {
  "use strict";
  /* Mark JS as active: only then does CSS hide .reveal elements for animation.
     If JS never runs (blocked/offline/proxy), content stays fully visible. */
  document.documentElement.classList.add("js-fx");
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Split hero name & footer name into animated letters ---------- */
  const splitLetters = (el, baseDelay = 0) => {
    const text = el.textContent;
    el.textContent = "";
    [...text].forEach((ch, i) => {
      if (ch === " " || ch === " ") { el.appendChild(document.createTextNode(" ")); return; }
      const s = document.createElement("span");
      s.className = "ch";
      s.textContent = ch;
      s.style.animationDelay = `${baseDelay + i * 0.055}s`;
      el.appendChild(s);
    });
  };
  splitLetters(document.getElementById("nameTop"), 0.15);
  splitLetters(document.getElementById("nameMain"), 0.35);
  const footerName = document.getElementById("footerName");
  [...footerName.childNodes].forEach(n => n.remove()); // re-split for hover letters
  [..."Saad Sakhidas"].forEach(ch => {
    if (ch === " ") { footerName.appendChild(document.createTextNode(" ")); return; }
    const s = document.createElement("span");
    s.className = "ch"; s.style.animation = "none"; s.textContent = ch;
    footerName.appendChild(s);
  });

  /* ---------- Starfield particles ---------- */
  const canvas = document.getElementById("particles");
  if (canvas && !prefersReduced) {
    const ctx = canvas.getContext("2d");
    let W, H, stars = [], t = 0;
    const COLORS = ["168,85,247", "34,211,238", "244,114,182", "251,191,36"];

    const resize = () => {
      W = canvas.width = innerWidth;
      H = canvas.height = innerHeight;
      const count = Math.min(120, Math.floor((W * H) / 16000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.6 + 0.4,
        vy: -(Math.random() * 0.28 + 0.06),
        vx: (Math.random() - 0.5) * 0.12,
        c: COLORS[(Math.random() * COLORS.length) | 0],
        p: Math.random() * Math.PI * 2,          // twinkle phase
        s: Math.random() * 0.02 + 0.008          // twinkle speed
      }));
    };
    resize();
    addEventListener("resize", resize);

    const loop = () => {
      t++;
      ctx.clearRect(0, 0, W, H);
      for (const st of stars) {
        st.y += st.vy; st.x += st.vx; st.p += st.s;
        if (st.y < -6) { st.y = H + 6; st.x = Math.random() * W; }
        if (st.x < -6) st.x = W + 6; else if (st.x > W + 6) st.x = -6;
        const a = 0.25 + Math.abs(Math.sin(st.p)) * 0.65;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${st.c},${a})`;
        ctx.shadowColor = `rgba(${st.c},.9)`;
        ctx.shadowBlur = 6;
        ctx.fill();
      }
      requestAnimationFrame(loop);
    };
    loop();
  }

  /* ---------- Cursor glow (fine pointers only) ---------- */
  const glow = document.querySelector(".cursor-glow");
  if (glow && matchMedia("(pointer: fine)").matches && !prefersReduced) {
    let gx = innerWidth / 2, gy = -400, tx = gx, ty = gy;
    addEventListener("mousemove", e => { tx = e.clientX; ty = e.clientY; });
    (function follow() {
      gx += (tx - gx) * 0.12; gy += (ty - gy) * 0.12;
      glow.style.left = gx + "px"; glow.style.top = gy + "px";
      requestAnimationFrame(follow);
    })();
  } else if (glow) { glow.style.display = "none"; }

  /* ---------- Navbar: shrink, scrollspy, hamburger ---------- */
  const nav = document.getElementById("nav");
  const navLinks = [...document.querySelectorAll(".nav-link")];
  const hamburger = document.getElementById("hamburger");
  const linksWrap = document.getElementById("navLinks");

  hamburger.addEventListener("click", () => linksWrap.classList.toggle("open"));
  navLinks.forEach(l => l.addEventListener("click", () => linksWrap.classList.remove("open")));

  const bar = document.getElementById("scrollBar");
  const toTop = document.getElementById("toTop");
  toTop.addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));

  const sections = navLinks
    .map(l => document.querySelector(l.getAttribute("href")))
    .filter(Boolean);

  addEventListener("scroll", () => {
    nav.classList.toggle("scrolled", scrollY > 30);
    toTop.classList.toggle("show", scrollY > 600);
    const h = document.documentElement;
    bar.style.width = (scrollY / (h.scrollHeight - h.clientHeight)) * 100 + "%";

    let current = null;
    for (const sec of sections) if (scrollY >= sec.offsetTop - 260) current = "#" + sec.id;
    navLinks.forEach(l => l.classList.toggle("active", l.getAttribute("href") === current));
  }, { passive: true });

  /* ---------- Reveal on scroll ---------- */
  let io = null;
  try {
    io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
    document.querySelectorAll(".reveal").forEach(el => io.observe(el));
  } catch (e) { io = null; }

  /* Failsafe: nothing on the page may stay hidden.
     1) immediately reveal whatever is already on screen,
     2) after 2.2s reveal everything no matter what. */
  const revealInView = () => {
    const vh = window.innerHeight || 800;
    document.querySelectorAll(".reveal:not(.visible)").forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) el.classList.add("visible");
    });
  };
  revealInView();
  setTimeout(revealInView, 400);
  setTimeout(() => {
    document.querySelectorAll(".reveal:not(.visible)").forEach(el => el.classList.add("visible"));
  }, 2200);

  /* ---------- 3D tilt on cards ---------- */
  if (matchMedia("(pointer: fine)").matches && !prefersReduced) {
    document.querySelectorAll("[data-tilt]").forEach(card => {
      const strength = 9;
      card.addEventListener("mousemove", e => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform =
          `perspective(900px) rotateY(${px * strength}deg) rotateX(${-py * strength}deg) translateY(-4px)`;
      });
      card.addEventListener("mouseleave", () => {
        card.style.transform = "";
      });
    });
  }

  /* ---------- NEET 2027 Countdown ---------- */
  const target = new Date("2027-05-02T14:00:00+05:30").getTime();
  // Prep meter: journey from 1 July 2025 (Aakash kick-off) to exam day
  const journeyStart = new Date("2025-07-01T00:00:00+05:30").getTime();

  const el = {
    d: document.getElementById("cdDays"),
    h: document.getElementById("cdHours"),
    m: document.getElementById("cdMins"),
    s: document.getElementById("cdSecs"),
    fill: document.getElementById("prepFill"),
    pct: document.getElementById("prepPct"),
  };

  const setNum = (node, val, len) => {
    const v = String(val).padStart(len, "0");
    if (node.textContent !== v) {
      node.textContent = v;
      node.classList.remove("tick");
      void node.offsetWidth; // restart animation
      node.classList.add("tick");
    }
  };

  const tickCountdown = () => {
    const now = Date.now();
    let diff = Math.max(0, target - now);
    const days = Math.floor(diff / 864e5);
    diff -= days * 864e5;
    const hrs = Math.floor(diff / 36e5);
    diff -= hrs * 36e5;
    const mins = Math.floor(diff / 6e4);
    diff -= mins * 6e4;
    const secs = Math.floor(diff / 1e3);

    setNum(el.d, days, 3);
    setNum(el.h, hrs, 2);
    setNum(el.m, mins, 2);
    setNum(el.s, secs, 2);

    const pct = Math.min(100, Math.max(0, ((now - journeyStart) / (target - journeyStart)) * 100));
    el.fill.style.width = pct.toFixed(1) + "%";
    el.pct.textContent = pct.toFixed(1) + "%";
  };
  tickCountdown();
  setInterval(tickCountdown, 1000);

  /* ---------- Quote rotator ---------- */
  const quotes = [
    { t: "Dream big. Work hard. Stay humble — AIIMS is calling.", a: "— Saad Sakhidas" },
    { t: "Success is the sum of small efforts, repeated day in and day out.", a: "— Robert Collier" },
    { t: "Every NCERT page you master today is a heartbeat you'll heal tomorrow.", a: "— Future Dr. Saad" },
    { t: "The pain of discipline weighs grams; the pain of regret weighs tons.", a: "— Study-room wall" },
    { t: "Mehnat itni khamoshi se karo, ke AIIMS ka darwaza khud khul jaye.", a: "— Saad Sakhidas" },
  ];
  const qBox = document.getElementById("quoteBox");
  const qText = document.getElementById("quoteText");
  const qAuth = document.getElementById("quoteAuthor");
  let qi = 0;
  setInterval(() => {
    qBox.classList.add("switch");
    setTimeout(() => {
      qi = (qi + 1) % quotes.length;
      qText.textContent = quotes[qi].t;
      qAuth.textContent = quotes[qi].a;
      qBox.classList.remove("switch");
    }, 600);
  }, 5000);

  /* ---------- Footer year ---------- */
  document.getElementById("year").textContent = new Date().getFullYear();
})();
