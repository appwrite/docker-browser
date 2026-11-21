// The startup baseline must include idle Chromium, so it launches first.
import "./browser.js";
import { createAdmission } from "../utils/admission.js";

export const admission = createAdmission();
