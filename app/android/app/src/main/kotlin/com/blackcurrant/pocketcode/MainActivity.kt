package com.blackcurrant.pocketcode

import io.flutter.embedding.android.FlutterFragmentActivity

// FlutterFragmentActivity (not FlutterActivity) is required by local_auth so the
// biometric / device-credential prompt can attach to the activity (S3-07).
class MainActivity : FlutterFragmentActivity()
