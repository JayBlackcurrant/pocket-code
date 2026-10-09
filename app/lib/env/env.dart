/// Build-time environment, selected by `appFlavor` (mirrors hedged-core-app's env/).
/// Note: unlike hedged, the daemon base URL is NOT here — it is obtained at runtime
/// from the paired connection (the scanned QR). This only holds static app config.
abstract class AppEnv {
  String get appName;
  String get flavor;
}

class StagingEnv implements AppEnv {
  @override
  String get appName => 'PocketCode (Staging)';

  @override
  String get flavor => 'staging';
}

class ProductionEnv implements AppEnv {
  @override
  String get appName => 'PocketCode';

  @override
  String get flavor => 'production';
}
