// 사용법: node render-post.mjs posts/<이름>.json
// JSON의 slides 순서대로 out/<이름>/01.mp4, 02.mp4 ... 를 만듭니다.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {basename} from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('사용법: node render-post.mjs posts/<이름>.json');
  process.exit(1);
}
const post = JSON.parse(readFileSync(file, 'utf8'));
const name = basename(file, '.json');
mkdirSync(`out/${name}`, {recursive: true});

post.slides.forEach((slide, i) => {
  const n = String(i + 1).padStart(2, '0');
  const propsFile = `out/${name}/.props-${n}.json`;
  writeFileSync(propsFile, JSON.stringify({account: post.account, slide}));
  execFileSync(
    'npx',
    ['remotion', 'render', 'PhotoSlide', `out/${name}/${n}.mp4`, `--props=${propsFile}`,
     '--codec=h264', '--crf=16', '--pixel-format=yuv420p', '--log=error'],
    {stdio: ['ignore', 'ignore', 'inherit']},
  );
  console.log(`✓ out/${name}/${n}.mp4 (${slide.kind})`);
});
