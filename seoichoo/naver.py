"""네이버 블로그 서로이웃(서이추) 자동화 엔진.

Playwright 로 실제 크롬 브라우저를 띄워 사용자가 직접 로그인하고,
그 브라우저 세션으로 대상 검색과 서로이웃 신청을 진행한다.
비밀번호는 프로그램이 다루지 않는다 (사용자가 브라우저에 직접 입력).
"""

from __future__ import annotations

import html
import json
import random
import re
import sys
import time
import urllib.parse
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from playwright.sync_api import BrowserContext, Page, sync_playwright

# exe 로 실행하면 exe 가 있는 폴더에, 아니면 이 파일이 있는 폴더에 데이터를 저장한다
if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys.executable).resolve().parent
else:
    BASE_DIR = Path(__file__).resolve().parent
PROFILE_DIR = BASE_DIR / "browser_profile"
SELECTORS_FILE = BASE_DIR / "selectors.json"

LOGIN_URL = "https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fm.blog.naver.com%2F"
LOGOUT_URL = "https://nid.naver.com/nidlogin.logout?returl=https%3A%2F%2Fwww.naver.com"
MY_BLOG_URL = "https://blog.naver.com/MyBlog.naver"
SEARCH_API = "https://section.blog.naver.com/ajax/SearchList.naver"
SEARCH_REFERER = "https://section.blog.naver.com/Search/Post.naver"
BUDDY_FORM_URL = "https://m.blog.naver.com/BuddyAddForm.naver?blogId={blog_id}"

# 네이버 화면 구조가 바뀌면 selectors.json 을 만들어 아래 값을 덮어쓸 수 있다.
DEFAULT_SELECTORS = {
    # 서로이웃 라디오/라벨 후보 (앞에서부터 순서대로 시도)
    "both_buddy": [
        "input#bothBuddyRadio",
        "label[for='bothBuddyRadio']",
        "label:has-text('서로이웃')",
        "text=서로이웃을 신청합니다",
    ],
    "message": [
        "textarea#buddyAddMsg",
        "textarea[name='message']",
        "textarea",
    ],
    "submit": [
        "button:has-text('확인')",
        "a:has-text('확인')",
        "input[type='submit']",
        "button:has-text('신청')",
    ],
}

# 결과 판별용 문구
TEXT_ALREADY = ("이미 이웃", "이미 서로이웃", "이미 신청", "신청중", "신청 중")
TEXT_LIMIT = ("하루에", "초과", "더 이상 신청", "100명")
TEXT_REFUSED = ("서로이웃 신청을 받지", "받지 않", "신청할 수 없", "차단")
TEXT_GROUP_FULL = ("그룹", "가득", "최대")


def load_selectors() -> dict:
    sel = {k: list(v) for k, v in DEFAULT_SELECTORS.items()}
    if SELECTORS_FILE.exists():
        try:
            user = json.loads(SELECTORS_FILE.read_text(encoding="utf-8"))
            for k, v in user.items():
                if isinstance(v, list):
                    sel[k] = v + [s for s in sel.get(k, []) if s not in v]
        except (OSError, ValueError):
            pass
    return sel


@dataclass
class Candidate:
    blog_id: str
    nick: str = ""
    blog_name: str = ""
    title: str = ""
    keyword: str = ""
    status: str = "대기"
    selected: bool = True


@dataclass
class ApplyResult:
    status: str  # success / already / refused / limit / group_full / unconfirmed / error
    detail: str = ""


def _strip_tags(s: str | None) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


class NaverBot:
    def __init__(self, log: Callable[[str], None] = print):
        self.log = log
        self._pw = None
        self.ctx: BrowserContext | None = None
        self.page: Page | None = None
        self.my_blog_id: str | None = None
        self.sel = load_selectors()
        self._last_dialog = ""

    # ------------------------------------------------------------------ 브라우저
    def open_browser(self) -> None:
        if self.ctx is not None:
            try:
                self.page.bring_to_front()
                return
            except Exception:  # 브라우저 창이 사용자에 의해 닫힌 경우
                self.close()
        self._pw = sync_playwright().start()
        PROFILE_DIR.mkdir(exist_ok=True)
        kwargs = dict(
            user_data_dir=str(PROFILE_DIR),
            headless=False,
            viewport={"width": 1100, "height": 850},
            locale="ko-KR",
        )
        # PC 에 설치된 크롬 → 엣지(윈도우 기본 탑재) → Playwright 크로미움 순서로 시도
        last_err = None
        for channel in ("chrome", "msedge", None):
            try:
                opts = dict(kwargs, channel=channel) if channel else kwargs
                self.ctx = self._pw.chromium.launch_persistent_context(**opts)
                break
            except Exception as e:  # noqa: BLE001
                last_err = e
        if self.ctx is None:
            self._pw.stop()
            self._pw = None
            raise RuntimeError(f"브라우저를 열 수 없습니다. 크롬 또는 엣지를 설치하세요. ({last_err})")
        self.page = self.ctx.pages[0] if self.ctx.pages else self.ctx.new_page()
        self.page.on("dialog", self._on_dialog)
        self.page.goto(LOGIN_URL)
        self.log("브라우저를 열었습니다. 네이버에 로그인한 뒤 [로그인 확인]을 누르세요.")

    def _on_dialog(self, dialog) -> None:
        self._last_dialog = dialog.message or ""
        try:
            dialog.accept()
        except Exception:
            pass

    def _require_page(self) -> Page:
        if self.page is None:
            raise RuntimeError("먼저 [브라우저 열기]를 눌러주세요.")
        return self.page

    def close(self) -> None:
        for obj, meth in ((self.ctx, "close"), (self._pw, "stop")):
            try:
                if obj is not None:
                    getattr(obj, meth)()
            except Exception:
                pass
        self.ctx = self.page = self._pw = None

    # ------------------------------------------------------------------ 로그인
    def check_login(self) -> str | None:
        page = self._require_page()
        cookies = {c["name"] for c in self.ctx.cookies("https://naver.com")}
        if "NID_AUT" not in cookies:
            self.my_blog_id = None
            return None
        page.goto(MY_BLOG_URL, wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        url = page.url
        if "nidlogin" in url:
            self.my_blog_id = None
            return None
        parsed = urllib.parse.urlparse(url)
        bid = urllib.parse.parse_qs(parsed.query).get("blogId", [None])[0]
        if not bid and parsed.hostname in ("blog.naver.com", "m.blog.naver.com"):
            bid = parsed.path.strip("/").split("/")[0]
        reserved = {"myblog", "postlist", "postview", "buddyaddform", "nidlogin"}
        self.my_blog_id = bid if bid and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", bid) and bid.lower() not in reserved else None
        if not self.my_blog_id:
            self.log("로그인 쿠키는 있지만 내 블로그 ID를 확인하지 못했습니다. 브라우저의 내 블로그 주소를 확인해 주세요.")
        return self.my_blog_id

    def logout(self) -> None:
        page = self._require_page()
        try:
            page.goto(LOGOUT_URL, wait_until="domcontentloaded")
        finally:
            self.ctx.clear_cookies()
            self.my_blog_id = None
        self.log("네이버에서 로그아웃했습니다.")

    # ------------------------------------------------------------------ 대상 찾기
    def search(
        self,
        keywords: list[str],
        pages_per_keyword: int,
        exclude: set[str],
        should_stop: Callable[[], bool] = lambda: False,
        on_found: Callable[[Candidate], None] | None = None,
    ) -> list[Candidate]:
        page = self._require_page()
        found: dict[str, Candidate] = {}
        exclude = {e.lower() for e in exclude}
        if self.my_blog_id:
            exclude.add(self.my_blog_id.lower())

        for kw in keywords:
            new_for_kw = 0
            for p in range(1, pages_per_keyword + 1):
                if should_stop():
                    return list(found.values())
                params = {
                    "countPerPage": 7,
                    "currentPage": p,
                    "endDate": "",
                    "keyword": kw,
                    "orderBy": "sim",
                    "startDate": "",
                    "type": "post",
                }
                url = SEARCH_API + "?" + urllib.parse.urlencode(params)
                try:
                    resp = page.request.get(url, headers={"Referer": SEARCH_REFERER})
                    text = resp.text()
                    data = json.loads(text[text.index("{"):])
                    items = data.get("result", {}).get("searchList") or []
                except Exception as e:
                    self.log(f"  [{kw}] {p}페이지 검색 실패: {e}")
                    break
                if not items:
                    break
                for it in items:
                    bid = (it.get("domainIdOrBlogId") or it.get("blogId") or "").strip()
                    if not bid or bid.lower() in exclude or bid in found:
                        continue
                    c = Candidate(
                        blog_id=bid,
                        nick=_strip_tags(it.get("nickName")),
                        blog_name=_strip_tags(it.get("blogName")),
                        title=_strip_tags(it.get("title")),
                        keyword=kw,
                    )
                    found[bid] = c
                    new_for_kw += 1
                    if on_found:
                        on_found(c)
                time.sleep(random.uniform(0.6, 1.4))
            self.log(f"  [{kw}] 새 후보 {new_for_kw}명")
        return list(found.values())

    # ------------------------------------------------------------------ 서이추 신청
    def _first(self, key: str, timeout: int = 2500):
        page = self.page
        for s in self.sel[key]:
            loc = page.locator(s).first
            try:
                loc.wait_for(state="visible", timeout=timeout)
                return loc
            except Exception:
                timeout = 500  # 첫 후보 이후로는 짧게
                continue
        return None

    def _classify(self, text: str) -> ApplyResult | None:
        if any(t in text for t in TEXT_LIMIT) and "신청" in text and re.search(r"초과|도달|더 이상|할 수 없|불가", text):
            return ApplyResult("limit", text)
        if any(t in text for t in TEXT_ALREADY):
            return ApplyResult("already", text)
        if re.search(r"그룹.{0,40}(?:가득|최대.{0,15}(?:초과|도달)|인원.{0,15}(?:초과|도달))", text):
            return ApplyResult("group_full", text)
        if any(t in text for t in TEXT_REFUSED):
            return ApplyResult("refused", text)
        return None

    def apply(self, blog_id: str, message: str) -> ApplyResult:
        page = self._require_page()
        self._last_dialog = ""
        try:
            page.goto(BUDDY_FORM_URL.format(blog_id=blog_id), wait_until="domcontentloaded")
            page.wait_for_timeout(1200)
        except Exception as e:
            return ApplyResult("error", f"페이지 열기 실패: {e}")

        if "nidlogin" in page.url:
            return ApplyResult("error", "로그인이 풀렸습니다. 다시 로그인하세요.")
        if self._last_dialog:
            return self._classify(self._last_dialog) or ApplyResult("error", self._last_dialog)

        radio = self._first("both_buddy")
        if radio is None:
            body = page.inner_text("body")[:500]
            return self._classify(body) or ApplyResult("error", "서로이웃 선택 항목을 찾지 못했습니다.")

        # 서로이웃 신청을 받지 않는 블로그면 라디오가 비활성화되어 있다
        try:
            target = page.locator("input#bothBuddyRadio").first
            if target.count() and target.is_disabled():
                return ApplyResult("refused", "서로이웃 신청을 받지 않는 블로그")
        except Exception:
            pass

        try:
            radio.click(timeout=3000)
        except Exception:
            try:
                radio.check(force=True, timeout=2000)
            except Exception as e:
                return ApplyResult("refused", f"서로이웃 선택 불가: {e}")
        page.wait_for_timeout(400)

        msg_box = self._first("message", timeout=1500)
        if message:
            if msg_box is None:
                return ApplyResult("error", "신청문구 입력란을 찾지 못해 전송하지 않았습니다.")
            try:
                msg_box.fill(message)
            except Exception as e:
                return ApplyResult("error", f"신청문구 입력 실패로 전송하지 않았습니다: {e}")

        btn = self._first("submit", timeout=1500)
        if btn is None:
            return ApplyResult("error", "확인 버튼을 찾지 못했습니다.")
        try:
            btn.click(timeout=3000)
        except Exception as e:
            return ApplyResult("unconfirmed", f"전송 여부를 확인하지 못했습니다. 네이버에서 직접 확인하세요: {e}")

        page.wait_for_timeout(2000)
        try:
            body = page.inner_text("body")[:1500]
        except Exception:
            body = ""
        text = self._last_dialog + "\n" + body
        classified = self._classify(text)
        if classified:
            return classified
        if re.search(r"(?:서로이웃|이웃)\s*신청(?:이|을)?\s*(?:완료되었습니다|완료됐습니다|완료했습니다|성공했습니다|정상적으로 처리되었습니다)|(?:서로이웃|이웃)(?:을|이)?\s*(?:신청했습니다|신청되었습니다)", text):
            return ApplyResult("success", "서로이웃 신청 완료 문구를 확인했습니다.")
        return ApplyResult("unconfirmed", "확실한 완료 문구를 확인하지 못했습니다. 네이버에서 신청 상태를 직접 확인하세요.")

    def inspect_form(self, blog_id: str) -> dict:
        """신청 폼을 열어 선택자 정보만 진단. 클릭/문구 입력/신청 전송 없음."""
        page = self._require_page()
        self._last_dialog = ""
        page.goto(BUDDY_FORM_URL.format(blog_id=blog_id), wait_until="domcontentloaded")
        page.wait_for_timeout(1000)
        parsed = urllib.parse.urlparse(page.url)
        fields = page.locator("input,textarea,button,select,label").evaluate_all("""nodes => nodes.map(e => ({tag:e.tagName.toLowerCase(),id:e.id,name:e.getAttribute('name')||'',type:e.getAttribute('type')||'',disabled:!!e.disabled,visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)}))""")
        return {"page": parsed.scheme+"://"+parsed.netloc+parsed.path, "login_page": "nidlogin" in page.url,
                "selectors": {key:[{"selector":selector,"count":page.locator(selector).count()} for selector in selectors] for key,selectors in self.sel.items()},
                "fields":fields,"submitted":False,"note":"폼 진단만 수행. 비밀번호·쿠키·입력값·본문은 포함하지 않음. 실계정 신청 결과 검증과는 별개."}
