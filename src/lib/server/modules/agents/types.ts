export type AgentHealth = 'ok' | 'needs_auth' | 'spawn_failed' | 'handshake_failed' | 'disabled';

export interface AgentCapabilities {
	loadSession?: boolean;
	promptCapabilities?: Record<string, boolean> | null;
	[extra: string]: unknown;
}

export interface AgentRegistration {
	id: string;
	name: string;
	command: string;
	args: string[];
	env: Record<string, string>;
	maxConcurrency: number;
	capabilities: AgentCapabilities | null;
	authMethod: string | null;
	health: AgentHealth;
	enabled: boolean;
	lastCheckedAt: number | null;
	createdAt: number;
}

export interface NewAgent {
	name: string;
	command: string;
	args?: string[];
	env?: Record<string, string>;
	maxConcurrency?: number;
}
