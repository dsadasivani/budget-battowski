export interface RecordOwnerIdentity {
  ownerUid?: string;
  memberEmail?: string;
}

export interface UserIdentityLike {
  uid?: string;
  email?: string;
}

export interface MemberIdentity {
  uid?: string;
  email: string;
}

export interface WorkspaceOwnerIdentity {
  ownerUid?: string;
  ownerEmail: string;
}

export function normalizeEmail(email: string | undefined): string {
  return email?.trim().toLowerCase() ?? '';
}

export function isSameIdentity(record: RecordOwnerIdentity, user: UserIdentityLike): boolean {
  if (record.ownerUid && user.uid) {
    return record.ownerUid === user.uid;
  }
  return (
    !!record.memberEmail &&
    !!user.email &&
    normalizeEmail(record.memberEmail) === normalizeEmail(user.email)
  );
}

export function haveSameOwner(left: RecordOwnerIdentity, right: RecordOwnerIdentity): boolean {
  if (left.ownerUid && right.ownerUid) {
    return left.ownerUid === right.ownerUid;
  }
  return (
    !!left.memberEmail &&
    !!right.memberEmail &&
    normalizeEmail(left.memberEmail) === normalizeEmail(right.memberEmail)
  );
}

export function matchesMember(record: RecordOwnerIdentity, member: MemberIdentity): boolean {
  return isSameIdentity(record, { uid: member.uid, email: member.email });
}

export function isWorkspaceOwner(
  workspace: WorkspaceOwnerIdentity,
  user: UserIdentityLike,
): boolean {
  if (workspace.ownerUid && user.uid) {
    return workspace.ownerUid === user.uid;
  }
  return !!user.email && normalizeEmail(workspace.ownerEmail) === normalizeEmail(user.email);
}

export function adoptOwnerUid<T extends RecordOwnerIdentity>(
  record: T,
  identity: Required<UserIdentityLike>,
): T {
  if (record.ownerUid || !isSameIdentity(record, identity)) {
    return record;
  }
  return { ...record, ownerUid: identity.uid };
}
