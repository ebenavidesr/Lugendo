---
name: Drizzle LEFT JOIN for nullable foreign keys
description: Use raw SQL with LEFT JOIN when a FK column is nullable so rows without a linked record still appear
---

## Rule
When a FK column is nullable, querying with a Drizzle relational join or a plain INNER JOIN will silently drop rows that have no matching record in the referenced table. Use `db.execute(sql\`...\`)` with a LEFT JOIN to preserve all rows.

**Why:** Traveler free activities have no `activityId` (ad-hoc). Using INNER JOIN filtered them out completely.

**How to apply:** Use `LEFT JOIN activities a ON a.id = tda.activity_id`. Check for null results before using joined fields. Import `sql` from `drizzle-orm`.
