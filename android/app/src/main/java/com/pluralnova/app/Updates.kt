package com.pluralnova.app

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Updating an app that came from no store.
 *
 * The server that runs PluralNova also publishes the APK, so an installed copy
 * can ask it what the current build is and fetch it. That is the whole
 * mechanism: there is nothing to sign in to and no account involved, because
 * getting the app onto a phone has to work before anybody has one.
 *
 * What stops a hostile server pushing a hostile build is not this code — it is
 * Android, which refuses an update that is not signed with the same key as the
 * installed app. The checksum here catches a truncated or corrupted download,
 * which is the failure that actually happens; it is not a signature and is not
 * treated as one.
 */
object Updates {

    data class Available(
        val versionCode: Int,
        val versionName: String,
        val url: String,
        val sha256: String,
        val notes: String?,
    )

    /** The published build, when it is newer than this one. Call off the main thread. */
    fun check(serverUrl: String): Available? {
        val connection = try {
            (URL("$serverUrl/api/app/android").openConnection() as HttpURLConnection).apply {
                connectTimeout = 8000
                readTimeout = 8000
                setRequestProperty("Accept", "application/json")
            }
        } catch (error: Exception) {
            return null
        }

        return try {
            if (connection.responseCode != 200) return null
            val payload = connection.inputStream.bufferedReader().use { it.readText() }
            val release = JSONObject(payload).optJSONObject("data")?.optJSONObject("release")
                ?: return null

            val versionCode = release.optInt("versionCode", 0)
            // A server running an older build than the phone is not an update.
            if (versionCode <= BuildConfig.VERSION_CODE) return null

            Available(
                versionCode = versionCode,
                versionName = release.optString("versionName", "?"),
                url = serverUrl + release.optString("url", "/app/pluralnova.apk"),
                sha256 = release.optString("sha256", ""),
                notes = release.optString("notes").takeIf { it.isNotBlank() },
            )
        } catch (error: Exception) {
            // An unreachable or unparseable server is not worth interrupting
            // anybody over; the check simply finds nothing this time.
            null
        } finally {
            connection.disconnect()
        }
    }

    /** Where a downloaded build lands. One name, so downloads cannot pile up. */
    fun downloadTarget(context: Context): File =
        File(context.getExternalFilesDir(null), "pluralnova-update.apk")

    fun startDownload(context: Context, update: Available): Long {
        downloadTarget(context).delete()

        val request = DownloadManager.Request(Uri.parse(update.url))
            .setTitle(context.getString(R.string.update_downloading, update.versionName))
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            .setDestinationInExternalFilesDir(context, null, "pluralnova-update.apk")

        return (context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
    }

    /** True when the file on disk is the file the server described. */
    fun verify(file: File, expectedSha256: String): Boolean {
        if (expectedSha256.isBlank() || !file.exists()) return false
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { stream ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val read = stream.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }.equals(expectedSha256, ignoreCase = true)
    }

    /**
     * Android 8 and later ask, per app, whether it may install other apps. That
     * has to be granted before the installer will open, and the request is a
     * trip to Settings rather than a dialog.
     */
    fun canInstall(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

    fun permissionIntent(context: Context): Intent =
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))

    fun installIntent(context: Context, file: File): Intent {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        return Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }
}
