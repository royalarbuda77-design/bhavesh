"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal typings for the Web Speech API (not in default lib.dom for all targets). */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function useSpeechInput(onText: (text: string, isFinal: boolean) => void) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [supported] = useState(() => {
    if (typeof window === "undefined") return false;
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  });

  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!supported) return;
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (final) onText(final, true);
      else if (interim) onText(interim, false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [supported, onText]);

  const toggle = useCallback(() => (listening ? stop() : start()), [listening, start, stop]);

  return { supported, listening, toggle, stop };
}
