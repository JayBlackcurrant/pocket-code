import 'dart:io';

/// True if [ip] is an IPv4 address in Tailscale's range (100.64.0.0/10, the CGNAT block
/// Tailscale assigns). Pure + testable.
bool isTailnetIpv4(String ip) {
  final parts = ip.split('.');
  if (parts.length != 4) return false;
  final octets = <int>[];
  for (final p in parts) {
    final n = int.tryParse(p);
    if (n == null || n < 0 || n > 255) return false;
    octets.add(n);
  }
  return octets[0] == 100 && octets[1] >= 64 && octets[1] <= 127;
}

/// Best-effort: the phone's own Tailscale IP, by scanning local interfaces for a 100.64/10
/// address. Returns null if none is found (e.g. Tailscale off, or the OS hides the interface —
/// the UI then falls back to manual host entry).
Future<String?> detectTailnetHost() async {
  try {
    final ifaces = await NetworkInterface.list(
      type: InternetAddressType.IPv4,
      includeLoopback: false,
    );
    for (final iface in ifaces) {
      for (final addr in iface.addresses) {
        if (isTailnetIpv4(addr.address)) return addr.address;
      }
    }
  } catch (_) {
    // Platform restrictions can throw; fall through to manual entry.
  }
  return null;
}
