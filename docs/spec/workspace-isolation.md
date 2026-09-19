# Isolasi Workspace (Git Worktree)

| | |
|---|---|
| **ID Prefix** | `WS` |
| **Status** | Terkunci |
| **Bergantung pada** | [`project.md`](./project.md) |

## Ringkasan

Isolasi adalah fondasi dari seluruh janji "spawn banyak agent". Setiap card mendapat **worktree dan branch git sendiri**, sehingga dua agent yang menyentuh file yang sama tidak pernah saling menimpa. Konflik baru muncul saat rebase atau merge — dan itu ditangani secara eksplisit, bukan secara tidak sengaja.

## Kebutuhan

- `WS-01` — Satu card yang berjalan memiliki tepat satu worktree dan satu branch.
- `WS-02` — Worktree dibuat dari branch utama project, dan `base_sha` (titik percabangan) dicatat saat pembuatan.
- `WS-03` — Worktree **tidak pernah** diletakkan di dalam folder project.
- `WS-04` — Pembuatan worktree gagal bila working tree branch utama kotor.
- `WS-05` — Worktree dipertahankan saat card masuk `blocked`, dan dihapus saat card mencapai `done` atau di-reject.
- `WS-06` — Worktree dengan state `frozen` tidak boleh direbase atau menerima commit baru.
- `WS-07` — Worktree yang tertinggal (card dihapus, project dihapus, atau proses mati mendadak) dibersihkan secara idempoten.
- `WS-08` — Setiap worktree harus bisa dilacak kembali ke card pemiliknya dari metadata sistem, bukan dari nama folder saja.
- `WS-09` — Dependency untuk worktree baru harus tersedia berdasarkan strategi yang ditentukan di `OD-02`, sebelum agent dijalankan.

## Penamaan

```
branch   : agent-o/<slug-card>-<short-id>
worktree : <app_data>/worktrees/<project-id>/<card-id>
```

Worktree disimpan di direktori data aplikasi, **bukan** di samping folder project. Alasannya: worktree di dalam repo akan muncul sebagai perubahan yang tidak diinginkan, dan worktree di folder tetangga akan mengotori direktori kerja user.

## State worktree

| State | Arti | Boleh direbase? |
|---|---|---|
| `active` | Card bisa jalan; branch bergerak | Ya |
| `frozen` | Card di `in_review`; revisi terkunci | Tidak |
| `merged` | Sudah di-merge, menunggu cleanup | Tidak |
| `removed` | Sudah dibersihkan | — |

## Alur pembuatan

1. Periksa ulang kondisi project (`PROJECT-06`): git repo, branch utama bersih, branch utama teridentifikasi.
2. Jalankan `git worktree add -b <branch> <path> <default_branch>`.
3. Hitung `base_sha` = `merge-base(default_branch, branch)` — yaitu tip branch utama pada saat itu.
4. Siapkan dependency sesuai `OD-02`.
5. Kalau ada langkah yang gagal, hapus worktree yang setengah jadi agar tidak meninggalkan sampah, lalu card ke `blocked`.

`git fetch` **tidak** dijalankan otomatis. agent-o bekerja pada repo lokal; mengubah state remote atau menarik perubahan tanpa diminta adalah tindakan yang terlalu berisiko untuk dilakukan diam-diam.

## Biaya isolasi: dependency

Ini konsekuensi praktis yang paling sering diremehkan. Setiap worktree adalah checkout terpisah dan secara default **tidak punya** `node_modules`, `vendor`, atau `.venv` sendiri.

| Strategi | Kelebihan | Kekurangan |
|---|---|---|
| Install ulang per worktree | Paling benar, isolasi penuh | Lambat, boros disk dan bandwidth |
| Symlink dari checkout utama | Cepat, hemat disk | Agent yang menambah dependency akan merusak checkout utama — dan itu merusak pekerjaanmu di luar board |
| Package manager berbasis store (pnpm, dsb.) | Cepat dan relatif aman | Terikat pada satu ekosistem |
| Install saat dibutuhkan (agent yang menjalankan) | Sederhana dibangun | Waktu run membengkak dan sulit diprediksi |

Pilihan ini menentukan apakah agent boleh mengubah manifest dependency sama sekali. Kalau agent boleh menambah dependency, symlink praktis tidak bisa dipakai.

## Cleanup

Cleanup dijalankan pada kejadian berikut, dan harus **idempoten** — boleh dijalankan berulang tanpa efek samping:

| Kejadian | Aksi |
|---|---|
| Card `done` | `git worktree remove`, hapus branch |
| Card di-reject | `git worktree remove`, hapus branch |
| Card dibatalkan dari `blocked` | Sama seperti reject |
| Card dihapus | Sama seperti reject |
| Project dihapus | Cleanup seluruh worktree project |
| Aplikasi start | Sapu worktree yang tercatat tapi card-nya sudah tidak ada, dan hapus direktori yatim |

Cleanup tidak boleh memakai paksa secara default. Kalau worktree punya perubahan yang belum di-commit dan remove biasa gagal, user diberi pilihan: simpan diff-nya dulu, atau paksa hapus.

## Kasus gagal

| Kasus | Penanganan |
|---|---|
| Working tree kotor saat pembuatan | Ditolak, daftar file ditampilkan |
| Disk penuh saat membuat worktree | Worktree parsial dibersihkan, card ke `blocked`, error muncul di UI |
| Branch dengan nama yang sama sudah ada | Tambahkan sufiks unik; jangan pernah menimpa |
| Worktree terkunci karena proses agent masih memegangnya | Coba setelah grace period; kalau tetap gagal, tampilkan perintah manual untuk user |
| Worktree dihapus manual oleh user di luar aplikasi | Terdeteksi saat akses berikutnya; card ke `blocked` dengan penjelasan |
| Repo memakai submodule | Perlu keputusan: inisialisasi submodule otomatis atau tolak project ber-submodule |
| Repo sangat besar | Pembuatan worktree bisa lambat; progresnya harus terlihat, bukan menggantung diam-diam |

## Keputusan terbuka

- `OD-02` — strategi dependency dan apakah agent boleh mengubah manifest dependency.
- Apakah agent-o boleh menjalankan hook repo (mis. `post-checkout`)? Usulan: tidak, kecuali user mengaktifkannya, karena hook bisa menjalankan apa pun.
- Repo dengan submodule: didukung atau ditolak?
- Apakah `git fetch` perlu disediakan sebagai aksi manual eksplisit di UI?

## Rujukan

- Rebase dan konflik: [`conflict-resolution.md`](./conflict-resolution.md)
- Freeze dan merge: [`review-and-merge.md`](./review-and-merge.md)
- Validasi project: [`project.md`](./project.md)
