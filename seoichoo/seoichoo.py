"""서이추 자동 프로그램 (GUI).

사용 순서
 1. [브라우저 열기] → 열린 크롬 창에서 네이버 로그인
 2. [로그인 확인] → 내 블로그 아이디 표시 확인
 3. 검색어 입력(줄바꿈/쉼표 구분) + 공용 신청문구 작성 → [대상 찾기]
 4. [후보 전체 선택] → [서이추 자동 신청]
 5. 작업이 끝나면 [네이버 로그아웃]
"""

from __future__ import annotations

import datetime as dt
import json
import queue
import random
import threading
import time
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk

from naver import BASE_DIR, Candidate, NaverBot

HISTORY_FILE = BASE_DIR / "history.json"
SETTINGS_FILE = BASE_DIR / "settings.json"
NAVER_DAILY_LIMIT = 100  # 네이버 정책상 하루 서이추 신청 최대 인원
DEFAULT_BATCH = 20  # 한 번 [서이추 자동 신청] 할 때 최대 신청 인원
DEFAULT_DMIN, DEFAULT_DMAX = 30, 120  # 신청 간격(초): 30초 ~ 2분

STATUS_KO = {
    "success": "신청 완료",
    "already": "이미 이웃/신청됨",
    "refused": "서이추 불가",
    "limit": "일일 한도 초과",
    "group_full": "이웃 그룹 가득참",
    "error": "오류",
    "unconfirmed": "직접 확인 필요",
}

DEFAULT_MESSAGE = "안녕하세요 {닉네임}님! 글 잘 보고 갑니다. 서로이웃 맺고 자주 소통해요 :)"


# ---------------------------------------------------------------------- 기록
class History:
    def __init__(self, path: Path):
        self.path = path
        self.data = {"applied": {}, "daily": {}}
        if path.exists():
            try:
                self.data.update(json.loads(path.read_text(encoding="utf-8")))
            except (OSError, ValueError):
                pass

    def save(self) -> None:
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(self.path)

    @staticmethod
    def today() -> str:
        return dt.date.today().isoformat()

    def today_count(self) -> int:
        return int(self.data["daily"].get(self.today(), 0))

    def done_ids(self) -> set[str]:
        """다시 시도할 필요가 없는 블로그 (완료/이미 이웃/불가)."""
        return {
            k for k, v in self.data["applied"].items()
            if v.get("status") in ("success", "already", "refused", "unconfirmed")
        }

    def record(self, blog_id: str, status: str, detail: str = "") -> None:
        self.data["applied"][blog_id] = {
            "status": status,
            "detail": detail[:200],
            "at": dt.datetime.now().isoformat(timespec="seconds"),
        }
        if status in ("success", "unconfirmed"):
            d = self.today()
            self.data["daily"][d] = int(self.data["daily"].get(d, 0)) + 1
        self.save()


# ---------------------------------------------------------------------- 작업 스레드
class Worker(threading.Thread):
    """Playwright 는 만든 스레드에서만 써야 하므로 전용 스레드에서 모든 작업을 수행한다."""

    def __init__(self, log):
        super().__init__(daemon=True)
        self.jobs: queue.Queue = queue.Queue()
        self.log = log
        self.bot: NaverBot | None = None
        self.busy = threading.Event()

    def submit(self, fn, *args) -> None:
        self.jobs.put((fn, args))

    def run(self) -> None:
        self.bot = NaverBot(log=self.log)
        while True:
            fn, args = self.jobs.get()
            if fn is None:
                self.bot.close()
                return
            self.busy.set()
            try:
                fn(self.bot, *args)
            except Exception as e:  # noqa: BLE001
                self.log(f"[오류] {e}")
            finally:
                self.busy.clear()


# ---------------------------------------------------------------------- GUI
class App:
    def __init__(self, root: tk.Tk):
        self.root = root
        root.title("서이추 자동 프로그램")
        root.geometry("980x780")
        root.minsize(820, 640)

        self.ui_q: queue.Queue = queue.Queue()
        self.history = History(HISTORY_FILE)
        self.candidates: dict[str, Candidate] = {}
        self.stop_flag = threading.Event()
        self.worker = Worker(self.log)
        self.worker.start()

        self._build()
        self._load_settings()
        self._refresh_counts()
        root.protocol("WM_DELETE_WINDOW", self.on_close)
        root.after(100, self._drain_ui_queue)

    # -------------------------------------------------------------- 화면 구성
    def _build(self) -> None:
        pad = {"padx": 8, "pady": 4}
        top = ttk.Frame(self.root)
        top.pack(fill="both", expand=True, padx=10, pady=8)

        # 1. 로그인
        f1 = ttk.LabelFrame(top, text="1. 로그인")
        f1.pack(fill="x", **pad)
        ttk.Button(f1, text="브라우저 열기", command=self.on_open).pack(side="left", **pad)
        ttk.Button(f1, text="로그인 확인", command=self.on_check).pack(side="left", **pad)
        self.login_var = tk.StringVar(value="로그인 안 됨")
        ttk.Label(f1, textvariable=self.login_var, foreground="#2563eb").pack(side="left", **pad)
        ttk.Button(f1, text="네이버 로그아웃", command=self.on_logout).pack(side="right", **pad)

        # 2. 대상 찾기
        f2 = ttk.LabelFrame(top, text="2. 서이추 대상 찾기")
        f2.pack(fill="x", **pad)
        f2.columnconfigure(1, weight=1)
        f2.columnconfigure(3, weight=1)
        ttk.Label(f2, text="검색어\n(줄바꿈/쉼표 구분,\n10개 정도 추천)").grid(row=0, column=0, sticky="nw", **pad)
        self.kw_text = tk.Text(f2, height=5, width=30)
        self.kw_text.grid(row=0, column=1, sticky="nsew", **pad)
        ttk.Label(f2, text="공용 신청문구\n({닉네임} 사용 가능)").grid(row=0, column=2, sticky="nw", **pad)
        self.msg_text = tk.Text(f2, height=5, width=40, wrap="word")
        self.msg_text.grid(row=0, column=3, sticky="nsew", **pad)

        opt = ttk.Frame(f2)
        opt.grid(row=1, column=0, columnspan=4, sticky="we", **pad)
        ttk.Label(opt, text="검색어당 페이지 수(1페이지=7개 글)").pack(side="left")
        self.pages_var = tk.IntVar(value=5)
        ttk.Spinbox(opt, from_=1, to=30, width=5, textvariable=self.pages_var).pack(side="left", padx=6)
        self.skip_done_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(opt, text="이전에 신청한 블로그 제외", variable=self.skip_done_var).pack(side="left", padx=12)
        ttk.Button(opt, text="대상 찾기", command=self.on_search).pack(side="right")

        # 3. 후보 목록
        f3 = ttk.LabelFrame(top, text="3. 후보 목록 (행을 클릭하면 선택/해제)")
        f3.pack(fill="both", expand=True, **pad)
        bar = ttk.Frame(f3)
        bar.pack(fill="x")
        ttk.Button(bar, text="후보 전체 선택", command=lambda: self.select_all(True)).pack(side="left", **pad)
        ttk.Button(bar, text="선택 전체 해제", command=lambda: self.select_all(False)).pack(side="left", **pad)
        tools = ttk.Frame(f3)
        tools.pack(fill="x")
        ttk.Button(tools, text="신청 폼 진단(전송 안 함)", command=self.on_inspect).pack(side="left", **pad)
        ttk.Button(tools, text="목록 비우기", command=self.clear_candidates).pack(side="left", **pad)
        self.cand_var = tk.StringVar(value="후보 0명")
        ttk.Label(bar, textvariable=self.cand_var).pack(side="right", **pad)

        cols = ("sel", "blog_id", "nick", "blog_name", "keyword", "status")
        heads = ("선택", "블로그 ID", "닉네임", "블로그명", "검색어", "상태")
        widths = (50, 140, 130, 220, 110, 160)
        tf = ttk.Frame(f3)
        tf.pack(fill="both", expand=True)
        self.tree = ttk.Treeview(tf, columns=cols, show="headings", height=10)
        for c, h, w in zip(cols, heads, widths):
            self.tree.heading(c, text=h)
            self.tree.column(c, width=w, anchor="center" if c in ("sel", "status") else "w")
        sb = ttk.Scrollbar(tf, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=sb.set)
        self.tree.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")
        self.tree.bind("<ButtonRelease-1>", self.on_tree_click)

        # 4. 자동 신청
        f4 = ttk.LabelFrame(top, text="4. 서이추 자동 신청")
        f4.pack(fill="x", **pad)
        ttk.Label(f4, text="신청 간격(초)").pack(side="left", **pad)
        self.dmin_var = tk.IntVar(value=DEFAULT_DMIN)
        self.dmax_var = tk.IntVar(value=DEFAULT_DMAX)
        ttk.Spinbox(f4, from_=3, to=300, width=5, textvariable=self.dmin_var).pack(side="left")
        ttk.Label(f4, text="~").pack(side="left")
        ttk.Spinbox(f4, from_=3, to=600, width=5, textvariable=self.dmax_var).pack(side="left")
        ttk.Label(f4, text="  1회 최대").pack(side="left", **pad)
        self.batch_var = tk.IntVar(value=DEFAULT_BATCH)
        ttk.Spinbox(f4, from_=1, to=NAVER_DAILY_LIMIT, width=5, textvariable=self.batch_var).pack(side="left")
        ttk.Label(f4, text="  하루 최대").pack(side="left", **pad)
        self.limit_var = tk.IntVar(value=NAVER_DAILY_LIMIT)
        ttk.Spinbox(f4, from_=1, to=NAVER_DAILY_LIMIT, width=5, textvariable=self.limit_var).pack(side="left")
        self.today_var = tk.StringVar()
        ttk.Label(f4, textvariable=self.today_var, foreground="#b45309").pack(side="left", padx=12)
        ttk.Button(f4, text="중지", command=self.on_stop).pack(side="right", **pad)
        ttk.Button(f4, text="서이추 자동 신청", command=self.on_apply).pack(side="right", **pad)

        # 로그
        f5 = ttk.LabelFrame(top, text="로그")
        f5.pack(fill="both", **pad)
        self.log_text = tk.Text(f5, height=8, state="disabled", wrap="word")
        self.log_text.pack(fill="both", expand=True)

    # -------------------------------------------------------------- 설정 저장/불러오기
    def _load_settings(self) -> None:
        s = {}
        if SETTINGS_FILE.exists():
            try:
                s = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                s = {}
        self.kw_text.insert("1.0", s.get("keywords", ""))
        self.msg_text.insert("1.0", s.get("message", DEFAULT_MESSAGE))
        for var, key in ((self.pages_var, "pages"), (self.dmin_var, "dmin"),
                         (self.dmax_var, "dmax"), (self.limit_var, "limit"),
                         (self.batch_var, "batch")):
            if key in s:
                var.set(s[key])

    def _save_settings(self) -> None:
        s = {
            "keywords": self.kw_text.get("1.0", "end").strip(),
            "message": self.msg_text.get("1.0", "end").strip(),
            "pages": self._int(self.pages_var, 5),
            "dmin": self._int(self.dmin_var, DEFAULT_DMIN),
            "dmax": self._int(self.dmax_var, DEFAULT_DMAX),
            "batch": self._int(self.batch_var, DEFAULT_BATCH),
            "limit": self._int(self.limit_var, NAVER_DAILY_LIMIT),
        }
        try:
            SETTINGS_FILE.write_text(json.dumps(s, ensure_ascii=False, indent=1), encoding="utf-8")
        except OSError:
            pass

    @staticmethod
    def _int(var: tk.Variable, default: int) -> int:
        try:
            return int(var.get())
        except (tk.TclError, ValueError):
            return default

    # -------------------------------------------------------------- 스레드 → UI
    def ui(self, fn, *args) -> None:
        self.ui_q.put((fn, args))

    def _drain_ui_queue(self) -> None:
        try:
            while True:
                fn, args = self.ui_q.get_nowait()
                fn(*args)
        except queue.Empty:
            pass
        self.root.after(100, self._drain_ui_queue)

    def log(self, msg: str) -> None:
        stamp = time.strftime("%H:%M:%S")
        self.ui(self._append_log, f"[{stamp}] {msg}\n")

    def _append_log(self, line: str) -> None:
        self.log_text.configure(state="normal")
        self.log_text.insert("end", line)
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def _refresh_counts(self) -> None:
        n = len(self.candidates)
        sel = sum(1 for c in self.candidates.values() if c.selected)
        self.cand_var.set(f"후보 {n}명 / 선택 {sel}명")
        self.today_var.set(f"오늘 신청: {self.history.today_count()}명")

    def _busy_guard(self) -> bool:
        if self.worker.busy.is_set():
            messagebox.showinfo("작업 중", "다른 작업이 진행 중입니다. 끝나거나 [중지] 후 다시 시도하세요.")
            return True
        return False

    # -------------------------------------------------------------- 1. 로그인
    def on_open(self) -> None:
        if self._busy_guard():
            return
        self.worker.submit(lambda bot: bot.open_browser())

    def on_check(self) -> None:
        if self._busy_guard():
            return

        def job(bot: NaverBot):
            bid = bot.check_login()
            if bid:
                self.ui(self.login_var.set, f"로그인됨 · 내 블로그: {bid}")
                self.log(f"로그인 확인 완료 (내 블로그: https://blog.naver.com/{bid})")
            else:
                self.ui(self.login_var.set, "로그인/내 블로그 확인 필요")
                self.log("로그인 또는 내 블로그 주소를 확인하지 못했습니다. 브라우저에서 현재 상태를 확인해 주세요. 이미 로그인되어 있다면 반복 로그인하지 마세요.")

        self.worker.submit(job)

    def on_logout(self) -> None:
        self.stop_flag.set()

        def job(bot: NaverBot):
            bot.logout()
            self.ui(self.login_var.set, "로그아웃됨")

        self.worker.submit(job)

    # -------------------------------------------------------------- 2. 대상 찾기
    def on_search(self) -> None:
        if self._busy_guard():
            return
        raw = self.kw_text.get("1.0", "end").replace(",", "\n")
        keywords = [k.strip() for k in raw.splitlines() if k.strip()]
        if not keywords:
            messagebox.showwarning("검색어", "검색어를 하나 이상 입력하세요.")
            return
        self._save_settings()
        pages = max(1, self._int(self.pages_var, 5))
        exclude = set(self.candidates)
        if self.skip_done_var.get():
            exclude |= self.history.done_ids()
        self.stop_flag.clear()

        def job(bot: NaverBot):
            if bot.page is None:
                self.log("먼저 [브라우저 열기] 후 로그인하세요.")
                return
            self.log(f"대상 찾기 시작: 검색어 {len(keywords)}개 × {pages}페이지")
            res = bot.search(keywords, pages, exclude, self.stop_flag.is_set,
                             on_found=lambda c: self.ui(self.add_candidate, c))
            self.log(f"대상 찾기 완료: 새 후보 {len(res)}명")

        self.worker.submit(job)

    def add_candidate(self, c: Candidate) -> None:
        if c.blog_id in self.candidates:
            return
        self.candidates[c.blog_id] = c
        self.tree.insert("", "end", iid=c.blog_id, values=self._row(c))
        self._refresh_counts()

    @staticmethod
    def _row(c: Candidate):
        return ("☑" if c.selected else "☐", c.blog_id, c.nick, c.blog_name, c.keyword, c.status)

    def _update_row(self, c: Candidate) -> None:
        if self.tree.exists(c.blog_id):
            self.tree.item(c.blog_id, values=self._row(c))
            self.tree.see(c.blog_id)
        self._refresh_counts()

    def on_tree_click(self, event) -> None:
        iid = self.tree.identify_row(event.y)
        if iid and iid in self.candidates and self.tree.identify_region(event.x, event.y) == "cell":
            c = self.candidates[iid]
            c.selected = not c.selected
            self._update_row(c)

    def select_all(self, value: bool) -> None:
        for c in self.candidates.values():
            c.selected = value and c.status == "대기"
            self.tree.item(c.blog_id, values=self._row(c))
        self._refresh_counts()

    def clear_candidates(self) -> None:
        if self._busy_guard():
            return
        self.candidates.clear()
        self.tree.delete(*self.tree.get_children())
        self._refresh_counts()

    # -------------------------------------------------------------- 3. 자동 신청
    def on_inspect(self) -> None:
        if self._busy_guard():
            return
        target = next((c for c in self.candidates.values() if c.selected), None)
        if not target:
            messagebox.showinfo("신청 폼 진단", "진단할 후보를 한 명 선택해 주세요. 신청은 전송하지 않습니다.")
            return
        def job(bot):
            report = bot.inspect_form(target.blog_id)
            path = BASE_DIR / "diagnostics.json"
            path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            self.log("신청 폼 진단을 diagnostics.json에 저장했습니다. 신청은 전송하지 않았습니다.")
        self.worker.submit(job)

    def on_apply(self) -> None:
        if self._busy_guard():
            return
        targets = [c for c in self.candidates.values() if c.selected and c.status == "대기"]
        if not targets:
            messagebox.showinfo("서이추", "선택된 후보가 없습니다. [후보 전체 선택]을 눌러주세요.")
            return
        message = self.msg_text.get("1.0", "end").strip()
        if not message:
            messagebox.showwarning("신청문구", "공용 신청문구를 입력하세요.")
            return
        limit = min(NAVER_DAILY_LIMIT, max(1, self._int(self.limit_var, NAVER_DAILY_LIMIT)))
        remain = limit - self.history.today_count()
        if remain <= 0:
            messagebox.showinfo("일일 한도", f"오늘은 이미 {self.history.today_count()}명 신청했습니다. 내일 다시 시도하세요.")
            return
        dmin = max(3, self._int(self.dmin_var, DEFAULT_DMIN))
        dmax = max(dmin, self._int(self.dmax_var, DEFAULT_DMAX))
        batch = max(1, self._int(self.batch_var, DEFAULT_BATCH))
        planned = min(remain, batch, len(targets))
        self._save_settings()
        if not messagebox.askyesno(
            "서이추 자동 신청",
            f"선택 {len(targets)}명 중 최대 {planned}명에게 서이추를 신청합니다.\n"
            f"(1회 최대 {batch}명, 오늘 남은 한도 {remain}명)\n"
            f"신청 간격: {dmin}~{dmax}초 (예상 소요 약 {planned * (dmin + dmax) // 120}분)\n진행할까요?",
        ):
            return
        self.stop_flag.clear()

        def job(bot: NaverBot):
            if not bot.my_blog_id:
                if not (bot.page and bot.check_login()):
                    self.log("로그인이 확인되지 않아 신청을 시작할 수 없습니다.")
                    return
            done = 0
            for i, c in enumerate(targets, 1):
                if self.stop_flag.is_set():
                    self.log("사용자가 중지했습니다.")
                    break
                if done >= batch:
                    self.log(f"이번 회차 최대 인원({batch}명)을 채워 중지합니다. 남은 후보는 다음에 다시 신청하세요.")
                    break
                if self.history.today_count() >= limit:
                    self.log(f"오늘 신청 한도({limit}명)에 도달해 중지합니다.")
                    break
                msg = message.replace("{닉네임}", c.nick or c.blog_id)
                c.status = "신청 중..."
                self.ui(self._update_row, c)
                res = bot.apply(c.blog_id, msg)
                self.history.record(c.blog_id, res.status, res.detail)
                c.status = STATUS_KO.get(res.status, res.status)
                c.selected = False
                self.ui(self._update_row, c)
                extra = f" - {res.detail}" if res.detail and res.status != "success" else ""
                self.log(f"({i}/{len(targets)}) {c.blog_id}: {c.status}{extra}")
                if res.status == "success":
                    done += 1
                if res.status == "limit":
                    self.log("네이버 일일 신청 한도에 걸렸습니다. 내일 다시 시도하세요.")
                    break
                if res.status == "group_full":
                    self.log("서로이웃 그룹 인원이 가득 찼습니다. 블로그 이웃 그룹을 확인하세요.")
                    break
                if res.status in ("error", "unconfirmed"):
                    self.log("결과/화면을 확인할 수 없어 자동 신청을 멈춥니다. 현재 브라우저에서 직접 확인하세요.")
                    break
                if i < len(targets) and done < batch:
                    wait = random.uniform(dmin, dmax)
                    end = time.time() + wait
                    while time.time() < end and not self.stop_flag.is_set():
                        time.sleep(0.2)
            self.log(f"자동 신청 종료: 이번에 {done}명 신청 완료 (오늘 누적 {self.history.today_count()}명)")
            self.ui(self._refresh_counts)

        self.worker.submit(job)

    def on_stop(self) -> None:
        self.stop_flag.set()
        self.log("중지 요청… 현재 작업이 끝나면 멈춥니다.")

    def on_close(self) -> None:
        self._save_settings()
        self.stop_flag.set()
        self.worker.submit(None)
        self.root.after(300, self.root.destroy)


def self_test(report_path: Path) -> int:
    """GUI와 패키징된 Playwright 드라이버만 검사. 네이버 접속/신청/사용자 파일 변경 없음."""
    import sys
    import tempfile
    from playwright.sync_api import sync_playwright
    result = {"ok": False, "frozen": bool(getattr(sys, "frozen", False)), "gui": False, "driver": False, "worker_thread": False}
    root = app = None
    try:
        with tempfile.TemporaryDirectory(prefix="seoichoo-gui-test-") as directory:
            global HISTORY_FILE, SETTINGS_FILE
            HISTORY_FILE, SETTINGS_FILE = Path(directory)/"history.json", Path(directory)/"settings.json"
            root = tk.Tk()
            root.withdraw()
            app = App(root)
            root.update()
            result["gui"] = bool(app.tree.winfo_exists())
            finished = threading.Event()
            def probe(_bot):
                try:
                    result["worker_thread"] = threading.get_ident() != threading.main_thread().ident
                    with sync_playwright() as pw:
                        result["driver"] = pw.chromium.name == "chromium"
                except Exception as error:
                    result["error"] = str(error)
                finally:
                    finished.set()
            app.worker.submit(probe)
            deadline = time.monotonic()+15
            def poll():
                if finished.is_set() or time.monotonic() >= deadline:
                    root.quit()
                else:
                    root.after(50, poll)
            root.after(50, poll)
            root.mainloop()
            app.worker.submit(None)
            app.worker.join(timeout=4)
            result["ok"] = all(result[key] for key in ("gui", "driver", "worker_thread")) and finished.is_set()
            if not finished.is_set():
                result["error"] = "드라이버 검사 시간 초과"
    except Exception as error:
        result["error"] = str(error)
    finally:
        if root is not None:
            root.destroy()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0 if result["ok"] else 1


def main() -> None:
    import sys
    if "--self-test" in sys.argv:
        import argparse
        parser = argparse.ArgumentParser()
        parser.add_argument("--self-test", action="store_true")
        parser.add_argument("--report", type=Path, required=True)
        args = parser.parse_args()
        raise SystemExit(self_test(args.report))
    root = tk.Tk()
    try:
        ttk.Style().theme_use("vista")
    except tk.TclError:
        pass
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
