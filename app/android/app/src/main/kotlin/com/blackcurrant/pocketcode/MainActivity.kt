package com.blackcurrant.pocketcode

import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// FlutterFragmentActivity (not FlutterActivity) is required by local_auth so the
// biometric / device-credential prompt can attach to the activity (S3-07).
class MainActivity : FlutterFragmentActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // S5-15: let the run screen send PocketCode to the background so the app running on the
        // phone comes forward ("switch to app"). Android has no public API to force split-screen,
        // so backgrounding is the closest programmatic action.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "pocketcode/app")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "moveToBack" -> {
                        moveTaskToBack(true)
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
