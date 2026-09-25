import { f, type CollectionDef } from './schema.js';

/**
 * Social collections cross account boundaries, so none of them are exposed through
 * the generic owner-scoped CRUD layer. Their tables are still declared here —
 * DDL, migrations, backup and sync all read from one registry — but every write
 * goes through a router that knows the rules (`serverManaged`).
 */

export const constellationProfiles: CollectionDef = {
  name: 'constellationProfiles',
  label: 'Constellation profile',
  singular: 'Profile',
  icon: 'constellation',
  area: 'social',
  scope: 'user',
  serverManaged: true,
  titleField: 'displayName',
  sortField: 'updatedAt',
  sortDir: 'desc',
  indexes: [['handle']],
  description: 'The face a system chooses to show. Private until it is deliberately published.',
  fields: [
    f.text('handle', 'Handle', { required: true, inList: true, searchable: true }),
    f.text('displayName', 'Display name', { required: true, inList: true, searchable: true }),
    f.long('bio', 'Bio', { searchable: true }),
    f.image('avatarUrl', 'Avatar'),
    f.image('bannerUrl', 'Banner'),
    f.json('avatarFocus', 'Avatar focal point'),
    f.json('bannerFocus', 'Banner focal point'),
    f.color('accent', 'Accent colour'),
    f.text('systemType', 'System description'),
    f.text('pronouns', 'Pronouns'),
    f.bool('isPublic', 'Discoverable', { inList: true }),
    f.bool('showMemberCount', 'Show member count'),
    f.bool('showMemberList', 'Show member list'),
    f.bool('showCurrentFronter', 'Show who is fronting'),
    f.bool('acceptFriendRequests', 'Accept friend requests', { defaultValue: true }),
    f.bool('acceptMessageRequests', 'Accept message requests', { defaultValue: true }),
    f.enumOf('memberSort', 'Member order', [
      { value: 'orbit', label: 'Orbit order' },
      { value: 'alphabetical', label: 'Alphabetical' },
      { value: 'newest', label: 'Newest' },
      { value: 'active', label: 'Most active' },
      { value: 'custom', label: 'Custom' },
    ], { defaultValue: 'orbit' }),
    f.int('memberColumns', 'Member grid columns', { defaultValue: 3, min: 1, max: 5 }),
    f.refs('pinnedMediaIds', 'Pinned gallery', 'mediaItems'),
    f.json('customInfo', 'Custom information', {
      hint: 'Free-form labelled rows shown on the profile.',
    }),
  ],
};

export const friendships: CollectionDef = {
  name: 'friendships',
  label: 'Friends',
  singular: 'Friend',
  icon: 'friend',
  area: 'social',
  scope: 'user',
  serverManaged: true,
  titleField: 'otherUserId',
  sortField: 'createdAt',
  sortDir: 'desc',
  indexes: [['userId', 'otherUserId']],
  fields: [
    f.text('otherUserId', 'Friend', { required: true, inList: true }),
    f.enumOf('state', 'State', [
      { value: 'active', label: 'Friends', color: '#5ec6a8', icon: '✓' },
      { value: 'muted', label: 'Muted', color: '#f0a05a', icon: '◍' },
      { value: 'blocked', label: 'Blocked', color: '#e06c93', icon: '✕' },
    ], { defaultValue: 'active', inList: true }),
    f.text('note', 'Private note', { sensitive: true }),
    f.datetime('lastInteractionAt', 'Last interaction'),
  ],
};

export const friendRequests: CollectionDef = {
  name: 'friendRequests',
  label: 'Friend requests',
  singular: 'Friend request',
  icon: 'friend',
  area: 'social',
  scope: 'user',
  serverManaged: true,
  titleField: 'toUserId',
  sortField: 'createdAt',
  sortDir: 'desc',
  indexes: [['toUserId', 'status'], ['fromUserId', 'status']],
  fields: [
    f.text('fromUserId', 'From', { required: true }),
    f.text('toUserId', 'To', { required: true }),
    f.long('message', 'Message'),
    f.enumOf('status', 'Status', [
      { value: 'pending', label: 'Pending' },
      { value: 'accepted', label: 'Accepted' },
      { value: 'declined', label: 'Declined' },
      { value: 'cancelled', label: 'Cancelled' },
    ], { defaultValue: 'pending', inList: true }),
    f.datetime('respondedAt', 'Responded'),
  ],
};

export const posts: CollectionDef = {
  name: 'posts',
  label: 'Flux',
  singular: 'Post',
  icon: 'flux',
  area: 'social',
  scope: 'user',
  serverManaged: true,
  memberScoped: true,
  titleField: 'body',
  sortField: 'postedAt',
  sortDir: 'desc',
  indexes: [['userId', 'postedAt'], ['postedAt']],
  fields: [
    f.long('body', 'Post', { searchable: true }),
    f.datetime('postedAt', 'Posted', { required: true, inList: true }),
    f.json('media', 'Media', { hint: 'Urls with optional alt text.' }),
    f.enumOf('authorKind', 'Posting as', [
      { value: 'system', label: 'The system' },
      { value: 'member', label: 'A member' },
    ], { defaultValue: 'system', inList: true }),
    f.ref('repostOfId', 'Repost of', 'posts'),
    f.int('reactionCount', 'Reactions', { defaultValue: 0 }),
    f.int('commentCount', 'Comments', { defaultValue: 0 }),
    f.int('repostCount', 'Reposts', { defaultValue: 0 }),
    f.tags('tags', 'Tags'),
    f.bool('edited', 'Edited'),
    f.text('contentWarning', 'Content note'),
  ],
};

export const comments: CollectionDef = {
  name: 'comments',
  label: 'Comments',
  singular: 'Comment',
  icon: 'flux',
  area: 'social',
  scope: 'user',
  serverManaged: true,
  memberScoped: true,
  titleField: 'body',
  sortField: 'postedAt',
  sortDir: 'asc',
  indexes: [['postId', 'postedAt']],
  fields: [
    f.ref('postId', 'Post', 'posts', { required: true }),
    f.long('body', 'Comment', { required: true, searchable: true }),
    f.datetime('postedAt', 'Posted', { required: true }),
    f.ref('replyToId', 'In reply to', 'comments'),
    f.text('authorKind', 'Posting as', { defaultValue: 'system' }),
    f.bool('edited', 'Edited'),
  ],
};

export const reactions: CollectionDef = {
  name: 'reactions',
  label: 'Reactions',
  singular: 'Reaction',
  icon: 'flux',
  area: 'social',
  scope: 'user',
  serverManaged: true,
  titleField: 'emoji',
  sortField: 'createdAt',
  sortDir: 'desc',
  indexes: [['targetId', 'userId']],
  fields: [
    f.text('targetType', 'Target type', { required: true, defaultValue: 'post' }),
    f.text('targetId', 'Target', { required: true }),
    f.text('emoji', 'Reaction', { required: true, maxLength: 16 }),
  ],
};

export const conversations: CollectionDef = {
  name: 'conversations',
  label: 'Conversations',
  singular: 'Conversation',
  icon: 'message',
  area: 'social',
  scope: 'user',
  serverManaged: true,
  titleField: 'title',
  sortField: 'lastMessageAt',
  sortDir: 'desc',
  indexes: [['userId', 'lastMessageAt']],
  description:
    'One row per participant per thread, so read state, requests and per-user chat settings stay scoped to the person they belong to.',
  fields: [
    f.text('threadId', 'Thread', { required: true }),
    f.text('otherUserId', 'With', { required: true, inList: true }),
    f.text('title', 'Title', { searchable: true }),
    f.ref('asMemberId', 'Speaking as', 'members'),
    f.datetime('lastMessageAt', 'Last message', { inList: true }),
    f.text('lastMessagePreview', 'Preview', { sensitive: true }),
    f.int('unreadCount', 'Unread', { defaultValue: 0, inList: true }),
    f.enumOf('state', 'State', [
      { value: 'accepted', label: 'Open' },
      { value: 'request', label: 'Message request' },
      { value: 'archived', label: 'Archived' },
      { value: 'blocked', label: 'Blocked' },
    ], { defaultValue: 'accepted', inList: true }),
    f.bool('muted', 'Muted'),
    f.bool('pinned', 'Pinned'),
    f.json('settings', 'Chat settings', {
      hint: 'Per-conversation notification, receipt and appearance choices.',
    }),
  ],
};

export const messages: CollectionDef = {
  name: 'messages',
  label: 'Messages',
  singular: 'Message',
  icon: 'message',
  area: 'social',
  scope: 'user',
  serverManaged: true,
  titleField: 'body',
  sortField: 'sentAt',
  sortDir: 'asc',
  indexes: [['threadId', 'sentAt'], ['threadId', 'sequence']],
  description:
    'Ordered by a server-assigned sequence so a late-arriving or re-sent message still lands in the right place.',
  fields: [
    f.text('threadId', 'Thread', { required: true }),
    f.text('senderUserId', 'Sender', { required: true }),
    f.ref('senderMemberId', 'Sent by member', 'members'),
    f.long('body', 'Message', { sensitive: true }),
    f.datetime('sentAt', 'Sent', { required: true, inList: true }),
    f.int('sequence', 'Sequence', { required: true, defaultValue: 0 }),
    f.json('attachments', 'Attachments'),
    f.json('readBy', 'Read by'),
    f.bool('edited', 'Edited'),
    f.bool('encrypted', 'Encrypted', {
      hint: 'Set only when the body really is ciphertext the server cannot read.',
    }),
    f.text('encryptionKeyId', 'Key id'),
    f.text('clientId', 'Client id', { hint: 'De-duplicates re-sends from an offline outbox.' }),
    f.ref('replyToId', 'In reply to', 'messages'),
    f.json('reactions', 'Reactions', { hint: 'Map of emoji to the userIds who used it.' }),
    f.json('forwardedFrom', 'Forwarded from', {
      hint: 'Where this was forwarded from, if it was: { kind, threadId, messageId, senderLabel }.',
    }),
  ],
};

export const notifications: CollectionDef = {
  name: 'notifications',
  label: 'Notifications',
  singular: 'Notification',
  icon: 'notification',
  area: 'social',
  scope: 'user',
  serverManaged: true,
  titleField: 'title',
  sortField: 'createdAt',
  sortDir: 'desc',
  indexes: [['userId', 'readAt'], ['userId', 'createdAt']],
  fields: [
    f.text('kind', 'Kind', { required: true, inList: true }),
    f.text('title', 'Title', { required: true, inList: true }),
    f.text('body', 'Body', { maxLength: 500 }),
    f.text('category', 'Category', { required: true, defaultValue: 'system', inList: true }),
    f.text('link', 'Opens', { hint: 'In-app route this notification deep-links to.' }),
    f.datetime('readAt', 'Read'),
    f.json('meta', 'Details'),
    f.text('actorUserId', 'From'),
    f.ref('actorMemberId', 'From member', 'members'),
  ],
};

export const devices: CollectionDef = {
  name: 'devices',
  label: 'Devices',
  singular: 'Device',
  icon: 'device',
  area: 'social',
  scope: 'user',
  serverManaged: true,
  neverPublic: true,
  titleField: 'label',
  sortField: 'lastSeenAt',
  sortDir: 'desc',
  backup: false,
  fields: [
    f.text('label', 'Device', { required: true, inList: true }),
    f.text('platform', 'Platform', { inList: true }),
    f.text('pushEndpoint', 'Push endpoint', { sensitive: true, maxLength: 2000 }),
    f.text('pushP256dh', 'Push key', { sensitive: true }),
    f.text('pushAuth', 'Push auth', { sensitive: true }),
    f.datetime('lastSeenAt', 'Last seen', { inList: true }),
    f.datetime('lastSyncAt', 'Last sync'),
    f.bool('pushEnabled', 'Push enabled', { defaultValue: true }),
  ],
};

export const SOCIAL_COLLECTIONS = [
  constellationProfiles,
  friendships,
  friendRequests,
  posts,
  comments,
  reactions,
  conversations,
  messages,
  notifications,
  devices,
] as const;
