import asyncio
import tempfile
import unittest
from pathlib import Path

from custom_components.rozvodna.database import Database
from custom_components.rozvodna.engine import Engine, Problem


def change(object_id, field, before, after, kind="entity"):
    return dict(kind=kind, object_id=object_id, field=field, before=before, after=after)


class Registry:
    def __init__(self):
        self.rows = {
            ("entity", "a"): {"name": None, "entity_id": "sensor.a", "labels": []},
            ("entity", "b"): {"name": "B", "entity_id": "sensor.b", "labels": []},
            ("device", "d"): {"name": "Device", "area_id": None, "labels": []},
        }
        self.fail = None

    def snapshot(self):
        return {"objects": len(self.rows)}

    def target(self, kind, object_id):
        values = self.rows.get((kind, object_id))
        return None if values is None else {
            "values": values.copy(), "title": object_id, "integration": "test"
        }

    def occupied(self, entity_id):
        return any(row.get("entity_id") == entity_id for row in self.rows.values())

    def exists(self, field, value):
        return value == {"area_id": "kitchen", "labels": "blue"}[field]

    def apply(self, op):
        if self.fail == op.object_id:
            raise RuntimeError("test failure")
        self.rows[(op.kind, op.object_id)][op.field] = op.after


class EngineTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.db = Database(Path(folder.name) / "test.sqlite3")
        self.registry = Registry()
        self.engine = Engine(self.db, self.registry, asyncio.to_thread)
        await self.engine.initialize()

    async def stage(self, *changes, user="alice", revision=0):
        return await self.engine.stage(user, revision, changes)

    async def test_commit_and_revert_by_stable_id(self):
        await self.stage(change("a", "name", None, "A"),
                         change("a", "entity_id", "sensor.a", "sensor.new"))
        self.assertEqual((await self.engine.state("bob"))["changes"], [])
        commit = await self.engine.commit("alice", 1, None)
        self.assertEqual(commit["status"], "saved")
        self.assertEqual((await self.engine.state("alice"))["changes"], [])
        restored = await self.engine.revert("alice", 2, commit["id"], [0, 1])
        self.assertEqual(len(restored["changes"]), 2)
        self.assertEqual(self.registry.rows["entity", "a"]["entity_id"], "sensor.new")
        undo = await self.engine.commit("alice", 3, "Undo")
        self.assertEqual(self.registry.rows["entity", "a"]["entity_id"], "sensor.a")
        self.assertEqual({op["source"] for op in undo["operations"]}, {commit["id"]})
        self.assertEqual(len(await self.engine.history()), 2)

    async def test_revert_conflict(self):
        await self.stage(change("a", "name", None, "A"))
        commit = await self.engine.commit("alice", 1, None)
        self.registry.rows["entity", "a"]["name"] = "External"
        with self.assertRaisesRegex(Problem, "changed"):
            await self.engine.revert("alice", 2, commit["id"], None)

    async def test_occupied_id_and_duplicate_destinations(self):
        with self.assertRaisesRegex(Problem, "occupied"):
            await self.stage(change("a", "entity_id", "sensor.a", "sensor.b"))
        with self.assertRaisesRegex(Problem, "invalid_entity_id"):
            await self.stage(change("a", "entity_id", "sensor.a", "light.a"))
        await self.stage(change("a", "entity_id", "sensor.a", "sensor.new"))
        await self.stage(change("b", "entity_id", "sensor.b", "sensor.new"), revision=1)
        result = await self.engine.commit("alice", 2, None)
        self.assertEqual(result["status"], "conflict")
        self.assertEqual(len(result["issues"]), 2)

    async def test_preflight_checks_every_field_before_any_write(self):
        await self.stage(change("a", "name", None, "A"), change("b", "name", "B", "C"))
        del self.registry.rows["entity", "b"]
        result = await self.engine.commit("alice", 1, None)
        self.assertEqual(result["status"], "conflict")
        self.assertIsNone(self.registry.rows["entity", "a"]["name"])
        self.assertEqual(result["issues"][0]["code"], "missing_object")

    async def test_partial_failure_keeps_failed_proposal(self):
        await self.stage(change("a", "name", None, "A"), change("b", "name", "B", "C"))
        self.registry.fail = "b"
        with self.assertLogs("custom_components.rozvodna.engine", level="ERROR"):
            result = await self.engine.commit("alice", 1, None)
        self.assertEqual(result["status"], "partial")
        self.assertEqual([op["status"] for op in result["operations"]], ["saved", "error"])
        self.assertEqual([op["object_id"] for op in (await self.engine.state("alice"))["changes"]], ["b"])

    async def test_interrupted_write_is_never_replayed(self):
        await self.stage(change("a", "name", None, "A"), change("b", "name", "B", "C"))
        start = await self.engine.state("alice")
        from custom_components.rozvodna.engine import Operation
        ops = [Operation(**op) for op in start["changes"]]
        commit_id = self.db.begin("alice", None, [(op, op.object_id, "test") for op in ops])
        self.db.applying(commit_id, 0)
        self.registry.apply(ops[0])
        await self.engine.initialize()
        result = await self.engine.detail(commit_id)
        self.assertEqual(result["status"], "interrupted")
        self.assertEqual([op["status"] for op in result["operations"]], ["uncertain", "skipped"])
        self.assertEqual(self.registry.rows["entity", "b"]["name"], "B")
        self.assertEqual(len((await self.engine.state("alice"))["changes"]), 2)

    async def test_stale_revision_and_return_to_original(self):
        await self.stage(change("a", "name", None, "A"))
        with self.assertRaisesRegex(Problem, "stale_revision"):
            await self.stage(change("b", "name", "B", "C"))
        state = await self.stage(change("a", "name", None, None), revision=1)
        self.assertEqual(state["changes"], [])

    async def test_external_change_during_commit_is_checked_again(self):
        await self.stage(change("a", "name", None, "A"), change("b", "name", "B", "C"))
        apply = self.registry.apply

        def external_change(op):
            apply(op)
            self.registry.rows["entity", "b"]["name"] = "External"

        self.registry.apply = external_change
        result = await self.engine.commit("alice", 1, None)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["operations"][1]["error"], "changed")
        self.assertEqual(self.registry.rows["entity", "b"]["name"], "External")

    async def test_stage_rejects_removed_options(self):
        with self.assertRaisesRegex(Problem, "missing_area"):
            await self.stage(change("d", "area_id", None, "removed", "device"))
        with self.assertRaisesRegex(Problem, "missing_label"):
            await self.stage(change("a", "labels", [], ["removed"]))
