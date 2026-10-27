// Official schemas checked 2026-10-27 (field shapes, not invented product IDs):
// https://developers.cloudflare.com/api/resources/accounts/subresources/subscriptions/methods/get/
// https://developers.cloudflare.com/api/resources/alerting/subresources/policies/methods/list/
// https://developers.cloudflare.com/billing/manage/budget-alerts/
// https://developers.cloudflare.com/billing/understand/usage-based-billing/
// Generic subscriptions do not document a Workers-specific scope/sets mapping.
// billing_usage_alert is a product usage notification, NOT an account budget alert.
const states = new Set(["Trial", "Provisioned", "Paid", "AwaitingPayment", "Cancelled", "Failed", "Expired"]);
const plans = new Set(["free", "lite", "pro", "pro_plus", "business", "enterprise", "partners_free", "partners_pro", "partners_business", "partners_enterprise"]);
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const text = value => typeof value === "string" && value.trim().length > 0;
const strings = value => Array.isArray(value) && value.length > 0 && value.every(text);

// Keep HTTP/API availability separate from configuration evidence. Never echo raw
// names, addresses, IDs, filters, provider messages or arbitrary plan strings.
function availability(response) {
  if (!response?.ok) return "unavailable";
  if (!Array.isArray(response.result)) return "unknown";
  const pagination = response.resultInfo;
  if (pagination !== undefined && (!record(pagination) ||
      !Number.isSafeInteger(pagination.total_count) || pagination.total_count !== response.result.length ||
      (pagination.page !== undefined && pagination.page !== 1))) return "unknown";
  return "observed";
}

export function inspectSubscriptions(response) {
  const status = availability(response);
  const observations = status !== "observed" ? [] : response.result.map((row, index) => {
    const ratePlan = row?.rate_plan;
    const stateKnown = states.has(row?.state);
    const planIdKnown = plans.has(ratePlan?.id);
    const priceValid = Number.isFinite(row?.price) && row.price >= 0;
    const currencyUsd = row?.currency === "USD";
    const valid = record(row) && stateKnown && record(ratePlan) && planIdKnown && priceValid && currencyUsd;
    return { index, fieldsValid: valid, state: stateKnown ? row.state : "unknown",
      planId: planIdKnown ? ratePlan.id : "unknown", priceUsd: priceValid && currencyUsd ? row.price : null,
      scopePresent: text(ratePlan?.scope), setsPresent: strings(ratePlan?.sets) };
  });
  return { status: status === "observed" && observations.some(row => !row.fieldsValid) ? "unknown" : status,
    httpStatus: Number.isInteger(response?.status) ? response.status : null,
    subscriptionCount: status === "observed" ? response.result.length : null,
    observations, workersPlan: "unknown", freePlanVerified: false,
    reason: "Workers tier needs authoritative product-specific subscription evidence; availability, empty results, zero price and generic free plan IDs do not establish it." };
}

export function inspectNotificationPolicies(response) {
  const status = availability(response);
  const observations = status !== "observed" ? [] : response.result.map((row, index) => {
    const billingUsage = row?.alert_type === "billing_usage_alert";
    const enabled = typeof row?.enabled === "boolean" ? row.enabled : null;
    const email = row?.mechanisms?.email;
    const validEmail = entry => record(entry) && typeof entry.id === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.id);
    const recipientsValid = Array.isArray(email) && email.length > 0 && email.every(validEmail);
    const productPresent = strings(row?.filters?.product);
    const limitPresent = strings(row?.filters?.limit);
    return { index, type: billingUsage ? "billing_usage_alert" : "other-or-unknown", enabled,
      emailRecipientCount: recipientsValid ? email.length : 0, recipientsValid,
      productFilterPresent: productPresent, limitFilterPresent: limitPresent,
      usageNotificationFieldsPresent: billingUsage && enabled === true && recipientsValid && productPresent && limitPresent };
  });
  return { status: status === "observed" && response.result.some(row => !record(row) || !text(row.alert_type) || typeof row.enabled !== "boolean") ? "unknown" : status,
    httpStatus: Number.isInteger(response?.status) ? response.status : null,
    policyCount: status === "observed" ? response.result.length : null, observations,
    budgetAlertStatus: "unknown", budgetAlertConfigured: null, budgetAlertVerified: false,
    reason: "Notification policies do not verify account budget alerts. Operator must inspect Billing > Billable Usage for the approved dollar threshold and intended recipients; usage filter semantics and recipient ownership also need review." };
}

export function inspectBillingConfiguration(subscriptions, alerts) {
  const billing = inspectSubscriptions(subscriptions);
  const notifications = inspectNotificationPolicies(alerts);
  return { billing, notifications, warnings: [
    `Workers plan verification ${billing.status}; Free plan remains unknown. ${billing.reason}`,
    `Budget-alert verification unknown; notification API ${notifications.status}. ${notifications.reason}`,
  ] };
}
