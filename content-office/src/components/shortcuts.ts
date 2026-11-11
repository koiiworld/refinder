// 편집기 공용 단축키 도우미 (한글 입력 상태에서도 동작하도록 e.key 대신 실제 키 위치 e.code 사용)

/** 글자를 치는 중인지 (글 상자·숫자 칸·편집 가능한 영역). 슬라이더·체크박스·버튼은 아님 */
export function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  const type = ((el as HTMLInputElement).type || "text").toLowerCase();
  return !["range", "checkbox", "radio", "button", "submit", "color", "file"].includes(type);
}

/** Ctrl/Cmd+Z = 되돌리기, Ctrl/Cmd+Shift+Z 또는 Ctrl+Y = 다시 하기 */
export function undoKey(e: KeyboardEvent): "undo" | "redo" | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  if (e.code === "KeyZ" || e.key.toLowerCase() === "z") return e.shiftKey ? "redo" : "undo";
  if (e.code === "KeyY" || e.key.toLowerCase() === "y") return "redo";
  return null;
}

/** 한글 입력 상태에서도 같은 자리 키로 인식 (예: s ↔ ㄴ) */
export function keyIs(e: KeyboardEvent, letter: string) {
  return e.code === `Key${letter.toUpperCase()}` || e.key.toLowerCase() === letter.toLowerCase();
}
