import 'package:flutter/services.dart';

const _channel = MethodChannel('pocketcode/app');

/// Send PocketCode to the background so the app running on the phone comes forward (S5-15).
/// The run target is a separate app on the same phone — Android has no public API to force
/// split-screen (that's user-initiated via recents), so backgrounding is the closest "switch to
/// app". Android-only; a no-op (and never throws) elsewhere or if the channel isn't wired.
Future<void> moveAppToBack() async {
  try {
    await _channel.invokeMethod<void>('moveToBack');
  } catch (_) {
    // No native handler (non-Android / tests) — ignore.
  }
}
