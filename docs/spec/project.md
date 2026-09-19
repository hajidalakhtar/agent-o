# Project & Validasi Folder

| | |
|---|---|
| **ID Prefix** | `PROJECT` |
| **Status** | Terkunci |
| **Bergantung pada** | — |

## Ringkasan

Satu instance agent-o bisa menampung banyak project. Setiap project adalah folder lokal yang diikat ke satu board, dan folder itu **wajib** berupa git repository dengan working tree bersih. Validasi ini bukan formalitas: seluruh sistem isolasi worktree, diff, dan merge bertumpu padanya.

## Kebutuhan

- `PROJECT-01` — User bisa menambahkan project dengan memilih folder dari filesystem.
- `PROJECT-02` — Folder divalidasi sebelum project masuk daftar; project yang gagal tidak boleh ditambahkan.
- `PROJECT-03` — Setiap kegagalan validasi harus menghasilkan pesan spesifik yang menyebut penyebabnya, bukan pesan generik.
- `PROJECT-04` — Project menyimpan branch utama yang terdeteksi, dan deteksi itu deterministik.
- `PROJECT-05` — Project menyimpan konfigurasi: agent default, WIP limit, dan permission policy.
- `PROJECT-06` — Validasi kondisi repo (terutama kebersihan working tree) diulang sebelum setiap pembuatan worktree, bukan hanya saat project ditambahkan.
- `PROJECT-07` — Menghapus project harus membersihkan seluruh worktree dan branch yang dibuat agent-o, dengan konfirmasi eksplisit.

## Aturan validasi

Dijalankan berurutan, berhenti pada kegagalan pertama:

| # | Pemeriksaan | Perintah | Pesan kegagalan |
|---|---|---|---|
| 1 | Folder ada dan bisa dibaca | akses filesystem | "Folder tidak ditemukan atau tidak bisa dibaca" |
| 2 | Merupakan git repo | `git rev-parse --is-inside-work-tree` | "Folder ini bukan git repository" |
| 3 | Tidak detached HEAD | `git symbolic-ref -q HEAD` | "Repo dalam keadaan detached HEAD" |
| 4 | Punya minimal satu commit | `git rev-parse --verify HEAD` | "Repo belum punya commit" |
| 5 | Working tree bersih | `git status --porcelain` kosong | "Ada perubahan yang belum di-commit: `<daftar file>`" |
| 6 | Branch utama teridentifikasi | lihat di bawah | "Tidak bisa menentukan branch utama" |

Tidak ada opsi memaksa di versi awal. Project yang gagal tidak masuk daftar sama sekali.

## Deteksi branch utama

Urutan pencarian, yang pertama berhasil dipakai:

1. `git symbolic-ref refs/remotes/origin/HEAD` — mengikuti branch yang jadi acuan remote.
2. Config `init.defaultBranch` bila branch tersebut ada di repo.
3. Keberadaan branch `main`.
4. Keberadaan branch `master`.

Kalau keempatnya gagal, validasi ditolak. Hasil deteksi disimpan di `Project.default_branch` dan **tidak dihitung ulang setiap saat** — kalau branch utama berubah nama, user harus mengubahnya di setting project.

## Model data

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | ID internal |
| `name` | string | Nama tampilan |
| `root_path` | absolute path | Folder project |
| `default_branch` | string | Hasil deteksi, bisa diubah user |
| `default_agent_id` | string \| null | Agent default untuk card baru |
| `wip_limit` | int | Batas card berjalan bersamaan untuk project ini |
| `permission_policy_id` | string | Policy yang berlaku untuk project ini |
| `created_at` | timestamp | — |

## Kasus gagal

| Kasus | Penanganan |
|---|---|
| Folder bukan git repo | Ditolak pada validasi #2 |
| Working tree kotor | Ditolak pada validasi #5, daftar file ditampilkan |
| Working tree menjadi kotor setelah project ditambahkan | `PROJECT-06`: pembuatan worktree berikutnya ditolak sampai user membereskan |
| Repo tanpa commit (baru `git init`) | Ditolak pada validasi #4 |
| Folder dipindahkan atau dihapus setelah project ditambahkan | Project ditandai "tidak tersedia", card yang berjalan ditahan, card baru tidak bisa dijalankan |
| Folder project adalah subfolder dari repo lain | `rev-parse --show-toplevel` mengembalikan root repo, bukan folder yang dipilih — perlu keputusan eksplisit apakah root itu yang dipakai |

## Keputusan terbuka

- `OD-03` — teknologi penyimpanan state.
- Apakah `name` project boleh berbeda dari nama folder? Belum diputuskan; default sementara: mengikuti nama folder.
- Apakah project bisa dinonaktifkan (archive) tanpa dihapus, sehingga worktree tetap ada tapi card tidak bisa dijalankan?

## Rujukan

- Isolasi dan worktree: [`workspace-isolation.md`](./workspace-isolation.md)
- Urutan resolusi policy: [`permissions.md`](./permissions.md)
- Edge case terkait: [`edge-cases.md`](./edge-cases.md)
