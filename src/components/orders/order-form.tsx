"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { EntitySearchPicker } from "@/components/crm/entity-search-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { idleFormState } from "@/lib/auth/validation";
import { searchContactsForCompanyPickerAction } from "@/lib/crm/entity-search";
import { createOrderAction } from "@/lib/orders/actions";
import {
  ORDER_AGE_RANGES,
  ORDER_DELIVERY_STATUSES,
  ORDER_LEAD_PROVIDERS,
  ORDER_PAYMENT_METHODS,
  ORDER_PAYMENT_STATUSES,
  ORDER_PAYMENT_TERMS,
  ORDER_VERTICALS,
  deliveryStatusLabel,
  formatMoney,
  invoiceTotal,
  paymentStatusLabel,
} from "@/lib/orders/validation";

export type OrderFormPrefills = {
  contactId?: string;
  contactName?: string;
  vertical?: string;
  imo?: string;
  leadType?: string;
  states?: string;
};

export function OrderForm({
  companyId,
  leadId,
  prefills,
}: {
  companyId: string;
  leadId?: string;
  prefills?: OrderFormPrefills;
}) {
  const [state, action] = useActionState(createOrderAction, idleFormState);
  const [formKey, setFormKey] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const [quantity, setQuantity] = useState("");
  const [costPerRecord, setCostPerRecord] = useState("");

  const suggestedInvoice = useMemo(() => {
    const q = quantity === "" ? null : Number(quantity);
    const cpr = costPerRecord === "" ? null : Number(costPerRecord);
    return invoiceTotal(
      q != null && Number.isFinite(q) ? q : null,
      cpr != null && Number.isFinite(cpr) ? cpr : null,
    );
  }, [quantity, costPerRecord]);

  useEffect(() => {
    if (state.status === "success") {
      setFormKey((key) => key + 1);
      setQuantity("");
      setCostPerRecord("");
    }
  }, [state]);

  const defaultContact =
    prefills?.contactId && prefills.contactName
      ? { id: prefills.contactId, label: prefills.contactName }
      : null;

  return (
    <form key={formKey} action={action} className="space-y-4">
      <FormAlert state={state} />
      <input type="hidden" name="companyId" value={companyId} />
      {leadId ? <input type="hidden" name="leadId" value={leadId} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="orderDate">Date ordered</Label>
          <Input
            id="orderDate"
            name="orderDate"
            type="date"
            required
            defaultValue={today}
            aria-describedby="orderDate-error"
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
            defaultOption={defaultContact}
            search={(query) => searchContactsForCompanyPickerAction(companyId, query)}
            aria-describedby="contactId-error"
          />
          <FieldError id="contactId-error" errors={state.fieldErrors?.contactId} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="vertical">Vertical</Label>
          <NativeSelect
            id="vertical"
            name="vertical"
            defaultValue={
              prefills?.vertical &&
              (ORDER_VERTICALS as readonly string[]).includes(prefills.vertical)
                ? prefills.vertical
                : ""
            }
          >
            <option value="">Select one</option>
            {ORDER_VERTICALS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <Label htmlFor="imo">IMO</Label>
          <Input id="imo" name="imo" defaultValue={prefills?.imo ?? ""} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="leadType">Lead type</Label>
          <Input
            id="leadType"
            name="leadType"
            placeholder="Aged Data"
            defaultValue={prefills?.leadType ?? ""}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ageRange">Age range</Label>
          <NativeSelect id="ageRange" name="ageRange" defaultValue="">
            <option value="">Select one</option>
            {ORDER_AGE_RANGES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <Label htmlFor="leadProvider">Lead provider</Label>
          <NativeSelect id="leadProvider" name="leadProvider" defaultValue="">
            <option value="">Select one</option>
            {ORDER_LEAD_PROVIDERS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <Label htmlFor="states">States</Label>
          <Input
            id="states"
            name="states"
            placeholder="TX, FL"
            defaultValue={prefills?.states ?? ""}
          />
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
          <FieldError id="quantity-error" errors={state.fieldErrors?.quantity} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="costPerRecord">Cost per record</Label>
          <Input
            id="costPerRecord"
            name="costPerRecord"
            inputMode="decimal"
            value={costPerRecord}
            onChange={(e) => setCostPerRecord(e.target.value)}
            onBlur={() =>
              setCostPerRecord((value) => {
                const trimmed = value.trim();
                return /^\.\d+$/.test(trimmed) ? `0${trimmed}` : trimmed;
              })
            }
          />
          <FieldError
            id="costPerRecord-error"
            errors={state.fieldErrors?.costPerRecord}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="extraFreeLeads">Extra free leads</Label>
          <Input id="extraFreeLeads" name="extraFreeLeads" inputMode="numeric" />
        </div>

        <div className="space-y-2">
          <Label>Invoice total (suggested)</Label>
          <p className="text-sm font-medium tabular-nums">
            {formatMoney(suggestedInvoice)}
          </p>
          <p className="text-muted-foreground text-xs">
            Quantity × cost per record. Extra free leads are not billed.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="invoiceNumber">Invoice number</Label>
          <Input
            id="invoiceNumber"
            name="invoiceNumber"
            placeholder="e.g. INV-1042"
            maxLength={80}
            aria-describedby="invoiceNumber-error"
          />
          <FieldError
            id="invoiceNumber-error"
            errors={state.fieldErrors?.invoiceNumber}
          />
          <p className="text-muted-foreground text-xs">
            Paste the number from your manual invoice PDF.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="collected">Collected</Label>
          <Input id="collected" name="collected" inputMode="decimal" />
          <FieldError id="collected-error" errors={state.fieldErrors?.collected} />
          <p className="text-muted-foreground text-xs">
            Dollars actually received from the customer.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ourCost">Our cost</Label>
          <Input id="ourCost" name="ourCost" inputMode="decimal" />
          <FieldError id="ourCost-error" errors={state.fieldErrors?.ourCost} />
        </div>

        <div className="space-y-2">
          <Label>Profit</Label>
          <p className="text-muted-foreground text-sm">
            Calculated after save (Collected − Our cost).
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="paymentMethod">Payment method</Label>
          <NativeSelect id="paymentMethod" name="paymentMethod" defaultValue="">
            <option value="">—</option>
            {ORDER_PAYMENT_METHODS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <Label htmlFor="paymentStatus">Customer paid</Label>
          <NativeSelect id="paymentStatus" name="paymentStatus" defaultValue="pending">
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
          <NativeSelect id="paymentTerms" name="paymentTerms" defaultValue="">
            <option value="">—</option>
            {ORDER_PAYMENT_TERMS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <Label htmlFor="deliveryStatus">Delivered</Label>
          <NativeSelect id="deliveryStatus" name="deliveryStatus" defaultValue="pending">
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
          <Input id="deliveryDate" name="deliveryDate" type="date" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="paidProvider" className="size-4" />
        Paid provider
      </label>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      <SubmitButton pendingLabel="Adding…" className="w-auto">
        Add order
      </SubmitButton>
    </form>
  );
}
