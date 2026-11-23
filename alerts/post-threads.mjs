#!/usr/bin/env node
// 스레드 게시 (공식 Threads API)
//
//   node alerts/post-threads.mjs            # 미리보기만 (아무것도 안 올림)
//   node alerts/post-threads.mjs --yes      # 실제 게시: 본문 → 첫 댓글(링크)
//   옵션: --file alerts/threads.txt  --env content-office/.env.local
//
// 필요 키 (.env.local, 값은 직접 입력): THREADS_ACCESS_TOKEN
// threads.txt 형식: 본문 + "----- 첫 댓글 -----" + 댓글  (make-alert.mjs 가 만듦)
import {readFileSync, existsSync, appendFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const FILE = opt('file', join(HERE, 'threads.txt'));
const ENV_FILE = opt('env', join(ROOT, 'content-office/.env.local'));
const GO = args.includes('--yes');
const API = 'https://graph.threads.net/v1.0';

const env = {
  ...(existsSync(ENV_FILE)
    ? Object.fromEntries(readFileSync(ENV_FILE, 'utf8').split('\n')
        .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean)
        .map(([, k, v]) => [k, v.replace(/^['"]|['"]$/g, '')]))
    : {}),
  ...process.env,
};

const [body, reply = ''] = readFileSync(FILE, 'utf8').split(/\n-+ 첫 댓글 -+\n/).map((s) => s.trim());
const len = (s) => [...s].length;

console.log(`===== 본문 (${len(body)}/500자) =====\n${body}\n`);
if (reply) console.log(`===== 첫 댓글 (${len(reply)}/500자) =====\n${reply}\n`);

// 게시 전 점검
const problems = [];
if (len(body) > 500) problems.push('본문이 500자를 넘어요');
if (len(reply) > 500) problems.push('댓글이 500자를 넘어요');
if (!/\[광고\]/.test(body)) problems.push('본문에 [광고] 표시가 없어요');
if (reply && !/수수료/.test(reply)) problems.push('댓글에 대가성 문구가 없어요');
if (/링크 생성 전/.test(reply)) problems.push('파트너스 링크가 아직 없어요 (make-alert.mjs --links)');
if (problems.length) {
  console.error('❌ 게시 안 함:\n - ' + problems.join('\n - '));
  process.exit(1);
}
if (!GO) {
  console.log('미리보기만 했어요. 올리려면 --yes 를 붙여 다시 실행하세요.');
  process.exit(0);
}

const token = env.THREADS_ACCESS_TOKEN?.trim();
if (!token) {
  console.error(`❌ THREADS_ACCESS_TOKEN 이 없어요 (${ENV_FILE})`);
  process.exit(1);
}

async function call(path, params) {
  const url = `${API}${path}?${new URLSearchParams({...params, access_token: token})}`;
  const res = await fetch(url, {method: 'POST', signal: AbortSignal.timeout(30_000)});
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Threads API 오류 (HTTP ${res.status}) ${data.error?.message ?? ''}`);
  return data;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(text, replyTo) {
  const c = await call('/me/threads', {media_type: 'TEXT', text, ...(replyTo ? {reply_to_id: replyTo} : {})});
  await sleep(5000); // 컨테이너 준비 대기
  const p = await call('/me/threads_publish', {creation_id: c.id});
  return p.id;
}

try {
  const id = await post(body);
  console.log(`✅ 본문 게시 완료 (id ${id})`);
  if (reply) {
    await sleep(3000);
    const rid = await post(reply, id);
    console.log(`✅ 첫 댓글 게시 완료 (id ${rid})`);
  }
  appendFileSync(join(HERE, 'posted.log'), `${new Date().toISOString()}\t${id}\t${body.split('\n')[0]}\n`);
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}
