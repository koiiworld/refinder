import "server-only";

/**
 * ☕ Render 무료 요금제 잠들지 않게 하기
 * - Render 무료는 15분 동안 접속이 없으면 잠듦 → 다음 접속 때 30초~1분 깨우는 화면
 * - 늘 켜져 있는 맥 앱이 10분마다 Render 상태 주소(/api/health)에 짧게 접속
 * - 맥의 .env.local 에 KEEPALIVE_URL 을 넣었을 때만 동작 (Render·테스트에서는 꺼짐)
 */
export function startKeepAlive() {
  const url = process.env.KEEPALIVE_URL?.trim();
  if (!url || process.env.RENDER) return;
  const g = globalThis as { __coKeepAlive?: boolean };
  if (g.__coKeepAlive) return;
  g.__coKeepAlive = true;
  const ping = () => fetch(url, { signal: AbortSignal.timeout(90_000), headers: { "user-agent": "ContentOffice-KeepAlive/1.0" } }).catch(() => {});
  void ping();
  setInterval(ping, 10 * 60 * 1000).unref?.();
}
