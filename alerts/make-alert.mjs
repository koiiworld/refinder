#!/usr/bin/env node
// 반품 특가 알림 글 만들기 (카카오톡 알림방 · 스레드)
//
// 사용법 (refinder 폴더에서):
//   node alerts/make-alert.mjs                      # 링크 없이 글만 미리보기
//   node alerts/make-alert.mjs --links              # 파트너스 링크까지 생성 (API 1회)
//   옵션: --count 5  --min-disc 30  --env content-office/.env.local
//
// - 데이터: index.html 의 RAW (반품가 | 쿠팡 새 상품가)
// - 이미 보낸 상품은 alerts/sent.json 에 기록해 다음 번엔 빼요.
// - 파트너스 링크는 alerts/links.json 에 저장해 다시 만들지 않아요.
//   쿠팡 링크 생성 API는 한 번 실행에 1회만 부릅니다 (차단 방지).
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import crypto from 'node:crypto';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const COUNT = Number(opt('count', 5));
const MIN_DISC = Number(opt('min-disc', 30));
const WANT_LINKS = args.includes('--links');
const ENV_FILE = opt('env', join(ROOT, 'content-office/.env.local'));

const DISCLOSURE = '이 글은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

// ---------- 데이터 ----------
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const raw = html.split('const RAW = `')[1].split('`')[0];
const checked = (html.match(/(\d{4}-\d{2}-\d{2}) 확인 기준/) || [])[1] ?? '날짜 미상';
const items = raw.trim().split('\n').map((l) => l.split('|')).filter((r) => r.length >= 7 && r[6])
  .map(([rid, pid, iid, ret, name, states, newp]) => ({
    rid, pid, iid, name: name.trim(), ret: +ret, newp: +newp, states: states.split(',').map((s) => s.trim()).filter(Boolean),
  }))
  .filter((it) => it.newp > it.ret)
  .map((it) => ({...it, disc: Math.round((1 - it.ret / it.newp) * 100), gap: it.newp - it.ret}));

const SENT_FILE = join(HERE, 'sent.json');
const LINK_FILE = join(HERE, 'links.json');
const sent = existsSync(SENT_FILE) ? JSON.parse(readFileSync(SENT_FILE, 'utf8')) : {};
const links = existsSync(LINK_FILE) ? JSON.parse(readFileSync(LINK_FILE, 'utf8')) : {};

const picks = items
  .filter((it) => it.disc >= MIN_DISC && !sent[it.rid])
  .sort((a, b) => b.gap - a.gap)
  .slice(0, COUNT);

if (!picks.length) {
  console.log('보낼 새 상품이 없어요. (--min-disc 를 낮추거나 데이터를 새로 받아 주세요)');
  process.exit(0);
}

const daysOld = Math.floor((Date.now() - new Date(checked).getTime()) / 864e5);
if (!(daysOld <= 2)) {
  console.warn(`⚠️  가격 데이터가 ${checked} 기준이에요 (${isNaN(daysOld) ? '?' : daysOld}일 전). 보내기 전에 최신 가격으로 갱신하세요.\n`);
}

const usedUrl = (it) =>
  `https://www.coupang.com/vp/products/${it.pid}?itemId=${it.iid}&vendorItemId=${it.rid}&landingType=USED_DETAIL&sourceType=OFFER_LIST`;

// ---------- 파트너스 링크 (선택) ----------
function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8').split('\n')
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      .map(([, k, v]) => [k, v.replace(/^['"]|['"]$/g, '')]),
  );
}

async function makeLinks(list) {
  const env = {...loadEnv(ENV_FILE), ...process.env};
  const ak = env.COUPANG_ACCESS_KEY?.trim();
  const sk = env.COUPANG_SECRET_KEY?.trim();
  if (!ak || !sk) throw new Error(`쿠팡 키를 못 찾았어요 (${ENV_FILE})`);
  const path = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';
  const dt = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '').slice(2);
  const sig = crypto.createHmac('sha256', sk).update(dt + 'POST' + path).digest('hex');
  const res = await fetch(`https://api-gateway.coupang.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `CEA algorithm=HmacSHA256, access-key=${ak}, signed-date=${dt}, signature=${sig}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({coupangUrls: list.map(usedUrl)}),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.rCode && data.rCode !== '0')) {
    throw new Error(`링크 생성 실패 (HTTP ${res.status}) ${data.rMessage ?? data.message ?? ''}`);
  }
  (data.data ?? []).forEach((d, i) => {
    if (d.shortenUrl) links[list[i].rid] = d.shortenUrl;
  });
  writeFileSync(LINK_FILE, JSON.stringify(links, null, 2));
}

if (WANT_LINKS) {
  const need = picks.filter((it) => !links[it.rid]).slice(0, 20); // API 1회, 최대 20개
  if (need.length) {
    try {
      await makeLinks(need);
      console.log(`파트너스 링크 ${need.length}개 생성 (API 1회)\n`);
    } catch (e) {
      console.error(`❌ ${e.message}\n   링크 없이 글만 만들어요.\n`);
    }
  }
}

// ---------- 글 만들기 ----------
const won = (n) => n.toLocaleString('ko-KR');
const man = (n) => (n >= 10000 ? `${Math.round(n / 10000).toLocaleString('ko-KR')}만원` : `${won(n)}원`);
const shortName = (n) => n.split(',')[0].trim();
const bestState = (s) => s.find((x) => x !== '새 상품') ?? s[0] ?? '';
const linkOf = (it) => links[it.rid] ?? '(링크 생성 전)';
const when = `${checked.slice(5).replace('-', '/')} 확인`;

const kakao = [
  '📢 [광고] ' + DISCLOSURE,
  '',
  `🔥 오늘의 반품 특가 (${when})`,
  '',
  ...picks.flatMap((it, i) => [
    `${i + 1}. ${shortName(it.name)}`,
    `   ${won(it.newp)}원 → ${won(it.ret)}원 (-${it.disc}%, ${man(it.gap)}↓)`,
    `   ${it.states.join(' · ')}`,
    `   👉 ${linkOf(it)}`,
    '',
  ]),
  '※ 반품 상품은 재고가 1~2개라 금방 품절돼요. 가격·상태는 구매 전 꼭 확인하세요.',
].join('\n');

const top = picks.slice(0, 3);
const threads = [
  '[광고] ' + DISCLOSURE,
  '',
  `쿠팡 반품마켓 오늘 특가 ${top.length}개 (${when})`,
  '',
  ...top.flatMap((it) => [
    `· ${shortName(it.name).slice(0, 40)}`,
    `  ${won(it.ret)}원 (-${it.disc}%, 새 상품가 ${won(it.newp)}원) · ${bestState(it.states)}`,
    `  ${linkOf(it)}`,
  ]),
].join('\n');

writeFileSync(join(HERE, 'kakao.txt'), kakao + '\n');
writeFileSync(join(HERE, 'threads.txt'), threads + '\n');
console.log('===== 카카오톡 알림방 (alerts/kakao.txt) =====\n' + kakao);
console.log(`\n===== 스레드 (alerts/threads.txt, ${[...threads].length}/500자) =====\n` + threads);

if (args.includes('--mark-sent')) {
  const at = new Date().toISOString();
  picks.forEach((it) => (sent[it.rid] = at));
  writeFileSync(SENT_FILE, JSON.stringify(sent, null, 2));
  console.log(`\n보낸 상품 ${picks.length}개를 기록했어요. 다음 번엔 빠져요.`);
} else {
  console.log('\n(보낸 뒤 --mark-sent 를 붙여 다시 실행하면 다음 번엔 이 상품들이 빠져요)');
}
