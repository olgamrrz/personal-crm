"use client";

import { Check, CircleAlert, Clock, Repeat } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";

import type { ContactChangeResult } from "@/app/actions";
import { DetailRow } from "@/components/detail-row";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CONTACT_FREQUENCIES,
  CONTACT_FREQUENCY_LABELS,
  NO_FREQUENCY_LABEL,
  type ContactFrequency,
} from "@/lib/contact-frequency";

const FREQUENCY_ITEMS = [
  { value: null, label: NO_FREQUENCY_LABEL },
  ...CONTACT_FREQUENCIES.map((value) => ({ value, label: CONTACT_FREQUENCY_LABELS[value] })),
];

const SAVE_FAILED = "Не удалось сохранить. Проверьте интернет и попробуйте ещё раз.";
const MARK_FAILED = "Не удалось отметить. Проверьте интернет и попробуйте ещё раз.";

// "Как часто общаться" and "Последнее общение" rows of the contact card
export function KeepInTouchRows({
  frequency,
  lastConversation,
  setFrequencyAction,
  markContactedAction,
}: {
  frequency: ContactFrequency | null;
  // Ready-made text: "сегодня", a date or "ещё не общались"
  lastConversation: string;
  setFrequencyAction: (frequency: ContactFrequency | null) => Promise<ContactChangeResult>;
  markContactedAction: () => Promise<ContactChangeResult>;
}) {
  // The choice shows at once; if saving fails, it falls back to the saved value
  const [optimisticFrequency, setOptimisticFrequency] = useOptimistic(frequency);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  function handleFrequencyChange(value: ContactFrequency | null) {
    setError(undefined);
    startTransition(async () => {
      setOptimisticFrequency(value);
      try {
        const result = await setFrequencyAction(value);
        if (result.error) setError(result.error);
      } catch {
        setError(SAVE_FAILED);
      }
    });
  }

  return (
    <>
      <DetailRow
        icon={<Repeat aria-hidden className="size-4" />}
        label="Как часто общаться"
        labelId="frequency-label"
        withControl
      >
        <div className="space-y-1.5">
          <Select items={FREQUENCY_ITEMS} value={optimisticFrequency} onValueChange={handleFrequencyChange}>
            <SelectTrigger
              aria-labelledby="frequency-label"
              aria-describedby={error ? "frequency-error" : undefined}
              className="w-full text-base sm:w-auto sm:min-w-52 sm:text-sm sm:data-[size=default]:h-9"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {FREQUENCY_ITEMS.map((item) => (
                <SelectItem
                  key={item.value ?? "none"}
                  value={item.value}
                  className="min-h-11 text-base sm:min-h-8 sm:text-sm"
                >
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && <ErrorMessage id="frequency-error">{error}</ErrorMessage>}
        </div>
      </DetailRow>
      {/* Follows the choice on the page, so resetting to "не задано" hides it at once */}
      {optimisticFrequency !== null && (
        <DetailRow icon={<Clock aria-hidden className="size-4" />} label="Последнее общение" withControl>
          <LastConversation text={lastConversation} markContactedAction={markContactedAction} />
        </DetailRow>
      )}
    </>
  );
}

function LastConversation({
  text,
  markContactedAction,
}: {
  text: string;
  markContactedAction: () => Promise<ContactChangeResult>;
}) {
  // On success the action refreshes the card, and the date turns into "сегодня"
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setError(undefined);
    startTransition(async () => {
      try {
        const result = await markContactedAction();
        if (result.error) setError(result.error);
      } catch {
        setError(MARK_FAILED);
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 sm:justify-start sm:gap-4">
        <span>{text}</span>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={pending}
          onClick={handleClick}
          aria-describedby={error ? "mark-contacted-error" : undefined}
          className="h-11 px-4 sm:h-9"
        >
          <Check aria-hidden />
          Пообщались
        </Button>
      </div>
      {error && <ErrorMessage id="mark-contacted-error">{error}</ErrorMessage>}
    </div>
  );
}

function ErrorMessage({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}
