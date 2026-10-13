"use server";

import {
  normalizeCompanySearch,
  searchCompaniesForPicker,
  type CompanyPickerOption,
} from "@/lib/companies/queries";
import {
  normalizeContactSearch,
  searchContactsForPicker,
  type ContactPickerOption,
} from "@/lib/contacts/queries";

export type { CompanyPickerOption, ContactPickerOption };

/** Typeahead for lead/contact company fields. Empty query returns a short starter list. */
export async function searchCompaniesForPickerAction(
  query: string,
): Promise<CompanyPickerOption[]> {
  return searchCompaniesForPicker(normalizeCompanySearch(query));
}

/** Typeahead for pipeline contact field. Empty query returns a short starter list. */
export async function searchContactsForPickerAction(
  query: string,
): Promise<ContactPickerOption[]> {
  return searchContactsForPicker(normalizeContactSearch(query));
}

/** Typeahead limited to contacts linked to one company (PowerBridge orders). */
export async function searchContactsForCompanyPickerAction(
  companyId: string,
  query: string,
): Promise<ContactPickerOption[]> {
  if (!companyId) return [];
  return searchContactsForPicker(normalizeContactSearch(query), 10, companyId);
}
