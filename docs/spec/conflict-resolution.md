# Rebase & Penyelesaian Konflik

| | |
|---|---|
| **ID Prefix** | `CONFLICT` |
| **Status** | Terkunci — keputusan `CONFLICT-05` sudah final |
| **Bergantung pada** | [`workspace-isolation.md`](./workspace-isolation.md) |

## Ringkasan

Branch utama bergerak terus saat card lain di-approve. Setiap worktree `active` karena itu direbase agar tetap relevan. Kalau muncul konflik, **agent yang menyelesaikannya**, bukan user.

Keputusan ini punya konsekuensi yang harus diterima secara sadar: pada jalur ini, agent menulis kode yang **belum pernah kamu review**, di luar niat asli card. Dokumen ini mendefinisikan bagaimana risiko itu dibatasi dan dibuat terlihat.

## Kebutuhan

- `CONFLICT-01` — Setiap kali branch utama bergerak, seluruh worktree `active` direbase ke branch utama terbaru.
- `CONFLICT-02` — Worktree `frozen` (card di `in_review`) **tidak pernah** direbase.
- `CONFLICT-03` — Rebase yang bersih memperbarui `base_sha` card dan tidak memicu aksi lain.
- `CONFLICT-04` — Rebase yang berkonflik memicu run penyelesaian konflik otomatis.
- `CONFLICT-05` — Maksimal **satu** run penyelesaian konflik otomatis per peristiwa rebase. Percobaan berikutnya selalu melibatkan manusia.
- `CONFLICT-06` — Run penyelesaian konflik diberi konteks bahwa ini konflik hasil rebase, bukan task asli, agar agent tidak mengerjakan ulang pekerjaannya atau mengubah niat card.
- `CONFLICT-07` — Commit hasil penyelesaian konflik diberi penanda khusus agar bisa dibedakan saat review.
- `CONFLICT-08` — Kegagalan penyelesaian konflik memindahkan card ke `blocked` dengan status `conflict_unresolved`, disertai diff konflik untuk dilihat user.
- `CONFLICT-09` — Setiap peristiwa konflik dan penyelesaiannya dicatat sebagai `CardEvent`.

## Alur

1. Sebuah card di-approve dan di-merge ke branch utama.
2. Orchestrator menghitung worktree `active` mana yang `base_sha`-nya sudah tertinggal.
3. Untuk setiap worktree tersebut, jalankan rebase.
4. **Rebase bersih** → perbarui `base_sha`, catat event, selesai.
5. **Rebase konflik** → jalankan `CONFLICT-04`:

```
kumpulkan konteks
  ├─ daftar file konflik
  ├─ output status rebase
  └─ cuplikan bagian yang berkonflik
        │
        ▼
spawn run kind = resolve-conflict pada agent yang sama
  ├─ briefing menyatakan: ini konflik rebase, jangan kerjakan ulang task
  ├─ brief menyebut card lain yang baru di-merge
  └─ instruksi: "selesaikan konflik, pertahankan niat kedua perubahan"
        │
        ▼
  sukses & gate lolos ──▶ base_sha diperbarui, commit ditandai, catat event
        │
        ▼
  gagal / menyerah ─────▶ card ke `blocked` (conflict_unresolved)
```

6. Setelah run penyelesaian konflik selesai, card kembali ke `in_progress` dan melanjutkan pekerjaannya. Card **belum** pindah ke `in_review` kecuali agent task awal melaporkan selesai.

## Kapan agent tidak boleh menyentuh konflik

Worktree `frozen` dikecualikan sepenuhnya (`CONFLICT-02`). Kalau review sedang berjalan, diff yang kamu baca tidak boleh berubah. Konflik untuk card tersebut baru diselesaikan setelah kamu approve atau reject:

- **Approve lalu merge berkonflik** → card kembali ke `in_progress` untuk run `resolve-conflict`, lalu **kembali ke `in_review` dengan freeze yang baru** dan harus direview lagi.
- **Reject** → branch dihapus; konflik tidak relevan.

Ini berarti kode hasil resolusi **tidak pernah masuk ke branch utama tanpa kamu review**. Ini satu-satunya jalur yang menjaga janji "review = aku lihat semua yang berubah".

## Membatasi kerusakan pada jalur auto-resolve

| Batasan | Alasan |
|---|---|
| Maksimal satu percobaan otomatis (`CONFLICT-05`) | Loop penyelesaian konflik bisa berjalan tanpa batas dan menghabiskan kuota |
| Commit ditandai (`CONFLICT-07`) | Supaya terlihat di riwayat dan di diff saat review |
| Konteks eksplisit (`CONFLICT-06`) | Agent yang salah paham akan mengerjakan ulang task, bukan menyelesaikan konflik |
| Event audit (`CONFLICT-09`) | Perubahan di luar task asli harus bisa ditelusuri |
| Card tetap berstatus `in_progress` | Perubahan hasil resolusi masih akan melewati review sebelum merge |

## Kasus gagal

| Kasus | Penanganan |
|---|---|
| Agent menyelesaikan konflik dengan membuang perubahan card lain | Tidak terdeteksi otomatis. Ini risiko yang diterima; mitigasinya adalah review. Perlu ditandai jelas di UI bahwa commit resolusi berasal dari agent. |
| Agent menghasilkan konflik baru | Dihitung sebagai percobaan yang gagal → `blocked` |
| Rebase dipicu berkali-kali berturut-turut karena banyak card di-approve | Rebase digabung dalam satu batch per siklus, bukan satu per satu |
| Rebase sementara agent sedang bekerja | Dijadwalkan setelah turn aktif selesai, bukan di tengah turn. Menghentikan proses di tengah turn akan membuat state agent kacau. |
| Rebase gagal karena worktree terkunci | Coba ulang setelah grace period; kalau tetap gagal, card ke `blocked` |
| Konflik pada file binary | Tidak bisa diselesaikan oleh agent; langsung ke `blocked` untuk keputusan user |
| Konflik pada lockfile dependency | Perlu aturan khusus: minta agent regenerasi lockfile sesuai `OD-02`, jangan merge manual |

## Keputusan terbuka

- `OD-07` (sebagian terjawab) — batas satu percobaan sudah dikunci untuk konflik. Apakah run jenis lain juga perlu batas? Belum diputuskan.
- Bagaimana UI menandai secara visual bahwa sebuah commit berasal dari penyelesaian konflik, tanpa harus membuka riwayat git?
- Kalau agent `resolve-conflict` adalah agent yang berbeda dari agent task awal, apakah boleh? Usulan: tidak, gunakan agent yang sama agar capability-nya konsisten.
- Konflik pada lockfile: siapa yang menjalankan install ulang, dan di mana?

## Rujukan

- State dan transisi: [`board-lifecycle.md`](./board-lifecycle.md)
- Freeze: [`review-and-merge.md`](./review-and-merge.md)
- Strategi dependency: [`workspace-isolation.md`](./workspace-isolation.md)
