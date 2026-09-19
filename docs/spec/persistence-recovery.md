# Persistensi & Pemulihan

| | |
|---|---|
| **ID Prefix** | `PERSIST` |
| **Status** | Terkunci |
| **Bergantung pada** | semua fitur yang punya state |

## Ringkasan

Proses agent adalah subprocess dari agent-o. Kalau agent-o berhenti, seluruh proses agent ikut mati. Pemulihan karena itu didesain dengan asumsi bahwa **pekerjaan yang sedang berjalan pasti hilang**, dan yang harus diselamatkan adalah state board dan hasil kerja parsial di worktree.

## Kebutuhan

- `PERSIST-01` — Seluruh metadata board (project, card, run, event, worktree, agent, policy) tersimpan di penyimpanan persisten.
- `PERSIST-02` — Isi file tidak pernah disimpan di database; yang tersimpan hanya metadata, SHA, dan log event.
- `PERSIST-03` — Riwayat event bersifat append-only; event tidak boleh diubah atau dihapus saat card berpindah state.
- `PERSIST-04` — Output mentah stdout dan stderr setiap run disimpan sebagai file log per run, dengan rotasi.
- `PERSIST-05` — Saat aplikasi start, seluruh run yang masih berstatus berjalan ditandai `interrupted`.
- `PERSIST-06` — Card dari run yang terinterupsi dipindahkan ke `blocked` dengan alasan yang terlihat user.
- `PERSIST-07` — Worktree dari run yang terinterupsi **dipertahankan**, sehingga hasil kerja parsial tidak hilang.
- `PERSIST-08` — Resume otomatis tidak dilakukan pada versi awal; user memutuskan lanjut atau buang.
- `PERSIST-09` — Hanya satu instance aplikasi yang boleh berjalan terhadap satu database, ditegakkan dengan file lock.
- `PERSIST-10` — Worktree yatim (card sudah tidak ada) disapu saat aplikasi start.

## Skema

Satu database berisi tabel berikut, mengikuti model di [`card.md`](./card.md) dan [`project.md`](./project.md):

```
project               card                  card_event
─────────────────     ─────────────────     ─────────────────
id                    id                    id
name                  project_id            card_id
root_path             title                 run_id
default_branch        instruction           type
default_agent_id      status                payload (JSON)
wip_limit             position              created_at
permission_policy_id  agent_id
created_at            created_at
                      updated_at            message
                                            ─────────────────
run                   worktree              id
─────────────────     ─────────────────     run_id
id                    id                    role
card_id               card_id               content
attempt_no            path                  created_at
kind                  branch
agent_id              base_sha              agent_registration
session_id            head_sha              ─────────────────
worktree_id           created_at            id
status                state                 name
stop_reason                                command / args / env
started_at            permission_policy     max_concurrency
ended_at              ─────────────────     capabilities (JSON)
                      id                    auth_method
                      scope                 health
                      rules (JSON)          enabled
                      default_decision      last_checked_at
```

## Alur pemulihan saat start

```
app start
   │
   ├─ ambil file lock ─── gagal? ──▶ instance lain berjalan, tolak start
   │
   ├─ migrasi skema bila perlu
   │
   ├─ tandai semua run berstatus "running" sebagai "interrupted"
   │
   ├─ pindahkan card terkait ke `blocked`
   │     alasan: "aplikasi ditutup saat run berjalan"
   │
   ├─ pertahankan worktree
   │
   ├─ sapu worktree yatim (card tidak ada / card di `done`)
   │
   └─ scheduler direkonstruksi dari state database
```

Langkah "pindahkan ke `blocked`" dipilih karena aman. Konsekuensinya harus diterima: kalau kamu menjalankan 5 card paralel lalu aplikasi restart, kelima card itu menunggu keputusanmu. `OD-04` menentukan apakah ini bisa diterima atau perlu mode resume otomatis untuk agent yang mendukung `loadSession`.

## Log mentah dan rotasi

Log mentah adalah satu-satunya petunjuk saat agent crash, karena crash biasanya tidak menghasilkan `stopReason` maupun pesan.

| Aturan | Nilai usulan |
|---|---|
| Lokasi | `<app_data>/logs/<project-id>/<card-id>/<run-id>.log` |
| Isi | stdout dan stderr mentah, tidak difilter, dengan timestamp dan penanda stream |
| Rotasi | Ukuran maksimum per run; dipotong dari awal kalau melebihi |
| Retensi | Dihapus saat card dan worktree-nya dibersihkan |
| Akses | Bisa dibuka dari thread card saat run berstatus `interrupted` atau `failed` |

## Backup dan integritas

- Database adalah satu file, sehingga mudah dicadangkan — tapi **backup database saja tidak cukup**: worktree berisi pekerjaan yang belum di-merge. Card `in_review` yang datanya dipulihkan tanpa worktree-nya akan tampak normal sampai kamu mencoba membuka diff-nya.
- Karena itu, validasi integritas saat start harus memeriksa: setiap card `in_progress`, `blocked`, dan `in_review` punya worktree yang benar-benar ada. Kalau tidak, card ditandai rusak dengan penjelasan.

## Kasus gagal

| Kasus | Penanganan |
|---|---|
| Database korup | Aplikasi menolak start, menunjuk file backup terakhir, tidak mencoba memperbaiki otomatis |
| Worktree hilang tapi datanya ada | Card ditandai rusak; tidak ada auto-recreate, karena hasil kerja sudah tidak ada |
| Database ada tapi worktree tidak | Sama seperti di atas, untuk semua card terkait |
| File log hilang | Tidak fatal; hanya riwayat mentah yang hilang |
| Dua instance dijalankan | Instance kedua menolak start dengan pesan lock |
| Lock file tertinggal setelah crash | Lock diperiksa dengan PID; kalau prosesnya sudah tidak ada, lock diambil alih |
| Disk penuh saat menulis event | Operasi ditolak dengan jelas; aplikasi tidak boleh diam-diam kehilangan event |
| Aplikasi mati saat operasi git berjalan | Rebase atau merge yang setengah jalan terdeteksi saat start; status dilaporkan dan user memutuskan |

## Keputusan terbuka

- `OD-03` — teknologi penyimpanan. Rekomendasi: SQLite, karena single-file, transaksional, dan tanpa server.
- `OD-04` — perilaku restart: selalu `blocked`, atau resume otomatis bila agent mendukung `loadSession`.
- Berapa lama event dan log disimpan sebelum dibersihkan?
- Apakah perlu menyimpan snapshot diff saat card di-reject? (Saat ini tidak — lihat [`review-and-merge.md`](./review-and-merge.md).)
- Apakah perlu mekanisme export/import seluruh board?

## Rujukan

- Model data: [`card.md`](./card.md), [`project.md`](./project.md)
- Efek ke scheduler: [`scheduler.md`](./scheduler.md)
- Efek ke worktree: [`workspace-isolation.md`](./workspace-isolation.md)
