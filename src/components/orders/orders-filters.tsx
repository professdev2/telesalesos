"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  ORDER_LEAD_PROVIDERS,
  ORDER_PAYMENT_STATUSES,
  ORDER_VERTICALS,
  paymentStatusLabel,
} from "@/lib/orders/validation";

export function OrdersFilters({
  dateFrom,
  dateTo,
  leadProvider,
  vertical,
  paymentStatus,
  paidProvider,
  delivered,
}: {
  dateFrom: string;
  dateTo: string;
  leadProvider: string;
  vertical: string;
  paymentStatus: string;
  paidProvider: string;
  delivered: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const params = new URLSearchParams();
        for (const key of [
          "dateFrom",
          "dateTo",
          "leadProvider",
          "vertical",
          "paymentStatus",
          "paidProvider",
          "delivered",
        ]) {
          const value = String(data.get(key) ?? "").trim();
          if (value) params.set(key, value);
        }
        startTransition(() => {
          router.push(params.size ? `/orders?${params}` : "/orders");
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="dateFrom">From</Label>
        <Input
          id="dateFrom"
          name="dateFrom"
          type="date"
          defaultValue={dateFrom}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dateTo">To</Label>
        <Input id="dateTo" name="dateTo" type="date" defaultValue={dateTo} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="leadProvider">Lead provider</Label>
        <NativeSelect
          id="leadProvider"
          name="leadProvider"
          defaultValue={leadProvider}
        >
          <option value="">Any</option>
          {ORDER_LEAD_PROVIDERS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="vertical">Vertical</Label>
        <NativeSelect id="vertical" name="vertical" defaultValue={vertical}>
          <option value="">Any</option>
          {ORDER_VERTICALS.map((value) => (
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
          defaultValue={paymentStatus}
        >
          <option value="">Any</option>
          {ORDER_PAYMENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {paymentStatusLabel(value)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="paidProvider">Paid provider</Label>
        <NativeSelect
          id="paidProvider"
          name="paidProvider"
          defaultValue={paidProvider}
        >
          <option value="">Any</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="delivered">Delivered</Label>
        <NativeSelect id="delivered" name="delivered" defaultValue={delivered}>
          <option value="">Any</option>
          <option value="yes">Delivered</option>
          <option value="no">Not delivered</option>
        </NativeSelect>
      </div>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-7">
        <Button type="submit" disabled={pending}>
          {pending ? "Filtering…" : "Apply filters"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => startTransition(() => router.push("/orders"))}
        >
          Clear
        </Button>
      </div>
    </form>
  );
}
