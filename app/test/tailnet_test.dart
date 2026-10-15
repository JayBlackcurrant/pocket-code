import 'package:flutter_test/flutter_test.dart';
import 'package:pocketcode/src/run/tailnet.dart';

void main() {
  group('isTailnetIpv4', () {
    test('accepts addresses in 100.64.0.0/10', () {
      expect(isTailnetIpv4('100.64.0.1'), true);
      expect(isTailnetIpv4('100.100.50.3'), true);
      expect(isTailnetIpv4('100.127.255.254'), true);
    });

    test('rejects addresses outside the range', () {
      expect(isTailnetIpv4('100.63.0.1'), false); // below .64
      expect(isTailnetIpv4('100.128.0.1'), false); // above .127
      expect(isTailnetIpv4('192.168.1.5'), false);
      expect(isTailnetIpv4('10.0.0.1'), false);
    });

    test('rejects malformed input', () {
      expect(isTailnetIpv4('100.64.0'), false);
      expect(isTailnetIpv4('not.an.ip.addr'), false);
      expect(isTailnetIpv4('100.64.0.999'), false);
      expect(isTailnetIpv4(''), false);
    });
  });
}
