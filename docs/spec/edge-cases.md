# Edge Case Lintas Fitur

| | |
|---|---|
| **ID Prefix** | `EDGE` |
| **Status** | Terkunci |
| **Bergantung pada** | semua fitur |

## Ringkasan

Dokumen ini adalah daftar kasus yang **melintasi lebih dari satu fitur**, sehingga tidak jelas siapa pemiliknya. Kasus yang menjadi tanggung jawab satu fitur saja didokumentasikan di dokumen fitur tersebut dan tidak diulang di sini.

## Kebutuhan

- `EDGE-01` — Setiap kasus di bawah harus punya penanganan yang terdefinisi sebelum fitur terkait dianggap selesai.
- `EDGE-02` — Setiap penanganan harus menghasilkan pesan yang bisa dipahami user dan menunjuk tindakan berikutnya.
- `EDGE-03` — Tidak ada kasus yang boleh berakhir dengan card menggantung tanpa status yang jelas.

## Daftar kasus

| # | Kasus | Penanganan | Pemilik |
|---|---|---|---|
| 1 | Card digeser ke `in_progress` dengan instruksi kosong | Transisi ditolak, card tidak berpindah | [`board-lifecycle.md`](./board-lifecycle.md) |
| 2 | Card digeser saat WIP limit penuh | Masuk antrean FIFO, posisi terlihat | [`scheduler.md`](./scheduler.md) |
| 3 | Working tree project kotor saat card mau jalan | Transisi ditolak, daftar file ditampilkan | [`project.md`](./project.md) |
| 4 | Dua card mengubah file yang sama | Diizinkan; isolasi worktree menanganinya, konflik muncul di rebase/merge | [`workspace-isolation.md`](./workspace-isolation.md) |
| 5 | Agent menulis di luar worktree | Diblokir gate, percobaan dicatat sebagai event | [`permissions.md`](./permissions.md) |
| 6 | Agent mencoba `git push` | Diblokir default, dicatat sebagai event | [`permissions.md`](./permissions.md) |
| 7 | Agent crash mendadak | Run `interrupted`, card ke `blocked`, log mentah dilampirkan | [`acp-client.md`](./acp-client.md) |
| 8 | Agent berhenti tanpa laporan selesai | Fallback `stopReason` dipakai, badge "belum terverifikasi" | [`completion-signal.md`](./completion-signal.md) |
| 9 | Agent melapor selesai tapi tidak ada perubahan | Card ke `blocked` | [`completion-signal.md`](./completion-signal.md) |
| 10 | Agent berulang kali mengabaikan protokol pelaporan | Setelah 3 kali, card dan agent diberi badge ketidakpatuhan | [`completion-signal.md`](./completion-signal.md) |
| 11 | Kredensial agent kedaluwarsa | Agent `needs_auth`; card terkait tidak bisa dijalankan | [`agent-registry.md`](./agent-registry.md) |
| 12 | Agent tidak mendukung `session/load` | Card `blocked` dilanjutkan dengan run baru + ringkasan konteks | [`acp-client.md`](./acp-client.md) |
| 13 | User menekan Stop saat streaming | `session/cancel`, grace period, lalu matikan paksa | [`acp-client.md`](./acp-client.md) |
| 14 | User menghapus card yang sedang berjalan | Konfirmasi eksplisit → cancel → cleanup worktree | [`card.md`](./card.md) |
| 15 | Approve saat branch utama kotor | Ditolak dengan daftar file | [`review-and-merge.md`](./review-and-merge.md) |
| 16 | Branch utama bergerak antara freeze dan approve | Bila menyentuh file yang sama → resolve; bila tidak → merge biasa | [`review-and-merge.md`](./review-and-merge.md) |
| 17 | Worktree diubah di luar aplikasi | Terdeteksi, minta konfirmasi sebelum `head_sha` diperbarui | [`review-and-merge.md`](./review-and-merge.md) |
| 18 | Aplikasi mati dengan run aktif | Run `interrupted`, card `blocked`, worktree dipertahankan | [`persistence-recovery.md`](./persistence-recovery.md) |
| 19 | Dua instance aplikasi dijalankan | Instance kedua menolak start karena lock | [`persistence-recovery.md`](./persistence-recovery.md) |
| 20 | Database ada tapi worktree hilang | Card ditandai rusak, tidak ada auto-recreate | [`persistence-recovery.md`](./persistence-recovery.md) |
| 21 | Disk penuh saat membuat worktree | Worktree parsial dibersihkan, card `blocked` | [`workspace-isolation.md`](./workspace-isolation.md) |
| 22 | Hanya tersisa satu slot WIP dan satu card `resolve-conflict` mengantre | Perlu keputusan prioritas — lihat [`scheduler.md`](./scheduler.md) | `OD-05` |
| 23 | Konflik pada file binary | Tidak diselesaikan agent, langsung ke `blocked` | [`conflict-resolution.md`](./conflict-resolution.md) |
| 24 | Konflik pada lockfile dependency | Aturan khusus regen lockfile, bergantung `OD-02` | `OD-02` |
| 25 | Repo memakai submodule | Perlu keputusan dukungan | [`workspace-isolation.md`](./workspace-isolation.md) |
| 26 | Project dipindahkan setelah ditambahkan | Project ditandai tidak tersedia, card berjalan ditahan | [`project.md`](./project.md) |
| 27 | Project dihapus saat ada card berjalan | Cancel semua, cleanup seluruh worktree, konfirmasi eksplisit | [`project.md`](./project.md) |
| 28 | Diff terlalu besar untuk dirender | Hanya daftar file yang ditampilkan | [`review-and-merge.md`](./review-and-merge.md) |
| 29 | WIP limit diubah saat ada card berjalan | Slot terpakai tidak dibatalkan, batas baru berlaku berikutnya | [`scheduler.md`](./scheduler.md) |
| 30 | Agent mengembalikan dua blok status, atau satu di tengah pesan | Hanya blok di akhir pesan terakhir yang dihitung | [`completion-signal.md`](./completion-signal.md) |

## Kasus yang belum punya jawaban

| # | Kasus | Kenapa belum bisa dijawab |
|---|---|---|
| A | Agent memodifikasi file yang sedang di-review card lain | Secara teknis tidak mungkin dalam pemodelan sekarang — tapi perlu diuji dengan dua card yang melewati siklus rebase berulang |
| B | Repo berukuran sangat besar, worktree memakan puluhan GB | Bergantung `OD-02` |
| C | User mengubah file di worktree card yang sedang jalan, di luar aplikasi | Belum ada kebijakan |
| D | Agent berjalan sangat lama tanpa commit sama sekali | Belum ada kebijakan; terkait keputusan tanpa batas waktu |
| E | Dua card memakai agent yang sama dengan `max_concurrency = 1` | Antrean per agent belum dirinci di [`scheduler.md`](./scheduler.md) |
| F | Branch utama di-force-push oleh user di luar aplikasi | Belum ada deteksi |
| G | Card yang di-reject lalu dijalankan ulang memakai agent berbeda | Belum ada kebijakan |

## Keputusan terbuka

- Prioritas `resolve-conflict` dibanding card baru (kasus 22) — ini yang paling mendesak karena bisa memblokir seluruh board.
- Kebijakan untuk kasus C dan D.
- Deteksi force-push pada branch utama (kasus F).

## Rujukan

Semua dokumen fitur di [`./`](./)
