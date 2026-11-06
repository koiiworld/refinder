import { connectionStatus } from "@/lib/ai/providers";
import { dbKind, q1 } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { naverConnected } from "@/lib/research";
import { naverAdConnected } from "@/lib/searchad";
import { youtubeConnected } from "@/lib/youtube";
import SettingsClient from "./SettingsClient";
import KeysCard from "./KeysCard";
import BrandCard from "./BrandCard";
import FeaturesCard from "./FeaturesCard";
import { getFeatureOff } from "@/lib/features";
import { getBrand } from "@/lib/brand";
import { canSaveKeys, keyStatus } from "@/lib/keystore";
import { pricingUpdates } from "@/lib/pricing-refresh";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const keys = await keyStatus(); // 앱에 넣은 키를 먼저 반영한 뒤 연결 상태 계산
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
          <p className="sub">단계별로 어떤 AI를 쓸지 정하고, 연결 상태를 확인합니다. API 키는 아래 'API 키 직접 연결'에서 넣을 수 있어요.</p>
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
        priceUpdates={await pricingUpdates()}
        keysCard={<KeysCard initial={keys} canSave={canSaveKeys()} />}
      />
      <div style={{ marginTop: 16 }}><FeaturesCard initial={await getFeatureOff()} /></div>
      <div style={{ marginTop: 16 }}><BrandCard initial={await getBrand()} /></div>
    </div>
  );
}
