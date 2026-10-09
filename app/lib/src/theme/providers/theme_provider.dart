import 'package:flutter/material.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/instances/shared_pref.dart';

part 'theme_provider.g.dart';

/// Theme mode, persisted to shared_preferences (mirrors hedged's AppThemeMode,
/// which defaults to dark).
@Riverpod(keepAlive: true)
class AppThemeMode extends _$AppThemeMode {
  static const _key = 'theme_mode';

  @override
  ThemeMode build() {
    _restore();
    return ThemeMode.dark;
  }

  Future<void> _restore() async {
    final prefs = await ref.read(sharedPrefProvider.future);
    state = switch (prefs.getString(_key)) {
      'light' => ThemeMode.light,
      'system' => ThemeMode.system,
      _ => ThemeMode.dark,
    };
  }

  Future<void> set(ThemeMode mode) async {
    state = mode;
    final prefs = await ref.read(sharedPrefProvider.future);
    await prefs.setString(_key, mode.name);
  }
}
