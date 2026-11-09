from pathlib import Path
import hashlib
import importlib.util
import json
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import naver
from naver import NaverBot
from seoichoo import History, Worker, DEFAULT_BATCH, DEFAULT_DMIN, DEFAULT_DMAX, NAVER_DAILY_LIMIT


class CoreTests(unittest.TestCase):
    def test_requested_defaults(self):
        self.assertEqual((DEFAULT_BATCH, DEFAULT_DMIN, DEFAULT_DMAX, NAVER_DAILY_LIMIT), (20, 30, 120, 100))

    def test_unknown_result_reserves_daily_count_and_prevents_duplicate(self):
        with tempfile.TemporaryDirectory() as directory:
            history = History(Path(directory)/"history.json")
            history.record("one", "success")
            history.record("two", "unconfirmed")
            history.record("three", "error")
            self.assertEqual(history.today_count(), 2)
            self.assertEqual(history.done_ids(), {"one", "two"})
            self.assertEqual(History(history.path).today_count(), 2)

    def test_classifier_does_not_call_normal_limit_guidance_a_failure(self):
        bot = NaverBot(log=lambda _: None)
        self.assertIsNone(bot._classify("하루에 100명까지 신청할 수 있습니다"))
        self.assertIsNone(bot._classify("이웃 그룹 최대 인원 안내: 그룹을 선택해 주세요"))
        self.assertEqual(bot._classify("하루에 100명 초과로 신청할 수 없습니다").status, "limit")
        self.assertEqual(bot._classify("이웃 그룹 인원이 가득 차서 신청할 수 없습니다").status, "group_full")
        self.assertEqual(bot._classify("이미 신청 중입니다").status, "already")

    def test_worker_serializes_jobs_on_one_non_gui_thread(self):
        worker = Worker(lambda _: None)
        done = threading.Event()
        ids = []
        worker.start()
        for _ in range(3):
            worker.submit(lambda bot: ids.append(threading.get_ident()))
        worker.submit(lambda bot: done.set())
        self.assertTrue(done.wait(5))
        worker.submit(None)
        worker.join(timeout=5)
        self.assertFalse(worker.is_alive())
        self.assertEqual(len(set(ids)), 1)
        self.assertNotEqual(ids[0], threading.get_ident())

    def test_release_zip_contains_only_public_build_files(self):
        spec = importlib.util.spec_from_file_location("package_release", ROOT/"tools"/"package_release.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            exe = Path(directory)/"seoichoo.exe"
            exe.write_bytes(b"fake-exe-for-packaging-test")
            archive = module.package(exe, Path(directory)/"test.zip")
            with zipfile.ZipFile(archive) as zip_file:
                self.assertEqual(set(zip_file.namelist()), {"seoichoo.exe", "README.md", "VALIDATION.md", "SHA256SUMS.txt"})
                sums = zip_file.read("SHA256SUMS.txt").decode()
                self.assertIn(hashlib.sha256(exe.read_bytes()).hexdigest(), sums)
            self.assertIn(hashlib.sha256(archive.read_bytes()).hexdigest(), archive.with_suffix(".zip.sha256").read_text())


if __name__ == "__main__":
    unittest.main()
