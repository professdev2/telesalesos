"use client";

import { useActionState } from "react";
import Link from "next/link";

import { SubmitButton } from "@/components/auth/form-parts";
import { NativeSelect } from "@/components/ui/native-select";
import { idleFormState } from "@/lib/auth/validation";
import {
  PIPELINE_CLOSED_STAGES,
  boardStagesForPurpose,
  statusLabel,
} from "@/lib/crm/pipelines";
import { moveLeadStatusAction } from "@/lib/leads/actions";
import type { Lead } from "@/lib/leads/queries";
import type { LeadPurpose } from "@/lib/leads/validation";

export function LeadKanbanBoard({
  purpose,
  leads,
}: {
  purpose: LeadPurpose;
  leads: Lead[];
}) {
  const boardStages = boardStagesForPurpose(purpose);
  const closedStages = PIPELINE_CLOSED_STAGES[purpose];
  const columns = [
    ...boardStages.map((stage) => ({
      id: stage,
      label: statusLabel(stage),
      statuses: [stage],
    })),
    ...(closedStages.length > 0
      ? [
          {
            id: "closed",
            label: "Closed",
            statuses: [...closedStages],
          },
        ]
      : []),
  ];

  const moveOptions = [...boardStages, ...closedStages];

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((column) => {
        const cards = leads.filter((lead) => column.statuses.includes(lead.status));
        return (
          <section
            key={column.id}
            className="bg-muted/40 border-border flex w-64 shrink-0 flex-col rounded-md border"
          >
            <header className="border-border flex items-center justify-between gap-2 border-b px-3 py-2">
              <h3 className="text-sm font-medium">{column.label}</h3>
              <span className="text-muted-foreground text-xs">{cards.length}</span>
            </header>
            <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto p-2">
              {cards.length === 0 ? (
                <li className="text-muted-foreground px-1 py-2 text-xs">Empty</li>
              ) : (
                cards.map((lead) => {
                  const unread = lead.viewedAt == null;
                  return (
                  <li
                    key={lead.id}
                    className={`bg-background border-border space-y-2 rounded-md border p-2 shadow-xs ${unread ? "border-sky-500/40" : ""}`}
                  >
                    <Link
                      href={`/leads/${lead.id}`}
                      className={`flex items-center gap-1.5 truncate text-sm underline-offset-4 hover:underline ${unread ? "font-semibold" : "font-medium"}`}
                    >
                      {unread ? (
                        <span
                          className="bg-sky-500 size-1.5 shrink-0 rounded-full"
                          title="Unread"
                          aria-hidden
                        />
                      ) : null}
                      {lead.contactName}
                    </Link>
                    <MoveStageForm leadId={lead.id} status={lead.status} options={moveOptions} />
                  </li>
                  );
                })
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function MoveStageForm({
  leadId,
  status,
  options,
}: {
  leadId: string;
  status: string;
  options: readonly string[];
}) {
  const [, action] = useActionState(moveLeadStatusAction, idleFormState);

  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="leadId" value={leadId} />
      <NativeSelect
        name="status"
        defaultValue={status}
        aria-label="Move stage"
        className="h-8 text-xs"
        onChange={(event) => {
          event.currentTarget.form?.requestSubmit();
        }}
      >
        {options.map((stage) => (
          <option key={stage} value={stage}>
            {statusLabel(stage)}
          </option>
        ))}
      </NativeSelect>
      <SubmitButton pendingLabel="…" size="sm" variant="ghost" className="h-8 px-2 text-xs">
        Go
      </SubmitButton>
    </form>
  );
}
