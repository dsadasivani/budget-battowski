import { describe, expect, it } from 'vitest';

import {
  adoptOwnerUid,
  haveSameOwner,
  isSameIdentity,
  isWorkspaceOwner,
  matchesMember,
  normalizeEmail,
} from './identity';

describe('identity compatibility policy', () => {
  it('normalizes legacy email identity', () => {
    expect(normalizeEmail(' User@Example.COM ')).toBe('user@example.com');
    expect(isSameIdentity({ memberEmail: 'User@Example.com' }, { email: 'user@example.com' })).toBe(
      true,
    );
  });

  it('prefers UID over a matching email', () => {
    const left = { ownerUid: 'uid-a', memberEmail: 'same@example.com' };
    const right = { ownerUid: 'uid-b', memberEmail: 'same@example.com' };
    expect(haveSameOwner(left, right)).toBe(false);
    expect(isSameIdentity(left, { uid: 'uid-b', email: 'same@example.com' })).toBe(false);
  });

  it('matches a changed member email through immutable UID', () => {
    expect(
      matchesMember(
        { ownerUid: 'member-uid', memberEmail: 'old@example.com' },
        { uid: 'member-uid', email: 'new@example.com' },
      ),
    ).toBe(true);
  });

  it('uses UID for migrated workspace administration', () => {
    const workspace = { ownerUid: 'owner-uid', ownerEmail: 'old@example.com' };
    expect(isWorkspaceOwner(workspace, { uid: 'owner-uid', email: 'new@example.com' })).toBe(true);
    expect(isWorkspaceOwner(workspace, { uid: 'wrong-uid', email: 'old@example.com' })).toBe(false);
  });

  it('adopts ownerUid only for the matching legacy email identity', () => {
    const legacy = { memberEmail: 'owner@example.com' };
    expect(adoptOwnerUid(legacy, { uid: 'owner-uid', email: 'OWNER@example.com' })).toEqual({
      ...legacy,
      ownerUid: 'owner-uid',
    });
    expect(adoptOwnerUid(legacy, { uid: 'other-uid', email: 'other@example.com' })).toBe(legacy);
  });
});
