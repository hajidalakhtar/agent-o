import type { Db } from '../persistence/db.js';
import type { Project } from './types.js';

interface ProjectRow {
	id: string;
	name: string;
	root_path: string;
	default_branch: string;
	default_agent_id: string | null;
	wip_limit: number;
	permission_policy_id: string | null;
	available: number;
	created_at: number;
}

function toProject(row: ProjectRow): Project {
	return {
		id: row.id,
		name: row.name,
		rootPath: row.root_path,
		defaultBranch: row.default_branch,
		defaultAgentId: row.default_agent_id,
		wipLimit: row.wip_limit,
		permissionPolicyId: row.permission_policy_id,
		available: row.available === 1,
		createdAt: row.created_at
	};
}

export class ProjectRepository {
	constructor(private readonly db: Db) {}

	insert(project: Project): Project {
		this.db.run(
			`INSERT INTO project
			 (id, name, root_path, default_branch, default_agent_id, wip_limit, permission_policy_id, available, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				project.id,
				project.name,
				project.rootPath,
				project.defaultBranch,
				project.defaultAgentId,
				project.wipLimit,
				project.permissionPolicyId,
				project.available ? 1 : 0,
				project.createdAt
			]
		);
		return project;
	}

	findById(id: string): Project | undefined {
		const row = this.db.get<ProjectRow>('SELECT * FROM project WHERE id = ?', [id]);
		return row ? toProject(row) : undefined;
	}

	findByRootPath(rootPath: string): Project | undefined {
		const row = this.db.get<ProjectRow>('SELECT * FROM project WHERE root_path = ?', [rootPath]);
		return row ? toProject(row) : undefined;
	}

	list(): Project[] {
		return this.db
			.all<ProjectRow>('SELECT * FROM project ORDER BY created_at ASC')
			.map(toProject);
	}

	setAvailable(id: string, available: boolean): void {
		this.db.run('UPDATE project SET available = ? WHERE id = ?', [available ? 1 : 0, id]);
	}

	/** Isi default_agent_id yang masih kosong tanpa menimpa pilihan yang sudah ada. */
	setDefaultAgentForUnset(agentId: string): void {
		this.db.run('UPDATE project SET default_agent_id = ? WHERE default_agent_id IS NULL', [agentId]);
	}

	updateDefaults(
		id: string,
		changes: { name?: string; defaultBranch?: string; wipLimit?: number; defaultAgentId?: string | null }
	): void {
		const current = this.findById(id);
		if (!current) return;
		this.db.run(
			'UPDATE project SET name = ?, default_branch = ?, wip_limit = ?, default_agent_id = ? WHERE id = ?',
			[
				changes.name ?? current.name,
				changes.defaultBranch ?? current.defaultBranch,
				changes.wipLimit ?? current.wipLimit,
				changes.defaultAgentId === undefined ? current.defaultAgentId : changes.defaultAgentId,
				id
			]
		);
	}

	delete(id: string): void {
		this.db.run('DELETE FROM project WHERE id = ?', [id]);
	}
}
