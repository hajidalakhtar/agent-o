import type { Db } from '../persistence/db.js';
import type { AgentCapabilities, AgentHealth, AgentRegistration } from './types.js';

interface AgentRow {
	id: string;
	name: string;
	command: string;
	args: string;
	env: string;
	max_concurrency: number;
	capabilities: string | null;
	auth_method: string | null;
	health: string;
	enabled: number;
	last_checked_at: number | null;
	created_at: number;
}

function parseJson<T>(raw: string | null, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function toAgent(row: AgentRow): AgentRegistration {
	return {
		id: row.id,
		name: row.name,
		command: row.command,
		args: parseJson<string[]>(row.args, []),
		env: parseJson<Record<string, string>>(row.env, {}),
		maxConcurrency: row.max_concurrency,
		capabilities: parseJson<AgentCapabilities | null>(row.capabilities, null),
		authMethod: row.auth_method,
		health: row.health as AgentHealth,
		enabled: row.enabled === 1,
		lastCheckedAt: row.last_checked_at,
		createdAt: row.created_at
	};
}

export class AgentRepository {
	constructor(private readonly db: Db) {}

	insert(agent: AgentRegistration): AgentRegistration {
		this.db.run(
			`INSERT INTO agent_registration
			 (id, name, command, args, env, max_concurrency, capabilities, auth_method, health, enabled, last_checked_at, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				agent.id,
				agent.name,
				agent.command,
				JSON.stringify(agent.args),
				JSON.stringify(agent.env),
				agent.maxConcurrency,
				agent.capabilities ? JSON.stringify(agent.capabilities) : null,
				agent.authMethod,
				agent.health,
				agent.enabled ? 1 : 0,
				agent.lastCheckedAt,
				agent.createdAt
			]
		);
		return agent;
	}

	findById(id: string): AgentRegistration | undefined {
		const row = this.db.get<AgentRow>('SELECT * FROM agent_registration WHERE id = ?', [id]);
		return row ? toAgent(row) : undefined;
	}

	findByName(name: string): AgentRegistration | undefined {
		const row = this.db.get<AgentRow>('SELECT * FROM agent_registration WHERE name = ?', [name]);
		return row ? toAgent(row) : undefined;
	}

	list(): AgentRegistration[] {
		return this.db
			.all<AgentRow>('SELECT * FROM agent_registration ORDER BY created_at ASC')
			.map(toAgent);
	}

	update(
		id: string,
		changes: Partial<
			Pick<
				AgentRegistration,
				'name' | 'command' | 'args' | 'env' | 'maxConcurrency' | 'capabilities' | 'authMethod' | 'health' | 'enabled' | 'lastCheckedAt'
			>
		>
	): void {
		const current = this.findById(id);
		if (!current) return;
		const next = { ...current, ...changes };
		this.db.run(
			`UPDATE agent_registration
			 SET name = ?, command = ?, args = ?, env = ?, max_concurrency = ?, capabilities = ?,
			     auth_method = ?, health = ?, enabled = ?, last_checked_at = ?
			 WHERE id = ?`,
			[
				next.name,
				next.command,
				JSON.stringify(next.args),
				JSON.stringify(next.env),
				next.maxConcurrency,
				next.capabilities ? JSON.stringify(next.capabilities) : null,
				next.authMethod,
				next.health,
				next.enabled ? 1 : 0,
				next.lastCheckedAt,
				id
			]
		);
	}

	delete(id: string): void {
		this.db.run('DELETE FROM agent_registration WHERE id = ?', [id]);
	}
}
