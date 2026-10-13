"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  FIELD_PACK_DEFS,
  type FieldDef,
} from "@/lib/crm/field-packs";
import type { LeadPurpose } from "@/lib/leads/validation";

export function LeadFieldPackFields({
  purpose,
  defaults = {},
}: {
  purpose: LeadPurpose;
  defaults?: Record<string, string>;
}) {
  const defs = FIELD_PACK_DEFS[purpose];

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Pipeline fields</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {defs.map((field) => (
          <FieldInput
            key={`${field.key}:${defaults[field.key] ?? ""}`}
            field={field}
            defaultValue={defaults[field.key] ?? ""}
          />
        ))}
      </div>
    </fieldset>
  );
}

function FieldInput({
  field,
  defaultValue,
}: {
  field: FieldDef;
  defaultValue: string;
}) {
  const name = `extra.${field.key}`;
  const id = `extra-${field.key}`;

  if (field.kind === "yn" || field.kind === "select") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <NativeSelect id={id} name={name} defaultValue={defaultValue}>
          <option value="">—</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      <Input
        id={id}
        name={name}
        type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"}
        step={field.kind === "number" ? "any" : undefined}
        defaultValue={defaultValue}
      />
    </div>
  );
}
