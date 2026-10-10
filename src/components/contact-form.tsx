"use client";

import Link from "next/link";
import { useActionState, useEffect, useLayoutEffect, useRef, useState } from "react";

import { createContact, type ContactFormState } from "@/app/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTACT_LIMITS, type ContactField } from "@/lib/validation";

type FieldConfig = {
  name: ContactField;
  label: string;
  placeholder: string;
  type?: "text" | "tel" | "email";
  autoComplete?: string;
  required?: boolean;
};

const FIELDS: FieldConfig[] = [
  { name: "name", label: "Имя", placeholder: "Например: Анна Смирнова", autoComplete: "off", required: true },
  { name: "about", label: "Кто это", placeholder: "Например: дизайнер, бывшая коллега", autoComplete: "off" },
  { name: "howWeMet", label: "Откуда знакомы", placeholder: "Например: учились вместе в университете", autoComplete: "off" },
  { name: "phone", label: "Телефон", placeholder: "+7 999 123-45-67", type: "tel", autoComplete: "off" },
  { name: "email", label: "Почта", placeholder: "anna@example.com", type: "email", autoComplete: "off" },
];

const initialState: ContactFormState = {};

export function NewContactForm() {
  const [formKey, setFormKey] = useState(0);
  const submitted = useRef(false);

  // Next.js keeps visited pages mounted but hidden. Once the form has been submitted,
  // start from a clean form on the next visit instead of showing the previous contact.
  useLayoutEffect(() => {
    return () => {
      if (submitted.current) {
        submitted.current = false;
        setFormKey((key) => key + 1);
      }
    };
  }, []);

  return <ContactForm key={formKey} onSubmit={() => (submitted.current = true)} />;
}

function ContactForm({ onSubmit }: { onSubmit: () => void }) {
  const [state, formAction, pending] = useActionState(createContact, initialState);
  const errors = state.errors ?? {};
  const values = state.values ?? {};

  // After a failed submit, put the cursor into the first field that needs fixing
  useEffect(() => {
    const firstInvalid = FIELDS.find((field) => state.errors?.[field.name]);
    if (firstInvalid) {
      document.getElementById(firstInvalid.name)?.focus();
    }
  }, [state]);

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="space-y-5">
      {FIELDS.map((field) => {
        const error = errors[field.name];
        const errorId = `${field.name}-error`;
        return (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={field.name}>
              {field.label}
              {field.required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={field.name}
              name={field.name}
              type={field.type ?? "text"}
              defaultValue={values[field.name]}
              placeholder={field.placeholder}
              autoComplete={field.autoComplete}
              autoFocus={field.name === "name"}
              maxLength={CONTACT_LIMITS[field.name]}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="h-10"
            />
            {error && (
              <p id={errorId} className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="submit" size="lg" disabled={pending} className="h-10 px-4">
          {pending ? "Сохраняю…" : "Сохранить контакт"}
        </Button>
        <Link href="/" className={buttonVariants({ variant: "ghost", size: "lg", className: "h-10 px-4" })}>
          Отмена
        </Link>
      </div>
    </form>
  );
}
