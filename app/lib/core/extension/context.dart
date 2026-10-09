import 'package:flutter/material.dart';

import '../../src/theme/app_color.dart';
import '../../src/theme/app_text_theme.dart';

/// Theme access via context (mirrors hedged's context.colors / context.text).
/// Widgets use these instead of Theme.of(context) directly.
extension ContextExt on BuildContext {
  ThemeData get theme => Theme.of(this);
  TextTheme get textTheme => Theme.of(this).textTheme;
  bool get isDark => Theme.of(this).brightness == Brightness.dark;

  BaseColorExtension get colors =>
      Theme.of(this).extension<BaseColorExtension>() ?? const AppLightColor();

  AppTypographyExtension get text =>
      Theme.of(this).extension<AppTypographyExtension>() ??
      AppTypographyExtension(colors: colors);
}
