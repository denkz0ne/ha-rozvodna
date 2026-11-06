"""Rozvodňa Home Assistant integration lifecycle."""

from pathlib import Path

DOMAIN = "rozvodna"
ASSET_URL = "/rozvodna-assets"


async def async_setup(hass, config):
    """Register process-wide routes and command handlers once."""
    from homeassistant.components.http import StaticPathConfig
    from homeassistant.const import MAJOR_VERSION, MINOR_VERSION
    from homeassistant.exceptions import HomeAssistantError

    if (MAJOR_VERSION, MINOR_VERSION) < (2026, 11):
        raise HomeAssistantError("Rozvodňa requires Home Assistant Core 2026.11 or newer")

    from .api import register_commands

    await hass.http.async_register_static_paths([
        StaticPathConfig(ASSET_URL, str(Path(__file__).parent / "panel"), False)
    ])
    register_commands(hass)
    return True


async def async_setup_entry(hass, entry):
    """Initialize the journal and expose the panel."""
    from homeassistant.components import panel_custom
    from homeassistant.exceptions import ConfigEntryNotReady

    from .database import Database
    from .engine import Engine
    from .registry import Registry
    from .references import References

    db = Database(Path(hass.config.path("rozvodna", "registry.sqlite3")))
    engine = Engine(db, Registry(hass), hass.async_add_executor_job, References(hass))
    try:
        await engine.initialize()
    except OSError as error:
        raise ConfigEntryNotReady("Rozvodňa database is unavailable") from error
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=DOMAIN,
        webcomponent_name="rozvodna-panel",
        sidebar_title="Rozvodňa",
        sidebar_icon="mdi:transmission-tower",
        module_url=f"{ASSET_URL}/panel.js?v=0.2.0",
        require_admin=True,
        config_panel_domain=DOMAIN,
    )
    hass.data[DOMAIN] = engine
    return True


async def async_unload_entry(hass, entry):
    """Wait for active writes and remove the panel."""
    from homeassistant.components import frontend

    engine = hass.data[DOMAIN]
    async with engine.lock:
        engine.active = False
        frontend.async_remove_panel(hass, DOMAIN)
        del hass.data[DOMAIN]
    return True
