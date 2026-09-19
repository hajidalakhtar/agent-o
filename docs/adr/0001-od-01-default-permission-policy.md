# ADR 0001 — Default permission policy (`OD-01`)

**Status:** Diterima

## Konteks

agent-o adalah ACP client, sehingga **agent-o yang mengeksekusi** setiap `fs/read_text_file`, `fs/write_text_file`, dan command terminal yang diminta agent. Default policy berlaku untuk setiap permintaan **sebelum** user menyentuh setting apa pun, sehingga parameternya paling berpengaruh di seluruh sistem.

Pilihan di [`spec/permissions.md`](../spec/permissions.md):

- **Allow di dalam worktree, deny di luar** — otomatis tetap utuh; risiko terbatas pada satu folder; agent bisa menghapus isi worktree-nya sendiri.
- **Deny sampai diizinkan** — paling aman; hampir setiap card berhenti di request pertama, "otomatis" hilang.

## Keputusan

Default sistem:

| Kategori | Default |
|---|---|
| `fs_read_internal` | `allow` |
| `fs_write_internal` | `allow` |
| `terminal_internal` | `allow` (klasifikasi konservatif — yang tidak bisa dipastikan aman → `terminal_destructive`) |
| `fs_read_external` | `deny` |
| `fs_write_external` | `deny` |
| `terminal_destructive` | `deny` |
| `git_remote` | `deny` |
| `network` | `deny` |

Dua kategori terakhir (`git_remote`, keluar-worktree) **deny tanpa syarat**, tidak bisa dinaikkan oleh policy card/project/global (`PERM-08`, `PERM-09`, `NFR-14`, `NFR-15`).

## Konsekuensi

- Pengalaman otomatis tetap utuh: card berjalan tanpa interaksi sampai agent keluar dari worktree.
- Permukaan risiko dibatasi pada isi worktree — agent dapat merusak pekerjaannya sendiri, dan itu terlihat sebagai diff di review.
- Kelemahan yang diterima: skrip yang sudah ada di repo bisa melakukan hal berbahaya. Tidak terdeteksi dari command line; mitigasinya adalah review sebelum merge.

## Kebutuhan terkait

`PERM-01`, `PERM-02`, `PERM-03`, `PERM-08`, `PERM-09`, `NFR-13`, `NFR-14`, `NFR-15`, `NFR-16`.
