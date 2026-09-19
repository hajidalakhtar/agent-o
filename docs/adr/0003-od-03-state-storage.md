# ADR 0003 — Teknologi penyimpanan state (`OD-03`)

**Status:** Diterima (direvisi: driver berubah dari Drizzle + better-sqlite3 ke `node:sqlite`)

## Konteks

Seluruh metadata board (project, card, run, event, worktree, agent, policy) harus persisten dan **transaksional** — perpindahan state card dan pencatatan event harus konsisten. Isi file tidak pernah disimpan di database. Aplikasi berjalan lokal di mesin user, satu instance pada satu waktu.

Kendala environment yang ditemukan saat implementasi:

- **Tidak ada C toolchain** (`make`, `g++`, `gcc` tidak tersedia) sehingga `better-sqlite3` tidak bisa dikompilasi dari source.
- **glibc 2.31**, sedangkan prebuilt `better-sqlite3` v13 menuntut **GLIBC ≥ 2.33** → `ERR_DLOPEN_FAILED` saat `require`.
- Drizzle ORM (0.45) tidak punya dialect untuk `node:sqlite`, dan `sqlite-proxy` bersifat async/remote — tidak cocok untuk database lokal sinkron.

## Keputusan

- **SQLite** diakses lewat **`node:sqlite`** (`DatabaseSync`), modul bawaan Node (stabil di Node 22+; environment memakai Node 26).
- Tidak ada ORM. Akses data lewat wrapper tipis `Db` (`persistence/db.ts`) dengan metode `run`, `get`, `all`, `transaction`, dan prepared-statement cache.
- Skema didefinisikan sebagai **string SQL inline** di `persistence/migrations.ts`, diterapkan oleh runner di `persistence/migrate.ts`, terlacak di tabel `_migration`, idempoten (`NFR-27`).
- Satu file database di direktori data aplikasi (`app_data/agent-o.db`), mode WAL, `PRAGMA foreign_keys = ON`, `busy_timeout = 5000`.
- Single-writer ditegakkan dengan file lock ber-PID (`PERSIST-09`), bukan mengandalkan WAL saja.

## Konsekuensi

- **Nol native dependency**: tidak ada masalah glibc, tidak butuh toolchain, dan `npm install` berjalan di platform apa pun yang didukung Node.
- API sinkron menyederhanakan transaksi dan menghindari kebocoran `await` di jalur kritis.
- Kehilangan yang diterima: tidak ada query builder bertipe, tidak ada migrasi otomatis dari diff skema, dan tidak ada Drizzle Studio. Sebagai gantinya, repository bertipe (`repository.ts` per modul) memetakan baris → tipe domain secara eksplisit dan menjadi satu-satunya lapisan yang menyentuh SQL.
- `node:sqlite` masih berevolusi; API yang dipakai terbatas pada `exec`/`prepare`/`run`/`get`/`all`, sehingga perubahan kecil pada permukaan API mudah diikuti.
- Backup database saja tidak cukup; worktree berisi pekerjaan yang belum di-merge (lihat validasi integritas di [`../spec/persistence-recovery.md`](../spec/persistence-recovery.md)).
- Karena tidak ada ORM, perubahan skema memerlukan migrasi baru (bukan `push` otomatis) — selaras `NFR-27`.

## Kebutuhan terkait

`PERSIST-01`–`PERSIST-04`, `PERSIST-09`, `NFR-11`, `NFR-17`, `NFR-27`.
