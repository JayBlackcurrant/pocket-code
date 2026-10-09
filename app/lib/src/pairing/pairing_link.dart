import '../../core/error/app_exception.dart';

/// Parsed `pocketcode://pair?url=<daemon>&code=<code>` payload from the Mac's QR.
class PairingLink {
  const PairingLink(this.url, this.code);
  final String url;
  final String code;
}

/// Parse and validate a scanned/pasted pairing payload. Pure + testable.
PairingLink parsePairingPayload(String payload) {
  final uri = Uri.tryParse(payload.trim());
  if (uri == null || uri.scheme != 'pocketcode') {
    throw AppException(ErrorType.other, 'Not a PocketCode pairing code');
  }
  final url = uri.queryParameters['url'];
  final code = uri.queryParameters['code'];
  if (url == null || url.isEmpty || code == null || code.isEmpty) {
    throw AppException(ErrorType.other, 'Pairing code is missing data');
  }
  return PairingLink(url, code);
}
