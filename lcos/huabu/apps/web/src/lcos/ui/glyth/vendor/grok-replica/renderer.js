import install_geometry from './geometry.js';
import install_math from './math.js';
import install_tables from './tables.js';
import install_pose from './pose.js';
import install_tricks from './tricks.js';
import install_eyes from './eyes.js';
import install_fx from './fx.js';
import install_character from './character.js';

// Module-private donor namespace. No window globals and no second product state.
const scope = {};
install_geometry(scope);
install_math(scope);
install_tables(scope);
install_pose(scope);
install_tricks(scope);
install_eyes(scope);
install_fx(scope);
install_character(scope);

// Original donor catalogs, also used by the pending-agent appearance picker.
export const GLYTH_SHAPES = Object.freeze(Object.keys(scope.GROK_GEO.shapes));
export const GLYTH_COLORS = Object.freeze(Object.keys(scope.GROK_TABLES.INK));

export function createGlythRenderer(svg, options) {
  return new scope.GrokCharacter(svg, {
    ...options,
    mode: 'controlled',
    shape: options.shape ?? 'blob',
    color: options.color ?? 'black',
    loginWrap: false,
    eyeTopology: false,
    followPointer: false,
    allowSpontaneousTricks: false,
  });
}
