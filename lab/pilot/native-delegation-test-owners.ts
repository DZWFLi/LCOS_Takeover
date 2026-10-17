// Test-only entry: keep the native adapter and its exact Core HTTP client in
// one module graph so HttpError / CoreApiError identity matches production.
export { NativeCoreCollaborationClient } from './native-collaboration-client.ts'
export { HttpClient } from '../../lcos/apps/web-gen2/src/backend/client.ts'
