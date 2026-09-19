import { randomUUID } from 'node:crypto';
import type { Db } from '../persistence/db.js';
import { AgentRepository } from './repository.js';
import type { AgentCapabilities, AgentHealth, AgentRegistration, NewAgent } from './types.js';

export class AgentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AgentError';
	}
}

export class AgentService {
	private readonly repository: AgentRepository;

	constructor(private readonly db: Db) {
		this.repository = new AgentRepository(db);
	}

	list(): AgentRegistration[] {
		return this.repository.list();
	}

	get(id: string): AgentRegistration | undefined {
		return this.repository.findById(id);
	}

	require(id: string): AgentRegistration {
		const agent = this.repository.findById(id);
		if (!agent) throw new AgentError(`Agent ${id} tidak ditemukan.`);
		return agent;
	}

	/** AGENT-01: user menentukan command dan argumen sendiri. */
	create(input: NewAgent): AgentRegistration {
		const name = input.name.trim();
		const command = input.command.trim();
		if (!name) throw new AgentError('Nama agent wajib diisi.');
		if (!command) throw new AgentError('Command agent wajib diisi.');
		if (this.repository.findByName(name)) {
			throw new AgentError(`Agent dengan nama "${name}" sudah terdaftar.`);
		}

		const agent: AgentRegistration = {
			id: randomUUID(),
			name,
			command,
			args: input.args ?? [],
			env: input.env ?? {},
			maxConcurrency: input.maxConcurrency ?? 1,
			capabilities: null,
			authMethod: null,
			health: 'ok',
			enabled: true,
			lastCheckedAt: null,
			createdAt: Date.now()
		};
		return this.repository.insert(agent);
	}

	/** AGENT-05: nonaktifkan tanpa menghapus riwayat run. */
	setEnabled(id: string, enabled: boolean): AgentRegistration {
		const agent = this.require(id);
		const health: AgentHealth = enabled
			? agent.health === 'disabled'
				? 'ok'
				: agent.health
			: 'disabled';
		this.repository.update(id, { enabled, health });
		return this.require(id);
	}

	/** AGENT-02/AGENT-07: hasil handshake disimpan apa adanya. */
	recordHandshake(
		id: string,
		result: { capabilities: AgentCapabilities | null; authMethod: string | null; health: AgentHealth }
	): AgentRegistration {
		this.require(id);
		this.repository.update(id, {
			capabilities: result.capabilities,
			authMethod: result.authMethod,
			health: result.health,
			lastCheckedAt: Date.now()
		});
		return this.require(id);
	}

	setMaxConcurrency(id: string, maxConcurrency: number): AgentRegistration {
		if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
			throw new AgentError('Batas konkurensi harus bilangan bulat minimal 1.');
		}
		this.require(id);
		this.repository.update(id, { maxConcurrency });
		return this.require(id);
	}

	/** AGENT-08: hapus hanya bila belum pernah dipakai run. */
	remove(id: string): void {
		this.require(id);
		const used = this.db.get<{ count: number }>('SELECT COUNT(*) AS count FROM run WHERE agent_id = ?', [
			id
		]);
		if ((used?.count ?? 0) > 0) {
			throw new AgentError(
				'Agent ini sudah dipakai pada run sebelumnya. Nonaktifkan saja agar riwayat tetap utuh.'
			);
		}
		this.repository.delete(id);
	}

	/** Dipakai scheduler untuk batas konkurensi per agent (AGENT-06). */
	limitFor(agentId: string | null): number | null {
		if (!agentId) return null;
		return this.repository.findById(agentId)?.maxConcurrency ?? null;
	}

	/** AGENT-03/AGENT-04: agent tidak bisa dipakai bila disabled atau needs_auth. */
	usable(agentId: string | null): { usable: boolean; reason?: string } {
		if (!agentId) return { usable: false, reason: 'Tidak ada agent yang ditentukan.' };
		const agent = this.repository.findById(agentId);
		if (!agent) return { usable: false, reason: 'Agent tidak terdaftar.' };
		if (!agent.enabled) return { usable: false, reason: `Agent "${agent.name}" dinonaktifkan.` };
		if (agent.health === 'needs_auth') {
			return { usable: false, reason: `Agent "${agent.name}" butuh autentikasi.` };
		}
		if (agent.health !== 'ok') {
			return { usable: false, reason: `Agent "${agent.name}" tidak sehat (${agent.health}).` };
		}
		return { usable: true };
	}
}
