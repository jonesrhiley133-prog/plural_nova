import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

/*
 * The version comes from the repository's package.json, so the app, the server
 * and the APK are never three different versions of PluralNova.
 *
 * Android refuses to install an APK whose versionCode is not greater than the
 * installed one, so it is derived from the same string rather than maintained
 * by hand: 1.0.0 -> 10000, 1.2.3 -> 10203. Bumping the npm version is the only
 * thing anyone has to remember.
 */
val appVersionName: String = run {
    val packageJson = rootProject.file("../package.json").readText()
    Regex("\"version\"\\s*:\\s*\"([^\"]+)\"").find(packageJson)?.groupValues?.get(1)
        ?: error("No version found in package.json")
}

val appVersionCode: Int = run {
    val parts = appVersionName.substringBefore('-').split('.').map { it.toIntOrNull() ?: 0 }
    val major = parts.getOrElse(0) { 0 }
    val minor = parts.getOrElse(1) { 0 }
    val patch = parts.getOrElse(2) { 0 }
    require(minor < 100 && patch < 100) { "version $appVersionName does not fit the versionCode scheme" }
    major * 10000 + minor * 100 + patch
}

/*
 * Release signing is read from `keystore.properties` when it exists, so no key
 * material lives in the repository.
 *
 * The key matters more than it looks: Android will only accept an update signed
 * with the same key as the installed app. Lose it and the only way to ship a new
 * version is to uninstall — which takes the local database with it. Create it
 * once with `tools/make-keystore.sh` and keep a copy somewhere safe.
 */
val keystoreProperties = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
val hasReleaseKey = keystoreProperties.containsKey("storeFile")

android {
    namespace = "com.pluralnova.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.pluralnova.app"
        minSdk = 24
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersionName
    }

    if (hasReleaseKey) {
        signingConfigs {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
        debug {
            /*
             * Two deliberate choices, both so that whatever somebody installs
             * first can be updated by whatever they build next.
             *
             * No applicationIdSuffix: a suffix would make the debug build a
             * separate app, which a release APK could never update.
             *
             * And the release key when there is one, because Android accepts an
             * update only from the same key. Signed with the debug key instead,
             * the first release build would have to be installed over the top —
             * which means uninstalling, which deletes the local database.
             */
            versionNameSuffix = "-debug"
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        viewBinding = true
        // MainActivity reads VERSION_NAME to tag the user agent.
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

/*
 * An unsigned release APK cannot be installed at all, and the failure only shows
 * up on the phone. Say so at build time instead.
 */
tasks.whenTaskAdded {
    if (!hasReleaseKey) {
        when (name) {
            // An unsigned release APK cannot be installed at all, and the
            // failure only shows up on the phone. Say so at build time instead.
            "assembleRelease" -> doFirst {
                error(
                    "No keystore.properties, so this APK would be unsigned and refused by Android.\n" +
                        "Run android/tools/make-keystore.sh once, or use assembleDebug.",
                )
            }
            // A debug build falls back to the throwaway debug key, which works
            // — until the first release build, which Android then refuses as an
            // update because the key changed.
            "assembleDebug" -> doFirst {
                logger.warn(
                    "\nNo keystore.properties: signing with the temporary debug key.\n" +
                        "A release build will not be able to update this install — run\n" +
                        "android/tools/make-keystore.sh first if this device matters.\n",
                )
            }
        }
    }
}

dependencies {
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.activity)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.webkit)
}
