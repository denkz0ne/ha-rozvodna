const ENTITY_REFERENCE_KEYS = new Set(["entity", "entity_id", "entity_ids"]);

export function referencePaths(config, entityId, limit = Infinity) {
  const matches = [];
  let truncated = false;
  const visit = (value, path = "", key = "", custom = false) => {
    if (truncated) return;
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length && !truncated; index++) {
        visit(value[index], `${path}/${index}`, key, custom);
      }
    }
    else if (value && typeof value === "object") {
      custom ||= String(value.type ?? "").startsWith("custom:");
      for (const [name, item] of Object.entries(value)) {
        visit(item, `${path}/${name.replaceAll("~", "~0").replaceAll("/", "~1")}`, name, custom);
        if (truncated) break;
      }
    }
    else if (typeof value === "string") {
      if (ENTITY_REFERENCE_KEYS.has(key) && value === entityId) {
        if (matches.length >= limit) truncated = true;
        else matches.push({ path: path || "/", reason: custom ? "ambiguous" : "manual_source" });
      }
      else if (value.includes(entityId) && (value.includes("{{") || value.includes("{%"))) {
        if (matches.length >= limit) truncated = true;
        else matches.push({ path: path || "/", reason: "dynamic" });
      }
    }
  };
  visit(config);
  return { matches, truncated };
}
