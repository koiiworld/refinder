// 콘텐츠 오피스 보내기 — 백그라운드: 앱으로 보내기 · 사진 받아오기 · 오른쪽 클릭 메뉴
const get = () => chrome.storage.local.get(["appUrl", "code", "target"]);

async function api(path, init = {}) {
  const { appUrl, code } = await get();
  if (!appUrl) throw new Error("확장 프로그램 아이콘을 눌러 앱 주소와 연결 코드를 먼저 넣어 주세요.");
  const res = await fetch(appUrl.replace(/\/$/, "") + path, { ...init, headers: { "content-type": "application/json", "x-co-ext": code || "", ...(init.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `앱 응답 오류 (${res.status})`);
  return data;
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function fetchAsDataUrl(url) {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`사진을 받지 못했어요 (${res.status})`);
  let type = (res.headers.get("content-type") || "image/png").split(";")[0];
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(type)) type = "image/png";
  return `data:${type};base64,${toBase64(await res.arrayBuffer())}`;
}

async function send(payload) {
  const { target } = await get();
  if (!target?.id) throw new Error("확장 프로그램 아이콘을 눌러 '보낼 글'을 먼저 골라 주세요.");
  if (payload.kind === "image" && payload.imageUrl) {
    payload.image = await fetchAsDataUrl(payload.imageUrl);
    delete payload.imageUrl;
  }
  await api("/api/ext/inbox", { method: "POST", body: JSON.stringify({ projectId: target.id, ...payload }) });
  return { ok: true, target: target.title };
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    if (msg.type === "send") return send(msg.payload);
    if (msg.type === "posts") return api("/api/ext/posts");
    if (msg.type === "target") return (await get()).target || null;
    throw new Error("알 수 없는 요청");
  })()
    .then((r) => reply({ ok: true, data: r }))
    .catch((e) => reply({ ok: false, error: e.message }));
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "co-text", title: "📥 콘텐츠 오피스로 보내기 (선택한 글)", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "co-image", title: "📥 콘텐츠 오피스로 보내기 (이 사진)", contexts: ["image"] });
});

const siteOf = (url) => (/gemini\.google\.com/.test(url || "") ? "gemini" : /chatgpt\.com|chat\.openai\.com/.test(url || "") ? "chatgpt" : "web");
async function notify(tabId, text, ok = true) {
  try { await chrome.tabs.sendMessage(tabId, { type: "toast", text, ok }); } catch { /* 다른 사이트 */ }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const source = { site: siteOf(tab?.url), url: tab?.url, title: tab?.title };
  try {
    if (info.menuItemId === "co-image") {
      await send({ kind: "image", imageUrl: info.srcUrl, source });
    } else {
      let html = "";
      try { html = (await chrome.tabs.sendMessage(tab.id, { type: "selectionHtml" }))?.html || ""; } catch { /* 다른 사이트 */ }
      await send({ kind: "text", html, text: info.selectionText || "", source });
    }
    const { target } = await get();
    notify(tab.id, `📥 "${target?.title || "글"}"로 보냈어요`);
  } catch (e) {
    notify(tab.id, e.message, false);
  }
});
