# Smart Study Board

A mobile-first, browser-local study board for editable PDF/image annotations and digital notebooks. It runs as a website/PWA and as a native Android application through Capacitor.

## Run the web app

```bash
npm install
npm run dev
```

Open the URL shown by Vite. Create a production web build with `npm run build`.

## Android app

The checked-in Android Studio project uses the application ID `com.smartstudyboard.app`, targets Android SDK 36, and supports Android 7.0 (API 24) and newer.

```bash
# Build the web app and copy it, plus native plugins, into Android
npm run android:sync

# Open the native project in Android Studio
npm run android:open

# Build a local debug APK (requires Java 17 and Android SDK 36)
npm run android:apk
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. A Play Store-ready bundle can be generated from Android Studio after configuring a private release-signing key.

Native integrations include:

- Persistent on-device IndexedDB document storage
- Android file picker support for PDF/image imports
- Android share/save sheet for exported PDF and PNG files
- Native status-bar and edge-to-edge handling
- Branded adaptive launcher icon and splash screen
- No cleartext traffic and no Android cloud backup of private study documents

A Play Store release AAB must be signed with the owner's private release keystore. Never commit that keystore or its passwords to the repository.

## Privacy and storage

Documents, original files, page models and editable Fabric.js annotation JSON are stored on the current device. No account, server, or paid API is required. Export creates a new flattened PDF/image without changing the editable local model.
