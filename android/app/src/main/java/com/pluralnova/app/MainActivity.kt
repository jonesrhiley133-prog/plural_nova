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
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
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
            load()
        }

        checkForUpdate()
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
                    chooseFiles.launch(params.createIntent())
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

    private fun load() {
        binding.error.visibility = View.GONE
        binding.webView.visibility = View.VISIBLE
        binding.webView.loadUrl(serverUrl)
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
}
