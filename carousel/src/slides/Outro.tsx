import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {C} from '../theme';
import {clamp, ease, Frame, Rise, TopBar} from './common';

export type OutroProps = {
  title1: string;
  title2: string;
  cta: string;
  tips: string[];
  disclosure: string;
  total: number;
};

export const Outro: React.FC<OutroProps> = ({title1, title2, cta, tips, disclosure, total}) => {
  const f = useCurrentFrame();
  return (
    <Frame>
      <TopBar page={total} total={total} />
      <div style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
        <Rise at={4}>
          <div style={{fontSize: 72, fontWeight: 900, lineHeight: 1.15}}>{title1}</div>
        </Rise>
        <Rise at={12}>
          <div style={{fontSize: 72, fontWeight: 900, lineHeight: 1.15, color: C.accent}}>{title2}</div>
        </Rise>
        <div style={{marginTop: 48, display: 'flex', flexDirection: 'column', gap: 22}}>
          {tips.map((t, i) => (
            <Rise key={t} at={26 + i * 8} dist={24}>
              <div style={{fontSize: 32, fontWeight: 700, display: 'flex', gap: 14}}>
                <span style={{color: C.accent}}>✓</span>
                {t}
              </div>
            </Rise>
          ))}
        </div>
        <div
          style={{
            marginTop: 70,
            alignSelf: 'flex-start',
            background: C.ink,
            color: '#fff',
            fontSize: 34,
            fontWeight: 800,
            padding: '22px 36px',
            borderRadius: 999,
            opacity: interpolate(f, [56, 68], [0, 1], clamp),
            scale: interpolate(f, [56, 72], [0.8, 1], {...clamp, easing: ease, output: 'perceptual-scale'}) *
              (1 + 0.025 * Math.max(0, Math.sin(((f - 72) / 30) * Math.PI))),
            transformOrigin: 'left center',
          }}
        >
          {cta}
        </div>
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 500,
          color: C.muted,
          lineHeight: 1.5, whiteSpace: "pre-line",
          opacity: interpolate(f, [70, 85], [0, 1], clamp),
        }}
      >
        {disclosure}
      </div>
    </Frame>
  );
};
