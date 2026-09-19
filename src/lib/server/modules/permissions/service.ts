import { randomUUID } from 'node:crypto';
import type { Db } from '../persistence/db.js';
import { PermissionRepository } from './repository.js';
import { resolveDecision, type PolicyLayer, type Resolution } from './resolver.js';
import {
	PERMISSION_CATEGORIES,
	type Decision,
	type PermissionCategory,
	type PermissionPolicy,
	type PermissionRule,
	type PolicyScope
} from './types.js';

export class PermissionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PermissionError';
	}
}

export interface PolicyInput {
	name: string;
	scope: PolicyScope;
	scopeId?: string | null;
	rules?: PermissionRule[];
	defaultDecision?: Decision;
}

export class PermissionService {
	private readonly repository: PermissionRepository;

	constructor(db: Db) {
		this.repository = new PermissionRepository(db);
	}

	list(): PermissionPolicy[] {
		return this.repository.list();
	}

	get(id: string): PermissionPolicy | undefined {
		return this.repository.findById(id);
	}

	require(id: string): PermissionPolicy {
		const policy = this.repository.findById(id);
		if (!policy) throw new PermissionError(`Policy ${id} tidak ditemukan.`);
		return policy;
	}

	create(input: PolicyInput): PermissionPolicy {
		const name = input.name.trim();
		if (!name) throw new PermissionError('Nama policy wajib diisi.');
		if (input.scope !== 'global' && !input.scopeId) {
			throw new PermissionError('Policy project/card harus menyebut scope id.');
		}

		const rules = this.sanitizeRules(input.rules ?? []);
		const policy: PermissionPolicy = {
			id: randomUUID(),
			name,
			scope: input.scope,
			scopeId: input.scopeId ?? null,
			rules,
			defaultDecision: input.defaultDecision ?? 'deny',
			createdAt: Date.now()
		};
		return this.repository.insert(policy);
	}

	update(
		id: string,
		changes: { name?: string; rules?: PermissionRule[]; defaultDecision?: Decision }
	): PermissionPolicy {
		this.require(id);
		this.repository.update(id, {
			name: changes.name?.trim() || undefined,
			rules: changes.rules ? this.sanitizeRules(changes.rules) : undefined,
			defaultDecision: changes.defaultDecision
		});
		return this.require(id);
	}

	remove(id: string): void {
		this.require(id);
		this.repository.delete(id);
	}

	private sanitizeRules(rules: PermissionRule[]): PermissionRule[] {
		const seen = new Set<PermissionCategory>();
		const cleaned: PermissionRule[] = [];
		for (const rule of rules) {
			if (!PERMISSION_CATEGORIES.includes(rule.category)) {
				throw new PermissionError(`Kategori tidak dikenal: ${rule.category}`);
			}
			if (seen.has(rule.category)) continue;
			seen.add(rule.category);
			cleaned.push({ category: rule.category, decision: rule.decision });
		}
		return cleaned;
	}

	/** Urutan card → project → global (PERM-03). */
	layersFor(input: { cardId?: string | null; projectId?: string | null }): PolicyLayer[] {
		const layers: PolicyLayer[] = [];
		if (input.cardId) {
			const card = this.repository.findByScope('card', input.cardId);
			if (card) layers.push({ scope: 'card', rules: card.rules, defaultDecision: card.defaultDecision, name: card.name });
		}
		if (input.projectId) {
			const project = this.repository.findByScope('project', input.projectId);
			if (project) {
				layers.push({
					scope: 'project',
					rules: project.rules,
					defaultDecision: project.defaultDecision,
					name: project.name
				});
			}
		}
		const global = this.repository.findByScope('global', null);
		if (global) {
			layers.push({ scope: 'global', rules: global.rules, defaultDecision: global.defaultDecision, name: global.name });
		}
		return layers;
	}

	/** PERM-10: uji coba policy sebelum disimpan. */
	simulate(
		category: PermissionCategory,
		input: { cardId?: string | null; projectId?: string | null } = {}
	): Resolution {
		return resolveDecision(category, this.layersFor(input));
	}
}
