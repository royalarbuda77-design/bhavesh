plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.jarvis.assistant.voice"
    compileSdk = 36

    defaultConfig {
        minSdk = 26
        consumerProguardFiles("consumer-rules.pro")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    // Optional on-device neural wake word (Picovoice Porcupine).
    // Enabled with:  -Pjarvis.engines.porcupine=true  (see docs/WAKE_WORD.md)
    sourceSets {
        getByName("main") {
            java.srcDir("src/main/kotlin")
        }
    }
}

dependencies {
    api(project(":core"))
    api(project(":gemini"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.coroutines.android)
}

if (project.findProperty("jarvis.engines.porcupine")?.toString()?.toBoolean() == true) {
    // Uncomment after adding the dependency to libs.versions.toml:
    //   porcupine = { group = "ai.picovoice", name = "porcupine-android", version = "3.0.1" }
    dependencies.add("implementation", "ai.picovoice:porcupine-android:3.0.1")
    android.sourceSets.getByName("main").java.srcDir("src/porcupine/kotlin")
}
