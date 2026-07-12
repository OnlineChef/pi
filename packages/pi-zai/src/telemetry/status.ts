import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ZaiConfig } from "../config.ts";
import { formatTpsStatusLine, type TpsSample, type TpsStats } from "./tps.ts";

const STATUS_KEY = "zai";

export function clearZaiStatus(ctx: ExtensionContext): void {
	if (!ctx.hasUI) {
		return;
	}
	ctx.ui.setStatus(STATUS_KEY, undefined);
}

export function updateZaiTpsStatus(
	ctx: ExtensionContext,
	config: ZaiConfig,
	sample: TpsSample | undefined,
	stats: TpsStats,
): void {
	if (!ctx.hasUI || config.statusTps === false || !sample || sample.tps <= 0) {
		return;
	}
	ctx.ui.setStatus(STATUS_KEY, formatTpsStatusLine(sample, stats.rolling, config.statusTpsAvg === true));
}
