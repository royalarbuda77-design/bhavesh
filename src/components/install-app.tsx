"use client";

import { useEffect, useState } from "react";
import { Download, Share, X, Smartphone } from "lucide-react";
import { Button, Modal } from "./ui";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * "Install app" entry point. Uses the native install prompt when the browser
 * offers one (Chrome/Edge/Android), and shows manual instructions on iOS
 * Safari, where Apple requires the Share → Add to Home Screen flow.
 */
export function InstallAppButton({ className = "" }: { className?: string }) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
      setIsIos(true);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  // register the SW (idempotent)
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const install = async () => {
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") setPromptEvent(null);
    } else {
      setIosOpen(true);
    }
  };

  const showIosHelp = isIos && !promptEvent;

  return (
    <>
      <button
        onClick={() => (showIosHelp ? setIosOpen(true) : void install())}
        className={`flex items-center gap-2 rounded-lg border border-surface-border px-2.5 py-1.5 text-[12px] font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink-primary ${className}`}
        aria-label="Install Nexus AI as an app"
      >
        <Download size={13} aria-hidden /> Install app
      </button>

      <Modal open={iosOpen} onClose={() => setIosOpen(false)} title="Install on iPhone / iPad">
        <ol className="list-decimal space-y-2.5 pl-5 text-[13.5px] leading-relaxed text-ink-secondary">
          <li className="flex gap-2">
            <span>Open this page in <strong className="text-ink-primary">Safari</strong> (not inside another app).</span>
          </li>
          <li className="flex gap-2">
            <span>Tap the <strong className="text-ink-primary">Share</strong> button</span>
            <Share size={15} className="mt-0.5 text-accent" aria-hidden />
            <span className="sr-only">share icon</span>
          </li>
          <li className="flex gap-2">
            <span>Scroll down and tap <strong className="text-ink-primary">Add to Home Screen</strong></span>
            <Smartphone size={15} className="mt-0.5 text-accent" aria-hidden />
          </li>
          <li>Tap <strong className="text-ink-primary">Add</strong> — Nexus AI will open full-screen like a native app.</li>
        </ol>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => setIosOpen(false)}>
            <X size={14} aria-hidden /> Close
          </Button>
        </div>
      </Modal>
    </>
  );
}
