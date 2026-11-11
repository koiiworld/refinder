import "server-only";

/**
 * ☕ Render 무료 요금제 잠들지 않게 하기
 * - Render 무료는 15분 동안 접속이 없으면 잠듦 → 텔레그램 알림·버튼 확인도 멈췄다가 앱을 열면 한꺼번에 처리됨
 * - 맥 앱: .env.local 의 KEEPALIVE_URL 로 10분마다 Render 에 접속 (맥이 잠들면 멈춤)
 * - Render: 자기 바깥 주소(RENDER_EXTERNAL_URL, Render가 자동으로 넣어 줌)로 10분마다 스스로 접속 → 맥이 잠들어도 깨어 있음
 */
export function startKeepAlive() {
  const own = process.env.RENDER && process.env.RENDER_EXTERNAL_URL?.trim() ? `${process.env.RENDER_EXTERNAL_URL.trim().replace(/\/$/, "")}/api/health` : "";
  const url = process.env.RENDER ? own : process.env.KEEPALIVE_URL?.trim();
  if (!url) return;
  const g = globalThis as { __coKeepAlive?: boolean };
  if (g.__coKeepAlive) return;
  g.__coKeepAlive = true;
  const ping = () => fetch(url, { signal: AbortSignal.timeout(90_000), headers: { "user-agent": "ContentOffice-KeepAlive/1.0" } }).catch(() => {});
  void ping();
  setInterval(ping, 10 * 60 * 1000).unref?.();
}
