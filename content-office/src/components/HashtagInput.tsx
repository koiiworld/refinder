"use client";
import { useRef } from "react";
import { formatHashtags } from "@/lib/caption-styles";

/** 스페이스·쉼표·엔터를 누르면 태그가 확정되고 다음 # 이 자동으로 열려요. 여러 개를 붙여넣어도 같아요. */
export default function HashtagInput({ value, onChange, placeholder, ariaLabel, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; ariaLabel?: string; disabled?: boolean }) {
  const prev = useRef(value);
  const set = (v: string) => { prev.current = v; onChange(v); };
  return (
    <input
      className="input"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel ?? "해시태그"}
      placeholder={placeholder ?? "#해시태그 입력 후 스페이스"}
      onFocus={() => { if (!value.trim()) set("#"); }}
      onBlur={() => set(formatHashtags(value, false))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); set(formatHashtags(value, true)); }
      }}
      onPaste={(e) => {
        const text = e.clipboardData.getData("text");
        if (!text) return;
        e.preventDefault();
        set(formatHashtags(value + " " + text, true));
      }}
      onChange={(e) => {
        const v = e.target.value;
        // 지우는 중이면 그대로 둬요 (# 이 다시 생기지 않게)
        if (v.length < prev.current.length) { set(v); return; }
        set(/[\s,]$/.test(v) ? formatHashtags(v, true) : v);
      }}
    />
  );
}
