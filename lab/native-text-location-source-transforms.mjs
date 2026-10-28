import { withNativeReaderSelectionSourceTransforms } from './native-reader-selection-source-transform.mjs';
import { withNativeTextLocationPersistenceSourceTransforms } from './native-text-location-persistence-source-transform.mjs';
import { withNativeReferenceLocationTransforms } from './native-reference-location-source-transform.mjs';

/** Extend the same original reading/transfer/reference owners, after the
 * existing shell, continuation and draft adapters have been applied. */
export function withNativeTextLocationSourceTransforms(existing = {}) {
  return withNativeReferenceLocationTransforms(withNativeTextLocationPersistenceSourceTransforms(
    withNativeReaderSelectionSourceTransforms(existing)));
}
