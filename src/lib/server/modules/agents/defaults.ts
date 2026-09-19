import type { NewAgent } from './types.js';

/** Agent ACP bawaan (`opencode acp`). Dipakai sebagai default_agent_id project baru. */
export const DEFAULT_ACP_AGENT: NewAgent = {
	name: 'OpenCode',
	command: 'opencode',
	args: ['acp']
};
