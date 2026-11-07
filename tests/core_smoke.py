"""Smoke test using actual Core registries and a loopback WebSocket server.

Run with Python 3.14 and homeassistant==2026.11.0 installed. Uses a fresh config.
"""

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
import shutil
import socket
import tempfile

from aiohttp import ClientSession
from homeassistant import bootstrap, loader
from homeassistant.auth.const import GROUP_ID_ADMIN, GROUP_ID_USER
from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar, device_registry as dr
from homeassistant.helpers import entity_registry as er, label_registry as lr


@asynccontextmanager
async def connection(session, url, token):
    async with session.ws_connect(f"{url}/api/websocket") as ws:
        assert (await ws.receive_json())["type"] == "auth_required"
        await ws.send_json({"type": "auth", "access_token": token})
        assert (await ws.receive_json())["type"] == "auth_ok"
        counter = 0

        async def command(command_type, *, success=True, **kwargs):
            nonlocal counter
            counter += 1
            await ws.send_json({"id": counter, "type": command_type, **kwargs})
            result = await ws.receive_json(timeout=15)
            assert result["id"] == counter and result["success"] == success, result
            return result["result"] if success else result["error"]

        yield command


async def token(hass, name, group):
    user = await hass.auth.async_create_user(name, group_ids=[group])
    refresh = await hass.auth.async_create_refresh_token(user, client_id="http://localhost/")
    return hass.auth.async_create_access_token(refresh)


async def smoke(folder):
    source = Path(__file__).resolve().parents[1] / "custom_components" / "rozvodna"
    shutil.copytree(source, Path(folder) / "custom_components" / "rozvodna",
                    ignore=shutil.ignore_patterns("__pycache__"))
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    url = f"http://127.0.0.1:{port}"
    hass = HomeAssistant(folder)
    loader.async_setup(hass)
    config = {"http": {"server_host": "127.0.0.1", "server_port": port}, "frontend": {}, "config": {}}
    assert await bootstrap.async_from_config_dict(config, hass) is hass
    await hass.async_start()
    try:
        flow = await hass.config_entries.flow.async_init("rozvodna", context={"source": "user"})
        assert flow["type"] == "form", flow
        created = await hass.config_entries.flow.async_configure(flow["flow_id"], {})
        assert created["type"] == "create_entry", created
        entry = created["result"]
        assert entry.state.value == "loaded", entry.state
        duplicate = await hass.config_entries.flow.async_init("rozvodna", context={"source": "user"})
        assert duplicate["type"] == "abort", duplicate

        devices, entities = dr.async_get(hass), er.async_get(hass)
        device = devices.async_get_or_create(config_entry_id=entry.entry_id,
                                              identifiers={("rozvodna", "parent")}, name="Parent")
        child = devices.async_get_or_create_child(config_entry_id=entry.entry_id, parent_device_id=device.id,
                                                   identifiers={("rozvodna", "child")}, name="Child")
        entity = entities.async_get_or_create("sensor", "rozvodna", "test-entity", config_entry=entry,
                                              device_id=child.id, original_name="Test", has_entity_name=True)
        replacement = entities.async_get_or_create("sensor", "rozvodna", "replacement", config_entry=entry,
                                                   device_id=device.id, original_name="Test", has_entity_name=True)
        area = ar.async_get(hass).async_create("Test Area", icon="mdi:door")
        label = lr.async_get(hass).async_create("Test Label", icon="mdi:tag", color="#00bcd4")
        admin = await token(hass, "Admin", GROUP_ID_ADMIN)
        regular = await token(hass, "Viewer", GROUP_ID_USER)
        async with ClientSession() as session:
            async with connection(session, url, regular) as ws:
                panels = await ws("get_panels")
                assert "rozvodna" not in panels
                denied = await ws("rozvodna/snapshot", success=False)
                assert denied["code"] == "unauthorized", denied
            async with connection(session, url, admin) as ws:
                panel = (await ws("get_panels"))["rozvodna"]
                assert panel["require_admin"]
                module = panel["config"]["_panel_custom"]["module_url"]
                async with session.get(url + module) as response:
                    assert response.status == 200 and "class RozvodnaPanel" in await response.text()
                plan = await ws("rozvodna/replacement_preview", old=child.id, new=device.id,
                                mapping={entity.entity_id: replacement.entity_id})
                assert plan["pairs"][0]["target"] == replacement.entity_id, plan
                assert entities.async_get(entity.entity_id).id == entity.id
                snapshot = await ws("rozvodna/snapshot")
                children = [row for row in snapshot["devices"] if row["id"] == child.id]
                assert children and children[0]["parent_device_id"] == device.id, snapshot
                assert any(row["id"] == entity.id for row in snapshot["entities"])
                assert snapshot["areas"][0] == {"id": area.id, "name": area.name, "icon": "mdi:door"}
                assert snapshot["labels"][0] == {
                    "id": label.label_id, "name": label.name, "icon": "mdi:tag", "color": "#00bcd4"
                }
                initial = (await ws("rozvodna/baseline"))["snapshot"]
                assert all(row["id"] != entity.id for row in initial["entities"])
                state = await ws("rozvodna/stage", revision=0, changes=[
                    dict(kind="device", object_id=child.id, field="area_id", before=None, after=area.id),
                    dict(kind="entity", object_id=entity.id, field="name", before=None, after="Own name"),
                    dict(kind="entity", object_id=entity.id, field="entity_id", before=entity.entity_id,
                         after="sensor.rozvodna_renamed"),
                    dict(kind="entity", object_id=entity.id, field="labels", before=[], after=[label.label_id]),
                ])
                assert state["revision"] == 1 and len(state["changes"]) == 4, state
                denied = await ws("rozvodna/commit", revision=1, success=False)
                assert denied["code"] == "rename_confirmation_required", denied
                references = await ws("rozvodna/references", revision=1)
                commit = await ws("rozvodna/commit", revision=1, acknowledge_rename=True,
                                  reference_token=references["token"], reference_ids=[])
                assert commit["status"] == "saved", commit
                assert entities.async_get(entity.id).entity_id == "sensor.rozvodna_renamed"
                assert entities.async_get(entity.id).name == "Own name"
                assert (await ws("rozvodna/history", kind="entity", object_id=entity.id, field="name"))[0]["id"] == commit["id"]
                undo = await ws("rozvodna/revert", revision=2, commit_id=commit["id"])
                assert len(undo["changes"]) == 4 and entities.async_get(entity.id).name == "Own name"
                assert await hass.config_entries.async_reload(entry.entry_id)
                assert len((await ws("rozvodna/state"))["changes"]) == 4
                undo_references = await ws("rozvodna/references", revision=3)
                undone = await ws("rozvodna/commit", revision=3, acknowledge_rename=True,
                                  reference_token=undo_references["token"], reference_ids=[])
                assert undone["status"] == "saved", undone
                assert entities.async_get(entity.id).entity_id == entity.entity_id
                assert entities.async_get(entity.id).name is None
                await hass.config_entries.async_remove(entry.entry_id)
                assert "rozvodna" not in await ws("get_panels")
                assert (await ws("rozvodna/snapshot", success=False))["code"] == "inactive"
        print("Core 2026.11.0 smoke passed: config flow, panel, WebSocket permissions, registries, commit, reload, revert and removal.")
    finally:
        await hass.async_stop(force=True)


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="rozvodna-ha-") as temp:
        asyncio.run(smoke(temp))
