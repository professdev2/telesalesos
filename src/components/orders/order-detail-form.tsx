"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { EntitySearchPicker } from "@/components/crm/entity-search-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { idleFormState } from "@/lib/auth/validation";
import { searchContactsForCompanyPickerAction } from "@/lib/crm/entity-search";
import {
  deleteOrderAction,
  duplicateOrderAction,
  updateOrderAction,
} from "@/lib/orders/actions";
import type { Order } from "@/lib/orders/queries";
import {
  ORDER_AGE_RANGES,
  ORDER_DELIVERY_STATUSES,
  ORDER_LEAD_PROVIDERS,
  ORDER_PAYMENT_METHODS,
  ORDER_PAYMENT_STATUSES,
  ORDER_PAYMENT_TERMS,
  ORDER_VERTICALS,
  deliveryStatusLabel,
  formatMargin,
  formatMoney,
  invoiceTotal,
  paymentStatusLabel,
} from "@/lib/orders/validation";

function normalizeLeadingDot(value: string): string {
  const trimmed = value.trim();
  if (/^\.\d+$/.test(trimmed)) return `0${trimmed}`;
  return trimmed;
}

function orderFormKey(order: Order): string {
  return [
    order.orderDate,
    order.contactId ?? "",
    order.vertical ?? "",
    order.imo ?? "",
    order.leadType ?? "",
    order.ageRange ?? "",
    order.leadProvider ?? "",
    order.quantity ?? "",
    order.costPerRecord ?? "",
    order.extraFreeLeads ?? "",
    order.states ?? "",
    order.invoiceNumber ?? "",
    order.collected ?? "",
    order.ourCost ?? "",
    order.paymentMethod ?? "",
    order.paymentStatus ?? "",
    order.paymentTerms ?? "",
    order.paidProvider ? "1" : "0",
    order.deliveryStatus ?? "",
    order.deliveryDate ?? "",
    order.notes ?? "",
    order.grossProfit ?? "",
    order.grossMarginPct ?? "",
  ].join("|");
}

export function OrderDetailForm({
  order,
}: {
  order: Order;
}) {
  const router = useRouter();
  const [state, action] = useActionState(updateOrderAction, idleFormState);
  const [duplicateState, duplicateAction] = useActionState(
    duplicateOrderAction,
    idleFormState,
  );
  const [deleteState, deleteAction] = useActionState(deleteOrderAction, idleFormState);
  const [quantity, setQuantity] = useState(String(order.quantity ?? ""));
  const [costPerRecord, setCostPerRecord] = useState(
    order.costPerRecord != null ? String(order.costPerRecord) : "",
  );

  useEffect(() => {
    setQuantity(String(order.quantity ?? ""));
    setCostPerRecord(order.costPerRecord != null ? String(order.costPerRecord) : "");
  }, [order.quantity, order.costPerRecord, order.id]);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [state, router]);

  const suggestedInvoice = useMemo(() => {
    const q = quantity === "" ? null : Number(quantity);
    const cpr = costPerRecord === "" ? null : Number(costPerRecord);
    return invoiceTotal(
      q != null && Number.isFinite(q) ? q : null,
      cpr != null && Number.isFinite(cpr) ? cpr : null,
    );
  }, [quantity, costPerRecord]);

  const paymentMethodOptions = ORDER_PAYMENT_METHODS.includes(
    order.paymentMethod as (typeof ORDER_PAYMENT_METHODS)[number],
  )
    ? ORDER_PAYMENT_METHODS
    : order.paymentMethod
      ? ([order.paymentMethod, ...ORDER_PAYMENT_METHODS] as string[])
      : [...ORDER_PAYMENT_METHODS];

  const paymentTermsOptions = ORDER_PAYMENT_TERMS.includes(
    order.paymentTerms as (typeof ORDER_PAYMENT_TERMS)[number],
  )
    ? ORDER_PAYMENT_TERMS
    : order.paymentTerms
      ? ([order.paymentTerms, ...ORDER_PAYMENT_TERMS] as string[])
      : [...ORDER_PAYMENT_TERMS];

  const verticalOptions = (ORDER_VERTICALS as readonly string[]).includes(
    order.vertical ?? "",
  )
    ? ORDER_VERTICALS
    : order.vertical
      ? ([order.vertical, ...ORDER_VERTICALS] as string[])
      : [...ORDER_VERTICALS];

  const leadProviderOptions = (ORDER_LEAD_PROVIDERS as readonly string[]).includes(
    order.leadProvider ?? "",
  )
    ? ORDER_LEAD_PROVIDERS
    : order.leadProvider
      ? ([order.leadProvider, ...ORDER_LEAD_PROVIDERS] as string[])
      : [...ORDER_LEAD_PROVIDERS];

  const ageRangeOptions = (ORDER_AGE_RANGES as readonly string[]).includes(
    order.ageRange ?? "",
  )
    ? ORDER_AGE_RANGES
    : order.ageRange
      ? ([order.ageRange, ...ORDER_AGE_RANGES] as string[])
      : [...ORDER_AGE_RANGES];

  return (
    <div className="space-y-8">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-sm">
        <div>
          <dt className="text-muted-foreground">Profit</dt>
          <dd className="font-medium">{formatMoney(order.grossProfit)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Margin</dt>
          <dd className="font-medium">{formatMargin(order.grossMarginPct)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Invoice total (suggested)</dt>
          <dd className="font-medium">{formatMoney(suggestedInvoice)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Invoice number</dt>
          <dd className="font-medium">{order.invoiceNumber ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Company</dt>
          <dd className="font-medium">{order.companyName ?? "—"}</dd>
        </div>
      </dl>

      <FormAlert state={state} />

      <form key={orderFormKey(order)} action={action} className="space-y-4">
        <input type="hidden" name="orderId" value={order.id} />
        <input type="hidden" name="companyId" value={order.companyId} />
        {order.leadId ? <input type="hidden" name="leadId" value={order.leadId} /> : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="orderDate">Date ordered</Label>
            <Input
              id="orderDate"
              name="orderDate"
              type="date"
              required
              defaultValue={order.orderDate}
            />
            <FieldError id="orderDate-error" errors={state.fieldErrors?.orderDate} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactId">Contact</Label>
            <EntitySearchPicker
              id="contactId"
              name="contactId"
              placeholder="Search contacts at this company…"
              emptyMessage="No contacts at this company. Link a person on Contacts first."
              clearLabel="Clear contact"
              defaultOption={
                order.contactId && order.contactName
                  ? { id: order.contactId, label: order.contactName }
                  : null
              }
              search={(query) =>
                searchContactsForCompanyPickerAction(order.companyId, query)
              }
              aria-describedby="contactId-error"
            />
            <FieldError id="contactId-error" errors={state.fieldErrors?.contactId} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vertical">Vertical</Label>
            <NativeSelect
              id="vertical"
              name="vertical"
              defaultValue={order.vertical ?? ""}
            >
              <option value="">Select one</option>
              {verticalOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="imo">IMO</Label>
            <Input id="imo" name="imo" defaultValue={order.imo ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="leadType">Lead type</Label>
            <Input id="leadType" name="leadType" defaultValue={order.leadType ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ageRange">Age range</Label>
            <NativeSelect
              id="ageRange"
              name="ageRange"
              defaultValue={order.ageRange ?? ""}
            >
              <option value="">Select one</option>
              {ageRangeOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="leadProvider">Lead provider</Label>
            <NativeSelect
              id="leadProvider"
              name="leadProvider"
              defaultValue={order.leadProvider ?? ""}
            >
              <option value="">Select one</option>
              {leadProviderOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="states">States</Label>
            <Input id="states" name="states" defaultValue={order.states ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              name="quantity"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="costPerRecord">Cost per record</Label>
            <Input
              id="costPerRecord"
              name="costPerRecord"
              inputMode="decimal"
              value={costPerRecord}
              onChange={(e) => setCostPerRecord(e.target.value)}
              onBlur={() => setCostPerRecord((value) => normalizeLeadingDot(value))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="extraFreeLeads">Extra free leads</Label>
            <Input
              id="extraFreeLeads"
              name="extraFreeLeads"
              inputMode="numeric"
              defaultValue={order.extraFreeLeads ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoiceNumber">Invoice number</Label>
            <Input
              id="invoiceNumber"
              name="invoiceNumber"
              placeholder="e.g. INV-1042"
              maxLength={80}
              defaultValue={order.invoiceNumber ?? ""}
              aria-describedby="invoiceNumber-error"
            />
            <FieldError
              id="invoiceNumber-error"
              errors={state.fieldErrors?.invoiceNumber}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="collected">Collected</Label>
            <Input
              id="collected"
              name="collected"
              inputMode="decimal"
              defaultValue={order.collected ?? ""}
              onBlur={(e) => {
                e.currentTarget.value = normalizeLeadingDot(e.currentTarget.value);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ourCost">Our cost</Label>
            <Input
              id="ourCost"
              name="ourCost"
              inputMode="decimal"
              defaultValue={order.ourCost ?? ""}
              onBlur={(e) => {
                e.currentTarget.value = normalizeLeadingDot(e.currentTarget.value);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentMethod">Payment method</Label>
            <NativeSelect
              id="paymentMethod"
              name="paymentMethod"
              defaultValue={order.paymentMethod ?? ""}
            >
              <option value="">—</option>
              {paymentMethodOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentStatus">Customer paid</Label>
            <NativeSelect
              id="paymentStatus"
              name="paymentStatus"
              defaultValue={order.paymentStatus ?? ""}
            >
              <option value="">—</option>
              {ORDER_PAYMENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {paymentStatusLabel(value)}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentTerms">Payment terms</Label>
            <NativeSelect
              id="paymentTerms"
              name="paymentTerms"
              defaultValue={order.paymentTerms ?? ""}
            >
              <option value="">—</option>
              {paymentTermsOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deliveryStatus">Delivered</Label>
            <NativeSelect
              id="deliveryStatus"
              name="deliveryStatus"
              defaultValue={order.deliveryStatus ?? ""}
            >
              <option value="">—</option>
              {ORDER_DELIVERY_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {deliveryStatusLabel(value)}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deliveryDate">Delivered at</Label>
            <Input
              id="deliveryDate"
              name="deliveryDate"
              type="date"
              defaultValue={order.deliveryDate ?? ""}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="paidProvider"
            className="size-4"
            defaultChecked={order.paidProvider}
          />
          Paid provider
        </label>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={3} defaultValue={order.notes ?? ""} />
        </div>

        <SubmitButton pendingLabel="Saving…" className="w-auto">
          Save order
        </SubmitButton>
      </form>

      <form action={duplicateAction} className="space-y-2 border-t pt-6">
        <FormAlert state={duplicateState} />
        <input type="hidden" name="orderId" value={order.id} />
        <p className="text-muted-foreground text-sm">
          Opens a new order for the same buyer with product fields copied. Date is today;
          customer paid, provider paid, and delivery reset so you can track the reorder.
        </p>
        <SubmitButton pendingLabel="Duplicating…" className="w-auto" variant="outline">
          Duplicate order
        </SubmitButton>
      </form>

      <form action={deleteAction} className="border-t pt-6">
        <FormAlert state={deleteState} />
        <input type="hidden" name="orderId" value={order.id} />
        <input type="hidden" name="companyId" value={order.companyId} />
        {order.leadId ? <input type="hidden" name="leadId" value={order.leadId} /> : null}
        <SubmitButton variant="destructive" pendingLabel="Deleting…" className="w-auto">
          Delete order
        </SubmitButton>
      </form>
    </div>
  );
}
