// 콘텐츠 오피스 보내기 — ChatGPT·제미나이 화면에 '📥 콘텐츠 오피스로' 버튼
// 사이트 화면(React)을 건드리지 않게, 답변 위에 마우스를 올리면 떠 있는 버튼을 보여 줌
(() => {
  const SITE = /gemini\.google\.com/.test(location.host) ? "gemini" : "chatgpt";
  const RESP = SITE === "gemini" ? "model-response, .model-response-text" : '[data-message-author-role="assistant"]';
  const BODY = SITE === "gemini" ? "message-content, .markdown" : ".markdown, .prose";

  const bar = document.createElement("div");
  bar.className = "co-bar";
  bar.innerHTML = '<button data-a="text">📥 글 보내기</button><button data-a="img">🖼 사진 보내기</button><span class="co-target"></span>';
  document.documentElement.appendChild(bar);
  const selBtn = document.createElement("button");
  selBtn.className = "co-sel";
  selBtn.textContent = "📥 선택한 부분 보내기";
  document.documentElement.appendChild(selBtn);
  const toast = document.createElement("div");
  toast.className = "co-toast";
  document.documentElement.appendChild(toast);

  let current = null;
  let hideTimer = null;

  const say = (text, ok = true) => {
    toast.textContent = text;
    toast.className = `co-toast show ${ok ? "" : "bad"}`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (toast.className = "co-toast"), 3500);
  };
  const ask = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, (r) => res(r || { ok: false, error: chrome.runtime.lastError?.message || "확장 프로그램 오류" })));
  const source = () => ({ site: SITE, url: location.href, title: document.title });

  /** 화면 HTML 정리: 복사 버튼·아이콘 빼고 글 서식만 */
  function cleanClone(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll("button, svg, [role=button], .co-bar, img, picture").forEach((n) => n.remove());
    return c.innerHTML;
  }
  const imagesIn = (el) => [...el.querySelectorAll("img")].filter((i) => (i.naturalWidth || i.width) >= 200 && !/avatar|logo|icon/i.test(i.className + i.alt));

  async function imgToSend(img) {
    const src = img.currentSrc || img.src;
    // blob: 주소는 이 페이지에서만 열려서 여기서 바꿔 보냄
    if (src.startsWith("blob:")) {
      const b = await (await fetch(src)).blob();
      const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
      return { kind: "image", imageUrl: data, source: source() };
    }
    return { kind: "image", imageUrl: src, source: source() };
  }

  async function sendText(el) {
    const body = el.querySelector(BODY) || el;
    const r = await ask({ type: "send", payload: { kind: "text", html: cleanClone(body), text: body.innerText, source: source() } });
    r.ok ? say(`📥 "${r.data.target}"로 글을 보냈어요`) : say(r.error, false);
  }
  async function sendImages(el) {
    const imgs = imagesIn(el);
    if (!imgs.length) return say("이 답변에는 보낼 사진이 없어요.", false);
    let n = 0;
    for (const img of imgs) {
      const r = await ask({ type: "send", payload: await imgToSend(img) });
      if (!r.ok) return say(r.error, false);
      n++;
    }
    say(`🖼 사진 ${n}장을 보냈어요`);
  }

  async function showTarget() {
    const r = await ask({ type: "target" });
    bar.querySelector(".co-target").textContent = r.ok && r.data ? `→ ${r.data.title.slice(0, 18)}` : "→ 보낼 글을 고르세요(아이콘)";
  }

  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest?.(RESP);
    if (!el && !bar.contains(e.target)) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => (bar.style.display = "none"), 600);
      return;
    }
    if (!el || el === current) { clearTimeout(hideTimer); return; }
    current = el;
    clearTimeout(hideTimer);
    const r = el.getBoundingClientRect();
    bar.style.display = "flex";
    bar.style.top = `${Math.max(8, Math.min(window.innerHeight - 50, r.top + 4))}px`;
    bar.style.left = `${Math.min(window.innerWidth - 330, r.right - 320)}px`;
    bar.querySelector('[data-a="img"]').style.display = imagesIn(el).length ? "" : "none";
    void showTarget();
  });
  bar.addEventListener("click", (e) => {
    const a = e.target.closest("button")?.dataset.a;
    if (!a || !current) return;
    a === "text" ? void sendText(current) : void sendImages(current);
  });

  // 드래그로 고른 부분만 보내기
  document.addEventListener("mouseup", (e) => {
    if (selBtn.contains(e.target) || bar.contains(e.target)) return;
    setTimeout(() => {
      const s = window.getSelection();
      if (!s || s.isCollapsed || s.toString().trim().length < 5) return (selBtn.style.display = "none");
      const r = s.getRangeAt(0).getBoundingClientRect();
      selBtn.style.display = "block";
      selBtn.style.top = `${Math.max(8, r.top - 38)}px`;
      selBtn.style.left = `${Math.max(8, r.left)}px`;
    }, 10);
  });
  const selectionHtml = () => {
    const s = window.getSelection();
    if (!s || s.isCollapsed) return "";
    const box = document.createElement("div");
    box.appendChild(s.getRangeAt(0).cloneContents());
    box.querySelectorAll("button, svg, img").forEach((n) => n.remove());
    return box.innerHTML;
  };
  selBtn.addEventListener("mousedown", (e) => e.preventDefault());
  selBtn.addEventListener("click", async () => {
    const s = window.getSelection();
    const r = await ask({ type: "send", payload: { kind: "text", html: selectionHtml(), text: s ? s.toString() : "", source: source() } });
    selBtn.style.display = "none";
    r.ok ? say(`📥 "${r.data.target}"로 선택한 부분을 보냈어요`) : say(r.error, false);
  });

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg.type === "selectionHtml") reply({ html: selectionHtml() });
    if (msg.type === "toast") say(msg.text, msg.ok);
  });
})();
