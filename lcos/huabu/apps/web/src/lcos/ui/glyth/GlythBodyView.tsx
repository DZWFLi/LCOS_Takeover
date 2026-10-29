import { useEffect, useId, useRef, useState } from 'react';

import { mountGlythPresence } from './glythPresence';
import { useReducedSpatialMotion } from '../motion/useReducedSpatialMotion';

import type { GlythVisualInput } from './glythPresence';

import './glyth-presence.css';

export interface GlythBodyViewProps {
  readonly appearance?: GlythVisualInput['appearance'];
  readonly pose: GlythVisualInput['pose'];
  readonly userState?: GlythVisualInput['userState'];
  readonly selected?: boolean;
  readonly mark?: boolean;
  readonly paused?: boolean;
  readonly reaction?: GlythVisualInput['reaction'];
  readonly size: number;
  readonly left: number;
  readonly top: number;
}

/** Figma 5388:119 body; the original NodeBody retains all actions, bindings and world geometry. */
export function GlythBodyView(props: GlythBodyViewProps): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const presenceRef = useRef<ReturnType<typeof mountGlythPresence> | null>(null);
  const latest = useRef<GlythVisualInput | null>(null);
  const [hovered, setHovered] = useState(false);
  const reducedMotion = useReducedSpatialMotion();
  const clipId = useId().replace(/[^a-zA-Z0-9_-]/g, '_');
  const input: GlythVisualInput = {
    pose: props.pose,
    ...(props.appearance ? { appearance: props.appearance } : {}),
    ...(props.userState === undefined ? {} : { userState: props.userState }),
    ...(props.reaction === undefined ? {} : { reaction: props.reaction }),
    selected: props.selected === true,
    hovered,
    mark: props.mark === true,
    paused: props.paused === true,
    reducedMotion,
  };
  latest.current = input;
  useEffect(() => {
    if (svgRef.current === null || latest.current === null) return;
    const instance = mountGlythPresence(svgRef.current, latest.current, `lcos-glyth-${clipId}`);
    presenceRef.current = instance;
    return () => { instance.destroy(); presenceRef.current = null; };
  }, [clipId]);
  useEffect(() => { presenceRef.current?.update(input); });
  return (
    <span
      className="lcos-glyth-presence"
      data-glyth-selected={props.selected === true}
      data-glyth-attention={props.userState === 'needs_user'}
      data-glyth-reduced={reducedMotion}
      style={{ width: props.size, height: props.size, left: props.left, top: props.top }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <svg
        ref={svgRef}
        data-lcos-glyth-vector
        data-lcos-glyth-renderer="grok-donor"
        data-figma-node-id="5388:119"
        width={props.size}
        height={props.size}
        viewBox="-15 -15 259 259"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      />
    </span>
  );
}
