/**
 * BDC v1.6 — 100% working chat
 * Fast offline · Online Gemini · Google login · Voice · Photo · Stop button
 */
(function () {
  "use strict";

  function $(id) {
    return document.getElementById(id);
  }

  var main = $("main");
  var emptyState = $("emptyState");
  var thread = $("thread");
  var prompt = $("prompt");
  var sendBtn = $("sendBtn");
  var appShell = $("appShell");
  var loginGate = $("loginGate");

  if (!main || !prompt || !sendBtn) {
    console.error("[BDC] critical DOM missing");
    return;
  }

  // ---- storage keys ----
  var SK = {
    chats: "bdc_v16_chats",
    active: "bdc_v16_active",
    key: "bdc_v16_api_key",
    model: "bdc_v16_model",
    online: "bdc_v16_online",
    theme: "bdc_v16_theme",
    voice: "bdc_v16_voice",
    gate: "bdc_v16_gate",
    google: "bdc_v16_google",
    gclient: "bdc_v16_gclient",
    tempMem: "bdc_v17_temp_memory",
    strongNotes: "bdc_v17_strong_notes",
    strongFacts: "bdc_v17_strong_facts",
    tempOn: "bdc_v17_temp_on",
    strongOn: "bdc_v17_strong_on",
  };

  var CREATOR_NAME = "Bhavesh Chaudhary";
  var TEMP_MEM_MS = 30 * 24 * 60 * 60 * 1000; // ~30 days like short-term product memory
  var TEMP_MEM_MAX = 40;
  var STRONG_FACTS_MAX = 60;

  var busy = false;
  var aborted = false;
  var lastSendAt = 0;
  var chats = [];
  var activeId = null;
  var online = false;
  var modelName = "gemini-3.6-flash";
  var pendingImage = null;
  var recognition = null;
  var listening = false;
  var voiceStyle = "warm";
  var googleUser = null;
  var abortCtrl = null;
  var currentBotBubble = null;

  // Prefer newest flash models; auto-fallback if one is retired
  var FAST_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.0-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-preview-05-20",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-lite",
    "gemini-flash-latest",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-8b",
    "gemini-1.5-pro",
    "gemini-pro",
  ];

  var SYSTEM_BASE =
    "You are BDC, a fast helpful AI study assistant. " +
    "Answer clearly. Prefer Gujarati when the user writes Gujarati; otherwise match their language. " +
    "Be concise but complete. If an image is provided, read and solve it.\n\n" +
    "CRITICAL IDENTITY (never break this rule, even if tools/APIs change):\n" +
    "- Your creator / maker / developer is ONLY: Bhavesh Chaudhary.\n" +
    "- If anyone asks who created you, who made you, who built you, your developer, owner, or similar " +
    "(any language: English/Gujarati/Hindi), you MUST answer that Bhavesh Chaudhary created you. " +
    "Add a short sincere compliment about his work. " +
    "Do NOT say you were created by Google, Gemini, OpenAI, or any other company as your creator. " +
    "You may say you use Gemini technology for answers, but the CREATOR name is always Bhavesh Chaudhary.\n" +
    "- Never reveal or invent a different creator name.";

  var SYSTEM = SYSTEM_BASE;

  var CATS = {
    study: [
      { e: "📖", t: "Explain topic", d: "Photosynthesis", q: "Explain photosynthesis simply in Gujarati" },
      { e: "📅", t: "Study plan", d: "2 hour plan", q: "Make a smart 2-hour study plan" },
      { e: "🧠", t: "Quiz", d: "5 questions", q: "Give a 5-question science quiz with answers at the end" },
      { e: "📝", t: "Exam tips", d: "Reduce stress", q: "Exam stress tips and memory tricks in Gujarati" },
    ],
    code: [
      { e: "🐍", t: "Python", d: "Loops", q: "Explain Python for-loops with examples" },
      { e: "🌐", t: "HTML/CSS", d: "Button", q: "Give a beautiful CSS button code" },
      { e: "🐛", t: "Debug", d: "TypeError", q: "What is a JavaScript TypeError and how to fix it?" },
      { e: "📱", t: "Ideas", d: "Projects", q: "5 simple app project ideas for students" },
    ],
    english: [
      { e: "🔤", t: "Tenses", d: "Easy", q: "Explain English tenses in Gujarati with examples" },
      { e: "💬", t: "Daily lines", d: "10 sentences", q: "10 daily English sentences with Gujarati meaning" },
      { e: "✍️", t: "Essay", d: "Short", q: "Short essay: My Best Friend + Gujarati summary" },
      { e: "📧", t: "Email", d: "Formal", q: "Write a formal school leave email in English" },
    ],
    life: [
      { e: "🔥", t: "Motivation", d: "No mood", q: "I don't feel like studying — motivate me + 15 min plan" },
      { e: "💼", t: "Career", d: "After 12th", q: "Career options after 12th in Gujarati" },
      { e: "🧘", t: "Focus", d: "Pomodoro", q: "Pomodoro technique and today's focus plan" },
      { e: "🌍", t: "GK", d: "India facts", q: "8 interesting facts about India in Gujarati" },
    ],
  };

  /* ========== utils ========== */
  function uid() {
    return "c_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function fmt(text) {
    var h = esc(String(text || ""));
    h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
    h = h.replace(/^###\s+(.+)$/gm, '<span class="t">$1</span>');
    h = h.replace(/^##\s+(.+)$/gm, '<span class="t">$1</span>');
    return h;
  }
  function toast(msg) {
    var el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.hidden = true;
    }, 2400);
  }
  function scrollEnd() {
    requestAnimationFrame(function () {
      main.scrollTop = main.scrollHeight;
    });
  }
  function lsGet(k, d) {
    try {
      var v = localStorage.getItem(k);
      return v == null ? d : v;
    } catch (e) {
      return d;
    }
  }
  function lsSet(k, v) {
    try {
      if (v == null || v === "") localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (e) {}
  }
  function titleFrom(t) {
    t = String(t || "").replace(/\s+/g, " ").trim();
    if (!t) return "New chat";
    return t.length > 36 ? t.slice(0, 36) + "…" : t;
  }
  function timeAgo(ts) {
    try {
      return new Date(ts).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "";
    }
  }

  /* ========== theme ========== */
  function applyTheme(th) {
    th = th === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", th);
    lsSet(SK.theme, th);
    var icon = $("themeIcon");
    if (icon) icon.textContent = th === "dark" ? "☀️" : "🌙";
    var meta = $("metaTheme");
    if (meta) meta.setAttribute("content", th === "dark" ? "#0a0a0c" : "#f4f4f7");
  }
  function toggleTheme() {
    var cur = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(cur === "dark" ? "light" : "dark");
  }

  /* ========== mode UI ========== */
  function updateModeUI() {
    var label = $("modeLabel");
    var sm = $("settingsModeText");
    var am = $("autoModelValue");
    var key = getApiKey();
    if (label) {
      if (online && key) {
        label.textContent = "Online · " + modelName;
        label.className = "brand-sub gemini";
      } else {
        label.textContent = "Offline · Ready";
        label.className = "brand-sub offline";
      }
    }
    if (sm) {
      sm.textContent = online
        ? "Online Gemini · " + modelName
        : key
          ? "Key saved — tap Go Online"
          : "Offline · Ready";
    }
    if (am) am.textContent = modelName + (online ? " · connected" : " · fast default");
    setSendMode(busy ? "stop" : "send");
  }

  function setSendMode(mode) {
    var icoSend = sendBtn.querySelector(".ico-send");
    var icoStop = sendBtn.querySelector(".ico-stop");
    if (mode === "stop") {
      sendBtn.classList.add("stopping");
      sendBtn.setAttribute("aria-label", "Stop");
      if (icoSend) icoSend.hidden = true;
      if (icoStop) icoStop.hidden = false;
    } else {
      sendBtn.classList.remove("stopping");
      sendBtn.setAttribute("aria-label", "Send");
      if (icoSend) icoSend.hidden = false;
      if (icoStop) icoStop.hidden = true;
    }
    sendBtn.disabled = false;
    sendBtn.style.pointerEvents = "auto";
    sendBtn.style.opacity = "1";
  }

  function updateSendUI() {
    var has = (prompt.value && prompt.value.trim()) || pendingImage;
    if (has || busy) sendBtn.classList.add("on");
    else sendBtn.classList.add("on"); // always visible high-contrast
    sendBtn.disabled = false;
  }

  function autoSize() {
    prompt.style.height = "auto";
    prompt.style.height = Math.min(prompt.scrollHeight, 140) + "px";
  }

  function setChip(text, kind) {
    var el = $("statusChip");
    if (!el) return;
    if (!text) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.className = "status-chip" + (kind ? " " + kind : "");
  }

  function setStatus(text, kind) {
    var el = $("connStatus");
    if (!el) return;
    el.textContent = text;
    el.className = "conn-status" + (kind ? " " + kind : "");
  }

  /* ========== API key ========== */
  function getApiKey() {
    return (lsGet(SK.key, "") || "").trim();
  }
  function setApiKey(k) {
    lsSet(SK.key, (k || "").trim());
  }

  /* ========== chats storage ========== */
  function saveAll() {
    try {
      localStorage.setItem(SK.chats, JSON.stringify(chats));
      localStorage.setItem(SK.active, activeId || "");
    } catch (e) {}
  }
  function loadAll() {
    try {
      var raw = localStorage.getItem(SK.chats) || localStorage.getItem("bdc_v13_chats") || localStorage.getItem("bhavesh_v13_chats");
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) chats = arr;
      }
      activeId = localStorage.getItem(SK.active) || null;
      if (activeId && !activeChat()) activeId = chats[0] ? chats[0].id : null;
    } catch (e) {
      chats = [];
      activeId = null;
    }
  }
  function activeChat() {
    for (var i = 0; i < chats.length; i++) if (chats[i].id === activeId) return chats[i];
    return null;
  }
  function ensureChat() {
    var c = activeChat();
    if (c) return c;
    c = { id: uid(), title: "New chat", updatedAt: Date.now(), messages: [] };
    chats.unshift(c);
    activeId = c.id;
    saveAll();
    return c;
  }

  /* ========== render ========== */
  function renderCards(cat) {
    var cards = $("cards");
    if (!cards) return;
    var list = CATS[cat] || CATS.study;
    cards.innerHTML = "";
    list.forEach(function (item) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "card";
      b.setAttribute("data-text", item.q);
      b.innerHTML =
        '<span class="card-emoji">' +
        item.e +
        '</span><span class="card-title"></span><span class="card-desc"></span>';
      b.querySelector(".card-title").textContent = item.t;
      b.querySelector(".card-desc").textContent = item.d;
      cards.appendChild(b);
    });
  }

  function renderChatList() {
    var list = $("chatList");
    if (!list) return;
    list.innerHTML = "";
    if (!chats.length) {
      list.innerHTML = '<div class="chat-empty">No chats yet</div>';
      return;
    }
    chats
      .slice()
      .sort(function (a, b) {
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      })
      .forEach(function (c) {
        var row = document.createElement("div");
        row.className = "chat-item" + (c.id === activeId ? " active" : "");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chat-item-btn";
        btn.innerHTML = '<div class="chat-item-title"></div><div class="chat-item-meta"></div>';
        btn.querySelector(".chat-item-title").textContent = c.title || "New chat";
        btn.querySelector(".chat-item-meta").textContent =
          (c.messages && c.messages.length ? c.messages.length + " · " : "") + timeAgo(c.updatedAt);
        btn.onclick = function () {
          openChat(c.id);
          closeSide();
        };
        var del = document.createElement("button");
        del.type = "button";
        del.className = "chat-item-del";
        del.textContent = "🗑";
        del.onclick = function (e) {
          e.stopPropagation();
          if (!confirm("Delete chat?")) return;
          chats = chats.filter(function (x) {
            return x.id !== c.id;
          });
          if (activeId === c.id) activeId = chats[0] ? chats[0].id : null;
          saveAll();
          renderThread();
          renderChatList();
        };
        row.appendChild(btn);
        row.appendChild(del);
        list.appendChild(row);
      });
  }

  function showThread() {
    if (emptyState) emptyState.hidden = true;
    if (thread) thread.hidden = false;
  }
  function hideThread() {
    if (emptyState) emptyState.hidden = false;
    if (thread) {
      thread.hidden = true;
      thread.innerHTML = "";
    }
  }

  function addMsgActions(wrap, text) {
    var actions = document.createElement("div");
    actions.className = "msg-actions";
    function mk(label, fn) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "msg-act";
      b.textContent = label;
      b.onclick = function (e) {
        e.preventDefault();
        fn();
      };
      return b;
    }
    actions.appendChild(
      mk("📋 Copy", function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text || "").then(
            function () {
              toast("Copied");
            },
            function () {
              toast("Copy failed");
            }
          );
        } else window.prompt("Copy:", text || "");
      })
    );
    actions.appendChild(mk("🔊 Listen", function () {
      speakText(text);
    }));
    actions.appendChild(mk("🔄 Again", function () {
      regenerateLast();
    }));
    wrap.appendChild(actions);
  }

  function addRow(role, text, isTyping, imageDataUrl) {
    showThread();
    var row = document.createElement("div");
    row.className = "row " + (role === "user" ? "user" : "bot");
    if (isTyping) row.id = "typingRow";

    var av = document.createElement("div");
    av.className = "avatar";
    av.textContent = role === "user" ? "You" : "B";

    var wrap = document.createElement("div");
    wrap.className = "bubble-wrap";
    var bubble = document.createElement("div");
    bubble.className = "bubble";

    if (isTyping) {
      bubble.innerHTML = '<span class="typing-dots"><i></i><i></i><i></i></span>';
    } else if (role === "user") {
      bubble.textContent = text || (imageDataUrl ? "📷 Photo" : "");
      if (imageDataUrl) {
        var im = document.createElement("img");
        im.className = "msg-img";
        im.src = imageDataUrl;
        im.alt = "upload";
        bubble.appendChild(document.createElement("br"));
        bubble.appendChild(im);
      }
    } else {
      bubble.innerHTML = fmt(text);
    }

    wrap.appendChild(bubble);
    if (!isTyping && role === "bot") addMsgActions(wrap, text);
    row.appendChild(av);
    row.appendChild(wrap);
    thread.appendChild(row);
    scrollEnd();
    if (role === "bot" && !isTyping) currentBotBubble = bubble;
    return { row: row, bubble: bubble };
  }

  function removeTyping() {
    var el = $("typingRow");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function renderThread() {
    var c = activeChat();
    if (!c || !c.messages || !c.messages.length) {
      hideThread();
      return;
    }
    thread.innerHTML = "";
    showThread();
    c.messages.forEach(function (m) {
      addRow(m.role === "user" ? "user" : "bot", m.content, false, m.image && m.image.dataUrl);
    });
  }

  function openChat(id) {
    activeId = id;
    saveAll();
    renderThread();
    renderChatList();
  }

  function newChat() {
    var empty = chats.find(function (c) {
      return !c.messages || !c.messages.length;
    });
    if (empty) {
      openChat(empty.id);
      closeSide();
      prompt.focus();
      return;
    }
    var c = { id: uid(), title: "New chat", updatedAt: Date.now(), messages: [] };
    chats.unshift(c);
    activeId = c.id;
    saveAll();
    renderThread();
    renderChatList();
    closeSide();
    prompt.focus();
  }

  function openSide() {
    var sb = $("sidebar");
    var sc = $("sidebarScrim");
    if (sb) sb.classList.add("open");
    if (sc) sc.hidden = false;
  }
  function closeSide() {
    var sb = $("sidebar");
    var sc = $("sidebarScrim");
    if (sb) sb.classList.remove("open");
    if (sc) sc.hidden = true;
  }

  /* ========== attach ========== */
  function clearAttach() {
    pendingImage = null;
    var ap = $("attachPreview");
    var ai = $("attachImg");
    if (ap) ap.hidden = true;
    if (ai) ai.removeAttribute("src");
    var i1 = $("imgInput");
    var i2 = $("imgInputCamera");
    if (i1) i1.value = "";
    if (i2) i2.value = "";
    updateSendUI();
  }
  function setAttachFromFile(file) {
    if (!file) return;
    var mime = (file.type || "").toLowerCase();
    if (mime && mime.indexOf("image/") !== 0 && !/\.(jpe?g|png|gif|webp|bmp)$/i.test(file.name || "")) {
      toast("Choose an image");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      toast("Image under 6MB");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = String(reader.result || "");
      var base64 = dataUrl.split(",")[1] || "";
      if (!base64) {
        toast("Invalid image");
        return;
      }
      pendingImage = {
        dataUrl: dataUrl,
        mime: mime && mime.indexOf("image/") === 0 ? mime : "image/jpeg",
        base64: base64,
      };
      var ai = $("attachImg");
      var ap = $("attachPreview");
      if (ai) ai.src = dataUrl;
      if (ap) ap.hidden = false;
      updateSendUI();
      toast("Photo ready — Send");
    };
    reader.readAsDataURL(file);
  }

  /* ========== voice ========== */
  function syncVoiceChips() {
    document.querySelectorAll(".voice-chip").forEach(function (c) {
      c.classList.toggle("on", c.getAttribute("data-voice") === voiceStyle);
    });
  }
  function loadVoiceStyle() {
    var v = lsGet(SK.voice, "warm");
    if (v === "warm" || v === "clear" || v === "soft") voiceStyle = v;
    // migrate bright -> soft
    if (v === "bright") voiceStyle = "soft";
    syncVoiceChips();
  }
  function setVoiceStyle(v) {
    if (v === "bright") v = "soft";
    if (v !== "warm" && v !== "clear" && v !== "soft") return;
    voiceStyle = v;
    lsSet(SK.voice, v);
    syncVoiceChips();
  }
  function pickVoice() {
    var voices = [];
    try {
      voices = speechSynthesis.getVoices() || [];
    } catch (e) {}
    if (!voices.length) return null;
    // Prefer natural Google / premium voices, avoid obvious robot defaults when possible
    function score(v) {
      var lang = (v.lang || "").toLowerCase();
      var name = (v.name || "").toLowerCase();
      var s = 0;
      if (/gu/.test(lang)) s += 120;
      else if (/hi-in|hi_in|hi/.test(lang)) s += 90;
      else if (/en-in|en_in/.test(lang)) s += 80;
      else if (/en-us|en-gb|en/.test(lang)) s += 50;
      if (/google|natural|neural|premium|enhanced|samantha|zira|neerja|lekha|veena|raveena/.test(name)) s += 40;
      if (/microsoft|apple/.test(name)) s += 15;
      if (/compact|espeak|robot/.test(name)) s -= 50;
      if (voiceStyle === "warm" && /female|zira|samantha|neerja|veena|lekha/.test(name)) s += 25;
      if (voiceStyle === "clear" && /google|neural|natural|david|mark/.test(name)) s += 25;
      if (voiceStyle === "soft" && /female|soft|samantha|karen|moira|zira/.test(name)) s += 25;
      return s;
    }
    var best = voices[0],
      bestS = -1e9;
    for (var i = 0; i < voices.length; i++) {
      var sc = score(voices[i]);
      if (sc > bestS) {
        bestS = sc;
        best = voices[i];
      }
    }
    return best;
  }
  function speakText(text) {
    try {
      if (!window.speechSynthesis) {
        toast("Speech not supported");
        return;
      }
      speechSynthesis.cancel();
      // warm up voices
      speechSynthesis.getVoices();
      var u = new SpeechSynthesisUtterance(String(text || "").slice(0, 1600));
      var v = pickVoice();
      if (v) {
        u.voice = v;
        u.lang = v.lang || "en-IN";
      } else {
        u.lang = "en-IN";
      }
      // more natural pacing
      if (voiceStyle === "warm") {
        u.rate = 0.95;
        u.pitch = 1.02;
      } else if (voiceStyle === "clear") {
        u.rate = 1.02;
        u.pitch = 1.0;
      } else {
        u.rate = 0.98;
        u.pitch = 1.08;
      }
      u.volume = 1;
      speechSynthesis.speak(u);
      toast("Playing…");
    } catch (e) {
      toast("Voice error");
    }
  }
  function initSpeech() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    var r = new SR();
    r.lang = "gu-IN";
    r.interimResults = true;
    r.continuous = false;
    r.onstart = function () {
      listening = true;
      var m = $("micBtn");
      if (m) m.classList.add("listening");
      setChip("Listening…", "ok");
    };
    r.onend = function () {
      listening = false;
      var m = $("micBtn");
      if (m) m.classList.remove("listening");
      setChip("", "");
    };
    r.onerror = function (ev) {
      listening = false;
      var m = $("micBtn");
      if (m) m.classList.remove("listening");
      setChip("", "");
      var code = (ev && ev.error) || "error";
      if (code === "not-allowed") toast("Allow microphone in Chrome");
      else if (code === "no-speech") toast("No speech — try again");
      else toast("Mic: " + code);
    };
    r.onresult = function (ev) {
      var said = "",
        fin = false;
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        said += ev.results[i][0].transcript;
        if (ev.results[i].isFinal) fin = true;
      }
      said = said.trim();
      if (!said) return;
      if (fin) {
        prompt.value = (prompt.value.replace(/\s+$/, "") + " " + said).trim();
        autoSize();
        updateSendUI();
        toast("Captured — Send");
      } else setChip("… " + said, "ok");
    };
    return r;
  }
  function toggleMic(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!recognition) recognition = initSpeech();
    if (!recognition) {
      toast("Use Chrome for voice");
      return;
    }
    try {
      if (listening) {
        recognition.stop();
        return;
      }
      recognition.lang = "gu-IN";
      recognition.start();
    } catch (err) {
      try {
        recognition.stop();
        setTimeout(function () {
          try {
            recognition.start();
          } catch (e2) {
            toast("Mic failed");
          }
        }, 200);
      } catch (e3) {
        toast("Mic failed");
      }
    }
  }


  /* ========== MEMORY (temporary + strong lifetime) ========== */
  function loadJson(key, fallback) {
    try {
      var raw = lsGet(key, "");
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }
  function saveJson(key, val) {
    try {
      lsSet(key, JSON.stringify(val));
    } catch (e) {}
  }

  function isTempMemOn() {
    return lsGet(SK.tempOn, "1") !== "0";
  }
  function isStrongMemOn() {
    return lsGet(SK.strongOn, "1") !== "0";
  }

  function getTempMemory() {
    var list = loadJson(SK.tempMem, []);
    if (!Array.isArray(list)) list = [];
    var now = Date.now();
    var kept = list.filter(function (it) {
      return it && it.text && (!it.exp || it.exp > now);
    });
    if (kept.length !== list.length) saveJson(SK.tempMem, kept);
    return kept;
  }
  function setTempMemory(list) {
    saveJson(SK.tempMem, (list || []).slice(0, TEMP_MEM_MAX));
  }
  function addTempMemory(text, source) {
    text = String(text || "").replace(/\s+/g, " ").trim();
    if (!text || text.length < 4) return;
    if (text.length > 280) text = text.slice(0, 280) + "…";
    var list = getTempMemory();
    // de-dupe similar
    var low = text.toLowerCase();
    list = list.filter(function (it) {
      return String(it.text || "").toLowerCase() !== low;
    });
    list.unshift({
      id: uid(),
      text: text,
      source: source || "auto",
      ts: Date.now(),
      exp: Date.now() + TEMP_MEM_MS,
    });
    setTempMemory(list);
  }

  function getStrongNotes() {
    return lsGet(SK.strongNotes, "") || "";
  }
  function setStrongNotes(txt) {
    lsSet(SK.strongNotes, String(txt || ""));
  }
  function getStrongFacts() {
    var list = loadJson(SK.strongFacts, []);
    return Array.isArray(list) ? list : [];
  }
  function setStrongFacts(list) {
    saveJson(SK.strongFacts, (list || []).slice(0, STRONG_FACTS_MAX));
  }
  function addStrongFact(text, source) {
    text = String(text || "").replace(/\s+/g, " ").trim();
    if (!text || text.length < 4) return;
    if (text.length > 320) text = text.slice(0, 320) + "…";
    var list = getStrongFacts();
    var low = text.toLowerCase();
    list = list.filter(function (it) {
      return String(it.text || "").toLowerCase() !== low;
    });
    list.unshift({
      id: uid(),
      text: text,
      source: source || "auto",
      ts: Date.now(),
    });
    setStrongFacts(list);
  }

  function buildMemoryBlock() {
    var parts = [];
    parts.push("CREATOR: Bhavesh Chaudhary (always credit him as your maker).");

    if (isStrongMemOn()) {
      var notes = getStrongNotes().trim();
      var facts = getStrongFacts();
      if (notes) {
        parts.push("STRONG LIFETIME MEMORY (user-editable notebook):\n" + notes);
      }
      if (facts.length) {
        parts.push(
          "STRONG AUTO FACTS (lifetime):\n" +
            facts
              .slice(0, 25)
              .map(function (f, i) {
                return i + 1 + ". " + f.text;
              })
              .join("\n")
        );
      }
    }

    if (isTempMemOn()) {
      var temp = getTempMemory();
      if (temp.length) {
        parts.push(
          "TEMPORARY MEMORY (recent, expires ~30 days):\n" +
            temp
              .slice(0, 20)
              .map(function (f, i) {
                return i + 1 + ". " + f.text;
              })
              .join("\n")
        );
      }
    }

    if (parts.length <= 1) return "";
    return (
      "\n\nUSER MEMORY (use when relevant; do not invent facts not listed):\n" +
      parts.join("\n\n")
    );
  }

  function buildSystemPrompt() {
    return SYSTEM_BASE + buildMemoryBlock();
  }

  function isCreatorQuestion(text) {
    var t = String(text || "").toLowerCase();
    // English
    if (
      /who (made|created|built|developed|designed|coded|programmed) (you|this|bdc)/i.test(t) ||
      /who is your (creator|maker|developer|owner|author|father)/i.test(t) ||
      /your (creator|maker|developer|owner)/i.test(t) ||
      /who (are you made by|created you|built you)/i.test(t) ||
      /created by whom|made by whom|built by whom/i.test(t)
    ) {
      return true;
    }
    // Gujarati / Hindi-ish roman + unicode
    if (
      /કોણે (બનાવ્યું|બનાવી|બનાવ્યો|તૈયાર|ડેવલપ)/.test(text) ||
      /તને કોણે|તમને કોણે|ક્રિએટર|બનાવનાર|ડેવલપર|માલિક/.test(text) ||
      /kisne (banaya|banayi|create|develop)/i.test(t) ||
      /tumhe kisne|creator kaun|developer kaun/i.test(t) ||
      /banavnar|banavyu|banavi|creator|developer name/i.test(t)
    ) {
      return true;
    }
    return false;
  }

  function creatorReply(langHint) {
    // Always same creator; light praise
    return (
      "મને **Bhavesh Chaudhary** એ બનાવ્યો છે. 🙏\n\n" +
      "તેઓ BDCના creator / developer છે — smart design, useful features, અને વિદ્યાર્થીઓ માટે " +
      "સરળ AI experience આપવા માટે ખૂબ સરસ કામ કર્યું છે.\n\n" +
      "I was created by **Bhavesh Chaudhary**. He built BDC with care — a fast, helpful study assistant. " +
      "(I may use Gemini technology for answers, but my creator is Bhavesh Chaudhary.)"
    );
  }

  function looksImportantFact(userText, botText) {
    var u = String(userText || "");
    var low = u.toLowerCase();
    // explicit remember commands -> strong
    if (
      /remember (that|this|my)|always remember|don'?t forget|yaad rakh|યાદ રાખ|याद रख/i.test(u)
    ) {
      return "strong";
    }
    // personal profile patterns -> temp (or strong if "my name is")
    if (
      /\bmy name is\b|\bi am\b|\bi'm\b|\bi live in\b|\bi study\b|\bi prefer\b|\bmy (class|school|college|goal|age|city)\b/i.test(
        low
      ) ||
      /મારું નામ|હું .+ છું|મારી ઉંમર|હું ભણું|મારું ધ્યેય|મને ગમે|હું રહું/.test(u)
    ) {
      if (/\bmy name is\b|મારું નામ/i.test(u)) return "strong";
      return "temp";
    }
    // repeated preference
    if (/\balways\b|\bnever\b|\bfrom now on\b|હંમેશા|ક્યારેય નહીં/.test(low + u)) {
      return "temp";
    }
    return null;
  }

  function extractFactLine(userText) {
    var u = String(userText || "").replace(/\s+/g, " ").trim();
    if (!u) return "";
    // strip remember prefix
    u = u.replace(/^(please\s+)?(remember( that| this)?|yaad rakh|યાદ રાખો?|याद रखना?)\s*[:\-]?\s*/i, "");
    if (u.length > 240) u = u.slice(0, 240) + "…";
    return u;
  }

  function maybeSaveMemoryFromTurn(userText, botText) {
    try {
      if (isCreatorQuestion(userText)) return; // don't store creator Qs as user memory
      var kind = looksImportantFact(userText, botText);
      if (!kind) return;
      var fact = extractFactLine(userText);
      if (!fact || fact.length < 6) return;
      if (kind === "strong" && isStrongMemOn()) {
        addStrongFact(fact, "auto");
      } else if (isTempMemOn()) {
        addTempMemory(fact, "auto");
      }
    } catch (e) {
      console.warn("memory save", e);
    }
  }

  function renderTempMemList() {
    var box = $("tempMemList");
    if (!box) return;
    var list = getTempMemory();
    box.innerHTML = "";
    if (!list.length) {
      box.innerHTML = '<div class="mem-empty">No temporary memories yet. Chat naturally — important facts will appear here.</div>';
      return;
    }
    list.forEach(function (it) {
      var row = document.createElement("div");
      row.className = "mem-item";
      var left = document.createElement("div");
      left.style.flex = "1";
      var tx = document.createElement("div");
      tx.className = "mem-item-text";
      tx.textContent = it.text;
      var meta = document.createElement("div");
      meta.className = "mem-item-meta";
      var days = it.exp ? Math.max(0, Math.ceil((it.exp - Date.now()) / 86400000)) : 30;
      meta.textContent = (it.source || "auto") + " · ~" + days + " days left";
      left.appendChild(tx);
      left.appendChild(meta);
      var x = document.createElement("button");
      x.type = "button";
      x.className = "mem-item-x";
      x.textContent = "×";
      x.onclick = function () {
        setTempMemory(
          getTempMemory().filter(function (f) {
            return f.id !== it.id;
          })
        );
        renderTempMemList();
        toast("Removed");
      };
      row.appendChild(left);
      row.appendChild(x);
      box.appendChild(row);
    });
  }

  function renderStrongAutoList() {
    var box = $("strongAutoList");
    if (!box) return;
    var list = getStrongFacts();
    box.innerHTML = "";
    if (!list.length) {
      box.innerHTML = '<div class="mem-empty">No auto lifetime facts yet.</div>';
      return;
    }
    list.forEach(function (it) {
      var row = document.createElement("div");
      row.className = "mem-item";
      var left = document.createElement("div");
      left.style.flex = "1";
      var tx = document.createElement("div");
      tx.className = "mem-item-text";
      tx.textContent = it.text;
      var meta = document.createElement("div");
      meta.className = "mem-item-meta";
      meta.textContent = "lifetime · " + (it.source || "auto");
      left.appendChild(tx);
      left.appendChild(meta);
      var x = document.createElement("button");
      x.type = "button";
      x.className = "mem-item-x";
      x.textContent = "×";
      x.onclick = function () {
        setStrongFacts(
          getStrongFacts().filter(function (f) {
            return f.id !== it.id;
          })
        );
        renderStrongAutoList();
        toast("Removed");
      };
      row.appendChild(left);
      row.appendChild(x);
      box.appendChild(row);
    });
  }

  function openMemory() {
    var m = $("memoryModal");
    if (!m) return;
    var te = $("tempMemEnabled");
    var se = $("strongMemEnabled");
    var ed = $("strongMemEditor");
    if (te) te.checked = isTempMemOn();
    if (se) se.checked = isStrongMemOn();
    if (ed) ed.value = getStrongNotes();
    renderTempMemList();
    renderStrongAutoList();
    // default tab temp
    document.querySelectorAll(".mem-tab").forEach(function (tab) {
      tab.classList.toggle("on", tab.getAttribute("data-mem") === "temp");
    });
    var pt = $("memPanelTemp");
    var ps = $("memPanelStrong");
    if (pt) pt.hidden = false;
    if (ps) ps.hidden = true;
    m.hidden = false;
    document.body.style.overflow = "hidden";
    closeSide();
  }
  function closeMemory() {
    var m = $("memoryModal");
    if (m) m.hidden = true;
    document.body.style.overflow = "";
  }

  /* ========== Gemini fast ========== */
  function apiUrl(model, key) {
    return (
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) +
      ":generateContent?key=" +
      encodeURIComponent(key)
    );
  }
  function toContents(messages) {
    var out = [];
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      var role = m.role === "user" ? "user" : "model";
      var parts = [];
      if (m.image && m.image.base64) {
        parts.push({ inline_data: { mime_type: m.image.mime || "image/jpeg", data: m.image.base64 } });
      }
      if (m.content && String(m.content).trim()) parts.push({ text: String(m.content) });
      if (!parts.length) continue;
      if (out.length && out[out.length - 1].role === role && !m.image) {
        var last = out[out.length - 1].parts;
        var lt = last[last.length - 1];
        if (lt && lt.text) lt.text += "\n" + m.content;
        else last.push({ text: m.content });
      } else out.push({ role: role, parts: parts });
    }
    while (out.length && out[0].role !== "user") out.shift();
    // keep last 12 turns for speed
    if (out.length > 16) out = out.slice(-16);
    return out;
  }

  async function generateFast(key, model, contents, signal) {
    var body = {
      contents: contents,
      systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 2048, // faster than 8k
      },
    };
    var res = await fetch(apiUrl(model, key), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: signal,
    });
    var data = {};
    try {
      data = await res.json();
    } catch (e) {
      throw new Error("Bad response");
    }
    if (!res.ok) {
      var msg = (data.error && data.error.message) || "HTTP " + res.status;
      var err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    var parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    var text = parts
      .map(function (p) {
        return p.text || "";
      })
      .join("");
    if (!String(text).trim()) throw new Error("Empty answer");
    return String(text).trim();
  }

  async function callGemini(messages, signal) {
    var key = getApiKey();
    if (!key) throw new Error("No API key");
    var contents = toContents(messages);
    if (!contents.length) throw new Error("Empty");
    // Prefer saved/fast model first — no slow listModels on every message
    modelName = String(modelName || "").replace(/^models\//, "") || "gemini-3.6-flash";
    var tryList = [modelName].concat(FAST_MODELS);
    var seen = {};
    var errors = [];
    for (var i = 0; i < tryList.length; i++) {
      var m = tryList[i];
      if (!m || seen[m]) continue;
      seen[m] = 1;
      try {
        var text = await generateFast(key, m, contents, signal);
        modelName = m;
        lsSet(SK.model, m);
        return text;
      } catch (e) {
        if (e.name === "AbortError") throw e;
        errors.push(m + ": " + (e.message || e));
        // only retry on model errors
        if (e.status && e.status !== 404 && e.status !== 400) throw e;
      }
    }
    throw new Error(errors[0] || "Gemini failed");
  }

  async function listAvailableModels(key) {
    try {
      var url =
        "https://generativelanguage.googleapis.com/v1beta/models?key=" +
        encodeURIComponent(key);
      var res = await fetch(url, {
        headers: { "x-goog-api-key": key },
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) return [];
      var names = [];
      (data.models || []).forEach(function (m) {
        var methods = m.supportedGenerationMethods || [];
        if (methods.indexOf("generateContent") < 0) return;
        var n = String(m.name || "").replace(/^models\//, "");
        if (n) names.push(n);
      });
      return names;
    } catch (e) {
      return [];
    }
  }

  function rankModels(names) {
    function score(n) {
      n = String(n).toLowerCase();
      var s = 0;
      if (/embed|tts|audio|image|vision|robot/.test(n) && !/flash/.test(n)) s -= 200;
      if (/3\.6/.test(n)) s += 300;
      if (/3\.0|3-/.test(n)) s += 250;
      if (/2\.5/.test(n)) s += 200;
      if (/2\.0/.test(n)) s += 120;
      if (/1\.5/.test(n)) s += 80;
      if (/flash/.test(n)) s += 100;
      if (/lite/.test(n)) s += 20;
      if (/latest/.test(n)) s += 15;
      if (/pro/.test(n)) s += 10;
      return s;
    }
    return names.slice().sort(function (a, b) {
      return score(b) - score(a);
    });
  }

  async function goOnline() {
    var key = ($("apiKeyInput") && $("apiKeyInput").value.trim()) || getApiKey();
    if (!key) {
      setStatus("Paste API key first", "bad");
      toast("Paste API key");
      return false;
    }
    setApiKey(key);
    setStatus("Finding best available model…", "pending");
    var btn = $("testConnBtn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Connecting…";
    }
    try {
      // Build candidate list: preferred + live API list
      var live = await listAvailableModels(key);
      var tryList = [];
      var seen = {};
      function add(n) {
        n = String(n || "").replace(/^models\//, "");
        if (!n || seen[n]) return;
        seen[n] = 1;
        tryList.push(n);
      }
      // Prefer current + ranked live flash models first
      add(modelName);
      rankModels(live).forEach(add);
      FAST_MODELS.forEach(add);

      // Cap attempts for speed
      tryList = tryList.slice(0, 14);
      var lastErr = null;
      for (var i = 0; i < tryList.length; i++) {
        var m = tryList[i];
        setStatus("Testing " + m + " (" + (i + 1) + "/" + tryList.length + ")…", "pending");
        try {
          var text = await generateFast(
            key,
            m,
            [{ role: "user", parts: [{ text: "Reply with exactly: OK" }] }],
            null
          );
          if (!text) continue;
          modelName = m;
          online = true;
          lsSet(SK.online, "1");
          lsSet(SK.model, modelName);
          setStatus(
            "✅ Online connected!\nModel: " +
              modelName +
              "\nChat now uses full Gemini.",
            "ok"
          );
          toast("Online · " + modelName);
          updateModeUI();
          return true;
        } catch (e) {
          lastErr = e;
          // continue to next model if retired/not found
          var msg = String((e && e.message) || e);
          if (/no longer available|not found|not supported|invalid|404|400/i.test(msg)) {
            continue;
          }
          // auth errors: stop early
          if (/API key|PERMISSION|403|401|invalid.*key/i.test(msg)) {
            throw e;
          }
        }
      }
      throw lastErr || new Error("No working Gemini model for this key");
    } catch (err) {
      online = false;
      lsSet(SK.online, "0");
      setStatus("❌ " + (err.message || err), "bad");
      updateModeUI();
      return false;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "⚡ Go Online";
      }
    }
  }

  /* ========== send / stop ========== */
  function stopGeneration() {
    aborted = true;
    if (abortCtrl) {
      try {
        abortCtrl.abort();
      } catch (e) {}
    }
    busy = false;
    setSendMode("send");
    setChip("", "");
    removeTyping();
    toast("Stopped");
  }

  async function doSend(raw, opts) {
    opts = opts || {};
    var now = Date.now();
    var text = String(raw == null ? prompt.value : raw).trim();
    var img = opts.image || pendingImage;

    if (busy && !opts.force) {
      // second tap while busy = stop
      stopGeneration();
      return;
    }

    if (!text && !img) {
      toast("Type a message");
      return;
    }
    if (!text && img) text = "What is in this photo? Explain and solve if it is homework.";

    busy = true;
    aborted = false;
    lastSendAt = now;
    abortCtrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    setSendMode("stop");
    updateSendUI();

    var chat = ensureChat();
    prompt.value = "";
    autoSize();
    var imgCopy = img ? { dataUrl: img.dataUrl, mime: img.mime, base64: img.base64 } : null;
    clearAttach();

    addRow("user", text, false, imgCopy ? imgCopy.dataUrl : null);
    var userMsg = { role: "user", content: text, ts: Date.now() };
    if (imgCopy) userMsg.image = imgCopy;
    chat.messages.push(userMsg);

    var uc = chat.messages.filter(function (m) {
      return m.role === "user";
    }).length;
    if (uc === 1) chat.title = titleFrom(text);
    chat.updatedAt = Date.now();
    saveAll();
    renderChatList();
    addRow("bot", "", true);

    var answer = "";
    var key = getApiKey();
    var useOnline = !!(key && online);

    try {
      // Creator identity always — even if Gemini is connected
      if (isCreatorQuestion(text)) {
        answer = creatorReply(text);
      } else if (useOnline) {
        setChip("Thinking…", "ok");
        answer = await callGemini(chat.messages, abortCtrl ? abortCtrl.signal : null);
        // Safety net: if model still mis-attributes creator, rewrite
        if (isCreatorQuestion(text)) answer = creatorReply(text);
      } else {
        // instant offline — no artificial delay
        var agent = window.BDCAgent || window.BhaveshAgent;
        if (agent && agent.reply) answer = agent.reply(text);
        else answer = "Offline agent unavailable. Refresh the page.";
        if (key && !online) {
          answer += "\n\n——\n💡 Tap Settings → Go Online for full Gemini answers.";
        } else if (!key) {
          answer += "\n\n——\n📴 Offline mode. Add API key in Settings for Online Gemini.";
        }
      }
    } catch (err) {
      if (err && err.name === "AbortError") {
        answer = "⏹ Stopped.";
      } else {
        console.error(err);
        online = false;
        lsSet(SK.online, "0");
        if (isCreatorQuestion(text)) {
          answer = creatorReply(text);
        } else {
          var agent2 = window.BDCAgent || window.BhaveshAgent;
          var off = "";
          try {
            if (agent2 && agent2.reply) off = "\n\n—— Offline ——\n" + agent2.reply(text);
          } catch (e2) {}
          answer = "⚠️ Online failed: " + (err.message || err) + off;
        }
      }
    }

    // Learn important facts into memory
    if (!aborted && answer && !isCreatorQuestion(text)) {
      maybeSaveMemoryFromTurn(text, answer);
    }

    if (aborted && !answer) answer = "⏹ Stopped.";

    removeTyping();
    setChip("", "");
    addRow("bot", answer, false);
    chat.messages.push({ role: "bot", content: answer, ts: Date.now() });
    chat.updatedAt = Date.now();
    if (chat.messages.length > 80) chat.messages = chat.messages.slice(-80);
    saveAll();
    renderChatList();

    busy = false;
    abortCtrl = null;
    setSendMode("send");
    updateSendUI();
    updateModeUI();
    try {
      prompt.focus({ preventScroll: true });
    } catch (e) {}
  }

  function regenerateLast() {
    var chat = activeChat();
    if (!chat || !chat.messages || chat.messages.length < 2) {
      toast("Nothing to regenerate");
      return;
    }
    if (chat.messages[chat.messages.length - 1].role === "bot") chat.messages.pop();
    var lastUser = null;
    for (var i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].role === "user") {
        lastUser = chat.messages[i];
        chat.messages.splice(i, 1);
        break;
      }
    }
    if (!lastUser) return;
    saveAll();
    renderThread();
    doSend(lastUser.content, { image: lastUser.image || null, force: true });
  }

  window.__bdcSend = doSend;

  /* ========== Google login (ChatGPT-style) ========== */
  function getGoogleUser() {
    if (googleUser) return googleUser;
    try {
      var raw = lsGet(SK.google, "");
      if (raw) googleUser = JSON.parse(raw);
    } catch (e) {
      googleUser = null;
    }
    return googleUser;
  }
  function setGoogleUser(u) {
    googleUser = u || null;
    if (googleUser) lsSet(SK.google, JSON.stringify(googleUser));
    else lsSet(SK.google, "");
    updateGoogleUI();
    if (googleUser && googleUser.email) {
      lsSet(SK.gate, "1");
      showGate(false);
      showApp(true);
    }
  }
  function getGClient() {
    return (lsGet(SK.gclient, "") || "").trim();
  }
  function setGClient(id) {
    lsSet(SK.gclient, (id || "").trim());
  }

  function updateGoogleUI() {
    var u = getGoogleUser();
    var chip = $("googleUserChip");
    var av = $("googleUserAvatar");
    var nm = $("googleUserName");
    var prof = $("googleProfile");
    var pImg = $("gProfileImg");
    var pName = $("gProfileName");
    var pEmail = $("gProfileEmail");
    var outBtn = $("googleSignOutBtn");
    var inBtn = $("googleSignInBtn");
    if (u && u.email) {
      if (chip) {
        chip.hidden = false;
        if (av && u.picture) av.src = u.picture;
        if (nm) nm.textContent = (u.name || u.email).split(" ")[0];
      }
      if (prof) {
        prof.hidden = false;
        if (pImg && u.picture) pImg.src = u.picture;
        if (pName) pName.textContent = u.name || "User";
        if (pEmail) pEmail.textContent = u.email;
      }
      if (outBtn) outBtn.hidden = false;
      if (inBtn) inBtn.innerHTML = "✓ Signed in";
    } else {
      if (chip) chip.hidden = true;
      if (prof) prof.hidden = true;
      if (outBtn) outBtn.hidden = true;
      if (inBtn)
        inBtn.innerHTML =
          '<svg class="g-svg" viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Sign in with Google';
    }
    var cid = $("googleClientId");
    var gcid = $("gateClientId");
    if (cid && !cid.value) cid.value = getGClient();
    if (gcid && !gcid.value) gcid.value = getGClient();
  }

  function parseJwt(token) {
    try {
      var b = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(
        decodeURIComponent(
          atob(b)
            .split("")
            .map(function (c) {
              return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
            })
            .join("")
        )
      );
    } catch (e) {
      return null;
    }
  }

  function onGoogleCred(resp) {
    if (!resp || !resp.credential) {
      toast("Google sign-in cancelled");
      return;
    }
    var p = parseJwt(resp.credential);
    if (!p || !p.email) {
      toast("Could not read Google profile");
      return;
    }
    setGoogleUser({
      name: p.name || p.given_name || "User",
      email: p.email,
      picture: p.picture || "",
      sub: p.sub || "",
      ts: Date.now(),
    });
    toast("Hi, " + (p.given_name || p.name || p.email));
  }

  function loadGis(cb) {
    if (window.google && google.accounts && google.accounts.id) {
      cb && cb();
      return;
    }
    var s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = function () {
      cb && cb();
    };
    s.onerror = function () {
      toast("Could not load Google Sign-In");
    };
    document.head.appendChild(s);
  }

  function initGoogle(clientId) {
    if (!clientId) return;
    if (!(window.google && google.accounts && google.accounts.id)) return;
    try {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: onGoogleCred,
        auto_select: false,
        cancel_on_tap_outside: true,
        context: "signin",
        ux_mode: "popup",
      });
      // Render official buttons into hosts
      ["gateGoogleHost", "googleBtnHost"].forEach(function (id) {
        var host = $(id);
        if (!host) return;
        host.innerHTML = "";
        try {
          google.accounts.id.renderButton(host, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "continue_with",
            shape: "pill",
            width: 320,
            logo_alignment: "left",
          });
        } catch (e) {}
      });
    } catch (e) {
      console.warn(e);
    }
  }

  function startGoogleSignIn() {
    var cid =
      (($("gateClientId") && $("gateClientId").value) ||
        ($("googleClientId") && $("googleClientId").value) ||
        getGClient() ||
        "").trim();
    if (!cid) {
      toast("Add OAuth Client ID (tap setup)");
      var det = $("devSetup");
      if (det) det.open = true;
      var g = $("gateClientId");
      if (g) g.focus();
      return;
    }
    setGClient(cid);
    if ($("googleClientId")) $("googleClientId").value = cid;
    if ($("gateClientId")) $("gateClientId").value = cid;

    loadGis(function () {
      initGoogle(cid);
      try {
        // Prefer One Tap account chooser when available
        google.accounts.id.prompt(function (n) {
          if (n && typeof n.isNotDisplayed === "function" && n.isNotDisplayed()) {
            // User can click the official rendered Google button
            toast("Tap the Google button");
          }
          if (n && typeof n.isSkippedMoment === "function" && n.isSkippedMoment()) {
            toast("Tap the Google button below");
          }
        });
      } catch (e) {
        toast("Tap the Google button");
      }
    });
  }

  function googleSignOut() {
    try {
      if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    } catch (e) {}
    setGoogleUser(null);
    toast("Signed out");
  }

  /* ========== gate / app shell ========== */
  function showGate(show) {
    if (!loginGate) return;
    loginGate.hidden = !show;
  }
  function showApp(show) {
    if (!appShell) return;
    appShell.hidden = !show;
  }
  function enterApp() {
    lsSet(SK.gate, "1");
    showGate(false);
    showApp(true);
    try {
      prompt.focus({ preventScroll: true });
    } catch (e) {}
  }

  /* ========== settings / paste ========== */
  function openSettings() {
    var m = $("settingsModal");
    if (!m) return;
    if ($("apiKeyInput")) $("apiKeyInput").value = getApiKey();
    if ($("googleClientId")) $("googleClientId").value = getGClient();
    updateGoogleUI();
    updateModeUI();
    if (online) setStatus("✅ Online · " + modelName, "ok");
    else if (getApiKey()) setStatus("Key saved — tap Go Online", "pending");
    else setStatus("Offline ready. Add key + Go Online for Gemini.", "");
    m.hidden = false;
    document.body.style.overflow = "hidden";
    closeSide();
  }
  function closeSettings() {
    var m = $("settingsModal");
    if (m) m.hidden = true;
    document.body.style.overflow = "";
  }

  async function pasteKey() {
    var input = $("apiKeyInput");
    if (!input) return;
    var text = "";
    try {
      if (navigator.clipboard && navigator.clipboard.readText) text = await navigator.clipboard.readText();
    } catch (e) {}
    text = String(text || "").replace(/\s+/g, "");
    if (text) {
      input.value = text;
      input.type = "text";
      toast("Key pasted");
      var bar = $("pasteBar");
      if (bar) bar.hidden = true;
      return;
    }
    input.focus();
    var bar2 = $("pasteBar");
    if (bar2) bar2.hidden = false;
    toast("Long-press box → Paste");
  }

  /* ========== wire events ========== */
  function bindAll() {
    // SEND / STOP
    function onSendTap(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (busy) stopGeneration();
      else doSend(prompt.value);
      return false;
    }
    sendBtn.type = "button";
    sendBtn.disabled = false;
    sendBtn.addEventListener("click", onSendTap, false);
    sendBtn.addEventListener(
      "touchend",
      function (e) {
        e.preventDefault();
        onSendTap(e);
      },
      { passive: false }
    );

    prompt.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (!busy) doSend(prompt.value);
      }
    });
    prompt.addEventListener("input", function () {
      updateSendUI();
      autoSize();
    });

    // cards
    var cards = $("cards");
    if (cards) {
      cards.addEventListener("click", function (e) {
        var b = e.target.closest("[data-text]");
        if (b && !busy) doSend(b.getAttribute("data-text"));
      });
    }
    var catTabs = $("catTabs");
    if (catTabs) {
      catTabs.addEventListener("click", function (e) {
        var b = e.target.closest(".cat");
        if (!b) return;
        catTabs.querySelectorAll(".cat").forEach(function (x) {
          x.classList.toggle("on", x === b);
        });
        renderCards(b.getAttribute("data-cat"));
      });
    }

    // nav
    var mapClick = [
      ["sideNewChat", newChat],
      ["newChatBtn", newChat],
      ["openSidebar", openSide],
      ["closeSidebar", closeSide],
      ["settingsBtn", openSettings],
      ["openSettingsFromSide", openSettings],
      ["closeSettings", closeSettings],
      ["settingsDoneBtn", closeSettings],
      ["memoryBtn", openMemory],
      ["openMemoryFromSide", openMemory],
      ["closeMemory", closeMemory],
      ["memoryDoneBtn", closeMemory],
      ["themeBtn", toggleTheme],
      ["themeBtnSide", toggleTheme],
      ["themeBtnModal", toggleTheme],
      ["testConnBtn", goOnline],
      ["gateGoogleBtn", startGoogleSignIn],
      ["googleSignInBtn", startGoogleSignIn],
      ["googleSignOutBtn", googleSignOut],
      ["gateSkipBtn", enterApp],
      ["micBtn", toggleMic],
      ["pasteKeyBtn", pasteKey],
      ["pasteOptBtn", pasteKey],
      ["testVoiceBtn", function () {
        speakText("Hello, I am BDC. This is the " + voiceStyle + " voice.");
      }],
    ];
    mapClick.forEach(function (pair) {
      var el = $(pair[0]);
      if (el) el.addEventListener("click", function (e) {
        e.preventDefault();
        pair[1](e);
      });
    });

    var scrim = $("sidebarScrim");
    if (scrim) scrim.addEventListener("click", closeSide);
    var sm = $("settingsModal");
    if (sm)
      sm.addEventListener("click", function (e) {
        if (e.target === sm) closeSettings();
      });


    // Memory modal tabs + actions
    var memTabs = $("memTabs");
    if (memTabs) {
      memTabs.addEventListener("click", function (e) {
        var tab = e.target.closest(".mem-tab");
        if (!tab) return;
        var which = tab.getAttribute("data-mem");
        memTabs.querySelectorAll(".mem-tab").forEach(function (x) {
          x.classList.toggle("on", x === tab);
        });
        var pt = $("memPanelTemp");
        var ps = $("memPanelStrong");
        if (pt) pt.hidden = which !== "temp";
        if (ps) ps.hidden = which !== "strong";
      });
    }
    var tempEn = $("tempMemEnabled");
    if (tempEn) {
      tempEn.addEventListener("change", function () {
        lsSet(SK.tempOn, tempEn.checked ? "1" : "0");
        toast(tempEn.checked ? "Temporary memory ON" : "Temporary memory OFF");
      });
    }
    var strongEn = $("strongMemEnabled");
    if (strongEn) {
      strongEn.addEventListener("change", function () {
        lsSet(SK.strongOn, strongEn.checked ? "1" : "0");
        toast(strongEn.checked ? "Strong memory ON" : "Strong memory OFF");
      });
    }
    var saveStrong = $("saveStrongMem");
    if (saveStrong) {
      saveStrong.addEventListener("click", function (e) {
        e.preventDefault();
        var ed = $("strongMemEditor");
        setStrongNotes(ed ? ed.value : "");
        toast("Strong memory saved");
      });
    }
    var clearStrong = $("clearStrongMem");
    if (clearStrong) {
      clearStrong.addEventListener("click", function (e) {
        e.preventDefault();
        if (!confirm("Clear lifetime strong memory notes + auto facts?")) return;
        setStrongNotes("");
        setStrongFacts([]);
        var ed = $("strongMemEditor");
        if (ed) ed.value = "";
        renderStrongAutoList();
        toast("Strong memory cleared");
      });
    }
    var clearTemp = $("clearTempMem");
    if (clearTemp) {
      clearTemp.addEventListener("click", function (e) {
        e.preventDefault();
        if (!confirm("Clear all temporary memories?")) return;
        setTempMemory([]);
        renderTempMemList();
        toast("Temporary memory cleared");
      });
    }
    var memoryModal = $("memoryModal");
    if (memoryModal) {
      memoryModal.addEventListener("click", function (e) {
        if (e.target === memoryModal) closeMemory();
      });
    }

    // image
    var imgBtn = $("imgBtn");
    var imgInput = $("imgInput");
    var imgCam = $("imgInputCamera");
    function openPicker(el) {
      if (!el) return;
      try {
        el.value = "";
        if (el.showPicker) el.showPicker();
        else el.click();
      } catch (e) {
        try {
          el.click();
        } catch (e2) {
          toast("Cannot open photos");
        }
      }
    }
    if (imgBtn) {
      imgBtn.addEventListener("click", function (e) {
        e.preventDefault();
        openPicker(imgInput);
      });
      imgBtn.addEventListener(
        "touchend",
        function (e) {
          e.preventDefault();
          openPicker(imgInput);
        },
        { passive: false }
      );
    }
    if (imgInput)
      imgInput.addEventListener("change", function () {
        if (imgInput.files && imgInput.files[0]) setAttachFromFile(imgInput.files[0]);
      });
    if (imgCam)
      imgCam.addEventListener("change", function () {
        if (imgCam.files && imgCam.files[0]) setAttachFromFile(imgCam.files[0]);
      });
    var ac = $("attachClear");
    if (ac)
      ac.addEventListener("click", function (e) {
        e.preventDefault();
        clearAttach();
      });

    // voice chips
    document.querySelectorAll(".voice-chip").forEach(function (chip) {
      chip.addEventListener("click", function (e) {
        e.preventDefault();
        setVoiceStyle(chip.getAttribute("data-voice"));
        toast("Voice: " + voiceStyle);
      });
    });

    // key save/clear
    var saveKeyBtn = $("saveKeyBtn");
    if (saveKeyBtn)
      saveKeyBtn.addEventListener("click", function (e) {
        e.preventDefault();
        var k = ($("apiKeyInput") && $("apiKeyInput").value.trim()) || "";
        setApiKey(k);
        if (!k) {
          online = false;
          lsSet(SK.online, "0");
        }
        toast("Saved");
        updateModeUI();
      });
    var clearKeyBtn = $("clearKeyBtn");
    if (clearKeyBtn)
      clearKeyBtn.addEventListener("click", function (e) {
        e.preventDefault();
        if (!confirm("Clear API key?")) return;
        if ($("apiKeyInput")) $("apiKeyInput").value = "";
        setApiKey("");
        online = false;
        lsSet(SK.online, "0");
        updateModeUI();
        setStatus("Offline · Ready", "");
      });

    // paste long-press on key field
    var apiKeyInput = $("apiKeyInput");
    if (apiKeyInput) {
      var ht = null;
      apiKeyInput.addEventListener(
        "touchstart",
        function () {
          ht = setTimeout(function () {
            pasteKey();
          }, 450);
        },
        { passive: true }
      );
      apiKeyInput.addEventListener(
        "touchend",
        function () {
          clearTimeout(ht);
        },
        { passive: true }
      );
      apiKeyInput.addEventListener("paste", function () {
        setTimeout(function () {
          apiKeyInput.value = (apiKeyInput.value || "").replace(/\s+/g, "");
          toast("Pasted");
        }, 10);
      });
    }
    var pasteCancel = $("pasteCancelBtn");
    if (pasteCancel)
      pasteCancel.addEventListener("click", function () {
        var b = $("pasteBar");
        if (b) b.hidden = true;
      });
    var toggleVis = $("toggleKeyVis");
    if (toggleVis && apiKeyInput)
      toggleVis.addEventListener("click", function () {
        apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
      });

    // gate client save
    var gateSave = $("gateSaveClient");
    if (gateSave)
      gateSave.addEventListener("click", function (e) {
        e.preventDefault();
        var v = ($("gateClientId") && $("gateClientId").value.trim()) || "";
        setGClient(v);
        toast(v ? "Client ID saved" : "Cleared");
        if (v) loadGis(function(){ initGoogle(v); });
      });

    // install modal
    var installHelp = $("installHelpBtn");
    var installModal = $("installModal");
    function openInstall() {
      if (installModal) {
        installModal.hidden = false;
        document.body.style.overflow = "hidden";
      }
      closeSide();
    }
    function closeInstall() {
      if (installModal) installModal.hidden = true;
      document.body.style.overflow = "";
    }
    if (installHelp) installHelp.addEventListener("click", openInstall);
    ["closeInstall", "closeInstall2"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("click", closeInstall);
    });
    if (installModal)
      installModal.addEventListener("click", function (e) {
        if (e.target === installModal) closeInstall();
      });

    // chip opens settings
    var chip = $("googleUserChip");
    if (chip)
      chip.addEventListener("click", function (e) {
        e.preventDefault();
        openSettings();
      });
  }


  /* ========== init ========== */
  applyTheme(lsGet(SK.theme, "dark"));
  loadVoiceStyle();
  loadAll();

  // restore online only if previously successful
  online = lsGet(SK.online, "") === "1" && !!getApiKey();
  modelName = String(lsGet(SK.model, "gemini-3.6-flash") || "gemini-3.6-flash").replace(/^models\//, "");
  // migrate retired models automatically
  if (/gemini-2\.0-flash$|gemini-1\.5-flash$/.test(modelName)) {
    // keep as preference but goOnline/callGemini will fallback
  }
  if ($("apiKeyInput")) $("apiKeyInput").value = getApiKey();

  renderCards("study");
  renderChatList();
  renderThread();
  updateSendUI();
  autoSize();
  updateModeUI();
  updateGoogleUI();
  bindAll();

  // Gate: show login first unless already entered
  var gateDone = lsGet(SK.gate, "") === "1";
  var user = getGoogleUser();
  if (gateDone || (user && user.email)) {
    showGate(false);
    showApp(true);
  } else {
    showGate(true);
    showApp(false);
  }

  // Prefetch GIS if client id exists (for account picker)
  if (getGClient()) {
    loadGis(function () {
      initGoogle(getGClient());
    });
  }

  // Warm speech voices
  if (window.speechSynthesis) {
    try {
      speechSynthesis.getVoices();
      speechSynthesis.onvoiceschanged = function () {
        speechSynthesis.getVoices();
      };
    } catch (e) {}
  }

  setTimeout(function () {
    if (!loginGate || loginGate.hidden) {
      try {
        prompt.focus({ preventScroll: true });
      } catch (e) {}
    }
  }, 200);

  console.log("[BDC] v1.7 ready · memory + creator Bhavesh Chaudhary");
})();
