"""Exact portable Windows source inventory; no native imports or model runs.

Explicit separate lanes retained, not skipped or silently discarded:
- test_preprocess_worker.py: 8 actual Linux cv2 tests.
- test_ocr_evaluation_worker.py: 18 Linux framing/admission/probe tests and
  one separately opted-in NumPy color proof; not a Windows WinAPI proof.
Windows worker's fake-API tests do not replace actual native qualification.
"""
import pathlib
import sys
import unittest

FILES = (
    'test_checkout_bytes.py',
    'test_derived_notice_evidence.py',
    'test_derived_pair_build.py',
    'test_derived_pair_retention.py',
    'test_fetch_platform_tools.py',
    'test_ocr_evaluation_metrics.py',
    'test_ocr_windows_worker.py',
    'test_platform_tools_archive.py',
    'test_validate_demo.py',
    'test_validate_derived_pair_build.py',
    'test_validate_fleet_ui.py',
    'test_validate_hosted.py',
    'test_validate_main_runtime_version.py',
    'test_validate_package.py',
    'test_validate_package_runtime_version.py',
    'test_validate_persistence.py',
    'test_validate_persistence_launcher.py',
    'test_validate_persistence_maintenance.py',
    'test_validate_persistence_matrix.py',
    'test_validate_persistence_restore.py',
    'test_validate_persistence_store.py',
    'test_validate_platform_tools.py',
    'test_validate_platform_tools_server.py',
    'test_validate_recipient_setup.py',
    'test_validate_retained_host.py',
    'test_validate_retained_pair_evidence.py',
    'test_validate_retained_rollback.py',
    'test_validate_runtime.py',
    'test_validate_settings.py',
    'test_validate_ui.py',
    'test_validate_vault.py',
    'test_validate_vault_matrix.py',
    'test_windows_vision_catalog.py',
    'test_windows_vision_host.py',
    'test_windows_vision_materialize.py',
    'test_windows_vision_prepare.py',
)
SEPARATE = ('test_ocr_evaluation_worker.py', 'test_preprocess_worker.py')
EXPECTED_CASES = 499


def main():
    if len(sys.argv) != 1:
        print('VISION_SOURCE_ARGUMENTS_REFUSED')
        return 2
    root = pathlib.Path(__file__).resolve().parent
    found = tuple(sorted(p.name for p in root.glob('test_*.py')))
    if found != tuple(sorted(FILES + SEPARATE)):
        print('VISION_SOURCE_INVENTORY_FAILED')
        return 1
    sys.path.insert(0, str(root))
    loader = unittest.TestLoader()
    suite = unittest.TestSuite(loader.loadTestsFromName(name[:-3]) for name in FILES)
    if loader.errors or suite.countTestCases() != EXPECTED_CASES:
        print('VISION_SOURCE_COUNT_FAILED')
        return 1
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    passed = result.wasSuccessful() and not result.skipped and result.testsRun == EXPECTED_CASES
    print('VISION_PORTABLE_SOURCE_499_PASS' if passed else 'VISION_PORTABLE_SOURCE_FAILED')
    return 0 if passed else 1


if __name__ == '__main__':
    sys.exit(main())
