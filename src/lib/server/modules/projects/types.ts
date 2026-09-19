export interface Project {
	id: string;
	name: string;
	rootPath: string;
	defaultBranch: string;
	defaultAgentId: string | null;
	wipLimit: number;
	permissionPolicyId: string | null;
	available: boolean;
	createdAt: number;
}
