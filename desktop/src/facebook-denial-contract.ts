// Source-owned informational denials only. Not a runtime registry or dispatch fence.
const REASONS = Object.freeze({
  'fb-page-video': 'PAGE_PERMISSION_AND_CERTIFICATION_MISSING',
  'fb-page-photo': 'PAGE_PERMISSION_AND_CERTIFICATION_MISSING',
  'fb-page-reels': 'PAGE_PERMISSION_AND_CERTIFICATION_MISSING',
  'fb-story': 'STORY_SEPARATE_PERMISSION_AND_CERTIFICATION_MISSING',
  'fb-group-video': 'GROUP_OUTSIDE_PILOT_SCOPE',
  'fb-group-photo': 'GROUP_OUTSIDE_PILOT_SCOPE',
  'fb-profile-video': 'PROFILE_OUTSIDE_PILOT_SCOPE',
  'fb-profile-photo': 'PROFILE_OUTSIDE_PILOT_SCOPE',
  'fb-profile-reels': 'PROFILE_OUTSIDE_PILOT_SCOPE',
  'fb-comment-links': 'COMMENT_SCOPE_AND_CERTIFICATION_MISSING',
  'fb-reaction-links': 'REACTION_AND_SHARE_OUTSIDE_PILOT_SCOPE',
} as const);
export type FacebookWorkflowId = keyof typeof REASONS;
export type FacebookDenialReason = (typeof REASONS)[FacebookWorkflowId] | 'UNKNOWN_WORKFLOW';
const DETAILS: Readonly<Record<FacebookDenialReason, string>> = Object.freeze({
  PAGE_PERMISSION_AND_CERTIFICATION_MISSING:
    'Disabled: this Page action requires separate permission and complete technical certification. Catalog or manifest existence grants neither.',
  STORY_SEPARATE_PERMISSION_AND_CERTIFICATION_MISSING:
    'Disabled: Story requires its own permission and technical certification; Page, feed-video or Reels approval cannot substitute.',
  GROUP_OUTSIDE_PILOT_SCOPE:
    'Disabled: Group publishing is outside the accepted pilot scope. Future enablement requires separate permission and technical certification.',
  PROFILE_OUTSIDE_PILOT_SCOPE:
    'Disabled: Profile publishing is outside the accepted pilot scope. Future enablement requires separate permission and technical certification.',
  COMMENT_SCOPE_AND_CERTIFICATION_MISSING:
    'Disabled: comments require separately permitted, verified owned/administered scope and technical certification. Arbitrary links do not establish permission.',
  REACTION_AND_SHARE_OUTSIDE_PILOT_SCOPE:
    'Disabled: Like, Love and Share are outside the accepted pilot scope and each requires separate permission and technical certification. Bulk fake engagement is excluded.',
  UNKNOWN_WORKFLOW:
    'Disabled: no exact supported catalog identity was supplied. No fallback is allowed.',
});
export type FacebookWorkflowDenial = Readonly<{
  kind: 'FACEBOOK_WORKFLOW_DENIAL';
  state: 'DISABLED';
  allowed: false;
  workflowId: FacebookWorkflowId | null;
  reason: FacebookDenialReason;
  detail: string;
}>;
export function facebookWorkflowDenial(value: unknown): FacebookWorkflowDenial {
  // Never inspect or coerce caller objects, including revoked proxies or wrappers.
  const workflowId =
    typeof value === 'string' && Object.hasOwn(REASONS, value)
      ? (value as FacebookWorkflowId)
      : null;
  const reason = workflowId === null ? 'UNKNOWN_WORKFLOW' : REASONS[workflowId];
  return Object.freeze({
    kind: 'FACEBOOK_WORKFLOW_DENIAL',
    state: 'DISABLED',
    allowed: false,
    workflowId,
    reason,
    detail: DETAILS[reason],
  });
}
