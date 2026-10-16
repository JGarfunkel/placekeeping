import {
  getBinding,
  getEffectiveBinding,
  isSuspended,
  listAsanaIdentitiesForUser,
  listRecurringTasks,
  listTaskLinksForSpot,
  shouldSuggestTask,
  type AuthContext,
  type RecurringTaskRow,
} from "@placekeeping/core";
import type { Observation, Spot } from "@placekeeping/shared-types";
import { isAsanaEnabled } from "@/lib/asana";
import { spotPath } from "@/lib/spotPath";
import { AsanaBindingEditor } from "./AsanaBindingEditor";
import { AsanaConnectPrompt } from "./AsanaConnectPrompt";
import { AsanaRecurringTasks, type RecurringItem } from "./AsanaRecurringTasks";
import { AsanaSpotPanel } from "./AsanaSpotPanel";

// Shown to signed-in users on a spot that has a steward or a binding. A user
// who has not linked Asana is offered a connect button; managers can bind a
// project at the steward level (all of that steward's spots), or override it
// for this one spot. Never renders on the public map.
export async function AsanaSpotSection({
  spot,
  observations,
  authContext,
  canManageSpot,
}: {
  spot: Spot;
  observations: Observation[];
  authContext: AuthContext | null;
  canManageSpot: boolean;
}) {
  if (!authContext || !isAsanaEnabled()) return null;

  const canManageSteward =
    !!spot.stewardId &&
    !isSuspended(authContext) &&
    (authContext.isSystemAdmin ||
      authContext.stewardId === spot.stewardId ||
      authContext.administeredStewardIds.includes(spot.stewardId));
  const effective = await getEffectiveBinding(spot);
  const canConfigure = canManageSpot || canManageSteward;
  if (!effective && !canConfigure) return null;

  const identities = await listAsanaIdentitiesForUser(authContext.userId);
  if (identities.length === 0) {
    return (
      <AsanaConnectPrompt
        returnTo={spotPath(spot)}
        message={
          effective
            ? `Tasks for this spot live in the Asana project "${effective.binding.remoteProjectName ?? "bound to it"}". Connect your Asana account to create tasks and join the discussion.`
            : "Connect your Asana account to manage maintenance tasks for this spot."
        }
      />
    );
  }

  const [spotBinding, stewardBinding, spotRecurring, stewardRecurring] =
    await Promise.all([
      getBinding({ spotId: spot.spotId }),
      spot.stewardId ? getBinding({ stewardId: spot.stewardId }) : null,
      canManageSpot ? listRecurringTasks({ spotId: spot.spotId }) : [],
      canManageSteward && spot.stewardId
        ? listRecurringTasks({ stewardId: spot.stewardId })
        : [],
    ]);

  const editors = canConfigure ? (
    <div className="flex flex-col gap-3">
      {canManageSteward && spot.stewardId && (
        <AsanaBindingEditor
          scope={{ stewardId: spot.stewardId }}
          identities={identities}
          binding={stewardBinding}
          title="Asana project for all of this steward's spots"
          note="Used by every spot this steward holds, unless a site or spot has its own project."
        />
      )}
      {canManageSteward && spot.stewardId && (
        <AsanaRecurringTasks
          scope={{ stewardId: spot.stewardId }}
          items={stewardRecurring.map(toItem)}
          title="Recurring tasks for all of this steward's spots"
          fansOut
        />
      )}
      {canManageSpot && (
        <AsanaBindingEditor
          scope={{ spotId: spot.spotId }}
          identities={identities}
          binding={spotBinding}
          title="Asana project for this spot only"
          note={
            spotBinding
              ? null
              : effective
                ? `Currently using the ${effective.source}'s project, ${effective.binding.remoteProjectName ?? "unnamed"}. Bind one here to override it for this spot.`
                : null
          }
        />
      )}
      {canManageSpot && (
        <AsanaRecurringTasks
          scope={{ spotId: spot.spotId }}
          items={spotRecurring.map(toItem)}
          title="Recurring tasks for this spot"
        />
      )}
    </div>
  ) : null;

  if (!effective) return editors;

  const { binding } = effective;
  if (!identities.some((i) => i.remoteWorkspaceId === binding.remoteWorkspaceId)) {
    return (
      <div className="flex flex-col gap-3">
        <AsanaConnectPrompt
          returnTo={spotPath(spot)}
          message={`This spot's tasks live in the Asana project "${binding.remoteProjectName ?? "bound to it"}", in a workspace your account isn't connected to. Reconnect and grant access to that workspace.`}
        />
        {editors}
      </div>
    );
  }

  const links = await listTaskLinksForSpot(spot, authContext.userId);
  const latest = [...observations]
    .filter((o) => o.source !== "gsv")
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];

  return (
    <div className="flex flex-col gap-3">
      <AsanaSpotPanel
        projectName={binding.remoteProjectName}
        links={links.map((l) => ({
          id: l.id,
          remoteUrl: l.remoteUrl,
          cachedTitle: l.cachedTitle,
          cachedStatus: l.cachedStatus,
        }))}
        suggested={shouldSuggestTask(latest?.weedLevel)}
      />
      {editors}
    </div>
  );
}

function toItem(r: RecurringTaskRow): RecurringItem {
  return {
    id: r.id,
    title: r.title,
    unit: r.unit,
    interval: r.interval,
    nextDueOn: r.nextDueOn,
    leadDays: r.leadDays,
    status: r.status,
    pausedReason: r.pausedReason,
  };
}
