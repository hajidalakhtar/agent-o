# agent-o

Kanban board lokal yang **kolomnya adalah state eksekusi agent**. Tulis card di Backlog, geser ke In Progress, dan sistem menjalankan harness ACP di dalam **git worktree terisolasi** per card. Saat agent selesai, card masuk In Review untuk kamu tinjau sebagai git diff, lalu approve atau reject.

Harness apa pun yang bicara **ACP (Agent Client Protocol)** bisa dipakai — Gemini CLI, OpenCode, Claude Code, Goose, atau harness lain.

## Fitur

- **Board = state machine.** Berpindah kolom memicu aksi nyata: buat worktree + branch, spawn agent, bekukan revisi, atau merge.
- **Isolasi penuh.** Satu card = satu worktree = satu branch, jadi banyak agent bisa jalan bersamaan tanpa saling menimpa.
- **Review berbasis diff beku.** Diff dihitung dari pasangan `base_sha..head_sha`, sehingga tidak berubah saat branch utama bergerak.
- **Scheduler WIP.** Batas konkurensi global, per project, dan per agent; antrean FIFO dengan prioritas untuk resolusi konflik.
- **Permission gate.** Setiap operasi file dan terminal yang diminta agent diklasifikasi dan dievaluasi policy; operasi keluar worktree dan git remote ditolak secara default.
- **Audit append-only.** Setiap perpindahan state, keputusan izin, dan update agent tercatat sebagai `CardEvent`.

## Stack

| | |
|---|---|
| Framework | SvelteKit 2 / Svelte 5 (runes), `@sveltejs/adapter-node` |
| Database | SQLite lewat `node:sqlite` (bawaan Node 22+) — tanpa native dependency |
| Protokol agent | `@agentclientprotocol/sdk` (ACP v1) |
| Git | `node:child_process` |
| Real-time | Server-Sent Events |
| Test | Vitest |

## Menjalankan

Butuh Node 22+ (dikembangkan di Node 26) dan `git` di PATH.

```bash
npm install
npm run dev
```

Build produksi:

```bash
npm run build
PORT=3021 HOST=0.0.0.0 ORIGIN=http://<alamat-akses>:3021 node build/index.js
```

`ORIGIN` wajib diset bila diakses lewat alamat/hostname non-lokal, supaya form action tidak ditolak proteksi CSRF SvelteKit.

Variabel lingkungan (lihat `.env.example`):

| Variabel | Fungsi |
|---|---|
| `AGENT_O_DATA_DIR` | Direktori data (default `~/.agent-o`) |
| `AGENT_O_DB_PATH` | Path database, menimpa data dir |
| `AGENT_O_GLOBAL_WIP` | Batas WIP global (default 3) |

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi |
| `npm test` | Menjalankan seluruh test |
| `npm run check` | Type-check Svelte + TypeScript |
| `npm run spike` | Spike ACP: menjalankan klien terhadap harness uji |

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [`docs/overview.md`](docs/overview.md) | Konsep produk, alur utama, risiko |
| [`docs/architecture.md`](docs/architecture.md) | Arsitektur modular, peta modul, skema database |
| [`docs/roadmap.md`](docs/roadmap.md) | Urutan pengerjaan per fase |
| [`docs/spec/`](docs/spec/README.md) | Spesifikasi per fitur dengan ID kebutuhan |
| [`docs/adr/`](docs/adr/README.md) | Architecture Decision Records + laporan spike |

## Status

Fase 0 (spike ACP), Fase 1 (fondasi), dan seluruh UI sudah dikerjakan. Fase 2 (worktree + eksekusi agent end-to-end) sedang berjalan — lihat [`docs/roadmap.md`](docs/roadmap.md).

## Lisensi

Belum ditentukan.
