/** The upstream SiriWave curve needs only a drawing controller, not another animation loop. */
export interface ICurve { draw(): unknown }
export interface IiOS9CurveDefinition { color: string; supportLine?: boolean }
export default interface SiriWave {
  ctx: CanvasRenderingContext2D;
  width: number;
  heightMax: number;
  amplitude: number;
  speed: number;
  opt: {
    pixelDepth: number;
    globalCompositeOperation: GlobalCompositeOperation;
    ranges?: {
      noOfCurves?: [number, number];
      amplitude?: [number, number];
      offset?: [number, number];
      width?: [number, number];
      speed?: [number, number];
      despawnTimeout?: [number, number];
    }
  };
}
