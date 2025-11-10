import lighthouseDesktopConfig from "lighthouse/core/config/lr-desktop-config.js";
import lighthouseMobileConfig from "lighthouse/core/config/lr-mobile-config.js";

export const lighthouseConfigs = {
	mobile: lighthouseMobileConfig,
	desktop: lighthouseDesktopConfig,
} as const;
