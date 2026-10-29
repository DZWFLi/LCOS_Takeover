import {
  TAPNOW_PIN_PALETTE,
  TapnowColorDot,
  TapnowColorGroup,
  TapnowPinConfirmationHost,
} from './TapnowPinPresentation';
import { pinMemberImage } from './ColorPinMemberPreview';
import { resolveArtifactUrl } from '@/api/artifact';
import { useAvoidingHudPosition } from '../navigation/useAvoidingHudPosition';
import { useNavigationHudSlot } from '../navigation/NavigationHudSlot';
import { useHudViewport } from '../navigation/useHudViewport';
import {
  colorPinTargetFromEntityRef,
  colorPinTargetKey,
} from '@local-creative-os/web-gen2';
import { useEffect, useMemo, useState } from 'react';

import useCanvasStore from '@/store/canvasStore';

import { useLcosWorksiteNav } from '../app/useLcosWorksiteNav';
import { useLcosReferenceStore } from '../lcosReferenceState';
import {
  readColorPinPaletteV1,
  toneForColorPinV1,
} from './lcosColorPinPalette';
import { useLcosColorPins } from './LcosColorPinProvider';
import { LcosNavigatorIsland } from '../navigation/LcosNavigatorIsland';
import {
  LCOS_SURFACE_MARKER_REASON_TEXT,
  resolveSurfaceMarkerTargetV1,
} from '../navigation/lcosSurfaceMarkerTarget';
import { waitForProjectedEntity } from '../navigation/waitForProjectedEntity';
import { lcosHudEdgeOffsets } from '../shell/lcosHudPlacement';
import {
  useLcosShellStore,
  type LcosSurfaceKey,
} from '../shell/lcosShellStore';
import { lcosGlassStyle, lcosTokens } from '../ui/lcosTokens';

import type { LcosNavigatorPin } from '../ui/families';
import type { ColorPinMembershipV0 } from '@local-creative-os/contracts';

export interface ColorPinHudProps {
  readonly projectId: string;
  readonly canvasBySurface: Readonly<Partial<Record<LcosSurfaceKey, string>>>;
  readonly surfaceByWorkspace: Readonly<Map<string, LcosSurfaceKey>>;
  readonly ensureCanvas: (
    surface: LcosSurfaceKey,
    force?: boolean,
  ) => Promise<string | undefined>;
  readonly ensureWorkspaceCanvas: (
    workspaceId: string,
  ) => Promise<string | undefined>;
  readonly childWorkspaceId?: string;
}

export function ColorPinHud(props: ColorPinHudProps): React.JSX.Element {
  const slot = useNavigationHudSlot();
  const pinsProjection = useLcosColorPins();
  const nodes = useCanvasStore((state) => state.nodes);
  const canvasId = useCanvasStore((state) => state.canvasId);
  const refs = useLcosReferenceStore((state) => state.nodeEntityRefs);
  const viewport = useHudViewport();
  const activeSurface = useLcosShellStore((state) => state.activeSurface);
  const windowEnvironment = useLcosShellStore(
    (state) => state.windowEnvironment,
  );
  const requestLocate = useLcosShellStore((state) => state.requestLocate);
  const requestFocusWhere = useLcosShellStore(
    (state) => state.requestFocusWhere,
  );
  const openWindow = useLcosShellStore((state) => state.openWindow);
  const { switchWorksite } = useLcosWorksiteNav({
    projectId: props.projectId,
    canvasBySurface: props.canvasBySurface,
    ensureCanvas: props.ensureCanvas,
  });
  const [palette, setPalette] = useState(() => readColorPinPaletteV1());
  const [openPinId, setOpenPinId] = useState<string | undefined>(undefined);
  const [travelMessage, setTravelMessage] = useState<string | undefined>(
    undefined,
  );
  const [travelling, setTravelling] = useState(false);

  useEffect(() => {
    setPalette(readColorPinPaletteV1());
  }, []);
  useEffect(() => {
    setOpenPinId(undefined);
    setTravelMessage(undefined);
  }, [props.projectId]);
  useEffect(() => {
    const close = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.key !== 'Escape' ||
        slot.active !== 'pin'
      )
        return;
      if (document.querySelector('[data-lcos-pin-overflow]')) return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          '[data-slot="dropdown-menu-content"],[role="dialog"]',
        )
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      slot.close('pin');
      setOpenPinId(undefined);
      setTravelMessage(undefined);
      pinsProjection.closeAuthoring();
    };
    window.addEventListener('keydown', close, true);
    return () => window.removeEventListener('keydown', close, true);
  }, [pinsProjection, slot.active, slot.close]);

  useEffect(() => {
    if (pinsProjection.authoringTarget !== undefined) slot.activate('pin');
  }, [pinsProjection.authoringTarget, slot.activate]);
  useEffect(() => {
    if (slot.active !== 'pin') {
      setOpenPinId(undefined);
      setTravelMessage(undefined);
      pinsProjection.closeAuthoring();
    }
  }, [slot.active, pinsProjection.closeAuthoring]);
  useEffect(() => {
    pinsProjection.setActiveDefinition?.(
      slot.active === 'pin' ? openPinId : undefined,
    );
  }, [slot.active, openPinId, pinsProjection.setActiveDefinition]);

  const definitionsById = useMemo(
    () =>
      new Map(
        pinsProjection.snapshot.definitions.map((definition) => [
          definition.id,
          definition,
        ]),
      ),
    [pinsProjection.snapshot.definitions],
  );
  const navigatorPins: readonly LcosNavigatorPin[] = useMemo(
    () =>
      pinsProjection.usedDefinitions.map((definition) => ({
        id: definition.id,
        tone:
          palette === undefined
            ? 'violet'
            : toneForColorPinV1(definition.color, palette),
        label: definition.label ?? `颜色组 ${definition.color}`,
        color: definition.color,
        count:
          pinsProjection.membershipsByColorPinId.get(definition.id)?.length ??
          0,
      })),
    [
      palette,
      pinsProjection.membershipsByColorPinId,
      pinsProjection.usedDefinitions,
    ],
  );

  const surfaceTarget =
    pinsProjection.projectTruth === undefined
      ? undefined
      : resolveSurfaceMarkerTargetV1({
          projectId: props.projectId,
          surface: activeSurface,
          childWorkspaceId: props.childWorkspaceId,
          scopes: pinsProjection.projectTruth.scopes,
          workspaces: pinsProjection.projectTruth.workspaces,
        });

  const openCurrentTarget = (): void => {
    slot.activate('pin');
    setOpenPinId(undefined);
    setTravelMessage(undefined);
    const selectedNodeId = useCanvasStore
      .getState()
      .nodes.find((node) => node.selected)?.id;
    const ref =
      selectedNodeId === undefined
        ? undefined
        : useLcosReferenceStore.getState().nodeEntityRefs.get(selectedNodeId);
    if (ref !== undefined) {
      pinsProjection.openAuthoring({
        targetRef: colorPinTargetFromEntityRef(props.projectId, ref),
        label: ref.descriptor?.title ?? ref.entityId,
      });
      return;
    }
    if (surfaceTarget?.status === 'resolved') {
      pinsProjection.openAuthoring({
        targetRef: surfaceTarget.targetRef,
        label: '当前现场',
      });
      return;
    }
    setTravelMessage(
      surfaceTarget?.status === 'unresolved'
        ? LCOS_SURFACE_MARKER_REASON_TEXT[surfaceTarget.reason]
        : '正在读取项目真值…',
    );
  };

  const currentMemberships =
    pinsProjection.authoringTarget === undefined
      ? []
      : (pinsProjection.membershipsByTargetKey.get(
          colorPinTargetKey(pinsProjection.authoringTarget.targetRef),
        ) ?? []);
  const assignedColors = new Set(
    currentMemberships
      .map((membership) =>
        definitionsById.get(membership.colorPinId)?.color.toUpperCase(),
      )
      .filter((color): color is string => color !== undefined),
  );

  const travelToMembership = async (
    membership: ColorPinMembershipV0,
  ): Promise<void> => {
    const identity = pinsProjection.targetIdentity(membership.targetRef);
    if (membership.targetRef.kind === 'entity' && identity !== undefined) {
      requestFocusWhere({
        reqId: crypto.randomUUID(),
        entityType: identity.entityType,
        entityId: identity.entityId,
        title: identity.label,
      });
      setOpenPinId(undefined);
      return;
    }
    setTravelling(true);
    setTravelMessage(undefined);
    try {
      const resolution = await pinsProjection.resolveNavigationTarget(
        membership.targetRef,
      );
      if (resolution.status === 'unresolved') {
        setTravelMessage(`无法前往：目标已失效（${resolution.reason}）`);
        return;
      }
      const { surfaceKind, surfaceRef } = resolution.target;
      let surface: LcosSurfaceKey | undefined;
      let canvasId: string | undefined;
      if (
        !surfaceRef.startsWith('workspace:') &&
        (surfaceKind === 'main' ||
          surfaceKind === 'context' ||
          surfaceKind === 'workflow')
      ) {
        surface = surfaceKind;
        if (!(await switchWorksite(surface)))
          throw new Error('未能进入目标现场，请重试');
        canvasId = useCanvasStore.getState().canvasId ?? undefined;
      } else if (surfaceRef.startsWith('workspace:')) {
        const workspaceId = surfaceRef.slice('workspace:'.length);
        canvasId = await props.ensureWorkspaceCanvas(workspaceId);
        if (canvasId === undefined) throw new Error('目标现场还没有可用画布');
        surface = props.surfaceByWorkspace.get(workspaceId);
        if (surface === undefined) throw new Error('目标现场尚未绑定可用视图');
        if (!(await switchWorksite(surface, { canvasId, workspaceId })))
          throw new Error('未能读取目标现场，请重试');
      } else if (
        surfaceKind === 'conversation' &&
        surfaceRef.startsWith('conversation:')
      ) {
        const conversationId = surfaceRef.slice('conversation:'.length);
        openWindow('conversation', '会话', conversationId);
        setOpenPinId(undefined);
        return;
      } else {
        setTravelMessage('该颜色组目标暂不支持前往');
        return;
      }
      if (
        membership.targetRef.kind === 'view' &&
        identity !== undefined &&
        canvasId !== undefined &&
        surface !== undefined
      ) {
        const nodeId = await waitForProjectedEntity({
          projectId: props.projectId,
          canvasId,
          entityType: identity.entityType,
          entityId: identity.entityId,
        });
        if (nodeId === undefined) {
          setTravelMessage('已进入目标现场，但对象投影尚未就绪');
          return;
        }
        requestLocate({
          reqId: crypto.randomUUID(),
          surface,
          canvasId,
          nodeId,
          status: 'projected',
          preserveSelection: true,
        });
      }
      setOpenPinId(undefined);
    } catch (error) {
      setTravelMessage(
        error instanceof Error ? error.message : '前往失败，请重试',
      );
    } finally {
      setTravelling(false);
    }
  };

  const offsets = lcosHudEdgeOffsets(windowEnvironment ?? null, viewport);
  const left = (offsets.left + (viewport.width - offsets.right)) / 2;
  const placement = useAvoidingHudPosition(
    {
      x: left,
      y: offsets.top + 56,
      width: pinsProjection.authoringTarget ? 196 : 340,
      height: pinsProjection.authoringTarget ? 48 : 160,
    },
    { x: 'center' },
    '[data-lcos-shell-project-cluster],[data-lcos-navigator-island]',
  );

  return (
    <>
      <TapnowPinConfirmationHost />
      <LcosNavigatorIsland
        projectId={props.projectId}
        canvasBySurface={props.canvasBySurface}
        surfaceByWorkspace={props.surfaceByWorkspace}
        ensureCanvas={props.ensureCanvas}
        pins={navigatorPins}
        pinRenderer={(pin) => {
          const members =
            pinsProjection.membershipsByColorPinId.get(pin.id) ?? [];
          return (
            <TapnowColorGroup
              id={pin.id}
              color={pin.color ?? ''}
              label={pin.label}
              members={members.map((member) => {
                const identity = pinsProjection.targetIdentity(
                  member.targetRef,
                );
                const image = pinMemberImage(
                  member.targetRef,
                  identity,
                  nodes,
                  refs,
                );
                return {
                  id: member.id,
                  label: identity?.label ?? member.targetRef.id,
                  kind: identity?.entityType === 'scope' ? 'world' : 'text',
                  thumbnail: image
                    ? resolveArtifactUrl(image, canvasId ?? undefined)
                    : undefined,
                };
              })}
              open={slot.active === 'pin' && openPinId === pin.id}
              onOpenChange={(open) => {
                if (open) {
                  slot.activate('pin');
                  pinsProjection.closeAuthoring();
                  setOpenPinId(pin.id);
                } else {
                  setOpenPinId(undefined);
                }
              }}
              onLocate={(id) => {
                if (travelling) return;
                const member = members.find((item) => item.id === id);
                if (member) void travelToMembership(member);
              }}
              onRemove={(id) => {
                if (!pinsProjection.busy)
                  void pinsProjection.removeMembership(id).catch(() => {});
              }}
              onRemoveAll={() => {
                void (async () => {
                  for (const member of members)
                    await pinsProjection.removeMembership(member.id);
                })().catch(() => {});
              }}
            />
          );
        }}
        onActivatePin={(pin) => {
          slot.activate('pin');
          pinsProjection.closeAuthoring();
          setTravelMessage(undefined);
          setOpenPinId((current) => (current === pin.id ? undefined : pin.id));
        }}
        onCreatePin={openCurrentTarget}
        createPinDisabled={
          pinsProjection.busy || pinsProjection.status === 'loading'
        }
      />

      {slot.active === 'pin' &&
        (pinsProjection.authoringTarget !== undefined ||
          travelMessage !== undefined ||
          pinsProjection.message !== undefined) && (
          <div
            ref={placement.ref}
            data-lcos-color-pin-hud
            className="pointer-events-auto fixed z-40"
            style={{
              top: placement.rect.y,
              left: placement.rect.x,
              maxWidth: '90vw',
            }}
          >
            {pinsProjection.authoringTarget !== undefined && (
              <div
                data-lcos-color-pin-palette
                data-lcos-color-pin-target={
                  pinsProjection.authoringTarget.targetRef.id
                }
                data-lcos-color-pin-target-kind={
                  pinsProjection.authoringTarget.targetRef.kind
                }
                className="p-2"
                aria-label={`为「${pinsProjection.authoringTarget.label}」选择颜色组`}
                style={lcosGlassStyle}
              >
                <div className="lcos-tapnow-palette">
                  {TAPNOW_PIN_PALETTE.map((color) => {
                    const assigned = assignedColors.has(color.hex);
                    return (
                      <span
                        key={color.id}
                        data-lcos-color-pin-swatch={color.id}
                        data-lcos-color-pin-swatch-assigned={
                          assigned ? 'true' : 'false'
                        }
                      >
                        <TapnowColorDot
                          hex={color.hex}
                          selected={assigned}
                          className={
                            pinsProjection.busy
                              ? 'pointer-events-none opacity-40'
                              : ''
                          }
                          ariaLabel={`${assigned ? '已标为' : '标为'} ${color.hex}`}
                          onClick={() => {
                            const targetRef =
                              pinsProjection.authoringTarget?.targetRef;
                            if (targetRef === undefined || pinsProjection.busy)
                              return;
                            if (assigned) {
                              const member = currentMemberships.find(
                                (item) =>
                                  definitionsById
                                    .get(item.colorPinId)
                                    ?.color.toUpperCase() === color.hex,
                              );
                              if (member)
                                void pinsProjection
                                  .removeMembership(member.id)
                                  .catch(() => {});
                              return;
                            }
                            void pinsProjection
                              .assignMembership(targetRef, color.hex)
                              .catch(() => undefined);
                          }}
                        />
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {(travelMessage ?? pinsProjection.message) !== undefined && (
              <div
                data-lcos-color-pin-note
                className="mt-2 rounded-xl px-4 py-2 text-xs"
                style={{ ...lcosGlassStyle, color: lcosTokens.color.muted }}
                aria-live="polite"
              >
                {travelMessage ?? pinsProjection.message}
              </div>
            )}
          </div>
        )}
    </>
  );
}
