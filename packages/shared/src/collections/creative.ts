import { f, OPTIONS, type CollectionDef } from './schema.js';

export const fics: CollectionDef = {
  name: 'fics',
  label: 'Fic tracker',
  singular: 'Fic',
  icon: 'fic',
  area: 'creative',
  scope: 'system',
  memberScoped: true,
  titleField: 'title',
  sortField: 'updatedAt',
  sortDir: 'desc',
  indexes: [['systemId', 'status']],
  fields: [
    f.text('title', 'Title', { required: true, inList: true, searchable: true }),
    f.text('author', 'Author', { inList: true, searchable: true }),
    f.url('url', 'Link'),
    f.text('platform', 'Platform', { inList: true, hint: 'AO3, FFN, a personal site — anything.' }),
    f.enumOf('status', 'Reading status', OPTIONS.readingStatus, {
      defaultValue: 'queued',
      inList: true,
    }),
    f.text('publicationStatus', 'Fic status', { hint: 'Complete, in progress, hiatus…' }),
    f.int('chaptersRead', 'Chapters read', { defaultValue: 0, inList: true }),
    f.int('chaptersTotal', 'Chapters total'),
    f.int('wordCount', 'Word count'),
    f.datetime('lastReadAt', 'Last read'),
    f.int('rating', 'Your rating', { min: 1, max: 5, inList: true }),
    f.tags('tags', 'Tags'),
    f.text('fandom', 'Fandom', { inList: true, searchable: true }),
    f.tags('characters', 'Characters'),
    f.long('notes', 'Notes', { searchable: true }),
    f.bool('favorite', 'Favourite'),
    f.text('importSource', 'Imported from'),
  ],
};

export const characters: CollectionDef = {
  name: 'characters',
  label: 'Characters',
  singular: 'Character',
  icon: 'character',
  area: 'creative',
  scope: 'system',
  memberScoped: true,
  titleField: 'name',
  sortField: 'name',
  sortDir: 'asc',
  fields: [
    f.text('name', 'Name', { required: true, inList: true, searchable: true }),
    f.image('imageUrl', 'Image'),
    f.long('biography', 'Biography', { searchable: true }),
    f.tags('traits', 'Traits'),
    f.text('source', 'Source', { inList: true, searchable: true }),
    f.text('pronouns', 'Pronouns'),
    f.text('role', 'Role', { inList: true }),
    f.tags('tags', 'Tags'),
    f.refs('storyIds', 'Appears in', 'stories'),
    f.long('notes', 'Notes', { searchable: true }),
    f.json('customFields', 'Custom fields'),
    f.color('color', 'Colour'),
  ],
};

export const stories: CollectionDef = {
  name: 'stories',
  label: 'Stories',
  singular: 'Story',
  icon: 'story',
  area: 'creative',
  scope: 'system',
  memberScoped: true,
  titleField: 'title',
  sortField: 'updatedAt',
  sortDir: 'desc',
  fields: [
    f.text('title', 'Title', { required: true, inList: true, searchable: true }),
    f.long('summary', 'Summary', { searchable: true }),
    f.text('genre', 'Genre', { inList: true }),
    f.text('setting', 'Setting', { hint: 'Where & when', searchable: true }),
    f.enumOf('status', 'Status', [
      { value: 'planning', label: 'Planning' },
      { value: 'drafting', label: 'Drafting' },
      { value: 'revising', label: 'Revising' },
      { value: 'finished', label: 'Finished' },
      { value: 'shelved', label: 'Shelved' },
    ], { defaultValue: 'planning', inList: true }),
    f.image('coverUrl', 'Cover'),
    f.tags('tags', 'Tags'),
    f.int('wordGoal', 'Word goal'),
    f.long('worldbuilding', 'Worldbuilding', { searchable: true }),
    f.long('notes', 'Notes', { searchable: true }),
    f.json('timeline', 'Timeline'),
    f.color('color', 'Colour'),
  ],
};

export const storyChapters: CollectionDef = {
  name: 'storyChapters',
  label: 'Chapters',
  singular: 'Chapter',
  icon: 'story',
  area: 'creative',
  scope: 'system',
  titleField: 'title',
  sortField: 'sortOrder',
  sortDir: 'asc',
  indexes: [['systemId', 'storyId', 'sortOrder']],
  fields: [
    f.ref('storyId', 'Story', 'stories', { required: true }),
    f.text('title', 'Title', { required: true, inList: true, searchable: true }),
    f.long('body', 'Text', { searchable: true }),
    f.long('summary', 'Summary'),
    f.int('sortOrder', 'Order', { defaultValue: 0 }),
    f.int('wordCount', 'Words', { defaultValue: 0, inList: true }),
    f.text('status', 'Status', { defaultValue: 'draft', inList: true }),
  ],
};

export const storyScenes: CollectionDef = {
  name: 'storyScenes',
  label: 'Scenes',
  singular: 'Scene',
  icon: 'story',
  area: 'creative',
  scope: 'system',
  titleField: 'title',
  sortField: 'sortOrder',
  sortDir: 'asc',
  indexes: [['systemId', 'storyId']],
  fields: [
    f.ref('storyId', 'Story', 'stories', { required: true }),
    f.ref('chapterId', 'Chapter', 'storyChapters'),
    f.text('title', 'Title', { required: true, inList: true, searchable: true }),
    f.long('body', 'Scene', { searchable: true }),
    f.refs('characterIds', 'Characters', 'characters'),
    f.ref('locationId', 'Location', 'storyLocations'),
    f.int('sortOrder', 'Order', { defaultValue: 0 }),
    f.text('pov', 'Point of view'),
    f.tags('tags', 'Tags'),
  ],
};

export const storyLocations: CollectionDef = {
  name: 'storyLocations',
  label: 'Story locations',
  singular: 'Location',
  icon: 'story',
  area: 'creative',
  scope: 'system',
  titleField: 'name',
  sortField: 'name',
  sortDir: 'asc',
  fields: [
    f.ref('storyId', 'Story', 'stories'),
    f.text('name', 'Name', { required: true, inList: true, searchable: true }),
    f.long('description', 'Description', { searchable: true }),
    f.image('imageUrl', 'Image'),
    f.tags('tags', 'Tags'),
  ],
};

export const resources: CollectionDef = {
  name: 'resources',
  label: 'Resources',
  singular: 'Resource',
  icon: 'resource',
  area: 'creative',
  scope: 'system',
  titleField: 'title',
  sortField: 'createdAt',
  sortDir: 'desc',
  fields: [
    f.text('title', 'Title', { required: true, inList: true, searchable: true }),
    f.url('url', 'Link', { inList: true }),
    f.long('summary', 'Summary', { searchable: true }),
    f.text('category', 'Category', { inList: true, searchable: true }),
    f.tags('tags', 'Tags'),
    f.bool('favorite', 'Favourite', { inList: true }),
    f.enumOf('kind', 'Kind', [
      { value: 'link', label: 'Link' },
      { value: 'guide', label: 'Guide' },
      { value: 'reference', label: 'Reference' },
      { value: 'document', label: 'Document' },
      { value: 'contact', label: 'Support contact' },
    ], { defaultValue: 'link', inList: true }),
  ],
};

export const dictionaryTerms: CollectionDef = {
  name: 'dictionaryTerms',
  label: 'Dictionary',
  singular: 'Term',
  icon: 'dictionary',
  area: 'creative',
  scope: 'system',
  titleField: 'term',
  sortField: 'term',
  sortDir: 'asc',
  description: 'Plurality vocabulary plus whatever words this system uses for itself.',
  fields: [
    f.text('term', 'Term', { required: true, inList: true, searchable: true }),
    f.long('definition', 'Definition', { required: true, searchable: true }),
    f.text('category', 'Category', { inList: true, searchable: true }),
    f.long('example', 'Example use'),
    f.tags('synonyms', 'Synonyms'),
    f.bool('favorite', 'Favourite'),
    f.bool('systemSpecific', 'Our own term', {
      hint: 'Marks a word this system coined or redefined.',
    }),

    f.text('pronunciation', 'Pronunciation', {
      hint: 'How it is said, however you like to write that.',
    }),
    f.tags('aliases', 'Also known as', { searchable: true }),
    f.refs('relatedTermIds', 'Related terms', 'dictionaryTerms', {
      hint: 'Words worth reading next to this one.',
    }),
    f.enumOf(
      'definitionType',
      'Kind of term',
      [
        { value: 'general', label: 'General plurality' },
        { value: 'clinical', label: 'Clinical' },
        { value: 'community', label: 'Community' },
        { value: 'system', label: 'Ours' },
        { value: 'slang', label: 'Slang' },
        { value: 'other', label: 'Other' },
      ],
      { inList: true },
    ),
    f.tags('tags', 'Tags'),
    f.ref('folderId', 'Folder', 'noteFolders', { group: 'Organising' }),
    f.int('sortOrder', 'Order', { defaultValue: 0, group: 'Organising' }),
    f.ref('memberId', 'About', 'members', {
      group: 'Links',
      hint: 'When a term belongs to one member in particular.',
    }),
    f.image('coverImageUrl', 'Image', { group: 'Appearance' }),

    /*
     * Where a definition came from, and whether it has been changed since.
     *
     * An imported glossary that somebody then edits is the normal case, and
     * without these the edit is invisible: a re-import would quietly overwrite
     * it, or be refused wholesale. Keeping the source and the edited flag
     * separate means a re-import can leave edited entries alone and still
     * refresh the rest.
     */
    f.text('sourceName', 'Source', { group: 'Source' }),
    f.url('sourceUrl', 'Source link', { group: 'Source' }),
    f.bool('isImported', 'Imported', { group: 'Source' }),
    f.bool('isLocallyEdited', 'Edited here', {
      group: 'Source',
      hint: 'Set once you change an imported entry, so a re-import leaves it alone.',
    }),
  ],
};

export const musicPlaylists: CollectionDef = {
  name: 'musicPlaylists',
  label: 'Playlists',
  singular: 'Playlist',
  icon: 'music',
  area: 'creative',
  scope: 'system',
  memberScoped: true,
  titleField: 'name',
  sortField: 'name',
  sortDir: 'asc',
  fields: [
    f.text('name', 'Name', { required: true, inList: true, searchable: true }),
    f.long('description', 'Description', { searchable: true }),
    f.image('coverUrl', 'Cover'),
    f.color('color', 'Colour'),
    f.bool('isSystemPlaylist', 'System playlist', { defaultValue: true }),
    f.int('trackCount', 'Tracks', { defaultValue: 0, inList: true }),
  ],
};

export const musicTracks: CollectionDef = {
  name: 'musicTracks',
  label: 'Tracks',
  singular: 'Track',
  icon: 'music',
  area: 'creative',
  scope: 'system',
  memberScoped: true,
  titleField: 'title',
  sortField: 'sortOrder',
  sortDir: 'asc',
  indexes: [['systemId', 'playlistId', 'sortOrder']],
  fields: [
    f.ref('playlistId', 'Playlist', 'musicPlaylists'),
    f.text('title', 'Title', { required: true, inList: true, searchable: true }),
    f.text('artist', 'Artist', { inList: true, searchable: true }),
    f.text('album', 'Album', { searchable: true }),
    f.image('artworkUrl', 'Artwork'),
    f.url('previewUrl', 'Audio', {
      hint: 'A short preview from the provider, or the full file if you uploaded one.',
    }),
    f.url('externalUrl', 'Open in provider'),
    f.text('provider', 'Provider', { defaultValue: 'local' }),
    f.text('providerTrackId', 'Provider id'),
    f.int('durationSeconds', 'Duration'),
    f.bool('favorite', 'Favourite', { inList: true }),
    f.int('sortOrder', 'Order', { defaultValue: 0 }),
    f.datetime('lastPlayedAt', 'Last played'),
    f.int('playCount', 'Plays', { defaultValue: 0 }),
  ],
};

export const videoCollections: CollectionDef = {
  name: 'videoCollections',
  label: 'Video collections',
  singular: 'Collection',
  icon: 'video',
  area: 'creative',
  scope: 'system',
  memberScoped: true,
  titleField: 'name',
  sortField: 'name',
  sortDir: 'asc',
  fields: [
    f.text('name', 'Name', { required: true, inList: true, searchable: true }),
    f.long('description', 'Description'),
    f.image('coverUrl', 'Cover'),
    f.int('itemCount', 'Items', { defaultValue: 0, inList: true }),
  ],
};

export const videoItems: CollectionDef = {
  name: 'videoItems',
  label: 'Videos',
  singular: 'Video',
  icon: 'video',
  area: 'creative',
  scope: 'system',
  memberScoped: true,
  titleField: 'title',
  sortField: 'sortOrder',
  sortDir: 'asc',
  fields: [
    f.ref('collectionId', 'Collection', 'videoCollections'),
    f.text('title', 'Title', { required: true, inList: true, searchable: true }),
    f.text('channel', 'Channel', { inList: true, searchable: true }),
    f.url('externalUrl', 'Link', { required: true }),
    f.image('thumbnailUrl', 'Thumbnail'),
    f.text('provider', 'Provider', { defaultValue: 'link' }),
    f.text('providerVideoId', 'Provider id'),
    f.int('durationSeconds', 'Duration'),
    f.bool('favorite', 'Favourite', { inList: true }),
    f.datetime('watchedAt', 'Last watched'),
    f.int('sortOrder', 'Order', { defaultValue: 0 }),
    f.tags('tags', 'Tags'),
  ],
};

export const ficChapters: CollectionDef = {
  name: 'ficChapters',
  label: 'Fic chapters',
  singular: 'Chapter',
  icon: 'fic',
  area: 'creative',
  scope: 'system',
  memberScoped: true,
  titleField: 'title',
  sortField: 'number',
  sortDir: 'asc',
  indexes: [['systemId', 'ficId', 'number']],
  description:
    'Where you are in something long. A fic tracked only as read or unread loses the middle, which is where most of a long work is.',
  fields: [
    f.ref('ficId', 'Fic', 'fics', { required: true, inList: true }),
    f.int('number', 'Chapter', { required: true, inList: true, min: 0 }),
    f.text('title', 'Title', { inList: true, searchable: true }),
    f.int('wordCount', 'Words', { min: 0 }),
    f.date('publishedOn', 'Published'),

    f.enumOf(
      'status',
      'Status',
      [
        { value: 'unread', label: 'Not read' },
        { value: 'reading', label: 'Reading' },
        { value: 'read', label: 'Read' },
        { value: 'skipped', label: 'Skipped' },
      ],
      { defaultValue: 'unread', inList: true },
    ),
    f.datetime('readAt', 'Finished'),
    /*
     * Who read it, not just that it was read. Two members reading the same
     * work at different paces is ordinary, and a single progress marker makes
     * one of them lose their place every time the other opens it.
     */
    f.refs('readByMemberIds', 'Read by', 'members'),
    f.int('progressPercent', 'How far in', { min: 0, max: 100 }),

    f.int('rating', 'Rating', { min: 1, max: 5 }),
    f.long('notes', 'Notes', { searchable: true }),
    f.tags('tags', 'Tags'),
    f.bool('isFavourite', 'Favourite'),
  ],
};

export const CREATIVE_COLLECTIONS = [
  ficChapters,
  fics,
  characters,
  stories,
  storyChapters,
  storyScenes,
  storyLocations,
  resources,
  dictionaryTerms,
  musicPlaylists,
  musicTracks,
  videoCollections,
  videoItems,
] as const;
