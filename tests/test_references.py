import asyncio
import copy
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from custom_components.rozvodna.database import Database
from custom_components.rozvodna.engine import Engine, Problem
from custom_components.rozvodna.references import References, find_references


class Dashboard:
    mode = "storage"
    url_path = "home"
    config = {"title": "Domov"}

    def __init__(self):
        self.data = {"views": [{"cards": [
            {"type": "entity", "entity": "sensor.old"},
            {"type": "entities", "entities": [{"entity": "sensor.old"}]},
            {"type": "markdown", "content": "{{ states('sensor.old') }}"},
            {"type": "custom:example-card", "entity": "sensor.old"},
        ]}]}
        self.fail_save_count = 0
        self.fail_load = False

    async def async_load(self, force):
        if self.fail_load:
            raise RuntimeError("simulated dashboard read failure")
        return copy.deepcopy(self.data)

    async def async_save(self, config):
        if self.fail_save_count:
            self.fail_save_count -= 1
            raise RuntimeError("simulated dashboard write failure")
        self.data = copy.deepcopy(config)


class Registry:
    def __init__(self):
        self.values = {"entity_id": "sensor.old", "name": None}
        self.fail_rename = False

    def snapshot(self):
        return {"entities": []}

    def target(self, kind, object_id):
        if (kind, object_id) != ("entity", "entity-1"):
            return None
        return {"kind": kind, "id": object_id, "title": "Old sensor", "integration": "test",
                "values": self.values.copy()}

    def occupied(self, entity_id):
        return entity_id == "sensor.other"

    def exists(self, field, value):
        return False

    def apply(self, op):
        if op.field == "entity_id" and self.fail_rename:
            raise RuntimeError("simulated entity registry write failure")
        self.values[op.field] = op.after


def staged_rename():
    return {"kind": "entity", "object_id": "entity-1", "field": "entity_id",
            "before": "sensor.old", "after": "sensor.new"}


class ReferencesTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.dashboard = Dashboard()
        self.hass = SimpleNamespace(data={
            "lovelace": SimpleNamespace(dashboards={"home": self.dashboard}),
            "automation": SimpleNamespace(entities=[SimpleNamespace(
                entity_id="automation.test", name="Test automation",
                raw_config={"trigger": [{"platform": "state", "entity_id": "sensor.old"}],
                            "condition": [{"condition": "template", "value_template": "{{ states('sensor.old') }}"}]},
            )]),
            "script": SimpleNamespace(entities=[]),
        })
        self.references = References(self.hass)
        self.registry = Registry()
        self.engine = Engine(Database(Path(self.folder.name) / "test.sqlite3"), self.registry,
                             asyncio.to_thread, self.references)
        await self.engine.initialize()

    async def test_scans_only_storage_dashboard_sources_and_ignores_names(self):
        findings = find_references({
            "entity_id": "sensor.old",
            "entity_ids": ["sensor.old", "sensor.old_extra"],
            "name": "sensor.old",
            "comment": "sensor.old",
            "value_template": "{{ states('sensor.old') }}",
            "custom": {"type": "custom:example-card", "entity": "sensor.old"},
        }, "sensor.old")
        self.assertEqual(findings, [
            ("/entity_id", "static"), ("/entity_ids/0", "static"),
            ("/value_template", "dynamic"), ("/custom/entity", "ambiguous"),
        ])
        await self.engine.stage("alice", 0, [staged_rename()])
        report = await self.engine.preview_references("alice", 1)
        automatic = [item for item in report["matches"] if item["automatic"]]
        manual = [item for item in report["matches"] if not item["automatic"]]
        self.assertEqual(len(automatic), 2)
        self.assertEqual([item["reason"] for item in manual], ["dynamic", "ambiguous"])
        self.assertEqual(report["coverage"]["automations"], 0)

    async def test_unreadable_dashboard_is_reported_without_partial_scan(self):
        self.dashboard.fail_load = True
        await self.engine.stage("alice", 0, [staged_rename()])
        report = await self.engine.preview_references("alice", 1)
        self.assertEqual(report["coverage"]["unavailable_dashboards"], 1)
        self.assertEqual(report["matches"], [])

    async def test_auto_repairs_share_commit_and_revert_as_one_unit(self):
        await self.engine.stage("alice", 0, [staged_rename()])
        report = await self.engine.preview_references("alice", 1)
        ids = [item["id"] for item in report["matches"] if item["automatic"]]
        commit = await self.engine.commit("alice", 1, None, report["token"], ids)
        self.assertEqual(commit["status"], "saved")
        self.assertEqual(len(commit["operations"]), 3)
        self.assertEqual(self.registry.values["entity_id"], "sensor.new")
        self.assertEqual(self.dashboard.data["views"][0]["cards"][0]["entity"], "sensor.new")
        self.assertTrue(all(op["status"] == "saved" for op in commit["operations"]))
        with self.assertRaisesRegex(Problem, "dependent_revert"):
            await self.engine.revert("alice", 2, commit["id"], [0])
        undo = await self.engine.revert("alice", 2, commit["id"], None)
        restored = await self.engine.commit("alice", undo["revision"], "Undo")
        self.assertEqual(restored["status"], "saved")
        self.assertEqual(self.registry.values["entity_id"], "sensor.old")
        self.assertEqual(self.dashboard.data["views"][0]["cards"][0]["entity"], "sensor.old")

    async def test_source_change_after_preview_blocks_every_write(self):
        await self.engine.stage("alice", 0, [staged_rename()])
        report = await self.engine.preview_references("alice", 1)
        self.dashboard.data["views"][0]["cards"][0]["entity"] = "sensor.other"
        with self.assertRaisesRegex(Problem, "reference_conflict"):
            await self.engine.commit("alice", 1, None, report["token"], [])
        self.assertEqual(self.registry.values["entity_id"], "sensor.old")

    async def test_dashboard_write_failure_is_recorded_as_partial(self):
        await self.engine.stage("alice", 0, [staged_rename()])
        report = await self.engine.preview_references("alice", 1)
        ids = [item["id"] for item in report["matches"] if item["automatic"]]
        self.dashboard.fail_save_count = 1
        with self.assertLogs("custom_components.rozvodna.engine", level="ERROR"):
            commit = await self.engine.commit("alice", 1, None, report["token"], ids)
        self.assertEqual(commit["status"], "partial")
        self.assertEqual([op["status"] for op in commit["operations"]], ["saved", "error", "saved"])
        self.assertEqual(self.registry.values["entity_id"], "sensor.new")
        self.assertEqual(self.dashboard.data["views"][0]["cards"][0]["entity"], "sensor.old")
        self.assertEqual(self.dashboard.data["views"][0]["cards"][1]["entities"][0]["entity"], "sensor.new")

    async def test_dashboard_repairs_are_skipped_when_entity_rename_fails(self):
        await self.engine.stage("alice", 0, [staged_rename()])
        report = await self.engine.preview_references("alice", 1)
        ids = [item["id"] for item in report["matches"] if item["automatic"]]
        self.registry.fail_rename = True
        with self.assertLogs("custom_components.rozvodna.engine", level="ERROR"):
            commit = await self.engine.commit("alice", 1, None, report["token"], ids)
        self.assertEqual(commit["status"], "error")
        self.assertEqual([op["status"] for op in commit["operations"]], ["error", "skipped", "skipped"])
        self.assertEqual([op["error"] for op in commit["operations"]][1:], ["rename_not_saved"] * 2)
        self.assertEqual(self.registry.values["entity_id"], "sensor.old")
        self.assertEqual(self.dashboard.data["views"][0]["cards"][0]["entity"], "sensor.old")


if __name__ == "__main__":
    unittest.main()
