import type { Db } from '../persistence/db.js';
import type { Card, CardMessage, CardStatus, MessageRole, Run, RunKind, RunStatus } from './types.js';

interface CardRow {
	id: string;
	project_id: string;
	title: string;
	instruction: string;
	status: string;
	position: number;
	agent_id: string | null;
	created_at: number;
	updated_at: number;
}

interface RunRow {
	id: string;
	card_id: string;
	attempt_no: number;
	kind: string;
	agent_id: string | null;
	session_id: string | null;
	worktree_id: string | null;
	status: string;
	stop_reason: string | null;
	reason: string | null;
	started_at: number | null;
	ended_at: number | null;
}

interface MessageRow {
	id: string;
	card_id: string;
	run_id: string | null;
	role: string;
	content: string;
	created_at: number;
}

function toCard(row: CardRow): Card {
	return {
		id: row.id,
		projectId: row.project_id,
		title: row.title,
		instruction: row.instruction,
		status: row.status as CardStatus,
		position: row.position,
		agentId: row.agent_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

function toRun(row: RunRow): Run {
	return {
		id: row.id,
		cardId: row.card_id,
		attemptNo: row.attempt_no,
		kind: row.kind as RunKind,
		agentId: row.agent_id,
		sessionId: row.session_id,
		worktreeId: row.worktree_id,
		status: row.status as RunStatus,
		stopReason: row.stop_reason,
		reason: row.reason,
		startedAt: row.started_at,
		endedAt: row.ended_at
	};
}

function toMessage(row: MessageRow): CardMessage {
	return {
		id: row.id,
		cardId: row.card_id,
		runId: row.run_id,
		role: row.role as MessageRole,
		content: row.content,
		createdAt: row.created_at
	};
}

export class CardRepository {
	constructor(private readonly db: Db) {}

	insert(card: Card): Card {
		this.db.run(
			`INSERT INTO card (id, project_id, title, instruction, status, position, agent_id, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				card.id,
				card.projectId,
				card.title,
				card.instruction,
				card.status,
				card.position,
				card.agentId,
				card.createdAt,
				card.updatedAt
			]
		);
		return card;
	}

	findById(id: string): Card | undefined {
		const row = this.db.get<CardRow>('SELECT * FROM card WHERE id = ?', [id]);
		return row ? toCard(row) : undefined;
	}

	listByProject(projectId: string): Card[] {
		return this.db
			.all<CardRow>(
				'SELECT * FROM card WHERE project_id = ? ORDER BY status, position ASC, created_at ASC',
				[projectId]
			)
			.map(toCard);
	}

	listAll(): Card[] {
		return this.db.all<CardRow>('SELECT * FROM card ORDER BY created_at ASC').map(toCard);
	}

	listByStatus(projectId: string, status: CardStatus): Card[] {
		return this.db
			.all<CardRow>(
				'SELECT * FROM card WHERE project_id = ? AND status = ? ORDER BY position ASC, created_at ASC',
				[projectId, status]
			)
			.map(toCard);
	}

	nextPosition(projectId: string, status: CardStatus): number {
		const row = this.db.get<{ max_position: number | null }>(
			'SELECT MAX(position) AS max_position FROM card WHERE project_id = ? AND status = ?',
			[projectId, status]
		);
		return (row?.max_position ?? -1) + 1;
	}

	update(
		id: string,
		changes: Partial<Pick<Card, 'title' | 'instruction' | 'status' | 'position' | 'agentId'>>,
		now = Date.now()
	): void {
		const current = this.findById(id);
		if (!current) return;
		this.db.run(
			`UPDATE card SET title = ?, instruction = ?, status = ?, position = ?, agent_id = ?, updated_at = ?
			 WHERE id = ?`,
			[
				changes.title ?? current.title,
				changes.instruction ?? current.instruction,
				changes.status ?? current.status,
				changes.position ?? current.position,
				changes.agentId === undefined ? current.agentId : changes.agentId,
				now,
				id
			]
		);
	}

	delete(id: string): void {
		this.db.run('DELETE FROM card WHERE id = ?', [id]);
	}

	// --- Run ---

	insertRun(run: Run): Run {
		this.db.run(
			`INSERT INTO run (id, card_id, attempt_no, kind, agent_id, session_id, worktree_id, status, stop_reason, reason, started_at, ended_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				run.id,
				run.cardId,
				run.attemptNo,
				run.kind,
				run.agentId,
				run.sessionId,
				run.worktreeId,
				run.status,
				run.stopReason,
				run.reason,
				run.startedAt,
				run.endedAt
			]
		);
		return run;
	}

	findRun(id: string): Run | undefined {
		const row = this.db.get<RunRow>('SELECT * FROM run WHERE id = ?', [id]);
		return row ? toRun(row) : undefined;
	}

	listRuns(cardId: string): Run[] {
		return this.db
			.all<RunRow>('SELECT * FROM run WHERE card_id = ? ORDER BY attempt_no ASC', [cardId])
			.map(toRun);
	}

	lastRun(cardId: string): Run | undefined {
		const row = this.db.get<RunRow>(
			'SELECT * FROM run WHERE card_id = ? ORDER BY attempt_no DESC LIMIT 1',
			[cardId]
		);
		return row ? toRun(row) : undefined;
	}

	nextAttemptNo(cardId: string): number {
		const row = this.db.get<{ max_attempt: number | null }>(
			'SELECT MAX(attempt_no) AS max_attempt FROM run WHERE card_id = ?',
			[cardId]
		);
		return (row?.max_attempt ?? 0) + 1;
	}

	updateRun(
		id: string,
		changes: Partial<Pick<Run, 'sessionId' | 'worktreeId' | 'status' | 'stopReason' | 'reason' | 'endedAt'>>
	): void {
		const current = this.findRun(id);
		if (!current) return;
		this.db.run(
			`UPDATE run SET session_id = ?, worktree_id = ?, status = ?, stop_reason = ?, reason = ?, ended_at = ?
			 WHERE id = ?`,
			[
				changes.sessionId === undefined ? current.sessionId : changes.sessionId,
				changes.worktreeId === undefined ? current.worktreeId : changes.worktreeId,
				changes.status ?? current.status,
				changes.stopReason === undefined ? current.stopReason : changes.stopReason,
				changes.reason === undefined ? current.reason : changes.reason,
				changes.endedAt === undefined ? current.endedAt : changes.endedAt,
				id
			]
		);
	}

	// --- Message ---

	insertMessage(message: CardMessage): CardMessage {
		this.db.run(
			`INSERT INTO message (id, card_id, run_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
			[message.id, message.cardId, message.runId, message.role, message.content, message.createdAt]
		);
		return message;
	}

	listMessages(cardId: string): CardMessage[] {
		return this.db
			.all<MessageRow>(
				'SELECT * FROM message WHERE card_id = ? ORDER BY created_at ASC, rowid ASC',
				[cardId]
			)
			.map(toMessage);
	}
}
