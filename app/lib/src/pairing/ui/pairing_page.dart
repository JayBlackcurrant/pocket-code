import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../core/extension/context.dart';
import '../../routes/app_router.dart';
import '../providers/pairing_controller.dart';

/// QR-scan pairing screen. Scan the QR printed by `npm run pair` on the Mac, or
/// paste the pairing link manually (useful on a simulator without a camera).
@RoutePage()
class PairingPage extends ConsumerStatefulWidget {
  const PairingPage({super.key});

  @override
  ConsumerState<PairingPage> createState() => _PairingPageState();
}

class _PairingPageState extends ConsumerState<PairingPage> {
  final MobileScannerController _scanner = MobileScannerController();
  final TextEditingController _linkCtrl = TextEditingController();
  bool _manual = false;
  bool _handling = false;

  @override
  void dispose() {
    _scanner.dispose();
    _linkCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit(String payload) async {
    if (_handling || payload.trim().isEmpty) return;
    setState(() => _handling = true);
    final ok = await ref
        .read(pairingControllerProvider.notifier)
        .pairFromPayload(payload);
    if (!mounted) return;
    if (ok) {
      await context.router.replaceAll([const HomeRoute()]);
    } else {
      setState(() => _handling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(pairingControllerProvider);
    ref.listen(pairingControllerProvider, (_, next) {
      if (next.hasError && mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('${next.error}')));
      }
    });
    final busy = state.isLoading || _handling;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pair with your Mac'),
        actions: [
          IconButton(
            onPressed: () => setState(() => _manual = !_manual),
            icon: Icon(_manual ? Icons.qr_code_scanner : Icons.keyboard),
            tooltip: _manual ? 'Scan QR' : 'Paste link',
          ),
        ],
      ),
      body: _manual ? _manualEntry(context, busy) : _scannerView(context, busy),
    );
  }

  Widget _scannerView(BuildContext context, bool busy) {
    return Stack(
      children: [
        MobileScanner(
          controller: _scanner,
          onDetect: (capture) {
            if (_handling) return;
            final codes = capture.barcodes;
            final raw = codes.isNotEmpty ? codes.first.rawValue : null;
            if (raw != null) _submit(raw);
          },
        ),
        Align(
          alignment: Alignment.bottomCenter,
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Run `npm run pair` on the Mac and scan the QR code.',
              textAlign: TextAlign.center,
              style: context.text.regular14.copyWith(color: Colors.white),
            ),
          ),
        ),
        if (busy)
          const ColoredBox(
            color: Colors.black45,
            child: Center(child: CircularProgressIndicator()),
          ),
      ],
    );
  }

  Widget _manualEntry(BuildContext context, bool busy) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 24),
          Text('Paste the pairing link', style: context.text.semibold16),
          const SizedBox(height: 12),
          TextField(
            controller: _linkCtrl,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              hintText: 'pocketcode://pair?url=...&code=...',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: busy ? null : () => _submit(_linkCtrl.text),
            child: busy
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Pair'),
          ),
        ],
      ),
    );
  }
}
