# Accessibility / NotificationListener services are referenced only from the
# manifest; R8 keeps manifest-reachable classes, but keep them explicitly:
-keep class com.jarvis.assistant.automation.screen.JarvisAccessibilityService { *; }
-keep class com.jarvis.assistant.automation.notifications.JarvisNotificationListenerService { *; }
-keep class com.jarvis.assistant.automation.utilities.ReminderReceiver { *; }
