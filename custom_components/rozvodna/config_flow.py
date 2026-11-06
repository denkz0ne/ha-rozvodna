"""Single-instance configuration flow."""

from homeassistant import config_entries

from . import DOMAIN


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Add Rozvodňa without configuration parameters."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        self._async_abort_entries_match({})
        if user_input is not None:
            return self.async_create_entry(title="Rozvodňa", data={})
        return self.async_show_form(step_id="user")
