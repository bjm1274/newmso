import { NextResponse } from 'next/server';
import { getD1Binding, getD1Drizzle, tax_insurance_rates, eq } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ ok: false, error: 'D1 binding not available' });
    }
    const db = getD1Drizzle(d1);

    // Update health_insurance_rate and long_term_care_rate for 2026 to official rates:
    // health_insurance_rate: 0.03595 (3.595%)
    // long_term_care_rate: 0.004724 (0.4724%)
    await db
      .update(tax_insurance_rates)
      .set({
        health_insurance_rate: 0.03595,
        long_term_care_rate: 0.004724,
      })
      .where(eq(tax_insurance_rates.effective_year, 2026));

    // Also let's update 2025 just in case it had rounding issues too (it was 0.0355, 0.0046 in query)
    // In migration:
    // health_insurance_rate = 0.03545 (3.545%)
    // long_term_care_rate = 0.004591 (0.4591%)
    await db
      .update(tax_insurance_rates)
      .set({
        health_insurance_rate: 0.03545,
        long_term_care_rate: 0.004591,
      })
      .where(eq(tax_insurance_rates.effective_year, 2025));

    // Fetch the updated values to confirm
    const rows = await db
      .select({
        company_name: tax_insurance_rates.company_name,
        effective_year: tax_insurance_rates.effective_year,
        national_pension_rate: tax_insurance_rates.national_pension_rate,
        health_insurance_rate: tax_insurance_rates.health_insurance_rate,
        long_term_care_rate: tax_insurance_rates.long_term_care_rate,
        employment_insurance_rate: tax_insurance_rates.employment_insurance_rate,
      })
      .from(tax_insurance_rates);

    return NextResponse.json({ ok: true, msg: 'Rates updated successfully in D1 database.', rows });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message });
  }
}
