import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_color.dart';
import 'app_text_theme.dart';

/// Builds light/dark ThemeData and registers the color + typography extensions
/// (mirrors hedged's AppTheme).
class AppTheme {
  AppTheme(this.context);

  final BuildContext context;

  ThemeData get light => _build(const AppLightColor(), Brightness.light);
  ThemeData get dark => _build(const AppDarkColor(), Brightness.dark);

  ThemeData _build(BaseColorExtension colors, Brightness brightness) {
    final base = ThemeData(brightness: brightness);
    return base.copyWith(
      scaffoldBackgroundColor: colors.background,
      colorScheme: ColorScheme.fromSeed(
        seedColor: colors.primary,
        brightness: brightness,
      ),
      textTheme: GoogleFonts.poppinsTextTheme(base.textTheme),
      extensions: <ThemeExtension<dynamic>>[
        colors,
        AppTypographyExtension(colors: colors),
      ],
    );
  }
}
