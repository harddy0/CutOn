# Database Indexes

Since the **M0 free tier** does not support programmatic index creation (neither
via the MongoDB driver's `createSearchIndexes` nor the Atlas Admin API), you
must create **vector search indexes manually** via the Atlas UI.

Regular MongoDB application indexes (unique email, lookups, etc.) are created
automatically by `npm run db:reset`.

---

## Regular Indexes (auto-created by `db:reset`)

These are created automatically by `DatabaseClient.create_indexes()` during
`npm run db:reset`. No manual action needed.

| Collection | Index Keys | Options |
|---|---|---|
| `users` | `email` asc | unique |
| `topics` | `user_id` asc | — |
| `topics` | `user_id` asc, `created_at` desc | — |
| `sources` | `user_id` asc | — |
| `sources` | `topic_id` asc | — |
| `sources` | `file_hash` asc | — |
| `document_chunks` | `user_id` asc | — |
| `document_chunks` | `topic_id` asc | — |
| `document_chunks` | `source_id` asc | — |
| `document_chunks` | `source_id` asc, `chunk_index` asc | — |
| `document_chunks` | `source_id` asc, `chunk_hash` asc | unique |
| `document_chunks` | `embedding_model` asc | — |
| `document_chunks` | `embedding_status` asc | — |
| `document_chunks` | `source_id` asc, `embedding_status` asc | — |
| `journal_entries` | `user_id` asc | — |
| `journal_entries` | `topic_id` asc | — |
| `journal_entries` | `user_id` asc, `topic_id` asc, `created_at` desc | — |
| `journal_entries` | `embedding_model` asc | — |
| `journal_entries` | `embedding_status` asc | — |

---

## Vector Search Indexes (create manually via Atlas UI)

These **must be created manually** in the Atlas UI because M0 free tier does not
support programmatic search index creation.

### Steps

1. Go to your [MongoDB Atlas](https://cloud.mongodb.com) cluster.
2. Click the **Atlas Search** tab.
3. Click **Create Search Index**.
4. Select **JSON Editor**.
5. Paste the definition below.
6. Click **Create**.

### Index 1 — `vector_index_chunks`

Created on the `document_chunks` collection for searching document text.

```json
{
  "name": "vector_index_chunks",
  "type": "vectorSearch",
  "definition": {
    "fields": [
      {
        "type": "vector",
        "path": "embedding",
        "numDimensions": 768,
        "similarity": "cosine"
      },
      {
        "type": "filter",
        "path": "topic_id"
      },
      {
        "type": "filter",
        "path": "user_id"
      }
    ]
  }
}
```

### Index 2 — `vector_index_journals`

Created on the `journal_entries` collection for searching journal text.

```json
{
  "name": "vector_index_journals",
  "type": "vectorSearch",
  "definition": {
    "fields": [
      {
        "type": "vector",
        "path": "embedding",
        "numDimensions": 768,
        "similarity": "cosine"
      },
      {
        "type": "filter",
        "path": "topic_id"
      },
      {
        "type": "filter",
        "path": "user_id"
      }
    ]
  }
}
```

### Notes

- **Dimensions**: 768 (Gemini `gemini-embedding-2-flash` output size).
- **Similarity**: Cosine (recommended for normalized embeddings).
- **Filter fields**: `topic_id` and `user_id` allow pre-filtering results by
  ownership before vector search — critical for multi-tenant queries.
