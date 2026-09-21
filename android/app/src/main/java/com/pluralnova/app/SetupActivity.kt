package com.pluralnova.app

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import com.pluralnova.app.databinding.ActivitySetupBinding
import java.util.concurrent.Executors

/**
 * First run: where is your PluralNova?
 *
 * The address is checked before it is kept, and the result says which of the
 * two things went wrong — nothing answered, or something answered that is not a
 * PluralNova. Those have completely different fixes, and a single "could not
 * connect" would send people looking in the wrong place.
 */
class SetupActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySetupBinding
    private val worker = Executors.newSingleThreadExecutor()

    /** Set once an unencrypted public address has been warned about. */
    private var acknowledgedInsecure: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        binding = ActivitySetupBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.address.setText(ServerAddress.stored(this) ?: "")
        binding.connect.setOnClickListener { connect() }
    }

    private fun connect() {
        /*
         * Candidates rather than one address: somebody who types a hostname
         * with no scheme has not said whether it is https, and the app should
         * find out rather than assume. It used to assume http, which is the
         * wrong half of the guess for anything hosted.
         */
        val candidates = ServerAddress.candidates(binding.address.text?.toString().orEmpty())
        if (candidates.isEmpty()) {
            showStatus(getString(R.string.setup_bad_address), isError = true)
            return
        }

        setBusy(true)
        showStatus(getString(R.string.setup_checking, candidates.first()), isError = false)

        worker.execute {
            // The first that answers wins. If none does, report what happened
            // to the first one tried, since that is the address they meant.
            val attempts = candidates.map { it to ServerAddress.check(it) }
            val reached = attempts.firstOrNull { it.second is ServerAddress.Check.Reachable }
            // Immutable before crossing to the UI thread: a captured var cannot
            // be smart-cast, and the branches below need the result's own type.
            val (address, result) = reached ?: attempts.first()

            runOnUiThread {
                setBusy(false)
                when (result) {
                    is ServerAddress.Check.Reachable -> {
                        // An address that is neither https nor on a local network
                        // sends a password across the open internet in the clear.
                        // Their server, their call — but not without being told.
                        if (!ServerAddress.isPrivateOrSecure(address) && acknowledgedInsecure != address) {
                            acknowledgedInsecure = address
                            binding.connect.setText(R.string.setup_connect_anyway)
                            showStatus(getString(R.string.setup_insecure), isError = true)
                            return@runOnUiThread
                        }
                        ServerAddress.store(this, address)
                        startActivity(Intent(this, MainActivity::class.java))
                        finish()
                    }
                    // Both name the address that was actually tried. Without
                    // it, "nothing answered" is unactionable: it could be the
                    // wrong host, the wrong port, or a scheme nobody chose.
                    is ServerAddress.Check.NotPluralNova ->
                        showStatus(getString(R.string.setup_not_pluralnova, address, result.detail), isError = true)
                    is ServerAddress.Check.Unreachable ->
                        showStatus(getString(R.string.setup_unreachable, address, result.detail), isError = true)
                }
            }
        }
    }

    private fun setBusy(busy: Boolean) {
        binding.connect.isEnabled = !busy
        binding.address.isEnabled = !busy
    }

    private fun showStatus(message: String, isError: Boolean) {
        binding.status.visibility = View.VISIBLE
        binding.status.text = message
        binding.status.setTextColor(getColor(if (isError) R.color.app_critical else R.color.app_text_muted))
    }

    override fun onDestroy() {
        worker.shutdownNow()
        super.onDestroy()
    }
}
