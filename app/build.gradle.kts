plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.jarvis.assistant"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.jarvis.assistant"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        vectorDrawables { useSupportLibrary = true }

        // Optional: bake a key at build time (fallback if not set in Settings).
        // Put `jarvis.apiKey=...` in local.properties (git-ignored).
        val localProps = java.util.Properties()
        val f = rootProject.file("local.properties")
        if (f.exists()) f.inputStream().use { localProps.load(it) }
        val baked = localProps.getProperty("jarvis.apiKey")?.takeIf { it.isNotBlank() }
            ?: System.getenv("JARVIS_API_KEY")?.takeIf { it.isNotBlank() } ?: ""
        buildConfigField("String", "BAKED_API_KEY", "\"$baked\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    signingConfigs {
        // Client release keystore — create with:
        //   keytool -genkey -v -keystore jarvis-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias jarvis
        // then put credentials in local.properties: jarvis.storeFile / jarvis.storePassword / jarvis.keyAlias / jarvis.keyPassword
        create("client") {
            val localProps = java.util.Properties()
            val f = rootProject.file("local.properties")
            if (f.exists()) f.inputStream().use { localProps.load(it) }
            localProps.getProperty("jarvis.storeFile")?.let {
                storeFile = rootProject.file(it)
                storePassword = localProps.getProperty("jarvis.storePassword")
                keyAlias = localProps.getProperty("jarvis.keyAlias")
                keyPassword = localProps.getProperty("jarvis.keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("client")
                .takeIf { it.storeFile != null }
                ?: signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
    lint {
        // The app intentionally declares background-activity/always-on features.
        abortOnError = false
    }
}

dependencies {
    implementation(project(":core"))
    implementation(project(":gemini"))
    implementation(project(":voice"))
    implementation(project(":automation"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.service)
    implementation(libs.androidx.savedstate)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.compose.animation)
    implementation(libs.androidx.compose.foundation)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)
}
