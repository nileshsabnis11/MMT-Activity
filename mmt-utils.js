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

  /* ---------- FIREBASE CONFIG ---------- */
  var firebaseConfig = {
    apiKey: "AIzaSyBsk-Pfqd26dFXMU04ye-gfA3uYSKR5Aps",
    authDomain: "activity-2026.firebaseapp.com",
    projectId: "activity-2026",
    storageBucket: "activity-2026.firebasestorage.app",
    messagingSenderId: "384955850563",
    appId: "1:384955850563:web:6ea833f95a6300845759f6"
  };

  // Initialize Firebase globally if scripts are loaded
  if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    // Enable offline persistence so it works perfectly without internet
    firebase.firestore().enablePersistence({synchronizeTabs:true}).catch(function(err){});
  }

  // Low-level POST (now uses Firestore instead of Apps Script)
  function post(url, payload) {
    if (typeof firebase === 'undefined') return Promise.resolve({ sent: false, reason: "no-firebase" });
    
    // Add server timestamp for sorting
    payload.serverTime = firebase.firestore.FieldValue.serverTimestamp();
    payload.Date = payload.Date || new Date().toLocaleDateString('en-GB');
    payload.Time = payload.Time || new Date().toLocaleTimeString('en-US');

    // Fire and forget — Firestore caches it locally instantly and syncs in background
    firebase.firestore().collection("submissions").add(payload)
      .catch(function(err) { console.error("Firestore error:", err); });
      
    // Always return success instantly to keep the UI fast and happy
    return Promise.resolve({ sent: true });
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

  /* ---------- 5. HINT MODE ---------- */
  // Behaviour:
  //   practice mode  -> hints are FREE (nothing recorded anyway)
  //   graded mode    -> using a hint HALVES that question's marks (floor)
  //                     and tags the detail string with 💡 so the sheet +
  //                     dashboard can show "answered with hint".
  // Usage in an activity:
  //   1. Give a question a hint string:  {q:"...", options:[...], correct:1, hint:"Think about ..."}
  //   2. Render MMT.hintBlock(qIndex, question.hint) under the question.
  //   3. On finish, for each question: marks = MMT.applyHintPenalty(rawMarks, MMT.hintUsed(qIndex));
  //      and append MMT.hintTag(MMT.hintUsed(qIndex)) to that question's detail string.
  //   4. Call MMT.resetHints() when a fresh attempt starts (e.g. Play Again / retry).

  var HINT_TAG = "💡";
  var _hintsUsed = {};

  // Returns HTML for a tap-to-reveal hint. Safe to inject via innerHTML.
  // qIndex identifies the question so we can remember which hints were used.
  function hintBlock(qIndex, hintText) {
    if (!hintText) return "";
    var id = "mmtHint_" + qIndex;
    var graded = !isPractice();
    var penaltyNote = !graded ? "" :
      '<div style="margin-top:6px;font-weight:700;font-size:12px;color:#9A6B1E;">Using this hint gives half marks for this question.</div>';
    // Up-front warning shown BEFORE the student clicks, so the cost is clear.
    var upfrontNote = !graded ? "" :
      '<span class="mmt-hint-warn" style="margin-left:10px;font-weight:600;font-size:12px;' +
        'color:#B4791F;vertical-align:middle;">⚠ Reveals cost half marks for this question</span>';
    return '' +
      '<div class="mmt-hint" style="margin:8px 0 4px;">' +
        '<button type="button" class="mmt-hint-btn" ' +
          'style="background:transparent;border:1px dashed #D98E3B;color:#9A6B1E;' +
          'font:600 13px/1.2 inherit;padding:7px 12px;border-radius:8px;cursor:pointer;" ' +
          'onclick="MMT.toggleHint(\'' + String(qIndex).replace(/'/g,"\\'") + '\')">💡 Need a hint?</button>' +
        upfrontNote +
        '<div id="' + id + '" class="mmt-hint-text" style="display:none;margin-top:8px;' +
          'background:#FBF0DC;border:1px solid #E7C98A;color:#7a5312;border-radius:8px;' +
          'padding:10px 12px;font-size:13.5px;line-height:1.45;">' +
          '<span style="opacity:.9;">' + escHtml(hintText) + '</span>' +
          penaltyNote +
        '</div>' +
      '</div>';
  }

  function escHtml(s){ var d=document.createElement("div"); d.textContent=s==null?"":s; return d.innerHTML; }

  // Reveals the hint text and records that this question's hint was used.
  function toggleHint(qIndex) {
    var el = document.getElementById("mmtHint_" + qIndex);
    if (el) el.style.display = "block";
    _hintsUsed[qIndex] = true;
    var wrap = el && el.parentNode;
    var btn = wrap && wrap.querySelector(".mmt-hint-btn");
    if (btn) {
      btn.textContent = "💡 Hint shown";
      btn.style.opacity = "0.7";
      btn.disabled = true;
    }
    // The up-front "costs half marks" warning is redundant once revealed.
    var warn = wrap && wrap.querySelector(".mmt-hint-warn");
    if (warn) warn.style.display = "none";
  }

  function hintUsed(qIndex) { return !!_hintsUsed[qIndex]; }
  function resetHints() { _hintsUsed = {}; }

  // Half marks (floor) in graded mode when a hint was used. Free in practice.
  // Non-numeric marks (e.g. "") are returned unchanged.
  function applyHintPenalty(marks, used) {
    if (!used || isPractice()) return marks;
    var n = Number(marks);
    if (isNaN(n)) return marks;
    return Math.floor(n / 2);
  }

  // Returns " 💡" to append to a detail string when a hint was used in graded
  // mode (so the backend halves it and the sheet shows the tag). Empty otherwise.
  function hintTag(used) {
    return (used && !isPractice()) ? " " + HINT_TAG : "";
  }

  /* ---------- 6. TIME TRACKING ---------- */
  // markStart() — call when student clicks "Start" (after gate passes)
  // getTimeTaken() — call at submit, returns seconds elapsed or null
  // Used for speed tie-breaking on leaderboard (always on, for all activities).

  var _startTime = null;

  function markStart() {
    _startTime = Date.now();
  }

  function getTimeTaken() {
    if (!_startTime) return null;
    return Math.round((Date.now() - _startTime) / 1000);
  }

  function fmtTime(seconds) {
    if (seconds == null || isNaN(seconds)) return '—';
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ---------- 7. TIMED MODE ---------- */
  // startTimer(onExpireCallback) — reads ?timed=N from URL
  // If N > 0: injects a countdown pill in top-right corner, calls callback at 0.
  // If no ?timed param: safe no-op.

  var _timerInterval = null;

  function getTimerSeconds() {
    try {
      var t = parseInt(new URLSearchParams(window.location.search).get('timed'), 10);
      return (!isNaN(t) && t > 0) ? t : 0;
    } catch (e) { return 0; }
  }

  function startTimer(onExpireCallback) {
    var total = getTimerSeconds();
    if (!total) return; // no-op if no ?timed param

    var remaining = total;

    // Create pill element
    var pill = document.createElement('div');
    pill.id = 'mmt-timer-pill';
    pill.style.cssText =
      'position:fixed;top:14px;right:16px;z-index:9999;' +
      'background:#1C2B33;color:#D98E3B;font-family:Inter,system-ui,sans-serif;' +
      'font-size:15px;font-weight:700;padding:8px 16px;border-radius:99px;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.35);border:2px solid #D98E3B;' +
      'letter-spacing:0.04em;transition:background 0.3s,color 0.3s,border-color 0.3s;';

    function updatePill() {
      var m = Math.floor(remaining / 60);
      var s = remaining % 60;
      pill.textContent = '⏱ ' + m + ':' + (s < 10 ? '0' : '') + s;
      if (remaining <= 30) {
        pill.style.background = '#A23B3B';
        pill.style.color = '#fff';
        pill.style.borderColor = '#A23B3B';
      }
    }

    updatePill();
    document.body.appendChild(pill);

    _timerInterval = setInterval(function () {
      remaining--;
      updatePill();
      if (remaining <= 0) {
        clearInterval(_timerInterval);
        pill.textContent = '⏱ Time\'s up!';
        pill.style.background = '#A23B3B';
        pill.style.color = '#fff';
        if (typeof onExpireCallback === 'function') {
          setTimeout(onExpireCallback, 400); // slight delay so student sees "Time's up!"
        }
      }
    }, 1000);
  }

  /* ---------- 8. VISUAL BADGE ---------- */
  // renderBadge(percent) — returns HTML string for final screen achievement badge.
  // Tiers: >=90 Outstanding, >=70 Great Job, >=50 Good Effort, <50 Keep Practicing

  function renderBadge(percent) {
    var p = parseInt(percent, 10) || 0;
    var icon, label, bg, border, color;
    if (p >= 90) {
      icon = '🏆'; label = 'Outstanding';
      bg = '#FFF8E6'; border = '#D98E3B'; color = '#7A4F00';
    } else if (p >= 70) {
      icon = '🥈'; label = 'Great Job';
      bg = '#E7F3EA'; border = '#3E7A52'; color = '#1E4D30';
    } else if (p >= 50) {
      icon = '🥉'; label = 'Good Effort';
      bg = '#DCEAF1'; border = '#2A5C7A'; color = '#1a3a4d';
    } else {
      icon = '💪'; label = 'Keep Practicing';
      bg = '#FBEAEA'; border = '#A23B3B'; color = '#6B1E1E';
    }
    return '<div style="text-align:center;margin:0 0 20px;' +
      'background:' + bg + ';border:2px solid ' + border + ';border-radius:16px;' +
      'padding:18px 24px;animation:badgePop 0.45s cubic-bezier(0.34,1.56,0.64,1) both;">' +
      '<style>@keyframes badgePop{0%{opacity:0;transform:scale(0.7)}100%{opacity:1;transform:scale(1)}}</style>' +
      '<div style="font-size:40px;line-height:1;margin-bottom:6px">' + icon + '</div>' +
      '<div style="font-family:Fraunces,serif;font-size:22px;font-weight:700;color:' + color + '">' + label + '</div>' +
    '</div>';
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
    // hint mode
    hintBlock: hintBlock,
    toggleHint: toggleHint,
    hintUsed: hintUsed,
    resetHints: resetHints,
    applyHintPenalty: applyHintPenalty,
    hintTag: hintTag,
    HINT_TAG: HINT_TAG,
    // time tracking (always on — for speed tie-breaker)
    markStart: markStart,
    getTimeTaken: getTimeTaken,
    fmtTime: fmtTime,
    // timed mode
    startTimer: startTimer,
    getTimerSeconds: getTimerSeconds,
    // visual badge
    renderBadge: renderBadge,
    // set MMT._autoFlushUrl = SHEET_WEBHOOK_URL in your activity to auto-flush on load
    _autoFlushUrl: null,
  };
})();