"""Admin-only WebSocket API."""

import asyncio

from homeassistant.components import websocket_api as ws
from homeassistant.exceptions import HomeAssistantError
import probatio as p

from . import DOMAIN
from .engine import FIELDS, Problem

KEY = {p.Required("kind"): p.In(FIELDS), p.Required("object_id"): str, p.Required("field"): str}
VALUE = p.Any(None, str, [str])
CHANGE = {**KEY, p.Required("before"): VALUE, p.Required("after"): VALUE}
REVISION = {p.Required("revision"): p.All(int, p.Range(min=0))}


def register_commands(hass):
    commands = {
        "snapshot": ({}, snapshot),
        "replacement_preview": ({p.Required("old"): str, p.Required("new"): str,
                                 p.Required("mapping"): {str: p.Any(None, str)}}, replacement_preview),
        "replacement_execute": ({p.Required("old"): str, p.Required("new"): str,
                                 p.Required("mapping"): {str: p.Any(None, str)},
                                 p.Required("token"): str, p.Required("reference_ids"): [str]}, replacement_execute),
        "state": ({}, state),
        "stage": ({**REVISION, p.Required("changes"): [CHANGE], p.Optional("drop"): [KEY]}, stage),
        "commit": ({**REVISION, p.Optional("message"): p.All(str, p.Length(max=255)),
                    p.Optional("acknowledge_rename"): bool,
                    p.Optional("reference_token"): str,
                    p.Optional("reference_ids"): [str]}, commit),
        "references": ({**REVISION}, references),
        "history": ({p.Optional("kind"): p.In(FIELDS), p.Optional("object_id"): str,
                     p.Optional("field"): str, p.Optional("offset"): p.All(int, p.Range(min=0))}, history),
        "detail": ({p.Required("commit_id"): str}, detail),
        "revert": ({**REVISION, p.Required("commit_id"): str,
                    p.Optional("positions"): [p.All(int, p.Range(min=0))]}, revert),
        "baseline": ({}, baseline),
    }
    for name, (schema, handler) in commands.items():
        _register(hass, name, schema, handler)


def _register(hass, name, schema, handler):
    @ws.require_admin
    @ws.websocket_command({p.Required("type"): f"{DOMAIN}/{name}", **schema})
    @ws.async_response
    async def command(hass, connection, msg):
        engine = hass.data.get(DOMAIN)
        if engine is None or not engine.active:
            connection.send_error(msg["id"], "inactive", "inactive")
            return
        try:
            result = await handler(engine, connection.user.id, msg, hass)
        except Problem as error:
            connection.send_error(msg["id"], str(error), str(error))
            return
        connection.send_result(msg["id"], result)

    ws.async_register_command(hass, command)


async def snapshot(engine, user, msg, hass):
    return engine.registry.snapshot()


async def replacement_preview(engine, user, msg, hass):
    from .replacer import preview

    async with engine.lock:
        engine._check_active()
        return await preview(engine.registry, engine.references, msg["old"], msg["new"], msg["mapping"])


async def replacement_execute(engine, user, msg, hass):
    from .replacer import execute

    task = hass.async_create_task(execute(
        engine, user, msg["old"], msg["new"], msg["mapping"], msg["token"], msg["reference_ids"],
    ), "Rozvodňa device replacement")
    return await asyncio.shield(task)


async def state(engine, user, msg, hass):
    return await engine.state(user)


async def stage(engine, user, msg, hass):
    return await engine.stage(user, msg["revision"], msg["changes"], msg.get("drop", ()))


async def commit(engine, user, msg, hass):
    if not msg.get("acknowledge_rename"):
        workspace = await engine.state(user)
        if workspace["revision"] != msg["revision"]:
            raise Problem("stale_revision")
        if any(item["field"] == "entity_id" for item in workspace["changes"]):
            raise Problem("rename_confirmation_required")
    task = hass.async_create_task(engine.commit(
        user, msg["revision"], msg.get("message"),
        msg.get("reference_token"), msg.get("reference_ids", ())),
                                  "Rozvodňa registry commit")
    # Closing a WebSocket does not abort an accepted write.
    return await asyncio.shield(task)


async def references(engine, user, msg, hass):
    return await engine.preview_references(user, msg["revision"])


async def history(engine, user, msg, hass):
    if ("kind" in msg) != ("object_id" in msg) or ("field" in msg and "kind" not in msg):
        raise HomeAssistantError("History filter requires kind and object_id")
    return await engine.history(msg.get("kind"), msg.get("object_id"),
                                msg.get("field"), msg.get("offset", 0))


async def detail(engine, user, msg, hass):
    return await engine.detail(msg["commit_id"])


async def revert(engine, user, msg, hass):
    return await engine.revert(user, msg["revision"], msg["commit_id"], msg.get("positions"))


async def baseline(engine, user, msg, hass):
    return await engine.execute(engine.db.baseline)
