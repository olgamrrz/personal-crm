"use client";

import { Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { createGroup } from "@/app/actions";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { groupNameKey } from "@/lib/group-name";
import { SAVE_FAILED } from "@/lib/messages";
import { GROUP_NAME_MAX_LENGTH } from "@/lib/validation";

export type PickerGroup = { id: number; name: string };

// A line of the list: a group, or the "Создать группу «…»" line (isNew) with the typed name
type Option = PickerGroup & { isNew?: boolean };

// Real ids are positive, so this one never clashes with a group
const NEW_OPTION_ID = 0;

const collator = new Intl.Collator("ru");

// The "Группы" field of the contact card and of the new contact form: the groups of the contact as labels
// with a cross, a field to search the list, and a line to create a group that does not exist yet.
// It does not save anything itself: the card saves every change at once, the form keeps them until "Сохранить".
export function GroupPicker({
  id,
  labelledBy,
  className,
  groups,
  selectedIds,
  onAdd,
  onRemove,
  onError,
}: {
  // Id of the text field, for a <label htmlFor>
  id?: string;
  // Id of an element that names the field, when there is no <label>
  labelledBy?: string;
  // Extra classes for the field with the labels
  className?: string;
  // All groups, by name, as the server sent them
  groups: PickerGroup[];
  selectedIds: number[];
  onAdd: (groupId: number) => void;
  onRemove: (groupId: number) => void;
  // A message for the user when a group could not be created; undefined clears it
  onError: (message: string | undefined) => void;
}) {
  const anchor = useComboboxAnchor();
  const [inputValue, setInputValue] = useState("");
  // Groups created here: they are in the list at once, without waiting for the page to refresh
  const [created, setCreated] = useState<PickerGroup[]>([]);
  const creating = useRef(false);

  const allGroups = useMemo(() => {
    const known = new Set(groups.map((group) => group.id));
    const extra = created.filter((group) => !known.has(group.id));
    if (extra.length === 0) return groups;
    return [...groups, ...extra].sort((a, b) => collator.compare(a.name, b.name) || a.id - b.id);
  }, [groups, created]);

  const selected = allGroups.filter((group) => selectedIds.includes(group.id));

  // The list shows the groups with the typed text in the name, and offers to create the typed name
  // unless some group already has it. The unique index in the database still has the last word.
  const typed = inputValue.trim();
  const key = groupNameKey(inputValue);
  const options: Option[] = key
    ? allGroups.filter((group) => groupNameKey(group.name).includes(key))
    : [...allGroups];
  if (typed && !allGroups.some((group) => groupNameKey(group.name) === key)) {
    options.push({ id: NEW_OPTION_ID, name: typed, isNew: true });
  }

  async function create(name: string) {
    if (creating.current) return;
    creating.current = true;
    onError(undefined);
    try {
      const result = await createGroup(name);
      if (!result.group) {
        onError(result.error ?? SAVE_FAILED);
        return;
      }
      const group = result.group;
      setCreated((current) => [...current, group]);
      onAdd(group.id);
    } catch {
      onError(SAVE_FAILED);
    } finally {
      creating.current = false;
    }
  }

  // The new value is the whole list of labels: find what was added and what was removed
  function handleValueChange(next: Option[]) {
    setInputValue("");
    const currentIds = selected.map((group) => group.id);
    const nextIds = next.filter((option) => !option.isNew).map((option) => option.id);

    for (const groupId of nextIds) {
      if (!currentIds.includes(groupId)) onAdd(groupId);
    }
    for (const groupId of currentIds) {
      if (!nextIds.includes(groupId)) onRemove(groupId);
    }

    const newOption = next.find((option) => option.isNew);
    if (newOption) void create(newOption.name);
  }

  return (
    <Combobox
      multiple
      items={options}
      filteredItems={options}
      value={selected}
      onValueChange={handleValueChange}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      onOpenChange={(open) => {
        if (!open) setInputValue("");
      }}
      itemToStringLabel={(option: Option) => option.name}
      itemToStringValue={(option: Option) => String(option.id)}
      isItemEqualToValue={(a: Option, b: Option) => a.id === b.id}
      autoHighlight
      openOnInputClick
    >
      <ComboboxChips ref={anchor} className={className}>
        <ComboboxValue>
          {(chips: Option[]) => (
            <>
              {chips.map((chip) => (
                <ComboboxChip key={chip.id} removeLabel={`Убрать из группы «${chip.name}»`}>
                  <span className="truncate">{chip.name}</span>
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                id={id}
                aria-labelledby={labelledBy}
                placeholder="Добавить в группу"
                autoComplete="off"
                maxLength={GROUP_NAME_MAX_LENGTH}
                className="min-w-32 bg-transparent placeholder:text-muted-foreground"
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>Групп пока нет. Введите название, чтобы создать</ComboboxEmpty>
        <ComboboxList>
          {(option: Option) => (
            <ComboboxItem key={option.isNew ? "new" : option.id} value={option}>
              {option.isNew ? (
                <>
                  <Plus aria-hidden />
                  <span className="truncate">Создать группу «{option.name}»</span>
                </>
              ) : (
                <span className="truncate">{option.name}</span>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
