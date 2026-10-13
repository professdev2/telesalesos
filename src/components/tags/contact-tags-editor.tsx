"use client";

import { useActionState, useEffect, useRef } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleFormState } from "@/lib/auth/validation";
import { addContactTagAction, removeContactTagAction } from "@/lib/tags/actions";
import type { Tag } from "@/lib/tags/queries";

export function ContactTagsEditor({
  contactId,
  tags,
  suggestions = [],
  campaignId,
  compact = false,
}: {
  contactId: string;
  tags: Tag[];
  /** Org tags not already on this contact — shown as quick-add chips. */
  suggestions?: Tag[];
  campaignId?: string;
  compact?: boolean;
}) {
  const [addState, addAction] = useActionState(addContactTagAction, idleFormState);
  const [removeState, removeAction] = useActionState(removeContactTagAction, idleFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (addState.status === "success") {
      formRef.current?.reset();
    }
  }, [addState]);

  const unusedSuggestions = suggestions.filter(
    (tag) => !tags.some((assigned) => assigned.id === tag.id),
  );

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <FormAlert state={addState} />
      <FormAlert state={removeState} />

      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 ? (
          <p className="text-muted-foreground text-xs">No tags yet.</p>
        ) : (
          tags.map((tag) => (
            <form key={tag.id} action={removeAction} className="inline">
              <input type="hidden" name="contactId" value={contactId} />
              <input type="hidden" name="tagId" value={tag.id} />
              {campaignId ? (
                <input type="hidden" name="campaignId" value={campaignId} />
              ) : null}
              <button
                type="submit"
                className="border-border bg-muted/50 hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium"
                title={`Remove tag ${tag.name}`}
              >
                {tag.name}
                <span className="text-muted-foreground" aria-hidden>
                  ×
                </span>
              </button>
            </form>
          ))
        )}
      </div>

      {unusedSuggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">Add:</span>
          {unusedSuggestions.slice(0, 8).map((tag) => (
            <form key={tag.id} action={addAction} className="inline">
              <input type="hidden" name="contactId" value={contactId} />
              <input type="hidden" name="name" value={tag.name} />
              {campaignId ? (
                <input type="hidden" name="campaignId" value={campaignId} />
              ) : null}
              <button
                type="submit"
                className="border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 rounded-md border border-dashed px-2 py-0.5 text-xs"
              >
                + {tag.name}
              </button>
            </form>
          ))}
        </div>
      ) : null}

      <form
        ref={formRef}
        action={addAction}
        className={compact ? "flex flex-wrap items-end gap-2" : "flex flex-wrap items-end gap-2"}
      >
        <input type="hidden" name="contactId" value={contactId} />
        {campaignId ? <input type="hidden" name="campaignId" value={campaignId} /> : null}
        <div className={compact ? "min-w-[8rem] flex-1 space-y-1" : "min-w-[12rem] flex-1 space-y-2"}>
          {!compact ? <Label htmlFor={`tag-${contactId}`}>New tag</Label> : null}
          <Input
            id={`tag-${contactId}`}
            name="name"
            placeholder="e.g. hot, 25% offer"
            maxLength={40}
            aria-describedby={`tag-${contactId}-error`}
          />
          <FieldError id={`tag-${contactId}-error`} errors={addState.fieldErrors?.name} />
        </div>
        <SubmitButton pendingLabel="Adding…" className="w-auto" size="sm" variant="outline">
          Add tag
        </SubmitButton>
      </form>
    </div>
  );
}
