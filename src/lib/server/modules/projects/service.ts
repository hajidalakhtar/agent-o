import { randomUUID } from 'node:crypto';
import { defaultWipLimit as configDefaultWipLimit } from '../../config.js';
import type { Db } from '../persistence/db.js';
import { ProjectRepository } from './repository.js';
import type { Project } from './types.js';
import { validateProjectFolder, type ProjectValidation } from './validation.js';

export class ProjectError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProjectError';
	}
}

export class ProjectService {
	private readonly repository: ProjectRepository;

	constructor(db: Db) {
		this.repository = new ProjectRepository(db);
	}

	list(): Project[] {
		return this.repository.list();
	}

	get(id: string): Project | undefined {
		return this.repository.findById(id);
	}

	require(id: string): Project {
		const project = this.repository.findById(id);
		if (!project) throw new ProjectError(`Project ${id} tidak ditemukan.`);
		return project;
	}

	/** Validasi tanpa menyimpan (dipakai UI untuk pratinjau). */
	validate(inputPath: string): Promise<ProjectValidation> {
		return validateProjectFolder(inputPath);
	}

	/** PROJECT-01/PROJECT-02: validasi lalu simpan; gagal berarti tidak masuk daftar. */
	async add(inputPath: string, defaults?: { wipLimit?: number }): Promise<Project> {
		const validation = await this.validate(inputPath);
		if (!validation.ok) {
			throw new ProjectError(validation.message);
		}
		if (this.repository.findByRootPath(validation.rootPath)) {
			throw new ProjectError('Folder ini sudah terdaftar sebagai project.');
		}

		const project: Project = {
			id: randomUUID(),
			name: validation.name,
			rootPath: validation.rootPath,
			defaultBranch: validation.defaultBranch,
			defaultAgentId: null,
			wipLimit: defaults?.wipLimit ?? configDefaultWipLimit(),
			permissionPolicyId: null,
			available: true,
			createdAt: Date.now()
		};
		return this.repository.insert(project);
	}

	rename(id: string, name: string): Project {
		if (name.trim().length === 0) throw new ProjectError('Nama project tidak boleh kosong.');
		this.repository.updateDefaults(id, { name: name.trim() });
		return this.require(id);
	}

	setWipLimit(id: string, wipLimit: number): Project {
		if (!Number.isInteger(wipLimit) || wipLimit < 1) {
			throw new ProjectError('WIP limit harus bilangan bulat minimal 1.');
		}
		this.repository.updateDefaults(id, { wipLimit });
		return this.require(id);
	}

	/** PROJECT-06: cek ulang kondisi repo sebelum membuat worktree. */
	async revalidate(id: string): Promise<ProjectValidation> {
		const project = this.require(id);
		const validation = await validateProjectFolder(project.rootPath);
		this.repository.setAvailable(id, validation.ok);
		return validation;
	}

	remove(id: string): void {
		this.repository.delete(id);
	}
}
