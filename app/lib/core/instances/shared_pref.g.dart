// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shared_pref.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(sharedPref)
const sharedPrefProvider = SharedPrefProvider._();

final class SharedPrefProvider extends $FunctionalProvider<
        AsyncValue<SharedPreferences>,
        SharedPreferences,
        FutureOr<SharedPreferences>>
    with
        $FutureModifier<SharedPreferences>,
        $FutureProvider<SharedPreferences> {
  const SharedPrefProvider._()
      : super(
          from: null,
          argument: null,
          retry: null,
          name: r'sharedPrefProvider',
          isAutoDispose: false,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$sharedPrefHash();

  @$internal
  @override
  $FutureProviderElement<SharedPreferences> $createElement(
          $ProviderPointer pointer) =>
      $FutureProviderElement(pointer);

  @override
  FutureOr<SharedPreferences> create(Ref ref) {
    return sharedPref(ref);
  }
}

String _$sharedPrefHash() => r'0e456cff28165336f5357af7ed815a19790f88e6';
