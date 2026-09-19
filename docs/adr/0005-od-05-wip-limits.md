# ADR 0005 — WIP limit (`OD-05`)

**Status:** Diterima

## Konteks

Setiap agent yang berjalan adalah satu proses OS dengan konsumsi memori dan kuota provider sendiri. Batas jumlah card berjalan bersamaan bukan preferensi estetika — board tanpa batas akan membeku dan membakar kuota. Freeze + auto-rebase juga saling mengunci: makin banyak card menumpuk di `in_review`, makin basi branch lain.

## Keputusan

Tiga tingkat batas, dievaluasi semuanya sebelum card dijalankan (`SCHED-01`, `SCHED-06`):

| Tingkat | Nilai awal | Sumber |
|---|---|---|
| Global | `3` | `settings` |
| Project | `3` (mengikuti global, bisa diubah per project) | `project.wip_limit` |
| Agent | dari registrasi agent | `agent_registration.max_concurrency` |

- Antrean bersifat **FIFO** berdasarkan waktu card masuk `in_progress` (`SCHED-02`).
- **Prioritas `resolve-conflict`** diaktifkan: run `resolve-conflict` didahulukan dari card baru, untuk mencegah board mengunci diri (edge case 22).
- Card `blocked` melepas slot (`BOARD-06`, `SCHED-03`); mengambil slot lagi saat dilanjutkan (`SCHED-04`).
- Scheduler **in-memory**, direkonstruksi dari database saat start (`SCHED-08`).

## Konsekuensi

- Tiga card paralel adalah default; cukup untuk membuktikan isolasi tanpa meledakkan memori/kuota.
- Prioritaskan `resolve-conflict` berarti card baru bisa tertunda demi membuka kunci board — trade-off yang disengaja.
- Mengubah WIP limit saat ada card berjalan tidak membatalkan slot terpakai; batas baru berlaku untuk pengambilan slot berikutnya (edge case 29).
- Nilai ini adalah target awal, dapat disesuaikan setelah ada data nyata (lihat [`../spec/non-functional.md`](../spec/non-functional.md)).

## Kebutuhan terkait

`SCHED-01`–`SCHED-08`, `BOARD-06`, `WS-09`, edge case 2, 22, 29.
