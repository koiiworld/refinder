import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

export const FONT = 'Pretendard';

const weights: [string, string][] = [
  ['Medium', '500'],
  ['Bold', '700'],
  ['ExtraBold', '800'],
  ['Black', '900'],
];
for (const [file, weight] of weights) {
  loadFont({family: FONT, url: staticFile(`fonts/Pretendard-${file}.woff2`), weight});
}

export const C = {
  bg: '#F4F1EA',
  ink: '#121212',
  muted: '#7A766E',
  line: '#DCD7CC',
  accent: '#FF4D1F',
  accentSoft: '#FFE3D9',
  card: '#FFFFFF',
};

export const won = (n: number) => n.toLocaleString('ko-KR');

/** 1234567 -> "123만 4,567원" 대신 짧게: 523,400 -> "52만원" */
export const manwon = (n: number) => {
  const m = Math.round(n / 10000);
  return m >= 1 ? `${m.toLocaleString('ko-KR')}만원` : `${won(n)}원`;
};
