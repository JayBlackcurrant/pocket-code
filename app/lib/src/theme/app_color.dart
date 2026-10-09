import 'package:flutter/material.dart';

/// Color tokens delivered as a ThemeExtension (mirrors hedged's BaseColorExtension).
/// Access via `context.colors` rather than hard-coded Colors.
class BaseColorExtension extends ThemeExtension<BaseColorExtension> {
  const BaseColorExtension({
    required this.primary,
    required this.onPrimary,
    required this.background,
    required this.surface,
    required this.onSurface,
    required this.border,
    required this.muted,
    required this.green,
    required this.red,
    required this.accent,
  });

  final Color primary;
  final Color onPrimary;
  final Color background;
  final Color surface;
  final Color onSurface;
  final Color border;
  final Color muted;
  final Color green;
  final Color red;
  final Color accent;

  @override
  BaseColorExtension copyWith({
    Color? primary,
    Color? onPrimary,
    Color? background,
    Color? surface,
    Color? onSurface,
    Color? border,
    Color? muted,
    Color? green,
    Color? red,
    Color? accent,
  }) {
    return BaseColorExtension(
      primary: primary ?? this.primary,
      onPrimary: onPrimary ?? this.onPrimary,
      background: background ?? this.background,
      surface: surface ?? this.surface,
      onSurface: onSurface ?? this.onSurface,
      border: border ?? this.border,
      muted: muted ?? this.muted,
      green: green ?? this.green,
      red: red ?? this.red,
      accent: accent ?? this.accent,
    );
  }

  @override
  BaseColorExtension lerp(ThemeExtension<BaseColorExtension>? other, double t) {
    if (other is! BaseColorExtension) return this;
    return BaseColorExtension(
      primary: Color.lerp(primary, other.primary, t)!,
      onPrimary: Color.lerp(onPrimary, other.onPrimary, t)!,
      background: Color.lerp(background, other.background, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      onSurface: Color.lerp(onSurface, other.onSurface, t)!,
      border: Color.lerp(border, other.border, t)!,
      muted: Color.lerp(muted, other.muted, t)!,
      green: Color.lerp(green, other.green, t)!,
      red: Color.lerp(red, other.red, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
    );
  }
}

class AppLightColor extends BaseColorExtension {
  const AppLightColor()
      : super(
          primary: const Color(0xFF4F46E5),
          onPrimary: Colors.white,
          background: const Color(0xFFF7F7F8),
          surface: Colors.white,
          onSurface: const Color(0xFF1A1A1A),
          border: const Color(0xFFE3E3E8),
          muted: const Color(0xFF6B7280),
          green: const Color(0xFF16A34A),
          red: const Color(0xFFDC2626),
          accent: const Color(0xFF4F46E5),
        );
}

class AppDarkColor extends BaseColorExtension {
  const AppDarkColor()
      : super(
          primary: const Color(0xFF8B87F5),
          onPrimary: const Color(0xFF0B0B0F),
          background: const Color(0xFF0B0B0F),
          surface: const Color(0xFF17171C),
          onSurface: const Color(0xFFECECEC),
          border: const Color(0xFF2A2A31),
          muted: const Color(0xFF9AA0AA),
          green: const Color(0xFF22C55E),
          red: const Color(0xFFEF4444),
          accent: const Color(0xFF8B87F5),
        );
}
