import { connectionStatus } from "@/lib/ai/providers";
import { dbKind, q1 } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { naverConnected } from "@/lib/research";
import { naverAdConnected } from "@/lib/searchad";
import { youtubeConnected } from "@/lib/youtube";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [kind, settings, cost] = await Promise.all([
    dbKind(),
    getSettings(),
    q1<{ n: number; cost: number }>("SELECT COUNT(*)::int AS n, COALESCE(SUM(cost_usd),0)::float8 AS cost FROM ai_runs WHERE created_at >= date_trunc('month', NOW())"),
  ]);
  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <div className="page-head">
        <div>
          <h1>설정</h1>
          <p className="sub">단계별로 어떤 AI를 쓸지 정하고, 연결 상태를 확인합니다. API 키는 서버의 .env.local 에만 저장됩니다.</p>
        </div>
      </div>
      {kind === "pglite" && process.env.RENDER && (
        <div className="notice notice-bad" style={{ marginBottom: 16 }}>
          배포 서버에서 내장 DB를 쓰고 있습니다. 무료 서버 디스크는 재시작 시 지워지므로 데이터가 사라집니다. DATABASE_URL(Supabase)을 설정하세요.
        </div>
      )}
      <SettingsClient
        connections={connectionStatus()}
        settings={settings}
        db={kind}
        data={{ naverAd: naverAdConnected(), datalab: naverConnected(), youtube: youtubeConnected() }}
        month={{ runs: Number(cost?.n ?? 0), cost: Number(cost?.cost ?? 0) }}
      />
    </div>
  );
}
