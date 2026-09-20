package com.pluralnova.app

import android.content.Context
import java.net.HttpURLConnection
import java.net.URL
import javax.net.ssl.SSLException

/**
 * Where this device's PluralNova lives.
 *
 * PluralNova is self-hosted, so the app cannot know its own server: somebody
 * runs it, on a machine they chose, at an address only they know. Getting that
 * address wrong is the single most likely way a first launch fails, so it is
 * checked against the server's health endpoint before it is saved — a clear
 * "nothing answered at that address" beats a blank screen.
 */
object ServerAddress {
    private const val PREFS = "pluralnova"
    private const val KEY = "serverUrl"

    fun stored(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)

    fun store(context: Context, url: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, url).apply()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).apply()
    }

    /**
     * Turns what somebody typed into an address, or returns null.
     *
     * People type "192.168.1.10:4000" and "pluralnova.example.com/" as often as
     * they type a full URL, and refusing those would be pedantry rather than
     * validation.
     */
    fun normalise(input: String): String? {
        val trimmed = input.trim().trimEnd('/')
        if (trimmed.isEmpty()) return null

        val withScheme = if (trimmed.contains("://")) trimmed else "http://$trimmed"
        return try {
            val url = URL(withScheme)
            if (url.host.isNullOrBlank()) null else url.toString().trimEnd('/')
        } catch (error: Exception) {
            null
        }
    }

    /** True when the address is one a password can safely be typed into. */
    fun isPrivateOrSecure(url: String): Boolean {
        val parsed = runCatching { URL(url) }.getOrNull() ?: return false
        if (parsed.protocol == "https") return true
        val host = parsed.host ?: return false
        if (host == "localhost" || host == "127.0.0.1" || host.endsWith(".local")) return true
        if (host.startsWith("10.") || host.startsWith("192.168.")) return true

        // 172.16.0.0/12 is the awkward one: only the second octet decides.
        val secondOctet = host.split(".").getOrNull(1)?.toIntOrNull()
        return host.startsWith("172.") && secondOctet != null && secondOctet in 16..31
    }

    sealed interface Check {
        data object Reachable : Check
        data class NotPluralNova(val detail: String) : Check
        data class Unreachable(val detail: String) : Check
    }

    /** Asks the address whether it is a PluralNova. Call off the main thread. */
    fun check(url: String): Check {
        val connection = try {
            (URL("$url/api/health").openConnection() as HttpURLConnection).apply {
                connectTimeout = 8000
                readTimeout = 8000
                requestMethod = "GET"
                setRequestProperty("Accept", "application/json")
            }
        } catch (error: Exception) {
            return Check.Unreachable(error.message ?: "that address could not be opened")
        }

        return try {
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            when {
                connection.responseCode != 200 -> Check.NotPluralNova("it answered ${connection.responseCode}")
                !body.contains("\"apiVersion\"") -> Check.NotPluralNova("something else is running there")
                else -> Check.Reachable
            }
        } catch (error: SSLException) {
            Check.Unreachable("its certificate was refused: ${error.message}")
        } catch (error: Exception) {
            Check.Unreachable(error.message ?: "nothing answered")
        } finally {
            connection.disconnect()
        }
    }
}
