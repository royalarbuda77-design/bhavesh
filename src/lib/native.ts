import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

export const isNativeApp = () => Capacitor.isNativePlatform()

export async function setNativeTheme(dark: boolean) {
  if (!isNativeApp()) return
  try {
    await StatusBar.setBackgroundColor({ color: dark ? '#11131a' : '#f6f7fb' })
    await StatusBar.setStyle({ style: dark ? Style.Light : Style.Dark })
  } catch {
    // The web experience remains usable if a device does not expose StatusBar APIs.
  }
}

export async function initializeNativeApp() {
  if (!isNativeApp()) return
  document.documentElement.classList.add('native-app')
  try { await StatusBar.setOverlaysWebView({ overlay: false }) } catch { /* Android may enforce edge-to-edge. */ }
  await setNativeTheme(document.documentElement.classList.contains('dark'))
}
