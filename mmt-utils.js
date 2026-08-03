/* ============================================================
   MMT Activities — Shared Utility Library  (mmt-utils.js)
   Load in every activity BEFORE its own <script>:
     <script src="mmt-utils.js"></script>
   Exposes a single global: window.MMT
   ------------------------------------------------------------
   Features:
     1. shuffle / pickPool  — anti-copying (randomize order + sample questions)
     2. submit + retry queue — never lose a result to flaky WiFi
     3. mode()              — practice vs graded via ?mode=practice URL param
   © 2026 Prof. Nilesh Vijay Sabnis (9890880549)
   ============================================================ */
(function () {
  "use strict";

  var QUEUE_KEY = "mmt_pending_results_v1";

  /* ---------- 1. ANTI-COPYING ---------- */

  // Fisher-Yates shuffle. Returns a NEW array (does not mutate input).
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Randomly pick n items from a pool (shuffled). If n >= pool size,
  // returns the whole pool shuffled. Great for "12 questions, show 6".
  function pickPool(pool, n) {
    var s = shuffle(pool);
    return (n && n < s.length) ? s.slice(0, n) : s;
  }

  /* ---------- 2. RETRY QUEUE ---------- */

  function readQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; }
    catch (e) { return []; }
  }
  function writeQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) {}
  }
  function enqueue(payload) {
    var q = readQueue();
    q.push({ payload: payload, ts: Date.now() });
    writeQueue(q);
  }

  // Low-level POST. Resolves {sent:true} or {sent:false, reason}.
  function post(url, payload) {
    if (!url) return Promise.resolve({ sent: false, reason: "no-url" });
    return fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    }).then(function () { return { sent: true }; })
      .catch(function () { return { sent: false, reason: "network" }; });
  }

  // Try to resend everything sitting in the queue. Because no-cors gives us
  // an opaque response, a resolved fetch is treated as delivered.
  function flushQueue(url) {
    if (!url) return Promise.resolve({ flushed: 0, remaining: readQueue().length });
    var q = readQueue();
    if (!q.length) return Promise.resolve({ flushed: 0, remaining: 0 });
    var still = [];
    var chain = Promise.resolve();
    var flushed = 0;
    q.forEach(function (item) {
      chain = chain.then(function () {
        return post(url, item.payload).then(function (r) {
          if (r.sent) { flushed++; } else { still.push(item); }
        });
      });
    });
    return chain.then(function () {
      writeQueue(still);
      return { flushed: flushed, remaining: still.length };
    });
  }

  // Main entry point. Sends a result; on failure stores it and retries later.
  // Also opportunistically flushes any older pending results first.
  // Resolves {sent:true} if this result went out, else {sent:false, queued:true}.
  function submitResult(url, payload) {
    if (!url) return Promise.resolve({ sent: false, reason: "no-url" });
    return flushQueue(url).then(function () {
      return post(url, payload).then(function (r) {
        if (r.sent) return { sent: true };
        enqueue(payload);
        return { sent: false, queued: true, reason: r.reason };
      });
    });
  }

  function pendingCount() { return readQueue().length; }

  /* ---------- 3. PRACTICE vs GRADED MODE ---------- */

  // ?mode=practice  → practice (retry allowed, NOT recorded to sheet)
  // anything else   → graded   (locked, recorded)
  function mode() {
    try {
      var m = new URLSearchParams(window.location.search).get("mode");
      return (m && m.toLowerCase() === "practice") ? "practice" : "graded";
    } catch (e) { return "graded"; }
  }
  function isPractice() { return mode() === "practice"; }

  // A small banner element you can insert at the top of the page to make the
  // current mode obvious. Returns an HTMLElement (or null in graded mode).
  function modeBanner() {
    if (!isPractice()) return null;
    var d = document.createElement("div");
    d.textContent = "PRACTICE MODE — results are NOT recorded. Retry freely.";
    d.style.cssText =
      "background:#FBF0DC;color:#9A6B1E;text-align:center;font:600 13px/1.4 " +
      "system-ui,Segoe UI,Arial,sans-serif;padding:9px 14px;border-radius:10px;" +
      "margin:0 0 14px;border:1px solid #E7C98A;";
    return d;
  }

  // Try to flush any leftover results as soon as the page loads.
  window.addEventListener("load", function () {
    if (window.MMT && window.MMT._autoFlushUrl) {
      flushQueue(window.MMT._autoFlushUrl);
    }
  });

  /* ---------- 4. REPORT CARD EXPORT ---------- */

  // Draws a printable result card to a canvas and triggers a PNG download.
  // cfg = {
  //   activity: "Build-a-Robot",            // activity title
  //   name, studentClass, prn,              // student identity
  //   college, department,                  // institution (optional)
  //   percent: 84,                          // overall %
  //   scoreLine: "42 / 50 pts",             // headline score text
  //   rows: [ {label:"Mission 1", value:"18/20"}, ... ],  // per-round breakdown
  //   rating: "Field-Ready Prototype"       // optional rating text
  // }
  function downloadReportCard(cfg) {
    cfg = cfg || {};
    var W = 1000, H = 1400;
    var canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext("2d");

    var COL = {
      graphite: "#1C2B33", steel: "#3E5C67", copper: "#D98E3B",
      card: "#F4F2EE", white: "#FFFFFF", ink: "#23343C", muted: "#5C7079",
      good: "#3E7A52", line: "#E3E0D8",
    };

    // background
    ctx.fillStyle = COL.white; ctx.fillRect(0, 0, W, H);
    // top band
    ctx.fillStyle = COL.graphite; ctx.fillRect(0, 0, W, 210);
    ctx.fillStyle = COL.copper;
    ctx.font = "700 26px Inter, Arial, sans-serif";
    ctx.fillText("RESULT CARD", 60, 84);
    ctx.fillStyle = COL.white;
    ctx.font = "700 44px Georgia, 'Times New Roman', serif";
    ctx.fillText(cfg.activity || "Interactive Activity", 60, 140);
    if (cfg.college) {
      ctx.fillStyle = "#B9C6CC";
      ctx.font = "400 20px Inter, Arial, sans-serif";
      ctx.fillText((cfg.college || "") + (cfg.department ? "  ·  " + cfg.department : ""), 60, 178);
    }

    var y = 300;
    // student identity block
    ctx.fillStyle = COL.ink;
    ctx.font = "700 40px Inter, Arial, sans-serif";
    ctx.fillText(cfg.name || "Anonymous", 60, y);
    y += 44;
    ctx.fillStyle = COL.muted;
    ctx.font = "400 24px Inter, Arial, sans-serif";
    var idbits = [];
    if (cfg.studentClass) idbits.push("Class: " + cfg.studentClass);
    if (cfg.prn) idbits.push("PRN: " + cfg.prn);
    if (idbits.length) ctx.fillText(idbits.join("      "), 60, y);
    y += 60;

    // score hero circle
    var cx = 175, cy = y + 130, r = 130;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = COL.graphite; ctx.fill();
    ctx.fillStyle = COL.copper;
    ctx.font = "700 72px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText((cfg.percent != null ? cfg.percent : "—") + "%", cx, cy + 10);
    ctx.fillStyle = "#B9C6CC";
    ctx.font = "400 22px Inter, Arial, sans-serif";
    ctx.fillText(cfg.scoreLine || "", cx, cy + 55);
    ctx.textAlign = "left";

    if (cfg.rating) {
      ctx.fillStyle = COL.graphite;
      ctx.font = "700 34px Georgia, serif";
      ctx.fillText(cfg.rating, 360, cy - 40);
    }
    ctx.fillStyle = COL.muted;
    ctx.font = "400 22px Inter, Arial, sans-serif";
    var d = new Date();
    ctx.fillText(d.toLocaleDateString() + "  " + d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}), 360, cy + 10);

    y = cy + r + 70;
    // breakdown heading
    ctx.fillStyle = COL.ink;
    ctx.font = "700 28px Inter, Arial, sans-serif";
    ctx.fillText("Breakdown", 60, y);
    y += 24;
    ctx.strokeStyle = COL.line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(W - 60, y); ctx.stroke();
    y += 46;

    (cfg.rows || []).forEach(function (row) {
      ctx.fillStyle = COL.ink;
      ctx.font = "400 26px Inter, Arial, sans-serif";
      ctx.fillText(String(row.label), 60, y);
      ctx.fillStyle = COL.graphite;
      ctx.font = "700 26px Inter, Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(String(row.value), W - 60, y);
      ctx.textAlign = "left";
      y += 30;
      ctx.strokeStyle = COL.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(W - 60, y); ctx.stroke();
      y += 34;
    });

    // footer
    ctx.fillStyle = COL.muted;
    ctx.font = "400 20px Inter, Arial, sans-serif";
    ctx.fillText("Generated by the MMT Activities System", 60, H - 50);

    // download
    var safe = (cfg.name || "student").replace(/[^a-z0-9]+/gi, "_");
    var act = (cfg.activity || "activity").replace(/[^a-z0-9]+/gi, "_");
    try {
      var link = document.createElement("a");
      link.download = "ResultCard_" + act + "_" + safe + ".png";
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) { /* ignore */ }
  }

  window.MMT = {
    shuffle: shuffle,
    pickPool: pickPool,
    submitResult: submitResult,
    flushQueue: flushQueue,
    pendingCount: pendingCount,
    mode: mode,
    isPractice: isPractice,
    modeBanner: modeBanner,
    downloadReportCard: downloadReportCard,
    // set MMT._autoFlushUrl = SHEET_WEBHOOK_URL in your activity to auto-flush on load
    _autoFlushUrl: null,
  };
})();
