package expo.modules.audioroute

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AudioRouteModule : Module() {
  private var receiver: BroadcastReceiver? = null

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context is not available")

  override fun definition() = ModuleDefinition {
    Name("AudioRoute")

    Events("onOutputLost")

    Function("isHeadphonesConnected") {
      headphonesConnected()
    }

    OnStartObserving {
      val r = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, intent: Intent?) {
          if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
            sendEvent("onOutputLost", mapOf("headphones" to false))
          }
        }
      }
      receiver = r
      val filter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        @Suppress("UnspecifiedRegisterReceiverFlag")
        context.registerReceiver(r, filter)
      }
    }

    OnStopObserving {
      receiver?.let {
        try {
          context.unregisterReceiver(it)
        } catch (_: Exception) {
        }
      }
      receiver = null
    }
  }

  private fun headphonesConnected(): Boolean {
    val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val types = mutableSetOf(
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_USB_HEADSET
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      types.add(AudioDeviceInfo.TYPE_BLE_HEADSET)
    }
    return am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { it.type in types }
  }
}
