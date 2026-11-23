# Remotion video

<p align="center">
  <a href="https://github.com/remotion-dev/logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-dark.apng">
      <img alt="Animated Remotion Logo" src="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-light.gif">
    </picture>
  </a>
</p>

Welcome to your Remotion project!

## Commands

**Install Dependencies**

```console
npm i --loglevel=error
```

**Start Preview**

```console
npm run dev
```

**Render video**

```console
npx remotion render
```

**Upgrade Remotion**

```console
npx remotion upgrade
```

## Docs

Get started with Remotion by reading the [fundamentals page](https://www.remotion.dev/docs/the-fundamentals).

## Help

We provide help on our [Discord server](https://discord.gg/6VzzNDwUwV).

## Issues

Found an issue with Remotion? [File an issue here](https://github.com/remotion-dev/remotion/issues/new).

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).

## 사진 나열형 캐러셀 (오늘의 아이템)

1. 사진/영상을 `public/<폴더>/` 에 넣습니다 (세로 4:5 권장, mp4도 가능).
2. `posts/demo.json` 을 복사해 `posts/<이름>.json` 으로 만들고 브랜드·상품명·가격·한줄평만 바꿉니다.
3. `node render-post.mjs posts/<이름>.json` → `out/<이름>/01.mp4 ...` 순서대로 인스타에 올립니다.

슬라이드 종류: `cover`(표지), `item`(제품), `outro`(마무리 + 파트너스 고지).
