# State Machine Board

| | |
|---|---|
| **ID Prefix** | `BOARD` |
| **Status** | Terkunci |
| **Bergantung pada** | [`scheduler.md`](./scheduler.md) untuk perolehan slot |

## Ringkasan

Kolom board adalah state eksekusi, bukan label administratif. Berpindah kolom berarti sistem menjalankan aksi nyata: membuat worktree, menjalankan proses agent, membekukan branch, atau melakukan merge.

## State

| State | Arti | Proses agent? | Worktree? | Slot WIP? |
|---|---|---|---|---|
| `backlog` | Belum dijadwalkan | Tidak | Tidak | Tidak |
| `in_progress` | Run sedang berjalan | Ya | Ya, `active` | Ya |
| `blocked` | Menunggu input manusia atau gagal lanjut | Tidak | Ya, `active` (dipertahankan) | Tidak |
| `in_review` | Diff siap dibaca | Tidak | Ya, `frozen` | Tidak |
| `done` | Sudah di-merge | Tidak | Sudah dihapus | Tidak |

## Kebutuhan

- `BOARD-01` — Setiap transisi divalidasi terhadap guard-nya; transisi yang tidak memenuhi guard ditolak disertai alasan yang terlihat oleh user.
- `BOARD-02` — Setiap transisi dicatat sebagai `CardEvent` berjenis `moved` dengan state asal, tujuan, pelaku (`user` atau `system`), dan alasan.
- `BOARD-03` — Card hanya boleh punya satu proses agent aktif pada satu waktu.
- `BOARD-04` — Perpindahan manual oleh user hanya diizinkan pada jalur yang terdaftar di tabel transisi. Board tidak mengizinkan drag bebas antar kolom.
- `BOARD-05` — Card `in_review` tidak boleh direbase maupun menerima commit baru.
- `BOARD-06` — Card `blocked` melepas slot WIP-nya, tetapi worktree-nya dipertahankan.

## Tabel transisi

| Dari | Ke | Trigger | Guard | Aksi sistem |
|---|---|---|---|---|
| `backlog` | `in_progress` | Drag user | `instruction` tidak kosong; agent ditentukan (card atau default project); slot WIP tersedia; working tree project bersih | Buat worktree + branch; spawn agent; buka sesi ACP; kirim briefing dan instruksi card |
| `in_progress` | `in_review` | Agent melaporkan `done` | Branch punya minimal satu commit di atas base | Rekam `base_sha` + `head_sha`; set worktree `frozen`; matikan proses agent; lepas slot |
| `in_progress` | `blocked` | Agent mengajukan pertanyaan | — | Matikan proses agent; simpan `session_id`; lepas slot |
| `in_progress` | `blocked` | Run gagal atau berhenti tanpa hasil | — | Sama seperti di atas, alasan dicatat dari `stopReason` |
| `in_progress` | `blocked` | User menekan Stop | — | Kirim `session/cancel`; tunggu grace period; matikan proses; lepas slot |
| `blocked` | `in_progress` | User menjawab atau menekan Lanjut | Slot WIP tersedia | Ambil slot; resume lewat `session/load` bila didukung, jika tidak mulai run baru dengan ringkasan konteks |
| `in_review` | `done` | User Approve | Merge berhasil; branch utama bersih | Merge `--no-ff`; catat `merge_sha`; hapus worktree dan branch |
| `in_review` | `in_progress` | Merge gagal karena konflik saat approve | — | Buat run `resolve-conflict`; setelah selesai card **kembali ke `in_review` dengan freeze baru** |
| `in_review` | `backlog` | User Reject | Feedback wajib diisi | Simpan feedback sebagai pesan user di thread; hapus worktree dan branch |
| `blocked` | `backlog` | User membatalkan | — | Hapus worktree dan branch |
| `any` kecuali `done` | `deleted` | User menghapus card | Konfirmasi eksplisit | Cancel run aktif; hapus worktree dan branch |

## Diagram

```
                    ┌──────────── reject ────────────┐
                    ▼                                │
                Backlog ──drag──▶ In Progress ──done──▶ In Review ──approve──▶ Done
                                      │                    │
                        pertanyaan /  │                    │ konflik saat merge
                        gagal / stop  │                    ▼
                                      ▼              (resolve-conflict)
                                   Blocked ◀────────────────┘
                                      │
                              user menjawab
                                      ▼
                                 In Progress
```

## Kenapa `blocked` melepas slot WIP

Kalau card yang menunggu jawaban tetap memegang slot, beberapa card yang macet akan memblokir seluruh board — dan itu adalah kegagalan mode yang paling mungkin terjadi pada pemakaian nyata.

Konsekuensi yang harus diterima: saat kamu menjawab, card perlu **mengambil slot lagi** dan bisa jadi harus mengantre. Jawabanmu tidak selalu langsung diproses, dan UI harus menampilkan posisi antrean itu dengan jujur alih-alih berpura-pura card langsung jalan.

## Guard detail

| Guard | Cara pemeriksaan |
|---|---|
| `instruction` tidak kosong | Panjang setelah trim > 0 |
| Agent ditentukan | `card.agent_id` ada, atau `project.default_agent_id` ada, dan agent tersebut berstatus `enabled` serta tidak `needs_auth` |
| Slot WIP tersedia | Lihat [`scheduler.md`](./scheduler.md) |
| Working tree project bersih | `git status --porcelain` kosong pada branch utama |
| Branch punya commit di atas base | `git rev-list --count <base_sha>..<branch>` > 0 |
| Branch utama bersih saat merge | `git status --porcelain` kosong |

## Kasus gagal

| Kasus | Penanganan |
|---|---|
| Guard gagal saat drag | Transisi ditolak, card **kembali ke posisi semula**, alasannya ditampilkan |
| Slot WIP penuh saat drag | Card masuk antrean scheduler; UI menunjukkan posisi antrean |
| Working tree kotor saat drag | Transisi ditolak dengan daftar file yang belum di-commit |
| Branch tidak punya commit saat agent melapor selesai | Card ke `blocked` dengan catatan "agent melapor selesai tapi tidak ada perubahan" |
| User mencoba drag `backlog` → `in_review` | Ditolak: transisi tidak terdaftar |
| Proses agent mati tanpa `stopReason` | Run `interrupted`, card ke `blocked` |
| Aplikasi mati saat ada run aktif | Lihat [`persistence-recovery.md`](./persistence-recovery.md) |

## Keputusan terbuka

- Apakah user boleh menahan card di `blocked` secara manual (tanpa pertanyaan dari agent) sebagai penanda "sedang aku urus sendiri"? Belum diputuskan.
- Apakah boleh ada kolom tambahan yang bisa dikonfigurasi user? Untuk versi awal: tidak, kolomnya tetap.

## Rujukan

- Scheduler & WIP: [`scheduler.md`](./scheduler.md)
- Sinyal selesai: [`completion-signal.md`](./completion-signal.md)
- Review & merge: [`review-and-merge.md`](./review-and-merge.md)
