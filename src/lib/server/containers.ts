import { mkdirSync } from 'node:fs';
import { acpTimeouts, appDataDir, dbPath, lockPath, logsDir, worktreesDir } from './config.js';
import { SpawnAcpRunner } from './modules/acp/index.js';
import { AgentService } from './modules/agents/index.js';
import { BoardService } from './modules/board/index.js';
import { CardService } from './modules/cards/index.js';
import { EventService } from './modules/events/index.js';
import { Orchestrator } from './modules/orchestrator/index.js';
import { PermissionService } from './modules/permissions/index.js';
import { Db, acquireLock, migrate, type LockHandle } from './modules/persistence/index.js';
import { ProjectService } from './modules/projects/index.js';
import { Scheduler } from './modules/scheduler/index.js';
import { SettingsService } from './modules/settings/index.js';
import { WorkspaceService } from './modules/workspace/index.js';

export interface App {
	db: Db;
	lock: LockHandle;
	settings: SettingsService;
	projects: ProjectService;
	cards: CardService;
	events: EventService;
	board: BoardService;
	scheduler: Scheduler;
	agents: AgentService;
	permissions: PermissionService;
	workspace: WorkspaceService;
	orchestrator: Orchestrator;
}

export interface AppPaths {
	dbPath: string;
	lockPath: string;
	worktreesRoot: string;
	logsDir: string;
}

/** Merakit seluruh modul. Dipisah dari `getApp` agar bisa dipakai test. */
export function buildApp(paths: AppPaths): App {
	const db = new Db(paths.dbPath);
	migrate(db);

	let lock: LockHandle;
	try {
		lock = acquireLock(paths.lockPath);
	} catch (error) {
		db.close();
		throw error;
	}

	mkdirSync(paths.logsDir, { recursive: true });
	mkdirSync(paths.worktreesRoot, { recursive: true });

	const settings = new SettingsService(db);
	const projects = new ProjectService(db);
	const cards = new CardService(db);
	const events = new EventService(db);
	const board = new BoardService(cards, events);
	const agents = new AgentService(db);
	const permissions = new PermissionService(db);
	const workspace = new WorkspaceService(db, { worktreesRoot: paths.worktreesRoot });

	// Agent ACP bawaan selalu tersedia, dan project lama tanpa default ikut memakainya.
	projects.adoptDefaultAgent(agents.ensureDefault().id);

	const scheduler = new Scheduler(
		{
			globalLimit: () => settings.globalWipLimit(),
			projectLimit: (projectId) => projects.get(projectId)?.wipLimit ?? settings.globalWipLimit(),
			agentLimit: (agentId) => agents.limitFor(agentId)
		},
		(type, request, detail) => {
			events.record({
				cardId: request.cardId,
				type: 'moved',
				payload: { scheduler: type, ...detail }
			});
		}
	);

	recoverInterruptedRuns(db, cards, events);
	scheduler.seed([]);

	const orchestrator = new Orchestrator({
		cards,
		events,
		board,
		agents,
		projects,
		permissions,
		scheduler,
		workspace,
		runs: { acp: new SpawnAcpRunner(acpTimeouts()), logsDir: paths.logsDir }
	});

	return {
		db,
		lock,
		settings,
		projects,
		cards,
		events,
		board,
		scheduler,
		agents,
		permissions,
		workspace,
		orchestrator
	};
}

/**
 * PERSIST-05/06 + NFR-20: setelah restart tidak ada proses agent yang berjalan,
 * jadi run `running` menjadi `interrupted` dan card-nya ke `blocked` —
 * tidak ada card yang "tampak sedang dikerjakan".
 */
function recoverInterruptedRuns(db: Db, cards: CardService, events: EventService): void {
	const now = Date.now();
	const running = db.all<{ id: string }>("SELECT id FROM run WHERE status = 'running'");
	for (const run of running) {
		db.run("UPDATE run SET status = 'interrupted', reason = ?, ended_at = ? WHERE id = ?", [
			'Aplikasi berhenti saat run berjalan.',
			now,
			run.id
		]);
	}

	for (const card of db.all<{ id: string; project_id: string }>("SELECT id, project_id FROM card WHERE status = 'in_progress'")) {
		cards.update(card.id, { status: 'blocked' });
		events.record({
			cardId: card.id,
			type: 'moved',
			payload: {
				from: 'in_progress',
				to: 'blocked',
				actor: 'system',
				reason: 'Aplikasi restart saat run berjalan.'
			}
		});
	}
}

let app: App | undefined;
let initError: Error | undefined;

/** Singleton aplikasi; inisialisasi sekali saat server start. */
export function getApp(): App {
	if (initError) throw initError;
	if (!app) {
		mkdirSync(appDataDir(), { recursive: true });
		app = buildApp({
			dbPath: dbPath(),
			lockPath: lockPath(),
			worktreesRoot: worktreesDir(),
			logsDir: logsDir()
		});
	}
	return app;
}

export function tryInitApp(): Error | undefined {
	try {
		getApp();
		return undefined;
	} catch (error) {
		initError = error as Error;
		return initError;
	}
}

export function shutdownApp(): void {
	if (!app) return;
	try {
		void app.orchestrator.shutdown();
		app.lock.release();
		app.db.close();
	} catch {
		// Shutdown tidak boleh melempar.
	}
	app = undefined;
}
