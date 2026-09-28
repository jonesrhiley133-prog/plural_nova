plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    // Applied per-module, and there only when that module has a
    // google-services.json to read — see app/build.gradle.kts.
    alias(libs.plugins.google.services) apply false
}
