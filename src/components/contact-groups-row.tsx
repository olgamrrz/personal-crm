"use client";

import { UsersRound } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";

import { setContactGroup } from "@/app/actions";
import { DetailRow } from "@/components/detail-row";
import { ErrorMessage } from "@/components/error-message";
import { GroupPicker, type PickerGroup } from "@/components/group-picker";
import { SAVE_FAILED } from "@/lib/messages";

type Change = { groupId: number; member: boolean };

function applyChange(ids: number[], { groupId, member }: Change) {
  const others = ids.filter((id) => id !== groupId);
  return member ? [...others, groupId] : others;
}

// The "Группы" row of the contact card. Every change is saved at once, without a button:
// the label appears or disappears right away, and if saving fails, it goes back with a message.
export function ContactGroupsRow({
  contactId,
  groups,
  selectedIds,
}: {
  contactId: number;
  groups: PickerGroup[];
  selectedIds: number[];
}) {
  const [optimisticIds, change] = useOptimistic(selectedIds, applyChange);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  function save(groupId: number, member: boolean) {
    setError(undefined);
    startTransition(async () => {
      change({ groupId, member });
      try {
        const result = await setContactGroup(contactId, groupId, member);
        if (result.error) setError(result.error);
      } catch {
        setError(SAVE_FAILED);
      }
    });
  }

  return (
    <DetailRow
      icon={<UsersRound aria-hidden className="size-4" />}
      label="Группы"
      labelId="groups-label"
      withControl
    >
      <div className="space-y-1.5 sm:max-w-md">
        <GroupPicker
          labelledBy="groups-label"
          // On wide screens as high as the other controls of the card, so the label stays level with it
          className="sm:min-h-9 sm:py-1"
          groups={groups}
          selectedIds={optimisticIds}
          onAdd={(groupId) => save(groupId, true)}
          onRemove={(groupId) => save(groupId, false)}
          onError={setError}
        />
        {error && <ErrorMessage id="groups-error">{error}</ErrorMessage>}
      </div>
    </DetailRow>
  );
}
