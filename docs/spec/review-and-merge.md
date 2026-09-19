# Review, Freeze, Approve & Merge

| | |
|---|---|
| **ID Prefix** | `REVIEW` |
| **Status** | Terkunci |
| **Bergantung pada** | [`workspace-isolation.md`](./workspace-isolation.md), [`conflict-resolution.md`](./conflict-resolution.md) |

## Ringkasan

`in_review` adalah inti nilai produk: tempat kamu melihat apa yang sebenarnya berubah, dan memutuskan menerima atau menolaknya. Supaya layak dipercaya, **apa yang kamu baca tidak boleh berubah di tengah jalan**.

## Kebutuhan

- `REVIEW-01` — Saat card masuk `in_review`, sistem merekam `base_sha` dan `head_sha` saat itu dan membekukan worktree.
- `REVIEW-02` — Diff review dihitung dari pasangan SHA yang dibekukan, bukan dari nama branch.
- `REVIEW-03` — Worktree `frozen` tidak boleh direbase atau menerima commit baru.
- `REVIEW-04` — User bisa Approve atau Reject; Reject mewajibkan alasan.
- `REVIEW-05` — Approve melakukan merge `--no-ff` ke branch utama dan hanya berhasil bila branch utama bersih.
- `REVIEW-06` — Merge yang berkonflik mengembalikan card ke `in_progress` untuk penyelesaian konflik, lalu **membekukan ulang** dan meminta review lagi.
- `REVIEW-07` — Perubahan yang berasal dari penyelesaian konflik harus bisa dibedakan saat review.
- `REVIEW-08` — Riwayat seluruh run pada card ditampilkan, bukan hanya run terakhir.
- `REVIEW-09` — Diff yang melebihi ambang ukuran tidak dirender otomatis.

## Kenapa diff dihitung dari SHA, bukan branch

Kedengarannya sepele, tapi ini bug yang mudah lolos. Kalau diff dihitung dengan `git diff main...card`, git memakai **merge-base** antara keduanya sebagai titik awal. Merge-base itu bergeser setiap kali branch utama bergerak — walaupun branch card sama sekali tidak berubah. Artinya, gerakan kecil di branch utama bisa mengubah diff yang sedang kamu baca.

Dengan mengunci dua SHA:

```
git diff <base_sha>..<head_sha>
```

yang kamu review adalah **revisi beku**. Branch utama boleh bergerak, card lain boleh di-merge, isi review-mu tetap sama.

## Freeze

| Aspek | Perilaku |
|---|---|
| Rebase | Dilarang |
| Commit baru | Dilarang |
| Pembatalan | Diperbolehkan (card keluar dari `in_review`) |
| Worktree removal | Hanya setelah approve atau reject |
| Perubahan di luar aplikasi | Terdeteksi saat akses berikutnya; card diperingatkan dan `head_sha` diperbarui hanya dengan konfirmasi user |

## Isi tab review

| Bagian | Isi |
|---|---|
| Ringkasan | Jumlah file berubah, baris ditambah/dihapus, `base_sha` → `head_sha` |
| Diff per file | Unified diff, dengan penanda khusus pada file hasil penyelesaian konflik |
| Riwayat run | Daftar run: task, resolve-conflict, answer, beserta statusnya |
| Audit aksi | Aksi yang diblokir permission gate selama run berlangsung |
| Keputusan | Tombol Approve dan Reject |

## Alur approve

1. Pastikan branch utama bersih (`git status --porcelain` kosong). Kalau kotor → tolak dengan pesan jelas.
2. Jalankan `git merge --no-ff <branch>` pada worktree branch utama.
3. **Berhasil** → catat `merge_sha`, card ke `done`, worktree dan branch dibersihkan.
4. **Konflik** → card ke `in_progress`, buat run `resolve-conflict` (lihat [`conflict-resolution.md`](./conflict-resolution.md)), lalu **freeze baru** dan kembali ke `in_review`.

Poin penting pada langkah 4: kode hasil resolusi tidak pernah masuk ke branch utama tanpa kamu review. Ini satu-satunya jalur yang menjaga janji produk.

## Alur reject

1. Alasan reject wajib diisi.
2. Alasan disimpan sebagai pesan `user` di thread card (jadi terlihat di percakapan, bukan tersembunyi di metadata).
3. Worktree dan branch dihapus.
4. Card kembali ke `backlog`.
5. Diff yang ditolak **tidak** disimpan sebagai snapshot — keputusan sadar, karena menyimpan diff akan menggandakan sistem riwayat. Kalau kamu ingin menyimpan hasilnya, lakukan sebelum menekan Reject.

## Batas ukuran diff

| Kondisi | Perilaku |
|---|---|
| > 5.000 baris atau > 200 file | Ringkasan dan daftar file saja; file dibuka satu per satu sesuai permintaan |
| File tunggal > 2.000 baris perubahan | Diff file dilipat, harus dibuka eksplisit |
| File binary | Ditampilkan sebagai metadata (nama, ukuran, berubah/tidak), tanpa diff |

Ambang ini mencegah UI mati lepas saat agent menghasilkan perubahan besar.

## Kasus gagal

| Kasus | Penanganan |
|---|---|
| Branch utama kotor saat approve | Ditolak dengan daftar file |
| Branch utama bergerak antara freeze dan approve | Deteksi pergeseran; kalau menyentuh file yang sama, tawarkan resolve; kalau tidak, merge biasa |
| Worktree berubah karena diubah di luar aplikasi | Deteksi; minta konfirmasi user sebelum memperbarui `head_sha` |
| Merge sukses tapi cleanup worktree gagal | Card tetap `done`; kegagalan cleanup dilaporkan terpisah dan bisa dicoba ulang |
| User meng-approve card yang tidak lagi punya worktree | Ditolak dengan penjelasan |
| Dua card di-approve bersamaan | Merge diserialkan; satu menunggu |
| Reject saat diff sedang dimuat | Aman; tidak ada state parsial yang tersimpan |

## Keputusan terbuka

- Apakah diff yang di-reject perlu disimpan sebagai snapshot agar bisa dirujuk lagi? Saat ini: tidak, tapi ini keputusan yang bisa berubah.
- Apakah perlu opsi approve sebagian (per file)? Ini fitur besar dan tidak ada di versi awal.
- Apakah perlu tombol "approve semua yang ada di review" untuk batch? Berisiko terhadap janji review-dulu; usulan: tidak.
- Apakah setelah approve card langsung `done`, atau ada state `merged` perantara? Usulan: langsung `done`.

## Rujukan

- Freeze vs rebase: [`conflict-resolution.md`](./conflict-resolution.md)
- Cleanup worktree: [`workspace-isolation.md`](./workspace-isolation.md)
- Batas ukuran sebagai NFR: [`non-functional.md`](./non-functional.md)
