// Helpers for running a generation via a secondary connection profile
// (pattern adapted from i5031337/sillytavern-switch-connection-profile).
// Queued so concurrent switches don't clobber each other.

const SNAP_PROFILE = "snap";

function getSTContext() {
  if (typeof SillyTavern !== "undefined" && SillyTavern.getContext) return SillyTavern.getContext();
  // fallback for older ST builds where SillyTavern global isn't present yet
  try {
    // eslint-disable-next-line no-undef
    const ctx = globalThis.SillyTavern?.getContext?.();
    if (ctx) return ctx;
  } catch {}
  return null;
}

function quoteSlashArg(s) {
  return `"${String(s).replace(/"/g, '\\"')}"`;
}

async function readActiveProfileName(context) {
  if (!context || typeof context.executeSlashCommands !== "function") return null;
  try {
    const result = await context.executeSlashCommands("/profile");
    const raw = (result?.pipe ?? result?.value ?? result ?? "").toString().trim();
    if (!raw || raw.toLowerCase() === "none") return "";
    return raw;
  } catch {
    return null;
  }
}

let profileSwitchQueue = Promise.resolve();

export function getSnapProfileName() {
  return SNAP_PROFILE;
}

export async function withSnapProfile(fn) {
  const ctx = getSTContext();
  // If we can't access profile switching, just run directly (degrades to current profile)
  if (!ctx || typeof ctx.executeSlashCommands !== "function") {
    return await fn();
  }

  const runTask = async () => {
    let previousProfile = null;
    let didSwitch = false;
    try {
      previousProfile = await readActiveProfileName(ctx);
    } catch (e) {
      console.warn("[snap-view] could not read active profile:", e);
    }

    if (previousProfile !== null && previousProfile.toLowerCase() !== SNAP_PROFILE.toLowerCase()) {
      try {
        await ctx.executeSlashCommands(`/profile ${quoteSlashArg(SNAP_PROFILE)}`);
        didSwitch = true;
        console.debug(`[snap-view] switched to profile "${SNAP_PROFILE}" (was "${previousProfile || "(none)"}")`);
      } catch (e) {
        console.warn(`[snap-view] failed to switch to profile "${SNAP_PROFILE}":`, e);
        // proceed anyway with current profile
        didSwitch = false;
      }
    }

    try {
      return await fn();
    } finally {
      if (didSwitch && previousProfile !== null) {
        const restoreTarget = previousProfile === "" ? "None" : previousProfile;
        try {
          await ctx.executeSlashCommands(`/profile ${quoteSlashArg(restoreTarget)}`);
          console.debug(`[snap-view] restored profile to "${restoreTarget}"`);
        } catch (e) {
          console.warn(`[snap-view] failed to restore profile "${previousProfile}":`, e);
        }
      }
    }
  };

  const task = profileSwitchQueue.then(runTask, runTask);
  // keep queue alive even if task rejects
  profileSwitchQueue = task.then(
    () => {},
    () => {},
  );
  return task;
}
