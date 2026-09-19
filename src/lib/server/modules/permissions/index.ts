export { PermissionService, PermissionError } from './service.js';
export {
	resolveDecision,
	classifyCommand,
	classifyPath,
	classifyWritePath
} from './resolver.js';
export type { PolicyLayer, Resolution } from './resolver.js';
export {
	PERMISSION_CATEGORIES,
	CATEGORY_LABELS,
	ALWAYS_DENIED,
	SYSTEM_DEFAULTS
} from './types.js';
export type {
	Decision,
	PermissionCategory,
	PermissionPolicy,
	PermissionRule,
	PolicyScope
} from './types.js';
