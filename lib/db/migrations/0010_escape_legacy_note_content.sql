-- One-time data migration: trip_notes.content used to be plain text (rendered client-side with
-- whitespace-pre-wrap). The notes editor now stores/renders sanitized HTML (see
-- artifacts/api-server/src/lib/sanitize.ts, artifacts/lugendo-app/src/components/trip-notes-tab.tsx),
-- so existing plain-text rows must be HTML-escaped once before the HTML-rendering frontend code
-- goes live -- otherwise characters like < or > in old notes would be misinterpreted as markup,
-- and newlines would collapse since HTML ignores bare \n. Migrations run at server startup before
-- the app accepts requests, so by the time any note is created/updated in the new HTML format,
-- this has already run against the old plain-text rows -- no ambiguity between old/new format.
-- Order matters: escape & first (before introducing &lt;/&gt;/<br> which contain &), then < and >,
-- then normalize \r\n, then convert \n to <br> last (so the <br> tags aren't themselves escaped).
UPDATE "trip_notes"
SET "content" = replace(
  replace(
    replace(
      replace(
        replace("content", '&', '&amp;'),
        '<', '&lt;'
      ),
      '>', '&gt;'
    ),
    E'\r\n', E'\n'
  ),
  E'\n', '<br>'
)
WHERE "content" IS NOT NULL;
