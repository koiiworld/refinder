// ==UserScript==
// @name         서이추 도우미 (반자동)
// @namespace    https://github.com/koiiworld/refinder
// @version      1.3.0
// @updateURL    https://raw.githubusercontent.com/koiiworld/refinder/claude/seoichoo-automation-program-50awjg/seoichoo/userscript/seoichoo-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/koiiworld/refinder/claude/seoichoo-automation-program-50awjg/seoichoo/userscript/seoichoo-helper.user.js
// @description  네이버 블로그 서로이웃 대상 검색 + 신청창 멘트 자동 입력. 보내기(확인)는 직접 누릅니다. 계정별 탭 지원.
// @match        https://section.blog.naver.com/*
// @match        https://m.blog.naver.com/BuddyAddForm.naver*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @grant        GM_addValueChangeListener
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  // ---------------------------------------------------------------- 공통 설정
  const DAILY_LIMIT = 100;      // 네이버 정책상 계정당 하루 서이추 최대
  const SESSION_LIMIT = 20;     // 20명마다 쉬어가기 알림
  const DEFAULT_COOLDOWN = 30;  // 다음 신청창을 열기까지 최소 대기(초)
  const MAX_ACCOUNTS = 3;       // 계정 탭 최대 개수
  const POPUP_NAME = "seoichoo_buddy";
  const DEFAULT_MSG = [
    "안녕하세요 {닉네임}님! 글 잘 보고 갑니다. 서로이웃 맺고 자주 소통해요 :)",
    "{닉네임}님 블로그 구경하다가 신청드려요! 앞으로 자주 놀러올게요~",
    "안녕하세요! 관심사가 비슷해서 서이추 신청드립니다. 잘 부탁드려요 {닉네임}님 :)",
    "{닉네임}님 글이 너무 재밌어서 이웃 신청드려요! 새 글 기다릴게요 :)",
    "안녕하세요~ 우연히 들렀다가 좋은 글이 많아서 서로이웃 신청합니다!",
    "{닉네임}님 반가워요! 서로 블로그 자주 들르면서 소통해요 ^^",
    "글 잘 읽고 갑니다! 앞으로도 좋은 글 보고 싶어서 서이추 신청드려요~",
    "안녕하세요 {닉네임}님, 블로그 분위기가 좋아서 이웃 맺고 싶어요. 잘 부탁드립니다!",
  ].join("\n");
  const OLD_DEFAULT_MSG = "안녕하세요 {닉네임}님! 글 잘 보고 갑니다. 서로이웃 맺고 자주 소통해요 :)";
  const ACC_KEYS = ["history", "daily", "candidates", "keywords", "pages", "message", "cooldown"];

  // 멘트 칸은 한 줄에 멘트 하나. 여러 줄이면 그중 하나를 무작위로 고른다 (직전 멘트는 가능하면 피함).
  function pickMessage(raw, last) {
    const lines = String(raw || "").split("\n").map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return "";
    const pool = lines.length > 1 ? lines.filter((l) => l !== last) : lines;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const store = {
    get: (k, d) => { try { const v = GM_getValue(k); return v === undefined ? d : v; } catch (e) { return d; } },
    set: (k, v) => { try { GM_setValue(k, v); } catch (e) { /* ignore */ } },
    del: (k) => { try { GM_deleteValue(k); } catch (e) { /* ignore */ } },
  };

  // ---------------------------------------------------------------- 계정(탭)
  // accounts: [{ id, name, naverId }]  /  계정별 값은 "acc:<id>:<key>" 에 저장
  function accounts() {
    let list = store.get("accounts");
    if (!Array.isArray(list) || !list.length) {
      // 1.2 이하에서 쓰던 기록을 첫 번째 탭으로 옮긴다
      list = [{ id: "a1", name: "계정 1", naverId: "" }];
      for (const k of ACC_KEYS) {
        const v = store.get(k);
        if (v !== undefined) { store.set(`acc:a1:${k}`, v); store.del(k); }
      }
      store.set("accounts", list);
      store.set("activeAcc", "a1");
    }
    return list;
  }
  const activeAcc = () => {
    const list = accounts();
    const id = store.get("activeAcc");
    return list.some((a) => a.id === id) ? id : list[0].id;
  };
  const aget = (acc, k, d) => store.get(`acc:${acc}:${k}`, d);
  const aset = (acc, k, v) => store.set(`acc:${acc}:${k}`, v);

  const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD (로컬 날짜)
  const historyOf = (acc) => aget(acc, "history", {});          // { blogId: {status, at} }
  const todayCountOf = (acc) => (aget(acc, "daily", {})[today()] || 0);

  function record(acc, blogId, status) {
    const h = historyOf(acc);
    const prev = h[blogId] && h[blogId].status;
    h[blogId] = { status, at: new Date().toISOString() };
    aset(acc, "history", h);
    if (status === "sent" && prev !== "sent") {
      const d = aget(acc, "daily", {});
      d[today()] = (d[today()] || 0) + 1;
      aset(acc, "daily", d);
    }
    store.set("ping", Date.now()); // 패널에 다시 그리라고 알림
  }

  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "style") e.style.cssText = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of children) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return e;
  }

  const stripTags = (s) => {
    const d = document.createElement("div");
    d.innerHTML = s || "";
    return (d.textContent || "").trim();
  };

  if (location.hostname === "m.blog.naver.com") buddyFormPage();
  else searchPanel();

  // ================================================================ 신청창: 멘트 자동 입력
  function buddyFormPage() {
    const blogId = new URLSearchParams(location.search).get("blogId") || "";
    const cur = store.get("current", {});
    const mine = cur.blogId === blogId;
    const acc = mine && cur.acc ? cur.acc : activeAcc();
    const template = mine && cur.message ? cur.message : pickMessage(aget(acc, "message", DEFAULT_MSG), "");
    const message = template.replaceAll("{닉네임}", (mine && cur.nick) || blogId);

    const banner = el("div", {
      style: "position:fixed;left:0;right:0;top:0;z-index:2147483647;padding:10px 12px;" +
        "font:14px/1.45 -apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;" +
        "background:#1d4ed8;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25)",
    });
    const say = (text, color) => { banner.textContent = "서이추 도우미 · " + text; if (color) banner.style.background = color; };
    document.body.append(banner);
    document.body.style.paddingTop = "48px";

    try { GM_setClipboard(message, "text"); } catch (e) { /* ignore */ }

    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      const done = fill();
      if (done || tries > 20) clearInterval(timer);
      if (!done && tries > 20) {
        say("입력칸을 찾지 못했어요. 멘트는 복사해 두었으니 붙여넣고 직접 보내주세요.", "#b45309");
      }
    }, 300);

    function fill() {
      // 1) 서로이웃 선택
      const radio = document.querySelector("#bothBuddyRadio") ||
        [...document.querySelectorAll("input[type=radio]")].find((r) => {
          const lab = r.id && document.querySelector(`label[for="${r.id}"]`);
          return /서로\s*이웃/.test((lab && lab.textContent) || (r.parentElement && r.parentElement.textContent) || "");
        });
      if (!radio) return false;
      if (radio.disabled) {
        say("이 블로그는 서로이웃 신청을 받지 않아요. 패널에서 [건너뛰기]를 누르세요.", "#b91c1c");
        record(acc, blogId, "refused");
        return true;
      }
      if (!radio.checked) {
        const lab = radio.id && document.querySelector(`label[for="${radio.id}"]`);
        (lab || radio).click();
      }

      // 2) 멘트 입력 (서로이웃 선택 후 나타나는 경우가 있어 재시도)
      const box = document.querySelector("textarea");
      if (!box) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(box, message);
      box.dispatchEvent(new Event("input", { bubbles: true }));
      box.dispatchEvent(new Event("change", { bubbles: true }));

      // 3) 확인 버튼 강조 + 사용자가 누르면 기록
      const btn = [...document.querySelectorAll("button, a, input[type=submit]")]
        .find((b) => /^\s*(확인|신청)\s*$/.test(b.textContent || b.value || ""));
      if (btn) {
        btn.style.outline = "3px solid #f59e0b";
        btn.style.outlineOffset = "2px";
        btn.addEventListener("click", () => record(acc, blogId, "sent"), { capture: true });
      }
      say("멘트를 입력했어요. 내용을 확인하고 [확인]을 직접 눌러주세요.", "#15803d");
      return true;
    }
  }

  // ================================================================ 대상 검색 패널
  function searchPanel() {
    let acc = activeAcc();
    let candidates = aget(acc, "candidates", []); // [{blogId,nick,blogName,keyword}]
    let cooldownUntil = 0;
    let loginId = detectLoginId();

    // 지금 로그인한 네이버 아이디와 연결된 탭이 있으면 그 탭을 연다
    const bound = loginId && accounts().find((a) => a.naverId === loginId);
    if (bound && bound.id !== acc) { acc = bound.id; store.set("activeAcc", acc); candidates = aget(acc, "candidates", []); }

    const css = `
      #sc-panel{position:fixed;right:16px;bottom:16px;width:370px;max-height:86vh;z-index:2147483647;
        display:flex;flex-direction:column;background:#fff;color:#111827;border:1px solid #d1d5db;border-radius:12px;
        box-shadow:0 10px 30px rgba(0,0,0,.18);font:13px/1.45 -apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif}
      #sc-panel *{box-sizing:border-box}
      #sc-panel header{display:flex;align-items:center;gap:8px;padding:10px 12px 6px;font-weight:700}
      #sc-panel header span{flex:1}
      #sc-panel .tabs{display:flex;gap:4px;padding:0 12px;border-bottom:1px solid #e5e7eb;overflow-x:auto}
      #sc-panel .tab{display:flex;align-items:center;gap:2px;padding:5px 4px 5px 10px;border:1px solid #e5e7eb;border-bottom:0;
        border-radius:8px 8px 0 0;background:#f3f4f6;color:#4b5563;cursor:pointer;white-space:nowrap;max-width:140px}
      #sc-panel .tab .t{overflow:hidden;text-overflow:ellipsis}
      #sc-panel .tab.on{background:#fff;color:#111827;font-weight:700;margin-bottom:-1px;border-color:#d1d5db}
      #sc-panel .tab .x{border:0;background:none;padding:0 5px;color:#9ca3af;font-size:14px;line-height:1}
      #sc-panel .tab .x:hover{color:#b91c1c}
      #sc-panel .add{border:0;background:none;padding:4px 8px;color:#03a94d;font-weight:700}
      #sc-panel .body{padding:10px 12px;overflow:auto;display:flex;flex-direction:column;gap:8px}
      #sc-panel textarea,#sc-panel input{width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:8px;font:inherit;color:inherit;background:#fff}
      #sc-panel button{padding:7px 10px;border:1px solid #d1d5db;border-radius:8px;background:#f9fafb;color:#111827;font:inherit;cursor:pointer;white-space:nowrap}
      #sc-panel .tabs button{border-radius:0}
      #sc-panel button.pri{background:#03c75a;border-color:#03c75a;color:#fff;font-weight:700}
      #sc-panel button:disabled{opacity:.5;cursor:default}
      #sc-panel .row{display:flex;gap:6px;align-items:center}
      #sc-panel .muted{color:#6b7280;font-size:12px}
      #sc-panel .warn{background:#fef3c7;color:#92400e;border-radius:8px;padding:6px 8px;font-size:12px}
      #sc-panel ul{list-style:none;margin:0;padding:0;border:1px solid #e5e7eb;border-radius:8px;max-height:200px;overflow:auto}
      #sc-panel li{display:flex;gap:6px;align-items:center;padding:5px 8px;border-bottom:1px solid #f3f4f6}
      #sc-panel li:last-child{border-bottom:0}
      #sc-panel li .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #sc-panel li .s{font-size:11px;color:#6b7280;white-space:nowrap}
      #sc-panel li.cur{background:#ecfdf5}
      #sc-panel.min .body,#sc-panel.min .tabs{display:none}
    `;
    document.head.append(el("style", {}, css));

    const tabs = el("div", { class: "tabs" });
    const kw = el("textarea", { rows: "3", placeholder: "검색어 (줄바꿈 또는 쉼표로 구분)\n예) 나는솔로1회, 나는솔로2회" });
    const pages = el("input", { type: "number", min: "1", max: "20", style: "width:64px" });
    const msg = el("textarea", { rows: "4", placeholder: "한 줄에 멘트 하나씩 적으세요" });
    const cool = el("input", { type: "number", min: "10", max: "600", style: "width:64px" });
    const warn = el("div", { class: "warn", hidden: "" });
    const info = el("div", { class: "muted" });
    const list = el("ul");
    const nextBtn = el("button", { class: "pri", onclick: openNext }, "다음 신청창 열기");
    const skipBtn = el("button", { onclick: skipCurrent }, "건너뛰기");
    const searchBtn = el("button", { onclick: search }, "대상 찾기");
    const minBtn = el("button", { onclick: () => panel.classList.toggle("min"), title: "접기/펴기" }, "–");

    const panel = el("div", { id: "sc-panel" },
      el("header", {}, el("span", {}, "서이추 도우미"), minBtn),
      tabs,
      el("div", { class: "body" },
        warn,
        kw,
        el("div", { class: "row" }, "검색어당 페이지", pages, el("span", { class: "muted" }, "(1페이지=7개 글)"), el("span", { style: "flex:1" }), searchBtn),
        el("div", { class: "row" },
          el("span", { class: "muted", style: "flex:1" }, "멘트: 한 줄에 하나씩, 매번 무작위로 골라요. {닉네임}은 상대 닉네임으로 바뀜"),
          el("button", { onclick: addSamples, title: "준비된 예시 멘트 8개를 추가해요" }, "예시 멘트 넣기")),
        msg,
        el("div", { class: "row" }, "신청 간격 최소", cool, "초"),
        info,
        list,
        el("div", { class: "row" }, nextBtn, skipBtn,
          el("button", { onclick: clearList, style: "margin-left:auto" }, "목록 비우기")),
        el("div", { class: "muted" },
          "탭마다 검색어·멘트·보낸 목록·하루 한도를 따로 기억해요. 탭 이름을 두 번 누르면 이름을 바꿀 수 있어요."),
      ),
    );
    document.body.append(panel);

    // -------------------------------------------------------------- 탭 값 불러오기/저장
    function loadFields() {
      kw.value = aget(acc, "keywords", "");
      pages.value = String(aget(acc, "pages", 3));
      const saved = aget(acc, "message", DEFAULT_MSG);
      msg.value = !String(saved).trim() || String(saved).trim() === OLD_DEFAULT_MSG ? DEFAULT_MSG : saved;
      cool.value = String(aget(acc, "cooldown", DEFAULT_COOLDOWN));
      candidates = aget(acc, "candidates", []);
    }
    function persist() {
      aset(acc, "keywords", kw.value);
      aset(acc, "pages", Number(pages.value) || 3);
      aset(acc, "message", msg.value);
      aset(acc, "cooldown", Math.max(10, Number(cool.value) || DEFAULT_COOLDOWN));
    }
    [kw, pages, msg, cool].forEach((i) => i.addEventListener("change", persist));

    function addSamples() {
      const have = new Set(msg.value.split("\n").map((l) => l.trim()).filter(Boolean));
      const add = DEFAULT_MSG.split("\n").filter((l) => !have.has(l));
      msg.value = [...have, ...add].join("\n");
      persist();
    }

    // -------------------------------------------------------------- 탭
    function renderTabs() {
      tabs.replaceChildren();
      const list = accounts();
      for (const a of list) {
        const tab = el("div", { class: "tab" + (a.id === acc ? " on" : ""), title: a.naverId ? `네이버 아이디: ${a.naverId}` : "아직 연결된 아이디 없음" },
          el("span", { class: "t" }, a.name));
        tab.addEventListener("click", () => switchTo(a.id));
        tab.addEventListener("dblclick", () => renameTab(a.id));
        if (list.length > 1) {
          tab.append(el("button", { class: "x", title: "탭 닫기", onclick: (e) => { e.stopPropagation(); closeTab(a.id); } }, "×"));
        }
        tabs.append(tab);
      }
      const add = el("button", { class: "add", title: `계정 탭 추가 (최대 ${MAX_ACCOUNTS}개)`, onclick: addTab }, "+");
      if (list.length >= MAX_ACCOUNTS) add.disabled = true;
      tabs.append(add);
    }

    function switchTo(id) {
      if (id === acc) return;
      persist();
      acc = id;
      store.set("activeAcc", id);
      loadFields();
      renderTabs();
      render();
    }

    function addTab() {
      const list = accounts();
      if (list.length >= MAX_ACCOUNTS) { alert(`계정 탭은 최대 ${MAX_ACCOUNTS}개까지 만들 수 있어요.`); return; }
      let n = 1;
      while (list.some((a) => a.id === `a${n}`)) n++;
      list.push({ id: `a${n}`, name: `계정 ${n}`, naverId: "" });
      store.set("accounts", list);
      switchTo(`a${n}`);
    }

    function renameTab(id) {
      const list = accounts();
      const a = list.find((x) => x.id === id);
      const name = prompt("탭 이름", a.name);
      if (!name || !name.trim()) return;
      a.name = name.trim().slice(0, 20);
      store.set("accounts", list);
      renderTabs();
    }

    function closeTab(id) {
      const list = accounts();
      if (list.length <= 1) return;
      const a = list.find((x) => x.id === id);
      if (!confirm(`'${a.name}' 탭을 닫을까요?\n이 탭의 검색어, 멘트, 보낸 목록이 모두 지워져요.`)) return;
      for (const k of ACC_KEYS) store.del(`acc:${id}:${k}`);
      const rest = list.filter((x) => x.id !== id);
      store.set("accounts", rest);
      if (acc === id) { acc = rest[0].id; store.set("activeAcc", acc); loadFields(); }
      renderTabs();
      render();
    }

    // 지금 로그인한 네이버 블로그 아이디 (페이지의 '내 블로그' 링크에서 읽음, 못 찾으면 빈 값)
    function detectLoginId() {
      for (const a of document.querySelectorAll("a[href*='blog.naver.com/']")) {
        if (!/내\s*블로그/.test(a.textContent || "")) continue;
        const m = a.href.match(/blog\.naver\.com\/(?:PostList\.naver\?blogId=)?([A-Za-z0-9_-]+)/);
        if (m && !/\.naver$/i.test(m[1])) return m[1];
      }
      return "";
    }

    // 탭과 지금 로그인한 계정이 안 맞으면 경고 문구를 돌려준다 (맞으면 빈 문자열).
    // 아직 아이디가 연결 안 된 탭은, 그 아이디를 쓰는 다른 탭이 없을 때 지금 아이디로 연결한다.
    function accountMismatch() {
      if (!loginId) loginId = detectLoginId(); // 로그인 영역이 늦게 그려지는 경우 대비
      if (!loginId) return "";
      const list = accounts();
      const a = list.find((x) => x.id === acc);
      if (!a.naverId) {
        const owner = list.find((x) => x.naverId === loginId);
        if (owner) {
          return `지금 로그인한 '${loginId}'는 '${owner.name}' 탭에서 쓰고 있어요. 이 탭은 다른 네이버 계정으로 로그인한 뒤 쓸 수 있어요.`;
        }
        a.naverId = loginId;
        if (/^계정 \d+$/.test(a.name)) a.name = loginId;
        store.set("accounts", list);
        renderTabs();
        return "";
      }
      if (a.naverId === loginId) return "";
      return `이 탭은 '${a.naverId}' 계정용이에요. 지금 네이버에는 '${loginId}'(으)로 로그인돼 있어요. 맞는 탭을 고르거나 네이버 계정을 바꿔주세요.`;
    }

    // -------------------------------------------------------------- 목록
    const statusOf = (id) => (historyOf(acc)[id] || {}).status || "";
    const LABEL = { sent: "보냄", refused: "불가", skipped: "건너뜀", opened: "열림" };
    const pending = () => candidates.filter((c) => !["sent", "refused", "skipped"].includes(statusOf(c.blogId)));

    function render() {
      list.replaceChildren();
      const cur = store.get("current", {});
      for (const c of candidates) {
        const st = statusOf(c.blogId);
        const a = el("a", { href: `https://blog.naver.com/${encodeURIComponent(c.blogId)}`, target: "_blank", rel: "noopener", class: "n", title: c.blogName },
          `${c.nick || c.blogId} · ${c.blogName || ""}`);
        list.append(el("li", { class: cur.acc === acc && c.blogId === cur.blogId ? "cur" : "" }, a, el("span", { class: "s" }, LABEL[st] || "대기")));
      }
      info.textContent = `후보 ${candidates.length}명 · 남은 ${pending().length}명 · 오늘 보냄 ${todayCountOf(acc)}/${DAILY_LIMIT}`;
      const problem = accountMismatch();
      if (problem) {
        warn.textContent = problem;
        warn.hidden = false;
      } else {
        warn.hidden = true;
      }
      tick();
    }

    function tick() {
      const wait = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (!warn.hidden) {
        nextBtn.disabled = true; nextBtn.textContent = "다른 계정 탭이에요";
      } else if (todayCountOf(acc) >= DAILY_LIMIT) {
        nextBtn.disabled = true; nextBtn.textContent = "오늘 한도 도달";
      } else if (wait > 0) {
        nextBtn.disabled = true; nextBtn.textContent = `${wait}초 후 열기 가능`;
      } else {
        nextBtn.disabled = pending().length === 0; nextBtn.textContent = "다음 신청창 열기";
      }
    }
    setInterval(tick, 1000);

    async function search() {
      persist();
      const searchAcc = acc;
      const words = kw.value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      if (!words.length) { alert("검색어를 입력하세요."); return; }
      const maxPage = Math.min(20, Math.max(1, Number(pages.value) || 3));
      const found = aget(searchAcc, "candidates", []);
      const known = new Set(found.map((c) => c.blogId));
      const h = historyOf(searchAcc);
      if (loginId) known.add(loginId);
      searchBtn.disabled = true;
      let added = 0;
      try {
        for (const w of words) {
          for (let p = 1; p <= maxPage; p++) {
            searchBtn.textContent = `찾는 중… ${w} ${p}/${maxPage}`;
            const qs = new URLSearchParams({ countPerPage: "7", currentPage: String(p), endDate: "", keyword: w, orderBy: "sim", startDate: "", type: "post" });
            let items = [];
            try {
              const res = await fetch(`/ajax/SearchList.naver?${qs}`, { credentials: "include" });
              const text = await res.text();
              items = (JSON.parse(text.slice(text.indexOf("{"))).result || {}).searchList || [];
            } catch (e) { console.warn("[서이추 도우미] 검색 실패", e); break; }
            if (!items.length) break;
            for (const it of items) {
              const id = (it.domainIdOrBlogId || it.blogId || "").trim();
              if (!id || known.has(id) || (h[id] && h[id].status !== "opened")) continue;
              known.add(id);
              found.push({ blogId: id, nick: stripTags(it.nickName), blogName: stripTags(it.blogName), keyword: w });
              added++;
            }
            await new Promise((r) => setTimeout(r, 700 + Math.random() * 800));
          }
        }
      } finally {
        aset(searchAcc, "candidates", found);
        if (searchAcc === acc) candidates = found;
        searchBtn.disabled = false;
        searchBtn.textContent = "대상 찾기";
        render();
      }
      if (searchAcc === acc) info.textContent = `새 후보 ${added}명 추가 · ` + info.textContent;
    }

    function openNext() {
      persist();
      if (accountMismatch()) { render(); return; }
      const c = pending()[0];
      if (!c) return;
      const n = todayCountOf(acc);
      if (n > 0 && n % SESSION_LIMIT === 0 &&
          !confirm(`오늘 ${n}명 보냈어요. 조금 쉬었다 하는 걸 권장해요. 계속할까요?`)) return;
      const prev = store.get("current", {});
      const chosen = pickMessage(msg.value, prev.acc === acc ? prev.message : "");
      if (!chosen) { alert("멘트를 한 줄 이상 적어주세요."); return; }
      store.set("current", { acc, blogId: c.blogId, nick: c.nick, message: chosen });
      if (statusOf(c.blogId) === "") record(acc, c.blogId, "opened");
      const url = `https://m.blog.naver.com/BuddyAddForm.naver?blogId=${encodeURIComponent(c.blogId)}`;
      const w = window.open(url, POPUP_NAME, "width=460,height=760");
      if (!w) alert("팝업이 차단됐어요. 주소창 오른쪽에서 이 사이트의 팝업을 허용해주세요.");
      const sec = Math.max(10, Number(cool.value) || DEFAULT_COOLDOWN);
      cooldownUntil = Date.now() + (sec + Math.random() * sec) * 1000; // 최소 간격 ~ 2배 사이 랜덤
      render();
    }

    function skipCurrent() {
      const cur = store.get("current", {});
      const id = (cur.acc === acc && cur.blogId) || (pending()[0] || {}).blogId;
      if (!id) return;
      record(acc, id, "skipped");
      cooldownUntil = 0;
      render();
    }

    function clearList() {
      if (!confirm("이 탭의 후보 목록을 비울까요? (보낸 기록은 남아요)")) return;
      candidates = [];
      aset(acc, "candidates", candidates);
      render();
    }

    try { GM_addValueChangeListener("ping", () => render()); } catch (e) { /* ignore */ }
    loadFields();
    renderTabs();
    render();
  }
})();
