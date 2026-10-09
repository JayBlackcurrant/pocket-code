import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/providers/pairing_provider.dart';
import '../app_router.dart';

/// Redirects to the pairing screen until the device is paired (mirrors hedged's
/// AuthGuard reading the session before entering authed routes).
class PairingGuard extends AutoRouteGuard {
  PairingGuard(this._ref);

  final Ref _ref;

  @override
  Future<void> onNavigation(
    NavigationResolver resolver,
    StackRouter router,
  ) async {
    final pairing = await _ref.read(pairingProvider.future);
    if (pairing == null) {
      unawaited(resolver.redirectUntil(const PairingRoute()));
    } else {
      resolver.next();
    }
  }
}
