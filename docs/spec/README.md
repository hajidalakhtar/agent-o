# agent-o — Spesifikasi per Fitur

Setiap fitur punya dokumen sendiri. Untuk konteks produk, lihat [`../overview.md`](../overview.md).

## Konvensi

- **ID kebutuhan** berbentuk `<PREFIX>-NN` (contoh: `WS-03`). ID ini dipakai sebagai rujukan dari [`../roadmap.md`](../roadmap.md), pesan commit, dan test.
- **ID keputusan terbuka** berbentuk `OD-NN` dan dikumpulkan di tabel di bawah. Selama sebuah `OD` belum dijawab, fitur yang bergantung padanya tidak boleh diimplementasikan sampai selesai.
- **Status** per fitur: `Draft`, `Terkunci` (keputusan sudah final, siap diimplementasikan), atau `Blocked` (menunggu `OD`).

## Daftar fitur

| Fitur | File | Prefix | Status | Bergantung pada |
|---|---|---|---|---|
| Index | `README.md` | — | — | — |
| Project & validasi folder | [`project.md`](./project.md) | `PROJECT` | Terkunci | — |
| Card & thread percakapan | [`card.md`](./card.md) | `CARD` | Terkunci | — |
| State machine board | [`board-lifecycle.md`](./board-lifecycle.md) | `BOARD` | Terkunci | — |
| Scheduler & WIP limit | [`scheduler.md`](./scheduler.md) | `SCHED` | Terkunci | — |
| Registry agent & capability | [`agent-registry.md`](./agent-registry.md) | `AGENT` | Terkunci | — |
| Klien ACP | [`acp-client.md`](./acp-client.md) | `ACP` | Terkunci | — |
| Isolasi workspace (worktree) | [`workspace-isolation.md`](./workspace-isolation.md) | `WS` | Terkunci | — |
| Rebase & penyelesaian konflik | [`conflict-resolution.md`](./conflict-resolution.md) | `CONFLICT` | Terkunci | [`workspace-isolation.md`](./workspace-isolation.md) |
| Sinyal selesai & fallback | [`completion-signal.md`](./completion-signal.md) | `DONE` | Terkunci | — |
| Review, freeze, approve & merge | [`review-and-merge.md`](./review-and-merge.md) | `REVIEW` | Terkunci | — |
| Permission & keamanan eksekusi | [`permissions.md`](./permissions.md) | `PERM` | Terkunci | — |
| Persistensi & pemulihan | [`persistence-recovery.md`](./persistence-recovery.md) | `PERSIST` | Terkunci | — |
| Edge case lintas fitur | [`edge-cases.md`](./edge-cases.md) | `EDGE` | Terkunci | — |
| Persyaratan non-fungsional | [`non-functional.md`](./non-functional.md) | `NFR` | Terkunci | — |

## Peta ketergantungan

```
project ──▶ workspace-isolation ──▶ conflict-resolution
   │                │                      │
   │                └──▶ completion-signal │
   │                                       ▼
   └──▶ scheduler ──▶ board-lifecycle ──▶ review-and-merge
              │              ▲
              │              │
   agent-registry ──▶ acp-client
              │
              └──▶ permissions
```

Urutan baca yang disarankan untuk yang baru bergabung: `project` → `workspace-isolation` → `acp-client` → `board-lifecycle` → `completion-signal` → `review-and-merge`.

## Keputusan terbuka

| ID | Pertanyaan | Memblokir | Status |
|---|---|---|---|
| `OD-01` | Default permission policy sebelum user menyentuh setting, dan perilaku `ask` saat tidak ada user yang menonton | `permissions` | Terjawab — [ADR 0001](../adr/0001-od-01-default-permission-policy.md), [ADR 0008](../adr/0008-od-08-ask-timeout.md) |
| `OD-02` | Strategi dependency per worktree (install ulang, symlink, package manager store, atau on-demand) dan apakah agent boleh mengubah manifest dependency | `workspace-isolation`, `completion-signal` | Terjawab — [ADR 0002](../adr/0002-od-02-dependency-strategy.md) |
| `OD-03` | Teknologi penyimpanan state (rekomendasi: SQLite) | `project`, `persistence-recovery` | Terjawab — [ADR 0003](../adr/0003-od-03-state-storage.md) |
| `OD-04` | Perilaku saat aplikasi restart: semua run jadi `blocked`, atau resume otomatis bila agent mendukung `loadSession` | `persistence-recovery` | Terjawab — [ADR 0004](../adr/0004-od-04-restart-behavior.md) |
| `OD-05` | Nilai default WIP limit dan cakupannya (global, per project, atau keduanya) | `scheduler` | Terjawab — [ADR 0005](../adr/0005-od-05-wip-limits.md) |
| `OD-06` | Pemilihan agent: hanya default per project, atau bisa di-override per card | `agent-registry` | Terjawab — [ADR 0006](../adr/0006-od-06-agent-selection.md) |
| `OD-07` | Batas percobaan otomatis: hanya konflik yang dibatasi satu percobaan, atau semua run punya batas? | `conflict-resolution` | Terjawab — [ADR 0007](../adr/0007-od-07-retry-limits.md) |
| `OD-08` | Perilaku `ask` yang menggantung: apakah card ke `blocked` dan melepas WIP slot, atau request di-deny setelah waktu tunggu | `permissions` | Terjawab — [ADR 0008](../adr/0008-od-08-ask-timeout.md) |
