import { mkdirSync } from 'node:fs';
import { appDataDir, dbPath, lockPath } from './config.js';
import { AgentService } from './modules/agents/index.js';
import { BoardService } from './modules/board/index.js';
import { CardService } from './modules/cards/index.js';
import { EventService } from './modules/events/index.js';
import { PermissionService } from './modules/permissions/index.js';
import { Db, acquireLock, migrate, type LockHandle } from './modules/persistence/index.js';
import { ProjectService } from './modules/projects/index.js';
import { Scheduler } from './modules/scheduler/index.js';
import { SettingsService } from './modules/settings/index.js';

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
}

export interface AppPaths {
	dbPath: string;
	lockPath: string;
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

	const settings = new SettingsService(db);
	const projects = new ProjectService(db);
	const cards = new CardService(db);
	const events = new EventService(db);
	const board = new BoardService(cards, events);
	const agents = new AgentService(db);
	const permissions = new PermissionService(db);

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
		permissions
	};
}

let app: App | undefined;
let initError: Error | undefined;

/** Singleton aplikasi; inisialisasi sekali saat server start. */
export function getApp(): App {
	if (initError) throw initError;
	if (!app) {
		mkdirSync(appDataDir(), { recursive: true });
		app = buildApp({ dbPath: dbPath(), lockPath: lockPath() });
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
		app.lock.release();
		app.db.close();
	} catch {
		// Shutdown tidak boleh melempar.
	}
	app = undefined;
}
