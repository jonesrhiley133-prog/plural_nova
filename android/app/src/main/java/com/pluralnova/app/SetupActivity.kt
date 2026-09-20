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
        val address = ServerAddress.normalise(binding.address.text?.toString().orEmpty())
        if (address == null) {
            showStatus(getString(R.string.setup_bad_address), isError = true)
            return
        }

        setBusy(true)
        showStatus(getString(R.string.setup_checking, address), isError = false)

        worker.execute {
            val result = ServerAddress.check(address)
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
                    is ServerAddress.Check.NotPluralNova ->
                        showStatus(getString(R.string.setup_not_pluralnova, result.detail), isError = true)
                    is ServerAddress.Check.Unreachable ->
                        showStatus(getString(R.string.setup_unreachable, result.detail), isError = true)
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
