"""로컬 가상 폼 검증. 실제 네이버 선택자/문구 검증으로 간주하지 않음."""
from pathlib import Path
import shutil
import sys
import unittest
from unittest.mock import patch
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import naver

FORM = '''<html><body><p>하루에 100명까지 신청할 수 있습니다</p>
<input id="bothBuddyRadio" type="radio" style="display:none"><label for="bothBuddyRadio">서로이웃</label>
<textarea id="buddyAddMsg"></textarea><button onclick="window.clicked=true;ACTION">확인</button></body></html>'''


class LocalFormTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw = sync_playwright().start()
        try:
            executable = shutil.which("chromium") or shutil.which("chromium-browser")
            if executable:
                cls.browser = cls.pw.chromium.launch(executable_path=executable, headless=True, args=["--no-sandbox"])
            else:
                cls.browser = None
                for channel in ("chrome", "msedge"):
                    try:
                        cls.browser = cls.pw.chromium.launch(channel=channel, headless=True)
                        break
                    except Exception:
                        pass
                if cls.browser is None:
                    raise unittest.SkipTest("로컬 Chrome/Edge/Chromium이 없어 가상 폼 브라우저 테스트 생략")
        except Exception:
            cls.pw.stop()
            raise

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()

    def setUp(self):
        self.page = self.browser.new_page()
        self.page.set_default_timeout(250)
        self.bot = naver.NaverBot(log=lambda _: None)
        self.bot.page = self.page
        self.page.on("dialog", self.bot._on_dialog)
        self.page.wait_for_timeout = lambda _: None
        self.url = patch.object(naver, "BUDDY_FORM_URL", "http://127.0.0.1:8765/BuddyAddForm.naver?blogId={blog_id}")
        self.url.start()

    def tearDown(self):
        self.page.close()
        self.url.stop()

    def fixture(self, action, readonly=False):
        form = FORM.replace("ACTION", action)
        if readonly:
            form = form.replace('<textarea id="buddyAddMsg">', '<textarea id="buddyAddMsg" readonly>')
        self.page.route("http://127.0.0.1:8765/**", lambda route: route.fulfill(content_type="text/html; charset=utf-8", body="<body>처리 결과를 확인해 주세요</body>" if "/done" in route.request.url else form))

    def test_hidden_radio_label_and_explicit_completion(self):
        self.fixture("alert('서로이웃 신청이 완료되었습니다')")
        self.assertEqual(self.bot.apply("fixture", "안녕하세요").status, "success")
        self.assertEqual(self.page.locator("#buddyAddMsg").input_value(), "안녕하세요")
        self.assertTrue(self.page.locator("#bothBuddyRadio").is_checked())

    def test_confirmation_dialog_is_not_completion(self):
        self.fixture("alert('서로이웃 신청하시겠습니까?')")
        self.assertEqual(self.bot.apply("fixture", "안녕하세요").status, "unconfirmed")

    def test_unknown_redirect_is_not_success(self):
        self.fixture("location.href='/done'")
        self.assertEqual(self.bot.apply("fixture", "안녕하세요").status, "unconfirmed")

    def test_message_fill_failure_does_not_submit(self):
        self.fixture("alert('서로이웃 신청이 완료되었습니다')", readonly=True)
        self.assertEqual(self.bot.apply("fixture", "안녕하세요").status, "error")
        self.assertFalse(self.page.evaluate("!!window.clicked"))

    def test_diagnostics_never_fills_or_submits(self):
        self.fixture("alert('서로이웃 신청이 완료되었습니다')")
        report = self.bot.inspect_form("fixture")
        self.assertFalse(report["submitted"])
        self.assertEqual(report["page"], "http://127.0.0.1:8765/BuddyAddForm.naver")
        self.assertTrue(report["fields"])
        self.assertEqual(self.page.locator("#buddyAddMsg").input_value(), "")
        self.assertFalse(self.page.evaluate("!!window.clicked"))


if __name__ == "__main__":
    unittest.main()
