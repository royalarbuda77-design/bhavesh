import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Nexus AI — Multi-Model AI Assistant", template: "%s · Nexus AI" },
  description:
    "Connect your own AI providers (OpenAI, Anthropic, Google, OpenRouter, Groq, Mistral, xAI or any OpenAI-compatible endpoint) and chat with all your models in one unified interface.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#131417" },
  ],
};

const themeScript = `
(function () {
  try {
    var t = localStorage.getItem("nexus-theme") || "system";
    var dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Nexus AI" />
        <script
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})})}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
