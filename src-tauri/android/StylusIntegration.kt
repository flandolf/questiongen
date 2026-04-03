package com.questiongen.stylus

// Concrete OnePlus-friendly stylus double-tap detector.
//
// This file contains:
// - `StylusIntegration` which loads the native Rust library and exposes
//   `stylusDoubleTap()` as an external call.
// - `StylusTapDetector` a small helper you can instantiate with any View to
//   detect quick double-taps from a stylus (two ACTION_DOWNs within a short
//   timeframe and small movement). This heuristic works on many devices and is
//   a practical fallback for OEMs that don't expose an explicit API.

object StylusIntegration {
    init {
        // Matches the Rust crate name `questiongen_lib` from Cargo.toml
        System.loadLibrary("questiongen_lib")
    }

    // Native function implemented by the Rust library (see src-tauri/src/lib.rs)
    external fun stylusDoubleTap()
}

import android.os.SystemClock
import android.view.MotionEvent
import android.view.View

/**
 * Attach this detector to any root View (for example `window.decorView`) to
 * detect stylus double-taps. It uses a simple timing + distance heuristic:
 * two ACTION_DOWN events from a stylus within `doubleTapMaxDelay` ms and
 * within `maxDistance` pixels are treated as a double-tap.
 *
 * On detection it calls `StylusIntegration.stylusDoubleTap()` which in turn
 * triggers the Rust/Tauri event emitter.
 *
 * Note: OEMs like OnePlus sometimes provide vendor-specific APIs or broadcast
 * intents for accessory gestures — if you have access to such docs, prefer
 * using those. This heuristic is a robust fallback.
 */
class StylusTapDetector(rootView: View) {
    private var lastTapTime = 0L
    private var lastX = 0f
    private var lastY = 0f
    private val doubleTapMaxDelay = 350L
    private val maxDistance = 60f // pixels

    init {
        rootView.setOnTouchListener { _, event ->
            try {
                // Only consider stylus tool events
                if (event.getToolType(0) == MotionEvent.TOOL_TYPE_STYLUS) {
                    when (event.actionMasked) {
                        MotionEvent.ACTION_DOWN -> {
                            val now = SystemClock.uptimeMillis()
                            val dx = event.x - lastX
                            val dy = event.y - lastY
                            val distSq = dx * dx + dy * dy
                            if (now - lastTapTime in 1..doubleTapMaxDelay && distSq <= maxDistance * maxDistance) {
                                // Detected stylus double-tap
                                try {
                                    StylusIntegration.stylusDoubleTap()
                                } catch (e: UnsatisfiedLinkError) {
                                    // Native lib not available in dev browser — ignore
                                }
                                lastTapTime = 0L
                                lastX = 0f
                                lastY = 0f
                                return@setOnTouchListener true
                            } else {
                                lastTapTime = now
                                lastX = event.x
                                lastY = event.y
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                // Be conservative: don't crash due to motion handling
            }
            false
        }
    }
}

// Usage example (in an Activity):
//
// override fun onCreate(savedInstanceState: Bundle?) {
//   super.onCreate(savedInstanceState)
//   // attach to decorView so gestures anywhere are captured
//   StylusTapDetector(window.decorView)
// }

// If you have OnePlus-specific APIs for pen gestures, integrate them here and
// call `StylusIntegration.stylusDoubleTap()` directly when the vendor event
// indicates a double-tap.
