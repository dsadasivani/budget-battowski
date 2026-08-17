export interface RecordOwnerIdentity {
  ownerUid?: string;
  memberEmail?: string;
}

export interface UserIdentityLike {
  uid?: string;
}

export interface MemberIdentity {
  uid: string;
  email: string;
}

export interface WorkspaceOwnerIdentity {
  ownerUid: string;
}

export function normalizeEmail(email: string | undefined): string {
  return email?.trim().toLowerCase() ?? '';
}

export function isSameIdentity(record: RecordOwnerIdentity, user: UserIdentityLike): boolean {
  return !!record.ownerUid && !!user.uid && record.ownerUid === user.uid;
}

export function haveSameOwner(left: RecordOwnerIdentity, right: RecordOwnerIdentity): boolean {
  return !!left.ownerUid && !!right.ownerUid && left.ownerUid === right.ownerUid;
}

export function matchesMember(record: RecordOwnerIdentity, member: MemberIdentity): boolean {
  return isSameIdentity(record, { uid: member.uid });
}

export function isWorkspaceOwner(
  workspace: WorkspaceOwnerIdentity,
  user: UserIdentityLike,
): boolean {
  return !!user.uid && workspace.ownerUid === user.uid;
}
