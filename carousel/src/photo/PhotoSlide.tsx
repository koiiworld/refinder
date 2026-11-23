import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Video} from '@remotion/media';
import {FONT} from '../theme';

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export type Slide =
  | {kind: 'cover'; media: string; kicker: string; title: string[]}
  | {kind: 'item'; media: string; brand: string; product: string; price: string; comment: string}
  | {kind: 'outro'; media: string; tagline: string; cta: string; disclosure: string};

export type PhotoSlideProps = {
  slide: Slide;
  account: string; // 우측 상단/워터마크에 쓰는 계정명
};

const src = (m: string) => (/^https?:\/\//.test(m) ? m : staticFile(m));
const isVideo = (m: string) => /\.(mp4|mov|webm)$/i.test(m);

/** 배경: 사진은 천천히 줌인(켄번즈), 영상은 그대로 재생 */
const Media: React.FC<{media: string; blur?: number}> = ({media, blur = 0}) => {
  const f = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    filter: blur ? `blur(${blur}px) brightness(0.75)` : undefined,
  };
  if (isVideo(media)) {
    return <Video src={src(media)} muted style={style} />;
  }
  return (
    <AbsoluteFill
      style={{
        scale: interpolate(f, [0, durationInFrames], [1.14, 1.02], {...clamp, easing: Easing.out(Easing.quad)}),
        translate: interpolate(f, [0, durationInFrames], ['0px 24px', '0px 0px'], clamp),
      }}
    >
      <Img src={src(media)} style={style} />
    </AbsoluteFill>
  );
};

/** 아래에서 블러와 함께 떠오르는 텍스트 */
const Up: React.FC<{at: number; children: React.ReactNode; style?: React.CSSProperties}> = ({at, children, style}) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        opacity: interpolate(f, [at, at + 16], [0, 1], {...clamp, easing: ease}),
        translate: interpolate(f, [at, at + 20], ['0px 28px', '0px 0px'], {...clamp, easing: ease}),
        filter: `blur(${interpolate(f, [at, at + 16], [10, 0], clamp)}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** 마스크 안에서 밀려 올라오는 큰 제목 줄 */
const MaskLine: React.FC<{at: number; children: React.ReactNode}> = ({at, children}) => {
  const f = useCurrentFrame();
  return (
    <div style={{overflow: 'hidden', paddingBottom: 6}}>
      <div
        style={{
          translate: interpolate(f, [at, at + 22], ['0px 110%', '0px 0%'], {...clamp, easing: ease}),
        }}
      >
        {children}
      </div>
    </div>
  );
};

/** 제목 끝 반짝이 ⋆.˚ */
const Sparkle: React.FC<{at: number}> = ({at}) => {
  const f = useCurrentFrame();
  const tw = (o: number) => 0.35 + 0.65 * Math.abs(Math.sin((f - at) / 9 + o));
  return (
    <span style={{fontSize: '0.5em', marginLeft: 18, opacity: interpolate(f, [at, at + 10], [0, 1], clamp)}}>
      <span style={{opacity: tw(0)}}>⋆</span>
      <span style={{opacity: tw(1.2)}}>.</span>
      <span style={{opacity: tw(2.1)}}>˚</span>
      <span style={{opacity: tw(0.6)}}> ⊹</span>
    </span>
  );
};

const shade = (from: number) =>
  `linear-gradient(to bottom, rgba(0,0,0,0) ${from}%, rgba(0,0,0,0.55) 100%)`;

const textShadow = '0 2px 16px rgba(0,0,0,0.35)';

export const PhotoSlide: React.FC<PhotoSlideProps> = ({slide, account}) => {
  const f = useCurrentFrame();
  const fadeIn = interpolate(f, [0, 12], [0, 1], clamp);

  return (
    <AbsoluteFill style={{background: '#000', fontFamily: FONT, color: '#fff', letterSpacing: '-0.02em', wordBreak: 'keep-all'}}>
      <Media media={slide.media} blur={slide.kind === 'outro' ? 24 : 0} />
      <AbsoluteFill style={{background: shade(slide.kind === 'cover' ? 45 : 60), opacity: fadeIn}} />

      {slide.kind !== 'cover' && slide.kind !== 'outro' && (
        <div
          style={{
            position: 'absolute', top: 26, width: '100%', textAlign: 'center',
            fontSize: 18, fontWeight: 800, letterSpacing: '0.04em', opacity: 0.75,
          }}
        >
          {account.toUpperCase()}
        </div>
      )}

      {slide.kind === 'cover' && (
        <>
          <Up at={4} style={{position: 'absolute', top: 200, left: 70, fontSize: 32, fontWeight: 500, textShadow}}>
            {slide.kicker}
          </Up>
          <Up at={4} style={{position: 'absolute', top: 200, right: 70, fontSize: 32, fontWeight: 800, textShadow}}>
            {account.toUpperCase()}
          </Up>
          <div style={{position: 'absolute', left: 70, right: 70, bottom: 190, fontSize: 104, fontWeight: 700, lineHeight: 1.18, textShadow}}>
            {slide.title.map((line, i) => (
              <MaskLine key={i} at={10 + i * 7}>
                {line}
                {i === slide.title.length - 1 && <Sparkle at={30} />}
              </MaskLine>
            ))}
          </div>
        </>
      )}

      {slide.kind === 'item' && (
        <div style={{position: 'absolute', left: 66, right: 66, bottom: 96, textShadow}}>
          <Up at={6} style={{fontSize: 46, fontWeight: 800}}>{slide.brand}</Up>
          <Up at={11} style={{fontSize: 34, fontWeight: 700, marginTop: 10}}>
            {slide.product} <span style={{opacity: 0.8}}>|</span> {slide.price}
          </Up>
          <Up at={16} style={{fontSize: 31, fontWeight: 500, marginTop: 10, opacity: 0.95}}>{slide.comment}</Up>
        </div>
      )}

      {slide.kind === 'outro' && (
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 80}}>
          <div
            style={{
              fontSize: 112, fontWeight: 900, letterSpacing: interpolate(f, [0, 30], [0.2, 0.02], {...clamp, easing: ease}) + 'em',
              opacity: interpolate(f, [0, 14], [0, 1], clamp),
            }}
          >
            {account.toUpperCase()}
          </div>
          <Up at={16} style={{fontSize: 34, fontWeight: 500, marginTop: 16}}>{slide.tagline}</Up>
          <Up at={26} style={{marginTop: 56, fontSize: 36, fontWeight: 800, background: '#fff', color: '#111', padding: '20px 40px', borderRadius: 999}}>
            {slide.cta}
          </Up>
          <Up at={36} style={{position: 'absolute', bottom: 70, left: 80, right: 80, fontSize: 22, fontWeight: 500, opacity: 0.75, lineHeight: 1.5}}>
            {slide.disclosure}
          </Up>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
