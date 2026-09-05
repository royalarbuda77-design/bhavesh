# ── JARVIS app-level R8 rules ────────────────────────────────────────────────
# Kotlin serialization (Gemini DTOs are handled by gemini/consumer-rules.pro)
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-dontwarn org.jetbrains.annotations.**

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# AndroidX TTS / speech callbacks invoked from Java — keep listeners
-keep class * extends android.speech.RecognitionListener
-keep class * extends android.accessibilityservice.AccessibilityService
-keep class * extends android.service.notification.NotificationListenerService
