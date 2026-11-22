/**
 * Keeps students out of the researcher screen. It is a child lock, not a
 * security measure: the value ships to the browser, and the data on this
 * screen is already on the same device.
 *
 * Set NEXT_PUBLIC_RESEARCHER_PIN in the deployment to change it.
 */
export const RESEARCHER_PIN = process.env.NEXT_PUBLIC_RESEARCHER_PIN ?? "0000";
