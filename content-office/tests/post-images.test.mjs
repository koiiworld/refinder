// 블로그 글 사진 고르기: 링크 카드(다른 글 미리보기) 썸네일·본문 아래 다른 글 사진은 빼기
import { test } from "node:test";
import assert from "node:assert/strict";
const { postImages } = await import("../src/lib/sample-html.ts");

test('링크 카드 썸네일·본문 끝 아래 사진은 이 글 사진이 아님', () => {
  const html = `<div class="se-main-container">
   <div class="se-component se-image"><img src="https://postfiles.pstatic.net/a/1.jpg?type=w80"></div>
   <div class="se-component se-oglink se-l-large_image"><div class="se-module se-module-oglink"><a class="se-oglink-thumbnail"><img src="https://dthumb-phinf.pstatic.net/?src=%22https%3A%2F%2Fblogthumb.pstatic.net%2Fx.jpg%22"></a><div class="se-oglink-info">계량컵 3종 비교</div></div></div>
   <div class="se-component se-image"><img src="https://postfiles.pstatic.net/a/2.jpg?type=w80"></div>
  </div>
  <div class="post_footer_contents"><img src="https://postfiles.pstatic.net/other/9.jpg"></div>`;
  const imgs = postImages(html, new URL("https://blog.naver.com/x/1"));
  assert.deepEqual(imgs, ["https://postfiles.pstatic.net/a/1.jpg?type=w966", "https://postfiles.pstatic.net/a/2.jpg?type=w966"]);
});
