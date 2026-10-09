import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/routes/app_router.dart';
import 'src/theme/app_theme.dart';
import 'src/theme/providers/theme_provider.dart';

/// Root app widget (mirrors hedged's App): wires MaterialApp.router with the
/// keepAlive router provider and the theme-mode provider.
class App extends ConsumerWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    final theme = AppTheme(context);
    final mode = ref.watch(appThemeModeProvider);
    return MaterialApp.router(
      title: 'PocketCode',
      debugShowCheckedModeBanner: false,
      routerConfig: router.config(),
      theme: theme.light,
      darkTheme: theme.dark,
      themeMode: mode,
    );
  }
}
