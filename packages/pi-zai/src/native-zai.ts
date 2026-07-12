import type { Model } from "@earendil-works/pi-ai";
import { isZaiModel } from "./cache/context-policy.ts";

/** True when the active model uses Pi's native Z.AI providers. */
export function isNativeZaiModel(model: Model<any> | undefined): boolean {
	return isZaiModel(model);
}
