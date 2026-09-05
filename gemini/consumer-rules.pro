# kotlinx.serialization: keep generated serializers for Gemini DTOs.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class com.jarvis.assistant.gemini.** {
    *** Companion;
    <fields>;
}
-keepclasseswithmembers class com.jarvis.assistant.gemini.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.jarvis.assistant.gemini.**$$serializer { *; }
