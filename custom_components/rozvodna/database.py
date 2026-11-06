"""Durable staging and write journal owned by Rozvodňa."""

import json
import sqlite3
from contextlib import closing, contextmanager
from dataclasses import asdict
from datetime import UTC, datetime
from uuid import uuid4


SCHEMA = (
    """CREATE TABLE baseline (
        id INTEGER PRIMARY KEY CHECK (id = 1), created TEXT NOT NULL, snapshot TEXT NOT NULL
    )""",
    """CREATE TABLE workspace (
        user_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, changes TEXT NOT NULL
    )""",
    """CREATE TABLE commits (
        id TEXT PRIMARY KEY, created TEXT NOT NULL, user_id TEXT NOT NULL,
        message TEXT, status TEXT NOT NULL
    )""",
    """CREATE TABLE operations (
        commit_id TEXT NOT NULL REFERENCES commits(id), position INTEGER NOT NULL,
        kind TEXT NOT NULL, object_id TEXT NOT NULL, field TEXT NOT NULL,
        title TEXT NOT NULL, integration TEXT NOT NULL, before TEXT NOT NULL,
        after TEXT NOT NULL, source TEXT REFERENCES commits(id), status TEXT NOT NULL,
        error TEXT, PRIMARY KEY (commit_id, position)
    )""",
    "CREATE INDEX operations_object ON operations(kind, object_id, field)",
)


class Database:
    def __init__(self, path):
        self.path = path

    @contextmanager
    def connect(self):
        with closing(sqlite3.connect(self.path)) as db, db:
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA foreign_keys = ON")
            yield db

    def initialize(self, snapshot):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version == 0:
                for statement in SCHEMA:
                    db.execute(statement)
                db.execute("PRAGMA user_version = 1")
            elif version != 1:
                raise RuntimeError(f"Unsupported Rozvodňa schema version {version}")
            db.execute("INSERT OR IGNORE INTO baseline VALUES (1, ?, ?)", (now(), json.dumps(snapshot)))
            db.execute("""
                UPDATE operations SET status = 'uncertain', error = 'interrupted'
                WHERE status = 'applying'
            """)
            db.execute("""
                UPDATE operations SET status = 'skipped', error = 'interrupted'
                WHERE status = 'planned'
            """)
            db.execute("UPDATE commits SET status = 'interrupted' WHERE status = 'writing'")

    def state(self, user):
        with self.connect() as db:
            row = db.execute("SELECT revision, changes FROM workspace WHERE user_id = ?", (user,)).fetchone()
        if row is None:
            return {"revision": 0, "changes": []}
        return {"revision": row["revision"], "changes": json.loads(row["changes"])}

    @staticmethod
    def _store_workspace(db, user, revision, changes):
        db.execute("""
            INSERT INTO workspace VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET revision = excluded.revision, changes = excluded.changes
        """, (user, revision, json.dumps([asdict(op) for op in changes])))

    def stage(self, user, revision, changes):
        with self.connect() as db:
            self._store_workspace(db, user, revision, changes)

    def begin(self, user, message, plan):
        commit_id = uuid4().hex
        with self.connect() as db:
            db.execute("INSERT INTO commits VALUES (?, ?, ?, ?, 'writing')",
                       (commit_id, now(), user, message))
            db.executemany("""
                INSERT INTO operations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', NULL)
            """, ((commit_id, i, op.kind, op.object_id, op.field, title, integration,
                   json.dumps(op.before), json.dumps(op.after), op.source)
                  for i, (op, title, integration) in enumerate(plan)))
        return commit_id

    def applying(self, commit_id, position):
        self.outcome(commit_id, position, "applying", None)

    def outcome(self, commit_id, position, status, error):
        with self.connect() as db:
            db.execute("""
                UPDATE operations SET status = ?, error = ?
                WHERE commit_id = ? AND position = ?
            """, (status, error, commit_id, position))

    def finish(self, commit_id, status, user, revision, remaining):
        with self.connect() as db:
            db.execute("UPDATE commits SET status = ? WHERE id = ?", (status, commit_id))
            self._store_workspace(db, user, revision, remaining)

    def history(self, kind=None, object_id=None, field=None, offset=0):
        filters = ""
        args = []
        if kind is not None:
            filters = """WHERE EXISTS (SELECT 1 FROM operations o WHERE o.commit_id = c.id
                         AND o.kind = ? AND o.object_id = ? AND (? IS NULL OR o.field = ?))"""
            args = [kind, object_id, field, field]
        with self.connect() as db:
            return [dict(row) for row in db.execute(f"""
                SELECT c.*, (SELECT count(*) FROM operations WHERE commit_id = c.id) AS count
                FROM commits c {filters} ORDER BY created DESC, id DESC LIMIT 50 OFFSET ?
            """, (*args, offset))]

    def detail(self, commit_id):
        with self.connect() as db:
            row = db.execute("SELECT * FROM commits WHERE id = ?", (commit_id,)).fetchone()
            if row is None:
                return None
            operations = [dict(op) for op in db.execute("""
                SELECT * FROM operations WHERE commit_id = ? ORDER BY position
            """, (commit_id,))]
        for op in operations:
            op["before"] = json.loads(op["before"])
            op["after"] = json.loads(op["after"])
        return {**dict(row), "operations": operations}

    def baseline(self):
        with self.connect() as db:
            row = db.execute("SELECT created, snapshot FROM baseline WHERE id = 1").fetchone()
        return {"created": row["created"], "snapshot": json.loads(row["snapshot"])}


def now():
    return datetime.now(UTC).isoformat()
