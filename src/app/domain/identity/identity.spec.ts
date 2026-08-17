import { describe, expect, it } from 'vitest';

import {
  haveSameOwner,
  isSameIdentity,
  isWorkspaceOwner,
  matchesMember,
  normalizeEmail,
} from './identity';

describe('UID identity policy', () => {
  it('normalizes email metadata without using it as identity', () => {
    expect(normalizeEmail(' User@Example.COM ')).toBe('user@example.com');
    expect(isSameIdentity({ memberEmail: 'User@Example.com' }, {})).toBe(false);
  });

  it('prefers UID over a matching email', () => {
    const left = { ownerUid: 'uid-a', memberEmail: 'same@example.com' };
    const right = { ownerUid: 'uid-b', memberEmail: 'same@example.com' };
    expect(haveSameOwner(left, right)).toBe(false);
    expect(isSameIdentity(left, { uid: 'uid-b' })).toBe(false);
  });

  it('matches a changed member email through immutable UID', () => {
    expect(
      matchesMember(
        { ownerUid: 'member-uid', memberEmail: 'old@example.com' },
        { uid: 'member-uid', email: 'new@example.com' },
      ),
    ).toBe(true);
  });

  it('uses UID exclusively for workspace administration', () => {
    const workspace = { ownerUid: 'owner-uid' };
    expect(isWorkspaceOwner(workspace, { uid: 'owner-uid' })).toBe(true);
    expect(isWorkspaceOwner(workspace, { uid: 'wrong-uid' })).toBe(false);
  });
});
