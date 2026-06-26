"""
Create Atlas Search vector indexes programmatically via pymongo driver.

Use this script when running on a non-M0 cluster (M2+, Serverless, or local
MongoDB with Atlas Search enabled).  On each collection it idempotently
creates the vectorSearch index needed by the Query and Study Buddy modules.

Usage
-----
    python -m app.db.create_indexes
    npm run db:indexes                    # equivalent via package.json

Requirements
------------
- A running MongoDB instance reachable via ``MONGO_URI``.
- A cluster tier that supports Atlas Search index creation via the driver
  (M2+, Serverless, or local dev).
- Project dependencies installed (``pip install -r requirements.txt``).
"""

import asyncio
import logging
import sys

from pymongo.errors import OperationFailure, PyMongoError

from app.db.client import DatabaseClient

logger = logging.getLogger("app.db.create_indexes")

# ---------------------------------------------------------------------------
# Atlas Search vector index definitions
#
# These mirror docs/INDEXES.md.  Dimensions = 3072 (Gemini embedding-2-flash).
# ---------------------------------------------------------------------------

VECTOR_INDEXES: list[dict] = [
    {
        "collection": "document_chunks",
        "name": "vector_index_chunks",
        "model": {
            "definition": {
                "mappings": {
                    "dynamic": False,
                    "fields": {
                        "embedding": {
                            "type": "knnVector",
                            "dimensions": 3072,
                            "similarity": "cosine",
                        },
                        "topic_id": {"type": "filter"},
                        "user_id": {"type": "filter"},
                    },
                }
            }
        },
    },
    {
        "collection": "journal_entries",
        "name": "vector_index_journals",
        "model": {
            "definition": {
                "mappings": {
                    "dynamic": False,
                    "fields": {
                        "embedding": {
                            "type": "knnVector",
                            "dimensions": 3072,
                            "similarity": "cosine",
                        },
                        "topic_id": {"type": "filter"},
                        "user_id": {"type": "filter"},
                    },
                }
            }
        },
    },
]


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------


async def index_exists(collection, index_name: str) -> bool:
    """Return True if a search index with *index_name* already exists."""
    try:
        async for idx in collection.list_search_indexes():
            if idx.get("name") == index_name:
                return True
    except OperationFailure:
        # Collection might not exist yet — treat as "not found"
        pass
    except PyMongoError:
        # list_search_indexes may not be supported on all tiers — treat as "not found"
        pass
    return False


async def run() -> None:
    """Connect, ensure collections exist, and create each vector search index."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    logger.info("Connecting to MongoDB …")
    await DatabaseClient.connect()

    created: list[str] = []
    skipped: list[str] = []
    failed: list[str] = []

    for cfg in VECTOR_INDEXES:
        coll_name = cfg["collection"]
        index_name = cfg["name"]
        model = cfg["model"]

        coll = getattr(DatabaseClient, coll_name, None)
        if coll is None:
            logger.warning("  ✗ Collection attribute '%s' not found on DatabaseClient", coll_name)
            failed.append(f"{coll_name}.{index_name}")
            continue

        # Check existence
        if await index_exists(coll, index_name):
            logger.info("  ✓ Already exists: %s on %s", index_name, coll_name)
            skipped.append(f"{coll_name}.{index_name}")
            continue

        try:
            logger.info("  Creating %s on %s …", index_name, coll_name)
            await coll.create_search_index(model=model, name=index_name)
            logger.info("  ✓ Created: %s on %s", index_name, coll_name)
            created.append(f"{coll_name}.{index_name}")
        except OperationFailure as exc:
            # Common failures: M0 tier, index already exists (race), etc.
            logger.warning("  ✗ Failed to create %s on %s: %s", index_name, coll_name, exc)
            failed.append(f"{coll_name}.{index_name}")
        except PyMongoError as exc:
            logger.error("  ✗ Error creating %s on %s: %s", index_name, coll_name, exc)
            failed.append(f"{coll_name}.{index_name}")

    await DatabaseClient.close()

    # ── Summary ────────────────────────────────────────────────────────
    logger.info("")
    logger.info("═" * 52)
    logger.info("  Vector index creation — summary")
    logger.info("═" * 52)
    if created:
        logger.info("  Created: %s", ", ".join(created))
    if skipped:
        logger.info("  Skipped (already exist): %s", ", ".join(skipped))
    if failed:
        logger.info("  Failed: %s", ", ".join(failed))
    logger.info("═" * 52)

    if failed:
        sys.exit(1)


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
