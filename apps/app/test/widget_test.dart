import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novamind_app/main.dart';

void main() {
  testWidgets('App boots and shows loading state', (tester) async {
    await tester.pumpWidget(const NovaMindApp());
    expect(find.byType(MaterialApp), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
