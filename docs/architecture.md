# agent-o — Arsitektur

Dokumen ini menjelaskan **bagaimana** agent-o dibangun. Untuk konteks produk lihat [`overview.md`](./overview.md); untuk urutan pengerjaan lihat [`roadmap.md`](./roadmap.md); untuk spesifikasi per fitur lihat [`spec/`](./spec/README.md).

Prinsip yang dipegang:

- **Satu modul = satu dokumen spec = satu prefix ID.** Batas modul mengikuti batas kebutuhan, bukan batas teknis.
- **Protokol dulu, UI kemudian.** Inti sistem ada di lapisan server (ACP + lifecycle git); UI adalah lapisan tipis di atasnya.
- **Git adalah sumber kebenaran kode.** Database menyimpan metadata, riwayat, dan SHA — tidak pernah isi file.
- **Port-adapter.** Logika domain murni dan dapat diuji; git, ACP, dan database adalah adapter yang di-inject.

## 1. Keputusan stack

| Aspek | Pilihan | Alasan |
|---|---|---|
| Framework | SvelteKit 2 / Svelte 5 (runes) | Satu repo untuk server Node long-running (orkestrasi) dan UI reaktif |
| Adapter deploy | `@sveltejs/adapter-node` | Butuh proses Node persisten: spawn agent, scheduler, file lock — bukan serverless |
| Bahasa | TypeScript (strict) | Model data besar dan bertipe; mencegah regresi di state machine |
| Database | SQLite via `node:sqlite` (bawaan Node 22+) | Nol native dependency. `better-sqlite3` tidak dipakai karena prebuilt-nya butuh GLIBC ≥ 2.33 dan environment build tidak punya C toolchain untuk kompilasi dari source |
| Migrasi | SQL inline + runner sendiri (`persistence/migrations.ts`) | Tidak ada dependensi ORM; migrasi dijalankan otomatis saat start (`NFR-27`) |
| Protokol agent | `@agentclientprotocol/sdk` (ACP v1 stabil) | SDK resmi; method/field diverifikasi dari handshake, bukan hardcode (`NFR-23`) |
| Git | `node:child_process` (helper tipis) | Butuh kontrol penuh atas worktree/merge/diff/rebase dan output mentah |
| Real-time | Server-Sent Events (SSE) | Streaming `CardEvent` server→browser tanpa server WebSocket terpisah |
| Test | Vitest | Unit test per modul; nama test merujuk ID kebutuhan (`NFR-25`) |
| Platform | Linux dulu (kode diusahakan portabel) | Sinyal proses dan file lock paling sederhana |

Keputusan yang berasal dari pertanyaan terbuka spec dikunci sebagai ADR di [`adr/`](./adr/README.md).

> **Rujukan resmi ACP.** Bila ragu soal nama method, field, capability, atau `stopReason`, jangan tebak dan jangan hardcode dari dokumen ini — baca indeks dokumentasi resminya di <https://agentclientprotocol.com/llms.txt> (daftar seluruh halaman; detail protokol ada di `/protocol/v1/*`, SDK TypeScript di `/libraries/typescript`). Konfirmasi terakhir terhadap kode: `@agentclientprotocol/sdk` v1.4.0, transport JSON-RPC 2.0 di atas stdio dengan pesan yang dipisahkan newline.

## 2. Arsitektur modular

Setiap modul adalah satu paket mandiri dengan **antarmuka publik tunggal** (`index.ts`). Modul lain hanya boleh mengimpor lewat `index.ts`; isi internal tidak boleh ditembus.

Lokasi: `src/lib/server/modules/<nama>/`

```
<modul>/
├── types.ts        # tipe domain murni (tanpa I/O)
├── schema.ts       # tabel Drizzle milik modul ini
├── repository.ts   # satu-satunya tempat yang menyentuh tabel modul ini
├── service.ts      # use-case / logika bisnis
├── index.ts        # antarmuka publik modul (port)
└── *.test.ts       # unit test, nama menyebut ID kebutuhan
```

### 2.1 Peta modul

| Modul | Prefix spec | Tanggung jawab |
|---|---|---|
| `events` | `CARD-06`, `PERSIST-03`, `NFR-11` | Store `CardEvent` append-only + `EventBus` in-process untuk SSE |
| `git` | — (adapter) | Wrapper tipis: `rev-parse`, `status --porcelain`, `worktree add/remove`, `merge`, `diff`, `rebase`, `rev-list`, `symbolic-ref` |
| `projects` | `PROJECT-*` | CRUD project, 6 validasi folder, deteksi default branch deterministik |
| `cards` | `CARD-*` | CRUD card, thread, run, pesan; render ulang thread dari event |
| `board` | `BOARD-*` | State machine: tabel transisi + guard; `transition(cardId, to, actor, reason)` |
| `scheduler` | `SCHED-*` | Batas WIP global/project/agent, antrean FIFO in-memory, rekonstruksi dari DB saat start |
| `workspace` | `WS-*` | Siklus hidup worktree + branch, state `active/frozen/merged/removed`, cleanup idempoten |
| `agents` | `AGENT-*` | Registry agent, handshake `initialize`, capability map, health, konkurensi |
| `acp` | `ACP-*` | Spawn proses, bridge stdio↔ndjson, client ACP, sesi, streaming update, cancel, log mentah |
| `completion` | `DONE-*` | Parser blok status `agent_o`, fallback `stopReason`, pelacakan kepatuhan |
| `permissions` | `PERM-*` | Klasifikasi operasi, resolusi policy (card→project→global→default), gate `fs/*` & `terminal/*` |
| `review` | `REVIEW-*` | Freeze, diff dari pasangan SHA, batas ukuran diff, approve (`merge --no-ff`) / reject |
| `conflict` | `CONFLICT-*` | Rebase worktree `active`, deteksi konflik, run `resolve-conflict`, re-freeze |
| `persistence` | `PERSIST-*` | Koneksi DB, migrasi, file lock single-instance, recovery start, sapu worktree yatim, rotasi log |
| `orchestrator` | lintas | Koordinator tunggal yang merangkai modul di atas |

### 2.2 Arah dependensi

```
UI (Svelte)
   │  load / form action
   ▼
routes (+page.server.ts, +server.ts)
   │
   ▼
orchestrator ──────────┐
   │                   │
   ├─▶ board           ├─▶ events ──▶ EventBus ──▶ SSE ──▶ UI
   ├─▶ scheduler       │
   ├─▶ workspace ──▶ git (adapter)
   ├─▶ acp       ──▶ agents
   ├─▶ completion      │
   ├─▶ permissions     │
   └─▶ review / conflict
   │
   ▼
persistence (Drizzle + better-sqlite3)  ▸  direktori app_data
```

Aturan:

1. `types.ts` setiap modul **murni** — tidak mengimpor adapter, database, atau modul lain. Ini yang membuat domain bisa di-unit-test tanpa proses atau filesystem nyata.
2. Adapter (`git`, `acp`, koneksi DB) **di-inject** ke service, bukan di-`import` langsung dari kode domain. Test memakai implementasi palsu.
3. Hanya `orchestrator` yang mengoordinasikan lintas modul untuk satu alur. Modul lain berkomunikasi lewat `index.ts`.
4. UI tidak pernah menyentuh git, ACP, atau SQL langsung — selalu lewat `routes` → `orchestrator`/modul.

## 3. Struktur direktori

```
agent-o/
├── docs/                       # dokumen ini, overview, roadmap, specs, ADR
├── scripts/spike/              # Fase 0: spike ACP headless
├── src/
│   ├── app.html
│   ├── app.d.ts
│   ├── hooks.server.ts         # init singletons: lock → migrasi → recovery → scheduler
│   ├── lib/
│   │   ├── server/
│   │   │   ├── config.ts       # path app_data, env
│   │   │   ├── containers.ts   # perakitan modul (dependency injection)
│   │   │   └── modules/        # modul pada §2.1
│   │   └── components/         # komponen Svelte (board, card, diff, log)
│   └── routes/
│       ├── +layout.svelte
│       ├── +page.svelte                    # daftar board / project
│       ├── projects/[id]/+page.svelte      # board satu project
│       ├── cards/[id]/+page.svelte         # thread + tab review
│       ├── agents/+page.svelte             # registry agent
│       └── api/
│           ├── projects/+server.ts
│           ├── cards/+server.ts
│           ├── cards/[id]/transition/+server.ts   # drag antar kolom
│           ├── cards/[id]/reply/+server.ts
│           ├── cards/[id]/stop/+server.ts
│           ├── cards/[id]/events/+server.ts        # SSE stream CardEvent
│           ├── cards/[id]/diff/+server.ts
│           ├── cards/[id]/approve|reject/+server.ts
│           └── agents/...  permissions/...
├── tests/                      # test integrasi lintas modul
├── package.json  svelte.config.js  vite.config.ts  tsconfig.json
└── drizzle.config.ts
```

## 4. Skema database

Mengikuti diagram di [`spec/persistence-recovery.md`](./spec/persistence-recovery.md). Setiap modul mendefinisikan DDL tabelnya, dan seluruh migrasi dikumpulkan di `persistence/migrations.ts` sebagai string SQL. Akses data lewat `repository.ts` tiap modul di atas wrapper `Db` (lihat [`persistence/db.ts`](../src/lib/server/modules/persistence/db.ts)).

| Tabel | Modul pemilik | Isi |
|---|---|---|
| `project` | `projects` | `root_path`, `default_branch`, `default_agent_id`, `wip_limit`, `permission_policy_id` |
| `card` | `cards` | `title`, `instruction`, `status`, `position`, `agent_id` |
| `run` | `cards` | `attempt_no`, `kind` (`task`/`resolve-conflict`/`answer`), `session_id`, `worktree_id`, `status`, `stop_reason` |
| `worktree` | `workspace` | `path`, `branch`, `base_sha`, `head_sha`, `state` |
| `card_event` | `events` | `type`, `payload` (JSON), `created_at` — append-only |
| `message` | `cards` | pesan user/agent di thread |
| `permission_policy` | `permissions` | `scope`, `rules` (JSON), `default_decision` |
| `agent_registration` | `agents` | `command`, `args`, `env`, `max_concurrency`, `capabilities` (JSON), `health` |
| `settings` | `persistence` | konfigurasi global (WIP global, policy default) |

Konvensi:

- **PK string opaque** (`nanoid`), bukan auto-increment — aman diekspos di URL.
- **Timestamp** integer `mode: 'timestamp_ms'` (epoch milidetik).
- **JSON** disimpan sebagai `TEXT` dan di-serialize/deserialize di repository.
- `card_event` **append-only**: repository tidak mengekspos `update`/`delete` (`NFR-11`).
- Foreign key ditulis di migrasi dan ditegakkan lewat `PRAGMA foreign_keys = ON`.
- Migrasi dijalankan otomatis saat start (`NFR-27`), idempoten, terlacak di tabel `_migration`.

## 5. Model proses dan real-time

### 5.1 Satu instance

SvelteKit Node berjalan sebagai **satu proses** = satu instance aplikasi. Saat `hooks.server.ts` dijalankan sekali:

```
ambil file lock ── gagal ──▶ tolak start (instance lain aktif)
   │
   ├─ jalankan migrasi
   ├─ recovery: tandai run "running" → "interrupted", card → blocked (PERSIST-05/06/07)
   ├─ validasi integritas: card aktif harus punya worktree (PERSIST)
   ├─ sapu worktree yatim (PERSIST-10, WS-07)
   └─ rekonstruksi scheduler dari DB (SCHED-08)
```

Lock adalah file ber-PID di `app_data/`; jika PID di lock sudah mati, lock diambil alih (PERSIST-09, NFR-17).

### 5.2 Orkestrasi

`orchestrator` adalah singleton di `src/lib/server`, bukan di dalam route. Route hanya memanggil use-case-nya. Untuk setiap transisi board, orchestrator menjalankan urutan guard → aksi sistem → pencatatan event secara transaksional sebisa mungkin.

### 5.3 Streaming ke UI

```
agent stdout ──▶ acp (ndjson) ──▶ session/update
                                   │
                                   ├─▶ events.append(CardEvent)  ──▶ SQLite
                                   └─▶ EventBus.publish(cardId, event)
                                              │
                                     SSE /api/cards/[id]/events
                                              │
                                              ▼
                                        thread di UI
```

Karena setiap update **juga** disimpan sebagai `CardEvent`, thread dapat dirender ulang penuh setelah restart — bukan hanya dari memori (`CARD-06`).

### 5.4 Proses agent

- Satu card = satu worktree = satu branch = maksimal satu sesi ACP aktif (`BOARD-03`, `ACP-10`, `NFR-05`).
- Proses agent memakai `child_process.spawn`, stdio-nya dijembatani ke stream ndjson milik SDK ACP.
- Proses **dimatikan** setiap card tidak berada di `in_progress` (`NFR-08`).
- stdout non-protokol dan seluruh stderr disimpan sebagai log mentah per run (`ACP-09`, `PERSIST-04`).

## 6. Keputusan terbuka

Setiap `OD-*` dikunci sebagai ADR. Ringkasan:

| ID | Keputusan | ADR |
|---|---|---|
| `OD-01` | Allow di dalam worktree, deny di luar; keluar-worktree & git remote selalu deny | [`adr/0001`](./adr/0001-od-01-default-permission-policy.md) |
| `OD-02` | Install dependency on demand; agent boleh mengubah manifest; tanpa symlink | [`adr/0002`](./adr/0002-od-02-dependency-strategy.md) |
| `OD-03` | SQLite (Drizzle + better-sqlite3) | [`adr/0003`](./adr/0003-od-03-state-storage.md) |
| `OD-04` | Restart selalu `blocked`; tanpa resume otomatis di v1 | [`adr/0004`](./adr/0004-od-04-restart-behavior.md) |
| `OD-05` | WIP global 3, project default 3, plus batas per agent | [`adr/0005`](./adr/0005-od-05-wip-limits.md) |
| `OD-06` | Agent bisa di-override per card | [`adr/0006`](./adr/0006-od-06-agent-selection.md) |
| `OD-07` | Hanya `resolve-conflict` yang dibatasi 1 percobaan otomatis | [`adr/0007`](./adr/0007-od-07-retry-limits.md) |
| `OD-08` | `ask` tanpa user → card `blocked`, lepas slot WIP | [`adr/0008`](./adr/0008-od-08-ask-timeout.md) |

## 7. Peta fase → modul

| Fase | Modul yang dibangun |
|---|---|
| 0 — Spike ACP | `scripts/spike/` (tanpa modul aplikasi) |
| 1 — Fondasi | `persistence`, `events`, `projects`, `cards`, `board`, `scheduler` |
| 2 — Walking skeleton | `git`, `workspace`, `agents`, `acp`, `completion`, `permissions` (baseline), `orchestrator` |
| 3 — Review & merge | `review` |
| 4 — Paralel & konflik | `scheduler` (penuh), `conflict` |
| 5 — Multi-agent & multi-project | `agents` (capability/health), `projects` (multi) |
| 6 — Hardening | `permissions` (penuh), `persistence` (recovery), `completion` (kepatuhan) |

## 8. Batasan dan risiko

Risiko produk yang diterima sadar tercantum di [`overview.md`](./overview.md#risiko-yang-harus-diterima-secara-sadar) dan risk register di [`roadmap.md`](./roadmap.md#risk-register). Yang relevan secara arsitektur:

- **Penegakan permission ada di sisi agent-o**, bukan agent (`NFR-16`) — konsekuensi peran sebagai penyedia `fs/*` dan `terminal/*`. Klasifikasi command tidak boleh hanya pencocokan string; harus parse struktur dan konservatif.
- **Auto-resolve konflik** melubangi janji "review = aku lihat semua yang berubah"; dibatasi satu percobaan, commit ditandai, dan selalu lewat re-freeze + review.
- **Tanpa batas waktu/konsumsi** (stop manual saja) — board bukan sistem yang bisa ditinggal.
- **Akses filesystem penuh** — satu policy salah bisa membuat agent menulis di luar project; diredam `PERM-08` (deny keluar worktree secara mutlak).
