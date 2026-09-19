# Persyaratan Non-Fungsional

| | |
|---|---|
| **ID Prefix** | `NFR` |
| **Status** | Terkunci |
| **Bergantung pada** | semua fitur |

## Ringkasan

Persyaratan yang berlaku lintas fitur. Angka di dokumen ini adalah **target awal**, bukan hasil pengukuran — nilai pastinya ditentukan saat spike dan disesuaikan setelah ada data nyata.

## Kebutuhan

### Kinerja dan responsivitas

- `NFR-01` — Update streaming muncul di UI dalam < 100 ms setelah diterima dari agent.
- `NFR-02` — Membuka board dengan 200 card dan 20 project tetap terasa responsif (interaksi < 100 ms).
- `NFR-03` — Membuka tab review dengan diff sedang (≤ 5.000 baris) selesai dalam < 1 detik.
- `NFR-04` — Perpindahan card tidak menunggu operasi git selesai secara blocking; pembuatan worktree berjalan dengan progres yang terlihat.

### Konkurensi dan resource

- `NFR-05` — Satu card hanya boleh punya satu proses agent aktif pada satu waktu.
- `NFR-06` — Jumlah proses agent aktif tidak boleh melampaui batas yang ditentukan user tanpa persetujuan eksplisit.
- `NFR-07` — Operasi yang menyentuh branch utama (merge) diserialkan; tidak boleh ada merge bersamaan.
- `NFR-08` — Setiap proses agent dimatikan ketika card-nya tidak berada di `in_progress` — tidak ada proses menganggur yang ditahan.

### Auditabilitas

- `NFR-09` — Setiap operasi yang menyentuh filesystem atau terminal tercatat minimal: waktu, kategori, target, keputusan policy, dan policy yang berlaku.
- `NFR-10` — Setiap perpindahan state card tercatat dengan pelaku (`user` atau `system`) dan alasan.
- `NFR-11` — Riwayat event bersifat append-only.
- `NFR-12` — Setiap perubahan yang berasal dari penyelesaian konflik dapat dibedakan dari perubahan task asli.

### Keamanan

- `NFR-13` — Setiap path diselesaikan menjadi absolute path dan diverifikasi berada di dalam worktree sebelum diklasifikasi.
- `NFR-14` — Operasi keluar worktree ditolak secara default, tanpa memandang setting lain.
- `NFR-15` — Operasi git remote ditolak secara default.
- `NFR-16` — Penegakan permission terjadi di sisi agent-o, tidak bergantung pada kepatuhan agent.
- `NFR-17` — Hanya satu instance aplikasi yang boleh mengakses satu database.

### Keandalan

- `NFR-18` — Aplikasi harus bisa dinyalakan ulang setelah crash tanpa intervensi manual dan tanpa kehilangan metadata board.
- `NFR-19` — Cleanup worktree harus idempoten.
- `NFR-20` — Tidak ada mode kegagalan yang membuat card "tampak sedang dikerjakan" padahal tidak ada proses yang berjalan.
- `NFR-21` — Aplikasi tidak boleh diam-diam menelan error; setiap kegagalan harus muncul di UI atau di log yang bisa diakses.

### Kompatibilitas

- `NFR-22` — Tidak ada asumsi perilaku yang bergantung pada satu harness agent tertentu; semua fitur opsional harus dideteksi lewat handshake.
- `NFR-23` — Nama method dan field ACP diverifikasi terhadap versi protokol yang di-advertise agent, bukan di-hardcode.
- `NFR-24` — Output non-protokol pada stdout tidak boleh membuat sesi gagal; parser harus toleran dan meninggalkan jejak di log.

### Pemeliharaan

- `NFR-25` — Setiap kebutuhan bernomor punya test yang merujuk nomornya.
- `NFR-26` — Setiap keputusan terbuka (`OD-*`) harus terjawab dan dihapus dari daftar sebelum fitur terkait dianggap selesai.
- `NFR-27` — Perubahan pada skema database harus lewat migrasi yang bisa dijalankan otomatis saat start.

## Catatan tentang target yang belum bisa diukur

Tiga hal berikut sengaja tidak diberi angka karena bergantung pada keputusan yang belum diambil:

| Hal | Bergantung pada |
|---|---|
| Batas waktu handshake, dead air, respons prompt, grace period | Terukur di spike ACP (ADR 0000): handshake 30 s, respons prompt 60 s, dead air 2 menit, grace period 5 s |
| Waktu pembuatan worktree yang dapat diterima | `OD-02` (terutama kalau dependency harus di-install ulang) |
| Batas WIP yang wajar | Kapasitas mesin + `OD-05` |

## Keputusan terbuka

- Platform target: Linux, macOS, Windows, atau subset? Ini mempengaruhi banyak hal — pemrosesan sinyal proses, path, file lock, dan pemisahan worktree. Belum diputuskan.
- Apakah aplikasi punya auto-update? Belum diputuskan.
- Apakah perlu telemetri? Untuk versi awal: tidak.

## Rujukan

- Semua dokumen fitur di [`./`](./)
- Urutan pengerjaan: [`../roadmap.md`](../roadmap.md)
