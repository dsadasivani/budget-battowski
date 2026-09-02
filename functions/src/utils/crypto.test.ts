import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  constantTimeHexEqual,
  createDeviceCredential,
  parseDeviceCredential,
  sha256,
} from './crypto.js';

describe('device credentials', () => {
  it('creates a parseable credential without persisting the raw secret', () => {
    const credential = createDeviceCredential();
    const parsed = parseDeviceCredential(`Bearer ${credential.deviceToken}`);
    assert.equal(parsed?.deviceId, credential.deviceId);
    assert.equal(constantTimeHexEqual(sha256(parsed?.secret ?? ''), credential.tokenHash), true);
    assert.equal(credential.tokenHash.includes(parsed?.secret ?? ''), false);
  });

  it('rejects malformed credentials and invalid hashes', () => {
    assert.equal(parseDeviceCredential(undefined), null);
    assert.equal(parseDeviceCredential('Bearer not-a-device-token'), null);
    assert.equal(constantTimeHexEqual(sha256('one'), sha256('two')), false);
    assert.equal(constantTimeHexEqual('short', sha256('two')), false);
  });
});
