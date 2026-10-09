import 'package:flutter/services.dart' show appFlavor;
import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'env/env.dart';

part 'app_config.g.dart';

/// Keep-alive config provider; picks the env from the build flavor (mirrors hedged).
@Riverpod(keepAlive: true)
AppConfig appConfig(Ref ref) => AppConfig();

class AppConfig {
  AppConfig() {
    init();
  }

  late AppEnv env;

  void init() => env = switch (appFlavor) {
        'production' => ProductionEnv(),
        _ => StagingEnv(),
      };
}
