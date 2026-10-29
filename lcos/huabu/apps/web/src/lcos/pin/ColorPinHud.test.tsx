import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { colorPinTargetKey } from '@local-creative-os/web-gen2';

import { ColorPinHud } from './ColorPinHud';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  projection: {} as Record<string, unknown>,
  requestFocusWhere: vi.fn(),
  requestLocate: vi.fn(),
  assign: vi.fn(),
  remove: vi.fn(),
  nodes: [{ id: 'node-a', selected: true }],
  refs: new Map<
    string,
    { entityType: string; entityId: string; descriptor?: { title?: string } }
  >(),
}));

vi.mock('./LcosColorPinProvider', () => ({
  useLcosColorPins: () => mocks.projection,
}));
vi.mock('./lcosColorPinPalette', () => ({
  readColorPinPaletteV1: () => ({
    violet: '#6633FF',
    teal: '#00AA99',
    amber: '#FFAA00',
  }),
  paletteTonesV1: () => ['violet', 'teal', 'amber'],
  toneForColorPinV1: () => 'violet',
}));
vi.mock('../navigation/LcosNavigatorIsland', () => ({
  LcosNavigatorIsland: (props: {
    pins?: readonly { id: string; label: string }[];
    onActivatePin?: (pin: { id: string; label: string }) => void;
    onCreatePin?: () => void;
    pinRenderer?: (pin: { id: string; label: string }) => React.ReactNode;
  }) => (
    <div>
      <button data-test-create-pin onClick={props.onCreatePin}>
        create
      </button>
      {props.pins?.map((pin) =>
        props.pinRenderer ? (
          <div key={pin.id} data-test-pin={pin.id}>
            {props.pinRenderer(pin)}
          </div>
        ) : (
          <button
            key={pin.id}
            data-test-pin={pin.id}
            onClick={() => props.onActivatePin?.(pin)}
          >
            {pin.label}
          </button>
        ),
      )}
    </div>
  ),
}));
vi.mock('../app/useLcosWorksiteNav', () => ({
  useLcosWorksiteNav: () => ({ switchWorksite: vi.fn() }),
}));
vi.mock('../navigation/waitForProjectedEntity', () => ({
  waitForProjectedEntity: vi.fn(),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/store/canvasStore', () => ({
  default: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({ nodes: mocks.nodes, canvasId: 'canvas-main' }),
    {
      getState: () => ({
        nodes: mocks.nodes,
        canvasId: 'canvas-main',
        switchCanvas: vi.fn(),
      }),
    },
  ),
}));
vi.mock('../lcosReferenceState', () => ({
  useLcosReferenceStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({ nodeEntityRefs: mocks.refs }),
    { getState: () => ({ nodeEntityRefs: mocks.refs }) },
  ),
}));
vi.mock('../shell/lcosShellStore', () => ({
  useLcosShellStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeSurface: 'main',
      windowEnvironment: null,
      requestLocate: mocks.requestLocate,
      requestFocusWhere: mocks.requestFocusWhere,
      openWindow: vi.fn(),
      setActiveSurface: vi.fn(),
    }),
}));

const at = '2026-09-20T00:00:00.000Z';
const definition = {
  id: 'blue',
  projectId: 'p',
  color: '#6633FF',
  label: 'Blue',
  createdAt: at,
  updatedAt: at,
};
const membership = {
  id: 'member-a',
  projectId: 'p',
  colorPinId: 'blue',
  targetRef: { projectId: 'p', kind: 'entity' as const, id: 'artifact-a' },
  createdAt: at,
  updatedAt: at,
};

function resetProjection(): void {
  mocks.projection = {
    projectId: 'p',
    snapshot: { definitions: [definition], memberships: [membership] },
    status: 'ready',
    busy: false,
    usedDefinitions: [definition],
    membershipsByColorPinId: new Map([['blue', [membership]]]),
    membershipsByTargetKey: new Map(),
    projectTruth: {
      scopes: [{ id: 'root', projectId: 'p', kind: 'root' }],
      workspaces: [],
    },
    authoringTarget: undefined,
    openAuthoring: vi.fn((target) => {
      mocks.projection = { ...mocks.projection, authoringTarget: target };
    }),
    closeAuthoring: vi.fn(),
    assignMembership: mocks.assign,
    removeMembership: mocks.remove,
    targetIdentity: () => ({
      entityType: 'artifact',
      entityId: 'artifact-a',
      label: 'Brief',
    }),
    resolveNavigationTarget: vi.fn(),
    refresh: vi.fn(),
    clearMessage: vi.fn(),
  };
}

afterEach(() => {
  mocks.requestFocusWhere.mockReset();
  mocks.requestLocate.mockReset();
  mocks.assign.mockReset();
  mocks.remove.mockReset();
  mocks.refs.clear();
  document.body.replaceChildren();
});

it('opens a used color group and hands a canonical entity to the existing Focus/Where owner', async () => {
  resetProjection();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <ColorPinHud
          projectId="p"
          canvasBySurface={{}}
          surfaceByWorkspace={new Map()}
          ensureCanvas={async () => undefined}
          ensureWorkspaceCanvas={async () => undefined}
        />,
      ),
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[data-test-pin="blue"] button')
        ?.click(),
    );
    expect(
      document.querySelector('[data-slot="dropdown-menu-content"]'),
    ).not.toBeNull();
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        .find((button) => button.textContent?.includes('Brief'))
        ?.click(),
    );
    expect(mocks.requestFocusWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'artifact',
        entityId: 'artifact-a',
        title: 'Brief',
      }),
    );
  } finally {
    await act(async () => root.unmount());
  }
});

it('authoring preserves canonical Artifact versus explicit View target kinds', async () => {
  resetProjection();
  mocks.refs.set('node-a', {
    entityType: 'artifact',
    entityId: 'artifact-a',
    descriptor: { title: 'Brief' },
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <ColorPinHud
          projectId="p"
          canvasBySurface={{}}
          surfaceByWorkspace={new Map()}
          ensureCanvas={async () => undefined}
          ensureWorkspaceCanvas={async () => undefined}
        />,
      ),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-test-create-pin]')?.click(),
    );
    expect(mocks.projection.openAuthoring).toHaveBeenCalledWith(
      expect.objectContaining({
        targetRef: { projectId: 'p', kind: 'entity', id: 'artifact-a' },
      }),
    );

    mocks.refs.set('node-a', {
      entityType: 'view',
      entityId: 'view-a',
      descriptor: { title: 'Specific view' },
    });
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-test-create-pin]')?.click(),
    );
    expect(mocks.projection.openAuthoring).toHaveBeenLastCalledWith(
      expect.objectContaining({
        targetRef: { projectId: 'p', kind: 'view', id: 'view-a' },
      }),
    );
  } finally {
    await act(async () => root.unmount());
  }
});

it('the original six-color palette toggles exact canonical membership instead of deleting content', async () => {
  resetProjection();
  mocks.assign.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  const red = { ...definition, color: '#F0606B' };
  mocks.projection = {
    ...mocks.projection,
    snapshot: { definitions: [red], memberships: [membership] },
    usedDefinitions: [red],
    authoringTarget: { targetRef: membership.targetRef, label: 'Brief' },
    membershipsByTargetKey: new Map([
      [colorPinTargetKey(membership.targetRef), [membership]],
    ]),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <ColorPinHud
          projectId="p"
          canvasBySurface={{}}
          surfaceByWorkspace={new Map()}
          ensureCanvas={async () => undefined}
          ensureWorkspaceCanvas={async () => undefined}
        />,
      ),
    );
    expect(host.querySelectorAll('[data-lcos-color-pin-swatch]')).toHaveLength(
      6,
    );
    const assigned = host.querySelector<HTMLButtonElement>(
      '[data-lcos-color-pin-swatch="F0606B"] button',
    );
    expect(assigned?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => assigned?.click());
    expect(mocks.remove).toHaveBeenCalledWith('member-a');
    expect(mocks.assign).not.toHaveBeenCalled();
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[data-lcos-color-pin-swatch="4FC978"] button',
        )
        ?.click(),
    );
    expect(mocks.assign).toHaveBeenCalledWith(membership.targetRef, '#4FC978');
  } finally {
    await act(async () => root.unmount());
  }
});

it('source member removal forwards the membership id and group removal keeps native confirmation', async () => {
  resetProjection();
  mocks.remove.mockResolvedValue(undefined);
  // More than one mounted group must not replace/unmount the confirmation host.
  const second = {
    ...definition,
    id: 'orange',
    color: '#F4A14B',
    label: 'Orange',
  };
  mocks.projection = {
    ...mocks.projection,
    usedDefinitions: [definition, second],
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const open = () =>
    host
      .querySelector<HTMLButtonElement>('[data-test-pin="blue"] button')
      ?.click();
  const removeAll = () =>
    [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((button) => button.textContent?.includes('移出本颜色组'))
      ?.click();
  try {
    await act(async () =>
      root.render(
        <ColorPinHud
          projectId="p"
          canvasBySurface={{}}
          surfaceByWorkspace={new Map()}
          ensureCanvas={async () => undefined}
          ensureWorkspaceCanvas={async () => undefined}
        />,
      ),
    );
    await act(async () => open());
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="从颜色组移除 Brief"]')
        ?.click(),
    );
    expect(mocks.remove).toHaveBeenCalledWith('member-a');
    mocks.remove.mockClear();
    await act(async () => removeAll());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(mocks.remove).not.toHaveBeenCalled();
    await act(async () =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[role="dialog"] button',
        ),
      ]
        .find((button) => button.textContent === '取消')
        ?.click(),
    );
    expect(mocks.remove).not.toHaveBeenCalled();
    await act(async () => open());
    await act(async () => removeAll());
    await act(async () =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[role="dialog"] button',
        ),
      ]
        .find((button) => button.textContent === '移出颜色组')
        ?.click(),
    );
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith('member-a');
  } finally {
    await act(async () => root.unmount());
  }
});
