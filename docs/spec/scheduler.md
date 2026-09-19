# Scheduler & WIP Limit

| | |
|---|---|
| **ID Prefix** | `SCHED` |
| **Status** | Terkunci |
| **Bergantung pada** | [`agent-registry.md`](./agent-registry.md) |

## Ringkasan

Scheduler memutuskan **kapan** sebuah card boleh mulai dikerjakan, dan memastikan jumlah agent yang berjalan bersamaan tidak melampaui batas yang ditentukan. Setiap agent yang berjalan adalah satu proses OS dengan konsumsi memori dan kuota provider sendiri, jadi batas ini bukan sekadar preferensi estetika.

## Kebutuhan

- `SCHED-01` — Ada batas jumlah card yang boleh berjalan bersamaan (WIP limit), berlaku pada level yang ditentukan di `OD-05`.
- `SCHED-02` — Card yang tidak mendapatkan slot masuk antrean FIFO dan posisinya terlihat di UI.
- `SCHED-03` — Slot dilepas ketika card meninggalkan `in_progress` ke state mana pun, termasuk `blocked`.
- `SCHED-04` — Slot diambil kembali saat card kembali ke `in_progress`; kalau penuh, card menunggu di antrean.
- `SCHED-05` — Scheduler tidak boleh memulai card untuk agent yang berstatus `disabled` atau `needs_auth`.
- `SCHED-06` — Agent boleh punya batas konkurensi sendiri yang lebih ketat daripada WIP limit project.
- `SCHED-07` — Antrean tidak boleh menyebabkan card berjalan diam-diam tanpa jejak; setiap perubahan status antrean tercatat sebagai event.
- `SCHED-08` — Scheduler bersifat in-memory dan direkonstruksi dari database saat aplikasi start.

## Model antrean

Dua tingkat batas, dievaluasi keduanya sebelum card dijalankan:

```
batas global  : jumlah total agent aktif di seluruh project
batas project : Project.wip_limit
batas agent   : AgentRegistration.max_concurrency
```

Card berjalan hanya jika **ketiganya** masih punya ruang. Yang pertama habis menentukan alasan card mengantre.

Antrean bersifat FIFO berdasarkan waktu card masuk `in_progress`, kecuali prioritas diaktifkan (lihat keputusan terbuka).

## Alur

1. User menggeser card ke `in_progress`.
2. Guard board dijalankan (lihat [`board-lifecycle.md`](./board-lifecycle.md)).
3. Scheduler mencoba mengambil slot:
   - **Berhasil** → buat worktree, spawn agent, status card tetap `in_progress` dengan `run.status = running`.
   - **Gagal** → card tetap `in_progress` tapi `run.status = queued`, ditampilkan dengan badge antrean dan posisinya.
4. Setiap kali ada slot dilepas, scheduler memeriksa antrean dari depan dan memulai card yang memenuhi batas.
5. Saat card mengantre terlalu lama, card tidak otomatis gagal — ia hanya menunggu. User bisa membatalkannya.

## Kasus gagal

| Kasus | Penanganan |
|---|---|
| Card mengantre tapi agent-nya menjadi `needs_auth` | Card dikeluarkan dari antrean, masuk `blocked`, user diberi tahu |
| Project dihapus saat ada card mengantre | Seluruh card project dibatalkan |
| Aplikasi restart dengan card mengantre | Status antrean dibaca dari database; card dengan run `queued` dikembalikan ke `blocked` dan user memutuskan (lihat `OD-04`) |
| WIP limit diubah saat ada card berjalan | Slot yang sudah dipakai tidak dibatalkan; batas baru berlaku untuk pengambilan slot berikutnya |
| Satu agent dipakai oleh banyak card | Dibatasi `max_concurrency` agent tersebut (lihat `AGENT-06`) |

## Keputusan terbuka

- `OD-05` — nilai default WIP limit dan cakupannya (global, per project, atau keduanya). Usulan awal: global 3, project mengikuti global kecuali diubah.
- Apakah antrean punya prioritas (mis. card `resolve-conflict` didahulukan karena bisa memblokir card lain)? Belum diputuskan, dan ini penting: kalau card `in_review` menahan rebase, antrean resolusi konflik yang lambat akan menumpuk.
- Apakah user bisa menaikkan card ke depan antrean secara manual?
- Bagaimana antrean berperilaku kalau batas agent dipakai bersama beberapa project? Scheduler per-agent atau per-project?

## Rujukan

- Guard transisi: [`board-lifecycle.md`](./board-lifecycle.md)
- Konkurensi agent: [`agent-registry.md`](./agent-registry.md)
- NFR concurrency: [`non-functional.md`](./non-functional.md)
