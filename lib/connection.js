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
let lastGenerationAt = 0;
const MIN_GAP_MS = 1500;

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
    // throttle: ensure at least MIN_GAP_MS between generations to avoid
    // bursting the small snap model (429s seen in logs)
    const sinceLast = Date.now() - lastGenerationAt;
    if (sinceLast < MIN_GAP_MS) {
      await new Promise((r) => setTimeout(r, MIN_GAP_MS - sinceLast));
    }

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
      const result = await fn();
      lastGenerationAt = Date.now();
      return result;
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
      // also update gap even if fn threw, so retries don't tight-loop
      if (lastGenerationAt === 0) lastGenerationAt = Date.now();
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
