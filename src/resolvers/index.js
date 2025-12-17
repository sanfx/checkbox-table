import Resolver from "@forge/resolver";
import { storage, asUser } from "@forge/api";

/*
  Resolver definitions for the checkbox macro.

  Exposed resolver functions:
    - getText (kept for compatibility / testing)
    - getCheckboxState() -> returns { checked: boolean, approver: string }
    - setCheckboxState({ checked, approver }) -> persists state and returns the new state
    - getCurrentUser() -> returns a string identifier for the current user (accountId if available)

  Notes:
    - We intentionally avoid calling product REST APIs here to fetch a user's display name to keep the resolver simple.
      The resolver will return the accountId available in the request context when available. If you want to resolve
      a human-readable display name, we can add an API call using the appropriate permission scope and api.asUser()
      in a follow-up change.
    - State is persisted using Forge app storage under the key "checkbox-state".
*/

const resolver = new Resolver();

// Legacy/test handler kept for compatibility
resolver.define("getText", (req) => {
  console.log("getText called with request:", req);
  return "Hello, world!";
});

// Return the persisted checkbox state. If nothing is stored, return a sensible default.
resolver.define("getCheckboxState", async (req) => {
  try {
    const saved = await storage.get("checkbox-state");
    // Ensure we always return an object with known keys
    return {
      checked:
        saved && typeof saved.checked === "boolean" ? saved.checked : false,
      approver: saved && saved.approver ? saved.approver : "",
    };
  } catch (err) {
    console.error("Error reading checkbox-state from storage", err);
    return { checked: false, approver: "" };
  }
});

// Persist the checkbox state. Accepts an optional approver; if not provided and checked === true,
// the resolver will attempt to record a friendly displayName via Confluence's user API (as the user).
resolver.define("setCheckboxState", async (req) => {
  try {
    const payload = req.payload || {};
    const incomingChecked = Boolean(payload.checked);
    let incomingApprover = payload.approver || "";

    // If the caller checked the box but didn't provide an approver, attempt to derive a human-friendly
    // display name from the Confluence REST API using the calling user's context.
    if (incomingChecked && !incomingApprover) {
      try {
        const userResp = await asUser().requestConfluence(
          "/wiki/rest/api/user/current",
        );
        if (userResp && userResp.ok) {
          const userJson = await userResp.json();
          incomingApprover = userJson.displayName || userJson.name || "";
        }
      } catch (err) {
        // If the API call fails, log and fall back to contextual identifiers below
        console.error(
          "Failed to fetch current user displayName via Confluence API",
          err,
        );
      }

      // Fallback: if we still don't have a human displayName, derive an identifier from the request context.
      if (!incomingApprover) {
        const ctx = req.context || {};
        incomingApprover =
          ctx.accountId ||
          (ctx.user && ctx.user.accountId) ||
          (ctx.actor && ctx.actor.accountId) ||
          "";
      }
    }

    const toStore = { checked: incomingChecked, approver: incomingApprover };
    await storage.set("checkbox-state", toStore);

    // Return the stored state so the frontend can update accordingly.
    return toStore;
  } catch (err) {
    console.error("Error writing checkbox-state to storage", err);
    // On error, still return a consistent shape
    return { checked: false, approver: "" };
  }
});

// Return a friendly identifier for the current user. Attempt to resolve a displayName via Confluence API
// using asUser().requestConfluence('/wiki/rest/api/user/current'). If that fails, fall back to accountId.
resolver.define("getCurrentUser", async (req) => {
  try {
    const userResp = await asUser().requestConfluence(
      "/wiki/rest/api/user/current",
    );
    if (userResp && userResp.ok) {
      const userJson = await userResp.json();
      // Return the human-friendly displayName when possible
      return userJson.displayName || userJson.name || null;
    }
  } catch (err) {
    console.error(
      "getCurrentUser: failed to fetch displayName via Confluence API",
      err,
    );
  }

  // Fallback to accountId from the request context if API call didn't succeed
  const ctx = req.context || {};
  const accountId =
    ctx.accountId ||
    (ctx.user && ctx.user.accountId) ||
    (ctx.actor && ctx.actor.accountId) ||
    null;

  return accountId;
});

export const handler = resolver.getDefinitions();
