import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/extension/context.dart';
import '../../routes/app_router.dart';
import '../../shared/providers/pairing_provider.dart';
import '../providers/projects_provider.dart';

/// Projects list — the first authenticated screen, proving pairing works.
/// (Task creation / streaming are S1-09 / S1-10.)
@RoutePage()
class HomePage extends ConsumerWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projects = ref.watch(projectsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Projects'),
        actions: [
          IconButton(
            tooltip: 'Unpair',
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await ref.read(pairingProvider.notifier).clear();
              if (context.mounted) {
                await context.router.replaceAll([const PairingRoute()]);
              }
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(projectsProvider),
        child: projects.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text('$e', style: context.text.regular14),
              ),
            ],
          ),
          data: (list) => list.isEmpty
              ? ListView(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'No projects registered on the daemon.',
                        style: context.text.regular14,
                      ),
                    ),
                  ],
                )
              : ListView.separated(
                  itemCount: list.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    final p = list[i];
                    final active = p.status == 'active';
                    return ListTile(
                      title:
                          Text(p.displayName, style: context.text.semibold16),
                      subtitle: Text(
                        '${p.status} · ${p.base}',
                        style: context.text.regular12,
                      ),
                      trailing: Icon(
                        active ? Icons.check_circle : Icons.pause_circle,
                        color: active
                            ? context.colors.green
                            : context.colors.muted,
                      ),
                      enabled: active,
                      onTap: active
                          ? () => context.router.push(
                                NewTaskRoute(
                                  projectId: p.id,
                                  projectName: p.displayName,
                                ),
                              )
                          : null,
                    );
                  },
                ),
        ),
      ),
    );
  }
}
