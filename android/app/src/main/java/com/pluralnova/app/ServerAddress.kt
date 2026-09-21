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

    /*
     * Set when somebody has chosen an address for themselves, including by
     * clearing one. It is what keeps "change server" working in a build that
     * ships with an address baked in: without it, clearing the stored value
     * would fall straight back to the default and the screen would be
     * unreachable.
     */
    private const val KEY_CHOSEN = "serverChosen"

    /**
     * The address baked in at build time, or empty when there is none.
     *
     * A build for one system's own server knows where that server is, and
     * asking on first launch is a question with one possible answer. A build
     * for anybody else does not, so this is empty and the setup screen does
     * its job. Same app either way; the difference is one Gradle property.
     */
    private val baked: String?
        get() = BuildConfig.DEFAULT_SERVER_URL.trim().ifEmpty { null }

    fun stored(context: Context): String? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.getString(KEY, null)?.let { return it }
        // Somebody cleared it on purpose: ask, rather than undoing their choice.
        if (prefs.getBoolean(KEY_CHOSEN, false)) return null
        return baked?.let { normalise(it) }
    }

    fun store(context: Context, url: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, url)
            .putBoolean(KEY_CHOSEN, true)
            .apply()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY)
            .putBoolean(KEY_CHOSEN, true)
            .apply()
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

        val withScheme = if (trimmed.contains("://")) trimmed else "https://$trimmed"
        return try {
            val url = URL(withScheme)
            if (url.host.isNullOrBlank()) null else url.toString().trimEnd('/')
        } catch (error: Exception) {
            null
        }
    }

    /**
     * The addresses worth trying for what somebody typed, best first.
     *
     * When no scheme is given this does not guess one. Guessing is what broke
     * it: a bare hostname became http://, a hosted server answered that with a
     * redirect to https, and HttpURLConnection will not follow a redirect that
     * changes protocol — so the address of a perfectly good server failed, and
     * said nothing had answered.
     *
     * Https first, because a hosted server is the case that cannot fall back,
     * then http for the machine on somebody's own desk, which is the case that
     * has no certificate to offer.
     */
    fun candidates(input: String): List<String> {
        val trimmed = input.trim().trimEnd('/')
        if (trimmed.isEmpty()) return emptyList()
        if (trimmed.contains("://")) return listOfNotNull(normalise(trimmed))
        return listOfNotNull(normalise("https://$trimmed"), normalise("http://$trimmed"))
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
    fun check(url: String): Check = check(url, redirectsLeft = 3)

    private fun check(url: String, redirectsLeft: Int): Check {
        val connection = try {
            (URL("$url/api/health").openConnection() as HttpURLConnection).apply {
                connectTimeout = 8000
                readTimeout = 8000
                requestMethod = "GET"
                setRequestProperty("Accept", "application/json")
                // Followed by hand below, because the automatic version stops
                // at a change of protocol and reports it as an ordinary reply.
                instanceFollowRedirects = false
            }
        } catch (error: Exception) {
            return Check.Unreachable(error.message ?: "that address could not be opened")
        }

        return try {
            /*
             * The status first, and the body from whichever stream matches it.
             *
             * inputStream throws for any 4xx or 5xx — the body of a failed
             * response is on errorStream — so reading it first meant every
             * error became "nothing answered", and the branch below that names
             * the status code could never run. A wrong address and a server
             * that was merely unhappy looked identical, which is most of why
             * this was hard to get past.
             */
            val status = connection.responseCode

            if (status in 300..399) {
                val location = connection.getHeaderField("Location")
                if (location.isNullOrBlank()) return Check.NotPluralNova("it redirected to nowhere")
                if (redirectsLeft <= 0) return Check.NotPluralNova("it redirected too many times")
                // Location may be relative, and may change http to https, which
                // is exactly what a hosted server does to an http request.
                val next = URL(URL(url), location).toString().removeSuffix("/api/health").trimEnd('/')
                return check(next, redirectsLeft - 1)
            }

            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() } ?: ""

            when {
                status != 200 -> Check.NotPluralNova("it answered $status")
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
