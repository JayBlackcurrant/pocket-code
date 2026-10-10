import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../home/ui/home_page.dart';
import '../pairing/ui/pairing_page.dart';
import '../review/ui/diff_file_page.dart';
import '../review/ui/review_page.dart';
import '../tasks/ui/new_task_page.dart';
import '../tasks/ui/task_page.dart';
import 'guards/pairing_guard.dart';

part 'app_router.gr.dart';
part 'app_router.g.dart';

/// Router exposed as a keepAlive provider so guards can inject `Ref`
/// (mirrors hedged's appRouter provider + @AutoRouterConfig).
@Riverpod(keepAlive: true)
Raw<AppRouter> appRouter(Ref ref) => AppRouter(ref);

@AutoRouterConfig(replaceInRouteName: 'Page,Route')
class AppRouter extends RootStackRouter {
  AppRouter(this._ref);

  final Ref _ref;

  @override
  RouteType get defaultRouteType => const RouteType.cupertino();

  @override
  List<AutoRoute> get routes => [
        AutoRoute(
          page: HomeRoute.page,
          path: '/',
          initial: true,
          guards: [PairingGuard(_ref)],
        ),
        AutoRoute(
          page: NewTaskRoute.page,
          path: '/new-task',
          guards: [PairingGuard(_ref)],
        ),
        AutoRoute(
          page: TaskRoute.page,
          path: '/tasks/:taskId',
          guards: [PairingGuard(_ref)],
        ),
        AutoRoute(
          page: ReviewRoute.page,
          path: '/tasks/:taskId/review',
          guards: [PairingGuard(_ref)],
        ),
        AutoRoute(
          page: DiffFileRoute.page,
          path: '/tasks/:taskId/review/file',
          guards: [PairingGuard(_ref)],
        ),
        AutoRoute(page: PairingRoute.page, path: '/pair'),
      ];
}
