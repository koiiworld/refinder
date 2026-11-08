const $ = (id) => document.getElementById(id);
const msg = (t, ok = true) => { $("msg").textContent = t; $("msg").className = `muted ${ok ? "ok" : "bad"}`; };
const ask = (m) => new Promise((res) => chrome.runtime.sendMessage(m, (r) => res(r || { ok: false, error: "확장 프로그램 오류" })));

async function loadPosts() {
  const r = await ask({ type: "posts" });
  if (!r.ok) { msg(r.error, false); $("setup").open = true; return false; }
  const { target } = await chrome.storage.local.get("target");
  $("target").innerHTML = r.data.posts.map((p) => `<option value="${p.id}">[${p.blog}] ${p.title.replace(/</g, "&lt;")}</option>`).join("");
  if (target?.id && r.data.posts.some((p) => p.id === target.id)) $("target").value = target.id;
  else if (r.data.posts[0]) await saveTarget();
  msg(`연결됨 · 최근 글 ${r.data.posts.length}개`);
  return true;
}
async function saveTarget() {
  const sel = $("target");
  const opt = sel.options[sel.selectedIndex];
  if (!opt?.value) return;
  await chrome.storage.local.set({ target: { id: opt.value, title: opt.textContent.replace(/^\[[^\]]*\]\s*/, "") } });
  msg(`보낼 글: ${opt.textContent}`);
}

(async () => {
  const { appUrl, code } = await chrome.storage.local.get(["appUrl", "code"]);
  $("app").value = appUrl || "";
  $("code").value = code || "";
  if (!appUrl) { $("setup").open = true; msg("앱 설정 → 🧩 크롬 확장 프로그램 에서 앱 주소와 연결 코드를 복사해 넣어 주세요.", false); return; }
  await loadPosts();
})();
$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({ appUrl: $("app").value.trim().replace(/\/$/, ""), code: $("code").value.trim() });
  if (await loadPosts()) $("setup").open = false;
});
$("target").addEventListener("change", saveTarget);
