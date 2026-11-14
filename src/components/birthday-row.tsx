"use client";

import { Cake } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import type { BirthdayChangeResult } from "@/app/actions";
import { DetailRow } from "@/components/detail-row";
import { ErrorMessage } from "@/components/error-message";
import { Input } from "@/components/ui/input";
import { SAVE_FAILED } from "@/lib/messages";
import { CONTACT_LIMITS } from "@/lib/validation";

// The "День рождения" row of the contact card: a field that saves by itself, without a button.
// A date is sent when the cursor leaves the field or Enter is pressed, and only if the text has changed.
export function BirthdayRow({
  birthday,
  setBirthdayAction,
}: {
  // The saved date as the field shows it ("05.03" or "05.03.1990"), or an empty text
  birthday: string;
  setBirthdayAction: (value: string) => Promise<BirthdayChangeResult>;
}) {
  const [text, setText] = useState(birthday);
  const [saved, setSaved] = useState(birthday);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();
  // The text on its way to the server, so Enter followed by leaving the field sends it once
  const sending = useRef<string | null>(null);
  // The text the server refused: it stays in the field for the person to fix, and is not sent again as it is
  const [rejected, setRejected] = useState<string | null>(null);

  // The card was refreshed with another saved date (a save of this field, or a change from outside)
  const [seenBirthday, setSeenBirthday] = useState(birthday);
  if (birthday !== seenBirthday) {
    setSeenBirthday(birthday);
    setSaved(birthday);
    setText(birthday);
    setError(undefined);
    setRejected(null);
  }

  function save() {
    const value = text.trim();
    if (value === saved) {
      // Only spaces were added: show the saved date as it is
      setText(saved);
      setError(undefined);
      setRejected(null);
      return;
    }
    if (value === sending.current || value === rejected) return;

    setError(undefined);
    sending.current = value;
    startTransition(async () => {
      try {
        const result = await setBirthdayAction(value);
        if (result.error) {
          setRejected(value);
          setError(result.error);
          return;
        }
        // Show the date the way it is saved ("5.3" becomes "05.03"), unless the person has started typing again
        const savedValue = result.value ?? "";
        setSaved(savedValue);
        setSeenBirthday(savedValue);
        setText((current) => (current.trim() === value ? savedValue : current));
        setRejected(null);
      } catch {
        // No answer from the server: the field goes back to the saved date
        setError(SAVE_FAILED);
        setText((current) => (current.trim() === value ? saved : current));
      } finally {
        sending.current = null;
      }
    });
  }

  return (
    <DetailRow
      icon={<Cake aria-hidden className="size-4" />}
      label="День рождения"
      labelId="birthday-label"
      withControl
    >
      <div className="space-y-1.5">
        <Input
          id="birthday"
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            // Enter while choosing a character in an input method is not "done typing"
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              save();
            }
          }}
          placeholder="Например: 14.03 или 14.03.1990"
          autoComplete="off"
          maxLength={CONTACT_LIMITS.birthday}
          aria-labelledby="birthday-label"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "birthday-error" : undefined}
          className="sm:h-9 sm:w-64 sm:text-sm"
        />
        {error && <ErrorMessage id="birthday-error">{error}</ErrorMessage>}
      </div>
    </DetailRow>
  );
}
