import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {C} from '../theme';
import {clamp, ease, Frame, Rise, SwipeHint, TopBar} from './common';

export type CoverProps = {
  kicker: string;
  line1: string;
  line2: string;
  highlight: string;
  sub: string;
  total: number;
};

export const Cover: React.FC<CoverProps> = ({kicker, line1, line2, highlight, sub, total}) => {
  const f = useCurrentFrame();
  return (
    <Frame bg={C.ink}>
      <TopBar page={1} total={total} dark />
      <div style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', color: '#fff'}}>
        <Rise at={4}>
          <div
            style={{
              display: 'inline-block',
              background: C.accent,
              color: '#fff',
              fontSize: 30,
              fontWeight: 800,
              padding: '10px 22px',
              borderRadius: 999,
              marginBottom: 36,
            }}
          >
            {kicker}
          </div>
        </Rise>
        <Rise at={12}>
          <div style={{fontSize: 80, fontWeight: 900, lineHeight: 1.15}}>{line1}</div>
        </Rise>
        <Rise at={20}>
          <div style={{fontSize: 80, fontWeight: 900, lineHeight: 1.15}}>{line2}</div>
        </Rise>
        <div style={{position: 'relative', alignSelf: 'flex-start', marginTop: 10}}>
          <div
            style={{
              position: 'absolute',
              left: -8,
              right: -8,
              bottom: 10,
              height: 34,
              background: C.accent,
              transformOrigin: 'left center',
              scale: `${interpolate(f, [34, 52], [0, 1], {...clamp, easing: ease})} 1`,
            }}
          />
          <Rise at={28}>
            <div style={{position: 'relative', fontSize: 108, fontWeight: 900, lineHeight: 1.1}}>{highlight}</div>
          </Rise>
        </div>
        <Rise at={48}>
          <div style={{fontSize: 32, fontWeight: 500, marginTop: 44, opacity: 0.75, lineHeight: 1.45, whiteSpace: "pre-line"}}>{sub}</div>
        </Rise>
      </div>
      <SwipeHint at={60} dark />
    </Frame>
  );
};
