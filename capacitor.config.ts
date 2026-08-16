import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.smartstudyboard.app',
  appName: 'Smart Study Board',
  webDir: 'dist',
  backgroundColor: '#f6f7fb',
  android: {
    adjustMarginsForEdgeToEdge: 'auto',
    backgroundColor: '#f6f7fb',
    allowMixedContent: false
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: '#f6f7fb',
      style: 'LIGHT'
    }
  }
}

export default config
