/// One device Flutter/adb can see on the phone (from GET /projects/:id/devices, S5-06).
class RunDevice {
  const RunDevice({required this.serial, required this.flutterVisible, this.name});

  /// adb serial, host:port.
  final String serial;
  final String? name;
  final bool flutterVisible;

  factory RunDevice.fromJson(Map<String, dynamic> json) => RunDevice(
        serial: (json['serial'] ?? '') as String,
        name: json['name'] as String?,
        flutterVisible: (json['flutterVisible'] ?? false) as bool,
      );
}

/// Result of the adb connect cascade for a phone host (GET /projects/:id/devices, S5-06).
class DeviceDiscovery {
  const DeviceDiscovery({
    required this.host,
    required this.connected,
    required this.reArmNeeded,
    required this.quality,
    required this.devices,
    this.port,
  });

  final String host;
  final int? port;
  final bool connected;

  /// True when nothing answered — the phone needs re-arming (ColorOS post-reboot case).
  final bool reArmNeeded;

  /// direct | relay | unknown
  final String quality;
  final List<RunDevice> devices;

  RunDevice? get primary => devices.isNotEmpty ? devices.first : null;

  factory DeviceDiscovery.fromJson(Map<String, dynamic> json) => DeviceDiscovery(
        host: (json['host'] ?? '') as String,
        port: json['port'] as int?,
        connected: (json['connected'] ?? false) as bool,
        reArmNeeded: (json['reArmNeeded'] ?? false) as bool,
        quality: (json['quality'] ?? 'unknown') as String,
        devices: ((json['devices'] ?? []) as List)
            .map((e) => RunDevice.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
