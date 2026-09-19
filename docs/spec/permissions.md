# Permission & Keamanan Eksekusi

| | |
|---|---|
| **ID Prefix** | `PERM` |
| **Status** | Terkunci |
| **Bergantung pada** | [`acp-client.md`](./acp-client.md) |

## Ringkasan

agent-o berjalan di mesinmu dengan hak akses user, dan sebagai ACP client, **agent-o yang mengeksekusi** setiap pembacaan file, penulisan file, dan command yang diminta agent. Artinya permukaan risiko di sini bukan teoretis.

Dokumen ini belum bisa diimplementasikan sampai `OD-01` dan `OD-08` dijawab, karena **default policy** adalah parameter paling berpengaruh di seluruh sistem: ia berlaku untuk setiap permintaan sebelum user menyentuh setting apa pun.

## Kebutuhan

- `PERM-01` — Setiap operasi file dan terminal yang diminta agent diklasifikasikan ke kategori sebelum dieksekusi.
- `PERM-02` — Setiap path diselesaikan menjadi absolute path dan diverifikasi berada di dalam worktree sebelum diklasifikasi.
- `PERM-03` — Keputusan policy mengikuti urutan: card override → project override → global setting → default sistem.
- `PERM-04` — Keputusan bisa berupa `allow`, `deny`, atau `ask`.
- `PERM-05` — Setiap operasi yang menyentuh filesystem atau terminal tercatat: waktu, kategori, target, keputusan, dan policy yang berlaku.
- `PERM-06` — Operasi yang ditolak dicatat sebagai `CardEvent` dan tampil di thread card, sehingga kamu bisa melihat apa yang agent coba lakukan.
- `PERM-07` — Permintaan izin dari agent dibalas oleh gate, berdasarkan policy; kalau policy menghasilkan `ask`, keputusan diteruskan ke user.
- `PERM-08` — Operasi keluar worktree ditolak secara default, apa pun setting lainnya.
- `PERM-09` — Operasi git remote ditolak secara default.
- `PERM-10` — Policy bisa diuji coba sebelum disimpan, dengan simulasi terhadap path dan command contoh.

## Kategori

| Kategori | Contoh |
|---|---|
| `fs_read_internal` | Membaca file di dalam worktree |
| `fs_write_internal` | Menulis file di dalam worktree |
| `fs_read_external` | Membaca file di luar worktree (mis. konfigurasi global, `~/.gitconfig`) |
| `fs_write_external` | Menulis file di luar worktree |
| `terminal_internal` | Command aman yang tidak keluar dari worktree |
| `terminal_destructive` | `rm -rf`, `sudo`, `chmod` rekursif, kill proses, `dd`, redirection ke device |
| `git_remote` | `git push`, `fetch`, `pull`, operasi remote apa pun |
| `network` | Permintaan jaringan dari proses agent |

Klasifikasi command **tidak boleh** hanya berdasar pencocokan string pada command line penuh, karena mudah dilewati (alias, pipe, subshell, `bash -c`). Pendekatan minimum yang dapat diterima: parse struktur command, identifikasi executable utama, dan tangani pemanggilan bersarang secara konservatif — kalau tidak bisa dipastikan aman, klasifikasikan sebagai berisiko.

## Titik penegakan

```
agent ──▶ ACP request
              │
              ├─ fs/read_text_file  ──┐
              ├─ fs/write_text_file ──┤
              ├─ terminal/* ──────────┤
              └─ session/request_permission
                                      │
                                      ▼
                          resolve path / klasifikasi command
                                      │
                                      ▼
                              resolusi policy
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
                  allow              deny              ask
                    │                 │                 │
                    │                 │                 ▼
                    │                 │        (keputusan user / OD-08)
                    ▼                 ▼                 │
                eksekusi      catat CardEvent ◀────────┘
```

Penegakan terjadi **di sisi agent-o**, bukan di sisi agent. Ini konsekuensi langsung dari peran agent-o sebagai penyedia `fs/*` dan `terminal/*`.

## Resolusi policy

Urutan prioritas, yang pertama cocok menang:

```
card override → project override → global setting → default sistem
```

`OD-01` menentukan apa yang ada di ujung rantai itu. Pilihannya:

| Opsi | Konsekuensi |
|---|---|
| **Allow di dalam worktree, deny di luar** | Pengalaman otomatis tetap utuh; permukaan risiko terbatas pada satu folder. Tapi agent bisa menghapus seluruh isi worktree-nya sendiri, termasuk perubahan yang belum di-commit. |
| **Deny sampai diizinkan** | Paling aman, tapi hampir semua card akan berhenti pada request pertama. "Otomatis" praktis hilang. |

## Saat policy menghasilkan `ask` tanpa user menonton

`OD-08` menentukan ini, dan pilihannya tidak nyaman:

| Opsi | Konsekuensi |
|---|---|
| Card ke `blocked`, melepas slot WIP | Aman dan eksplisit, tapi card akan sering macet di tengah dan butuh kamu |
| Tunggu selama ambang waktu, lalu deny | Tidak macet, tapi agent menerima penolakan yang tidak pernah kamu lihat dan mungkin bereaksi aneh |
| Tunggu tanpa batas | Card menggantung diam-diam — mode kegagalan terburuk |

## Kasus gagal

| Kasus | Penanganan |
|---|---|
| Path berisi `..` yang keluar worktree | Ditolak setelah resolusi absolute path |
| Symlink di dalam worktree menunjuk ke luar | Resolusi harus mengikuti symlink dan memeriksa target akhir |
| Command memakai `&&`, pipe, atau subshell untuk menyembunyikan operasi berisiko | Analisis struktur; kalau tidak bisa dipastikan aman → diklasifikasi berisiko |
| Agent menjalankan skrip yang sudah ada di repo, dan skrip itu melakukan hal berbahaya | Tidak bisa dideteksi dari command line. Ini batas nyata dari penegakan di level ini; mitigasinya adalah klasifikasi `allow` pada `terminal_internal` hanya bila kamu menerima risiko itu. |
| Agent meminta izin menulis ke `~/.ssh` | `fs_write_external` → ditolak |
| Agent memakai network lewat command, bukan lewat API | Perlu klasifikasi jaringan di level command; kalau tidak, kategori `network` tidak berguna |
| Policy diubah saat card berjalan | Policy dibaca saat request terjadi; perubahan berlaku langsung dan dicatat di audit |

## Keputusan terbuka

- `OD-01` — default policy sistem.
- `OD-08` — perilaku `ask` saat tidak ada user.
- Apakah agent boleh mengubah manifest dependency (terkait `OD-02`)? Kalau ya, `fs_write_internal` tidak bisa di-allow buta.
- Apakah perlu mode "read-only" per card, untuk card yang hanya dimaksudkan sebagai analisis?
- Apakah audit log permission perlu bisa diekspor?

## Rujukan

- Peran client dan operasi yang disediakan: [`acp-client.md`](./acp-client.md)
- Audit sebagai event card: [`card.md`](./card.md)
- NFR keamanan: [`non-functional.md`](./non-functional.md)
