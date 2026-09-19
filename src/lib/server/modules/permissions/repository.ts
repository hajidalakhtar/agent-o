import type { Db } from '../persistence/db.js';
import type { Decision, PermissionPolicy, PermissionRule, PolicyScope } from './types.js';

interface PolicyRow {
	id: string;
	name: string;
	scope: string;
	scope_id: string | null;
	rules: string;
	default_decision: string;
	created_at: number;
}

function toPolicy(row: PolicyRow): PermissionPolicy {
	let rules: PermissionRule[] = [];
	try {
		rules = JSON.parse(row.rules) as PermissionRule[];
	} catch {
		rules = [];
	}
	return {
		id: row.id,
		name: row.name,
		scope: row.scope as PolicyScope,
		scopeId: row.scope_id,
		rules,
		defaultDecision: row.default_decision as Decision,
		createdAt: row.created_at
	};
}

export class PermissionRepository {
	constructor(private readonly db: Db) {}

	insert(policy: PermissionPolicy): PermissionPolicy {
		this.db.run(
			`INSERT INTO permission_policy (id, name, scope, scope_id, rules, default_decision, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[
				policy.id,
				policy.name,
				policy.scope,
				policy.scopeId,
				JSON.stringify(policy.rules),
				policy.defaultDecision,
				policy.createdAt
			]
		);
		return policy;
	}

	findById(id: string): PermissionPolicy | undefined {
		const row = this.db.get<PolicyRow>('SELECT * FROM permission_policy WHERE id = ?', [id]);
		return row ? toPolicy(row) : undefined;
	}

	list(): PermissionPolicy[] {
		return this.db
			.all<PolicyRow>('SELECT * FROM permission_policy ORDER BY created_at ASC')
			.map(toPolicy);
	}

	findByScope(scope: PolicyScope, scopeId: string | null): PermissionPolicy | undefined {
		const row = this.db.get<PolicyRow>(
			'SELECT * FROM permission_policy WHERE scope = ? AND (scope_id IS ? OR scope_id = ?) LIMIT 1',
			[scope, scopeId, scopeId]
		);
		return row ? toPolicy(row) : undefined;
	}

	update(
		id: string,
		changes: Partial<Pick<PermissionPolicy, 'name' | 'rules' | 'defaultDecision' | 'scope' | 'scopeId'>>
	): void {
		const current = this.findById(id);
		if (!current) return;
		const next = { ...current, ...changes };
		this.db.run(
			`UPDATE permission_policy SET name = ?, scope = ?, scope_id = ?, rules = ?, default_decision = ? WHERE id = ?`,
			[next.name, next.scope, next.scopeId, JSON.stringify(next.rules), next.defaultDecision, id]
		);
	}

	delete(id: string): void {
		this.db.run('DELETE FROM permission_policy WHERE id = ?', [id]);
	}
}
