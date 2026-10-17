import { transformNativeDensityHook } from './native-density-transform.mjs';
import { transformNativeMindMapContent, transformNativeTextFaces } from './native-outline-transform.mjs';
import { transformNativeTextBody } from './native-text-body-transform.mjs';
import { transformNativeTextFacesPresentation } from './native-text-presentation-transform.mjs';
import { transformNativeProjectTextCreate } from './native-project-text-create-transform.mjs';

/** One live/test composition of precise, in-memory donor caller adaptations. */
export function createNativeTextSourceTransforms() {
  return {
    'lcos/huabu/apps/web/src/lcos/nodes/useLcosDensity.ts': transformNativeDensityHook,
    'lcos/huabu/apps/web/src/lcos/nodes/LcosCanvasTextBody.tsx': transformNativeTextBody,
    'lcos/huabu/apps/web/src/lcos/nodes/text/MindMapEditor.tsx': transformNativeMindMapContent,
    'lcos/huabu/apps/web/src/lcos/nodes/text/LcosTextFaces.tsx': (source, context) =>
      transformNativeProjectTextCreate(
        transformNativeTextFacesPresentation(transformNativeTextFaces(source, context), context), context),
  };
}
