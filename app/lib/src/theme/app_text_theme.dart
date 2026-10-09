import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_color.dart';

/// Named typography tokens as a ThemeExtension (mirrors hedged's AppTypographyExtension).
/// Access via `context.text.semibold16` etc.
class AppTypographyExtension extends ThemeExtension<AppTypographyExtension> {
  AppTypographyExtension({required this.colors});

  final BaseColorExtension colors;

  TextStyle get regular12 => GoogleFonts.poppins(
      fontSize: 12, fontWeight: FontWeight.w400, color: colors.onSurface);
  TextStyle get regular14 => GoogleFonts.poppins(
      fontSize: 14, fontWeight: FontWeight.w400, color: colors.onSurface);
  TextStyle get medium14 => GoogleFonts.poppins(
      fontSize: 14, fontWeight: FontWeight.w500, color: colors.onSurface);
  TextStyle get semibold16 => GoogleFonts.poppins(
      fontSize: 16, fontWeight: FontWeight.w600, color: colors.onSurface);
  TextStyle get bold20 => GoogleFonts.poppins(
      fontSize: 20, fontWeight: FontWeight.w700, color: colors.onSurface);

  @override
  AppTypographyExtension copyWith({BaseColorExtension? colors}) =>
      AppTypographyExtension(colors: colors ?? this.colors);

  @override
  AppTypographyExtension lerp(
          ThemeExtension<AppTypographyExtension>? other, double t) =>
      this;
}
