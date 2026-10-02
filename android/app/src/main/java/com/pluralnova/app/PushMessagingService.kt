package com.pluralnova.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives Firebase Cloud Messaging pushes and turns them into a real
 * notification.
 *
 * The server always sends a data-only message, never Firebase's own
 * "notification" payload, so this runs unconditionally — including while the
 * app is in the foreground — and builds the notification itself from the same
 * PushPayload shape the browser's service worker already shows, rather than
 * leaving display to Firebase, which a data message gives nothing to show.
 */
class PushMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val body = data["body"] ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val title = data["title"]?.takeIf { it.isNotBlank() } ?: getString(R.string.app_name)
        val link = data["link"]
        // The same string a browser would pass to ServiceWorkerRegistration.showNotification's
        // own `tag` option: matching notifications replace each other, distinct ones stack.
        val tag = data["tag"]?.takeIf { it.isNotBlank() } ?: System.currentTimeMillis().toString()

        ensureChannel()

        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (link != null) putExtra(MainActivity.EXTRA_LINK, link)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            tag.hashCode(),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(getColor(R.color.app_accent))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        NotificationManagerCompat.from(this).notify(tag, NOTIFICATION_ID, notification)
    }

    /**
     * Firebase can hand out a new token on its own — a security-driven
     * rotation on Google's side, say — not only when the page asks for one.
     * There is no route from here, a background service, back into the
     * page's own authenticated session to register it, so this is a
     * deliberate no-op rather than a gap: `WebAppBridge.getFcmToken` below
     * always asks Firebase for whatever token is current, not a cached one,
     * and `core/push.ts`'s `watchAndroidPushToken` compares that against
     * what the server last has on every status check (including every time
     * the app is reopened) — so a rotation that happens here is caught and
     * silently re-registered the next time anything on the page looks,
     * without this service needing a network path of its own.
     */
    override fun onNewToken(token: String) = Unit

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = getString(R.string.notification_channel_description)
        }
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
    }

    companion object {
        private const val CHANNEL_ID = "pluralnova"
        private const val NOTIFICATION_ID = 1
    }
}
