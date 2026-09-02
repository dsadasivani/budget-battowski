import { authenticateDevice } from '../auth/device-auth.js';
import { authenticatedUser, authorizedWorkspace } from '../auth/firebase-user-auth.js';
import { ingestSms } from '../ingestion/sms-ingestion.service.js';
import {
  listDevices,
  touchDevice,
  updateDevice,
} from '../repositories/ingestion-device.repository.js';
import {
  consumePairingSession,
  createPairingSession,
} from '../repositories/pairing-session.repository.js';
import { enforceRateLimit } from '../repositories/rate-limit.repository.js';
import { ApiError } from '../utils/api-error.js';
import { logSmsEvent } from '../utils/logging.js';
import { jsonObject, requiredTrimmedString, validateSmsPayload } from '../utils/validation.js';

interface ApiRequest {
  method: string;
  path: string;
  ip?: string;
  body?: unknown;
  query: Record<string, unknown>;
  header(name: string): string | undefined;
}

interface ApiResponse {
  set(name: string, value: string): void;
  status(status: number): ApiResponse;
  json(value: unknown): void;
  send(value: string): void;
}

function cors(response: ApiResponse): void {
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  response.set('Cache-Control', 'no-store');
}

function normalizedPath(path: string): string {
  const withoutApi = path.startsWith('/api/') ? path.slice(4) : path;
  return withoutApi.replace(/\/$/, '') || '/';
}

function bodyObject(request: ApiRequest): Record<string, unknown> {
  const body = jsonObject(request.body);
  if (!body) throw new ApiError(400, 'INVALID_JSON');
  return body;
}

async function userWorkspace(
  request: ApiRequest,
  source: Record<string, unknown>,
): Promise<{ uid: string; workspaceId: string }> {
  const uid = await authenticatedUser(request.header('authorization'));
  const workspaceId = await authorizedWorkspace(uid, source['workspaceId']);
  return { uid, workspaceId };
}

async function handlePairingSession(request: ApiRequest, response: ApiResponse): Promise<void> {
  const body = bodyObject(request);
  const { uid, workspaceId } = await userWorkspace(request, body);
  await enforceRateLimit(`pair-session:${uid}`, 8, 10 * 60_000);
  response.status(201).json(await createPairingSession(uid, workspaceId));
}

async function handlePair(request: ApiRequest, response: ApiResponse): Promise<void> {
  const body = bodyObject(request);
  const pairingCode = requiredTrimmedString(body['pairingCode'], 6);
  const deviceName = requiredTrimmedString(body['deviceName'], 80);
  const connectorVersion =
    body['connectorVersion'] === undefined
      ? undefined
      : (requiredTrimmedString(body['connectorVersion'], 32) ?? undefined);
  if (!pairingCode || !/^\d{6}$/.test(pairingCode) || !deviceName) {
    throw new ApiError(400, 'PAIRING_PAYLOAD_INVALID');
  }
  await enforceRateLimit(`pair-attempt:${request.ip ?? 'unknown'}`, 10, 10 * 60_000);
  response
    .status(200)
    .json(await consumePairingSession({ pairingCode, deviceName, connectorVersion }));
}

async function handleListDevices(request: ApiRequest, response: ApiResponse): Promise<void> {
  const { uid, workspaceId } = await userWorkspace(request, request.query);
  response.status(200).json({ devices: await listDevices(uid, workspaceId) });
}

async function handleUpdateDevice(
  request: ApiRequest,
  response: ApiResponse,
  deviceId: string,
): Promise<void> {
  const body = bodyObject(request);
  const { uid, workspaceId } = await userWorkspace(request, body);
  const deviceName =
    body['deviceName'] === undefined
      ? undefined
      : (requiredTrimmedString(body['deviceName'], 80) ?? undefined);
  const status = body['status'];
  if (
    (body['deviceName'] !== undefined && !deviceName) ||
    (status !== undefined && !['active', 'paused', 'revoked'].includes(String(status))) ||
    (!deviceName && status === undefined)
  ) {
    throw new ApiError(400, 'DEVICE_UPDATE_INVALID');
  }
  await updateDevice(uid, workspaceId, deviceId, {
    deviceName,
    status: status as 'active' | 'paused' | 'revoked' | undefined,
  });
  response.status(200).json({ updated: true });
}

async function handleHeartbeat(request: ApiRequest, response: ApiResponse): Promise<void> {
  const device = await authenticateDevice(request.header('authorization'));
  await enforceRateLimit(`heartbeat:${device.id}`, 24, 60 * 60_000);
  await touchDevice(device.id, {});
  response.status(200).json({ connected: true, deviceId: device.id });
}

async function handleIngestion(request: ApiRequest, response: ApiResponse): Promise<void> {
  const startedAt = Date.now();
  const device = await authenticateDevice(request.header('authorization'));
  await enforceRateLimit(`ingestion:${device.id}`, 120, 60_000);
  const payload = validateSmsPayload(request.body);
  if (!payload) throw new ApiError(400, 'SMS_PAYLOAD_INVALID');
  const result = await ingestSms(device, payload);
  logSmsEvent({
    eventId: payload.eventId,
    deviceId: device.id,
    workspaceId: device.workspaceId,
    parserId: result.parserId,
    outcome: result.status,
    durationMs: Date.now() - startedAt,
    status: 202,
  });
  response.status(202).json(result);
}

export async function apiRouter(request: ApiRequest, response: ApiResponse): Promise<void> {
  cors(response);
  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }
  const path = normalizedPath(request.path);
  try {
    if (request.method === 'POST' && path === '/v1/integrations/sms/pairing-sessions') {
      await handlePairingSession(request, response);
      return;
    }
    if (request.method === 'POST' && path === '/v1/integrations/sms/pair') {
      await handlePair(request, response);
      return;
    }
    if (request.method === 'GET' && path === '/v1/integrations/sms/devices') {
      await handleListDevices(request, response);
      return;
    }
    const deviceMatch = /^\/v1\/integrations\/sms\/devices\/(dev_[A-Za-z0-9_-]{8})$/.exec(path);
    if (request.method === 'PATCH' && deviceMatch) {
      await handleUpdateDevice(request, response, deviceMatch[1]);
      return;
    }
    if (request.method === 'POST' && path === '/v1/integrations/sms/heartbeat') {
      await handleHeartbeat(request, response);
      return;
    }
    if (request.method === 'POST' && path === '/v1/ingestion/sms') {
      await handleIngestion(request, response);
      return;
    }
    throw new ApiError(404, 'NOT_FOUND');
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR');
    logSmsEvent({ outcome: apiError.code, status: apiError.status });
    response.status(apiError.status).json({ code: apiError.code });
  }
}
