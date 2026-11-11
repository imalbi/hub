import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const history = sqliteTable('history', {
  id: text('id').notNull(),
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  playedAt: integer('played_at').notNull(),
});

export const favorites = sqliteTable('favorites', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  addedAt: integer('added_at').notNull(),
});

export const playlists = sqliteTable('playlists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const playlistSongs = sqliteTable('playlist_songs', {
  playlistId: integer('playlist_id')
    .notNull()
    .references(() => playlists.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  id: text('id').notNull(),
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  addedAt: integer('added_at').notNull(),
});
