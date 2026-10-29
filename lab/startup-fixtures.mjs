export const OFFLINE_FIXTURE_CANVAS_ID = 'offline-fixture-canvas';
export const OFFLINE_FIXTURE_CANVAS_PATH = '/canvas/' + OFFLINE_FIXTURE_CANVAS_ID;
export const OFFLINE_FIXTURE_CANVAS_API_PATH = '/api/canvas/v1/canvases/' + OFFLINE_FIXTURE_CANVAS_ID;
export const OFFLINE_FIXTURE_BILLING_API_PATH = '/api/bff/billing/init';

const canvas = Object.freeze({
  id: OFFLINE_FIXTURE_CANVAS_ID,
  name: '离线 Fixture · Canvas',
  title: '离线 Fixture · Canvas',
  type: 'canvas',
  description: 'Local demonstration data. This is not an LCOS Core canvas.',
  nodes: [
    {
      id: 'offline-fixture-note',
      type: 'text',
      name: 'OFFLINE FIXTURE',
      x: 160,
      y: 120,
      position: { x: 160, y: 120 },
      data: {
        id: 'offline-fixture-note',
        title: 'OFFLINE FIXTURE',
        name: 'OFFLINE FIXTURE',
        text: '离线 Fixture\n仅用于本地界面验证\n未连接 LCOS Core',
        content: '离线 Fixture\n仅用于本地界面验证\n未连接 LCOS Core'
      }
    },
    {
      id: 'offline-fixture-note-2',
      type: 'text',
      name: 'READ ONLY',
      x: 520,
      y: 300,
      position: { x: 520, y: 300 },
      data: {
        id: 'offline-fixture-note-2',
        title: 'READ ONLY',
        name: 'READ ONLY',
        text: '写入、生成、删除、付费、文件与 Shell 动作均未接入。',
        content: '写入、生成、删除、付费、文件与 Shell 动作均未接入。'
      }
    }
  ],
  connections: []
});

const fixtureMeta = Object.freeze({
  mode: 'fixture-only',
  core_connected: false,
  mutations_connected: false,
  billing_connected: false
});

function failure(status, code, message) {
  return {
    status,
    body: {
      code: status * 100,
      message,
      msg: message,
      data: null,
      error: { code, message },
      lcos_adapter: fixtureMeta
    }
  };
}

/**
 * Supply exactly one synthetic Canvas detail response. Return null for every
 * other route so the existing compatibility adapter can handle its own scope.
 */
export function handleStartupFixture({ method = 'GET', pathname, url } = {}) {
  const route = pathname || (url instanceof URL ? url.pathname : undefined);
  if (typeof route !== 'string') return null;

  if (route === OFFLINE_FIXTURE_BILLING_API_PATH) {
    if (method !== 'GET') {
      return failure(501, 'FIXTURE_BILLING_ACTION_NOT_IMPLEMENTED',
        'Billing is disconnected in this fixture. Checkout, subscription and payment actions are not implemented.');
    }
    return {
      status: 200,
      body: {
        code: 0,
        message: '',
        msg: '',
        data: {
          wallet: { available: 0, total: 0, onHold: 0 },
          subscription: null,
          payingCustomer: { isPayingCustomer: false },
          orgTier: { tier: null, models: [] },
          billingState: 'not_connected',
          note: 'No subscription or balance is connected in this local fixture.'
        },
        lcos_adapter: fixtureMeta
      }
    };
  }

  const exact = route === OFFLINE_FIXTURE_CANVAS_API_PATH;
  const childRoute = route.startsWith(OFFLINE_FIXTURE_CANVAS_API_PATH + '/');
  if (!exact && !childRoute) return null;

  if (method !== 'GET') {
    return failure(501, 'FIXTURE_ACTION_NOT_IMPLEMENTED',
      'Offline fixture is read-only. Write, generation, deletion, payment, file and Shell actions are not connected.');
  }
  if (childRoute) {
    return failure(501, 'FIXTURE_READ_NOT_IMPLEMENTED',
      'This offline fixture endpoint is not implemented; no synthetic success was returned.');
  }

  return {
    status: 200,
    body: {
      code: 0,
      message: '',
      msg: '',
      data: {
        ...canvas,
        nodes: canvas.nodes.map(node => ({ ...node, position: { ...node.position }, data: { ...node.data } })),
        connections: canvas.connections.map(connection => ({ ...connection }))
      },
      lcos_adapter: fixtureMeta
    }
  };
}
