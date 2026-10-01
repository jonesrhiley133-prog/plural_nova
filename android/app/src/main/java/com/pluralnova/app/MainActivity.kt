package com.pluralnova.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import com.google.android.gms.tasks.Tasks
import com.google.firebase.messaging.FirebaseMessaging
import com.pluralnova.app.databinding.ActivityMainBinding
import java.net.URL
import java.util.concurrent.Executors

/**
 * The app.
 *
 * PluralNova is a web application with a service worker, a local database and
 * its own offline handling, so this is a host for it rather than a
 * reimplementation of it: everything the browser version does — opening without
 * a connection, queuing writes, syncing on reconnect — works here because it is
 * the same code running in the same engine.
 *
 * What the shell has to add is the handful of things a browser does for free
 * and a WebView does not: the back button, downloads, file pickers, sending
 * links that are not PluralNova to a real browser, and an error screen that
 * says something useful instead of "net::ERR_CONNECTION_REFUSED".
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var serverUrl: String
    private var pendingFileChooser: ValueCallback<Array<Uri>>? = null

    private val worker = Executors.newSingleThreadExecutor()
    private var offered: Updates.Available? = null
    private var downloadId: Long = -1L
    private var downloadWatcher: BroadcastReceiver? = null

    private val requestNotifications =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            // Declined or granted, the page finds out the same way a browser tells
            // it: by calling Notification.permission itself. Nothing here needs to
            // react to the result directly.
        }

    private val chooseFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = pendingFileChooser ?: return@registerForActivityResult
        pendingFileChooser = null
        callback.onReceiveValue(
            if (result.resultCode == RESULT_OK) {
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            } else {
                // A cancelled picker must still answer, or the page's file input
                // stays wedged and cannot be opened a second time.
                emptyArray()
            },
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val stored = ServerAddress.stored(this)
        if (stored == null) {
            startActivity(Intent(this, SetupActivity::class.java))
            finish()
            return
        }
        serverUrl = stored

        // The page draws its own safe-area padding from env(safe-area-inset-*),
        // which only reports real values when the window is edge to edge.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        configureWebView()
        requestNotificationPermission()
        binding.retry.setOnClickListener { load() }
        binding.changeServer.setOnClickListener {
            ServerAddress.clear(this)
            startActivity(Intent(this, SetupActivity::class.java))
            finish()
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.webView.canGoBack()) binding.webView.goBack() else finish()
            }
        })

        binding.updateDismiss.setOnClickListener { binding.updateBar.visibility = View.GONE }
        binding.updateAction.setOnClickListener { beginUpdate() }

        if (savedInstanceState != null) {
            binding.webView.restoreState(savedInstanceState)
        } else {
            load(intent.getStringExtra(EXTRA_LINK))
        }

        checkForUpdate()
    }

    /**
     * A tapped notification while the app is already running — `singleTask`
     * routes it here instead of a fresh `onCreate`. A plain re-launch (no
     * link extra) leaves the page exactly as it was; only a real deep link
     * navigates it, and never on a configuration-change recreation, which
     * redelivers the same intent `onCreate` already handled once.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val link = intent.getStringExtra(EXTRA_LINK) ?: return
        if (::binding.isInitialized) load(link)
    }

    // ----------------------------------------------------------- updating

    private fun checkForUpdate() {
        worker.execute {
            val found = Updates.check(serverUrl) ?: return@execute
            runOnUiThread {
                offered = found
                binding.updateText.text = getString(R.string.update_available, found.versionName)
                binding.updateAction.isEnabled = true
                binding.updateBar.visibility = View.VISIBLE
            }
        }
    }

    private fun beginUpdate() {
        val update = offered ?: return

        // Android 8 and later want per-app permission before the installer will
        // open at all, and granting it is a trip to Settings rather than a dialog.
        if (!Updates.canInstall(this)) {
            binding.updateText.text = getString(R.string.update_needs_permission)
            runCatching { startActivity(Updates.permissionIntent(this)) }
            return
        }

        binding.updateAction.isEnabled = false
        binding.updateText.text = getString(R.string.update_preparing)
        downloadId = Updates.startDownload(this, update)
        watchDownload()
    }

    private fun watchDownload() {
        if (downloadWatcher != null) return
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                val finished = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
                if (finished != downloadId) return
                onDownloadFinished()
            }
        }
        downloadWatcher = receiver
        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(receiver, filter)
        }
    }

    private fun onDownloadFinished() {
        val update = offered ?: return
        val file = Updates.downloadTarget(this)

        worker.execute {
            val good = Updates.verify(file, update.sha256)
            runOnUiThread {
                binding.updateAction.isEnabled = true
                if (!good) {
                    // Either the download was cut short or the file is not what
                    // the server said it was. Neither is worth installing.
                    file.delete()
                    binding.updateText.text = getString(
                        if (file.exists()) R.string.update_corrupt else R.string.update_failed,
                    )
                    return@runOnUiThread
                }
                runCatching { startActivity(Updates.installIntent(this, file)) }
                    .onFailure { binding.updateText.text = getString(R.string.update_failed) }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        val webView = binding.webView

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            // The app's own service worker handles caching; a second cache layer
            // here would only serve stale builds.
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = false
            setSupportMultipleWindows(false)
            userAgentString = "$userAgentString PluralNova/${BuildConfig.VERSION_NAME}"
        }

        // Let the page's own dark theme through instead of the WebView inverting
        // colours underneath it.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(webView.settings, false)
        }

        webView.setBackgroundColor(getColor(R.color.app_background))
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)
        // The one thing a bare WebView cannot give the page for free: there is
        // no Web Push service behind it, so this is how it reaches Firebase
        // Cloud Messaging instead. See core/push.ts on the web side.
        webView.addJavascriptInterface(WebAppBridge(), "PluralNovaAndroid")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val target = request.url
                if (isOurServer(target)) return false
                // Anything that is not this PluralNova belongs in a browser, where
                // the person can see the address they are being sent to.
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, target)) }
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                if (binding.error.visibility != View.VISIBLE) binding.webView.visibility = View.VISIBLE
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                // Only a failure to load the page itself is worth a screen; a
                // missing image is not, and the app is offline-capable anyway.
                if (!request.isForMainFrame) return
                showError(error.description?.toString())
            }

            override fun onReceivedHttpError(
                view: WebView,
                request: WebResourceRequest,
                errorResponse: WebResourceResponse,
            ) {
                // A host that answers at all — a dead Railway subdomain serving its
                // own "Not Found" page is the case that sent us looking for this —
                // never reaches onReceivedError, since the connection succeeded.
                // Without this, that page would just render as if it were the app,
                // with no retry and no way to change the address.
                if (!request.isForMainFrame) return
                showError("it answered ${errorResponse.statusCode}")
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                // The renderer is a separate OS process from this one and can be
                // killed by the system under memory pressure — the Files app,
                // Camera or Photo Picker briefly in the foreground is a common
                // trigger — without PluralNova itself crashing. Left unhandled,
                // Android crashes the host app anyway; this is reported to have
                // looked like the chat layout and back button breaking, since
                // whatever was on screen when the renderer died stops responding.
                // `recreate()` rebuilds the WebView through the same
                // saveState/restoreState path a configuration change already
                // uses (see onSaveInstanceState/onCreate below), so the page and
                // its back/forward history come back exactly as they were.
                if (view !== binding.webView) return false
                recreate()
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                pendingFileChooser?.onReceiveValue(emptyArray())
                pendingFileChooser = callback
                return try {
                    chooseFiles.launch(galleryPickerIntent(params) ?: params.createIntent())
                    true
                } catch (error: Exception) {
                    // No app can handle the picker. Answer the page so its file
                    // input is not left waiting forever.
                    pendingFileChooser = null
                    callback.onReceiveValue(emptyArray())
                    false
                }
            }
        }

        // Exporting a backup is a download; without this it silently does nothing.
        webView.setDownloadListener(DownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setMimeType(mimeType)
                addRequestHeader("User-Agent", userAgent)
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                val name = android.webkit.URLUtil.guessFileName(url, contentDisposition, mimeType)
                setTitle(name)
                setDestinationInExternalFilesDir(this@MainActivity, null, name)
            }
            runCatching {
                (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            }
        })
    }

    /**
     * The page's "Gallery" attach option asks for images/video with no camera
     * capture — `GALLERY_ACCEPT` in MessageConversationView.tsx and its System
     * Chat equivalent. `params.createIntent()`'s default for that shape is
     * typically a generic document chooser rather than an actual photo
     * browser, which is the reported "Gallery opens the Files app" bug. The
     * system Photo Picker (API 33+) is a real gallery — swipeable, its own
     * back-swipe-to-dismiss UI, no files-app chrome — so it is used directly
     * when the request is unambiguously photo/video and not a camera capture;
     * anything else (Camera's own capture intent, the broad Files input, or a
     * device too old to have the picker) falls back to the default unchanged.
     */
    private fun galleryPickerIntent(params: WebChromeClient.FileChooserParams): Intent? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return null
        if (params.isCaptureEnabled) return null

        val types = params.acceptTypes.filter { it.isNotBlank() }
        val isVisualMediaOnly = types.isNotEmpty() && types.all { it.startsWith("image/") || it.startsWith("video/") }
        if (!isVisualMediaOnly) return null

        val picker = Intent(MediaStore.ACTION_PICK_IMAGES)
        if (params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
            picker.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, MediaStore.getPickImagesMaxLimit())
        }
        return if (picker.resolveActivity(packageManager) != null) picker else null
    }

    // Below Android 13 a notification needs no runtime permission at all; asking
    // there would only be a confusing dialog for nothing.
    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) requestNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    private fun isOurServer(uri: Uri): Boolean {
        val ours = runCatching { URL(serverUrl) }.getOrNull() ?: return false
        return uri.host == ours.host && (uri.port == ours.port || uri.port == -1)
    }

    /** `path`, when given, is an in-app route like "/fronting" from a notification tap. */
    private fun load(path: String? = null) {
        binding.error.visibility = View.GONE
        binding.webView.visibility = View.VISIBLE
        binding.webView.loadUrl(serverUrl + (path ?: ""))
    }

    private fun showError(detail: String?) {
        binding.webView.visibility = View.GONE
        binding.error.visibility = View.VISIBLE
        binding.errorDetail.text = getString(R.string.error_detail, serverUrl, detail ?: "")
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::binding.isInitialized) binding.webView.saveState(outState)
    }

    override fun onPause() {
        super.onPause()
        if (::binding.isInitialized) binding.webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (::binding.isInitialized) binding.webView.onResume()
    }

    override fun onDestroy() {
        pendingFileChooser?.onReceiveValue(emptyArray())
        pendingFileChooser = null
        downloadWatcher?.let { runCatching { unregisterReceiver(it) } }
        downloadWatcher = null
        worker.shutdownNow()
        super.onDestroy()
    }

    /**
     * What core/push.ts reaches into the app for, as `window.PluralNovaAndroid`.
     * Kept to just the one thing a WebView cannot do on its own: everything
     * else the page already handles itself.
     *
     * WebView calls every `@JavascriptInterface` method off the UI thread, which
     * is what makes the blocking `Tasks.await` calls below safe rather than a
     * frozen page — this is the documented, standard way to bridge an
     * inherently asynchronous native API back to JS as a plain return value.
     */
    private inner class WebAppBridge {

        @JavascriptInterface
        fun getFcmToken(): String = try {
            Tasks.await(FirebaseMessaging.getInstance().token)
        } catch (error: Exception) {
            // No google-services.json, no network, or no Play Services on this
            // device — any of these just leave native push unavailable here.
            ""
        }

        @JavascriptInterface
        fun deleteFcmToken() {
            runCatching { Tasks.await(FirebaseMessaging.getInstance().deleteToken()) }
        }

        @JavascriptInterface
        fun notificationsAllowed(): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            } else {
                true
            }
        }
    }

    companion object {
        /** Intent extra a notification tap carries: an in-app route to open, like "/fronting". */
        const val EXTRA_LINK = "link"
    }
}
