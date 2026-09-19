# agent-o — Roadmap

Urutan pengerjaan, dengan kriteria selesai yang bisa diverifikasi. Setiap fase merujuk ID kebutuhan dari [`spec/`](./spec/README.md) dan tidak boleh dianggap selesai sebelum semua ID-nya terpenuhi.

Prinsip urutan: **de-risk asumsi paling berbahaya dulu, bangun yang bisa dipakai sesegera mungkin, perluas setelahnya.**

## Ringkasan fase

| Fase | Nama | Hasil | Gate |
|---|---|---|---|
| 0 | Spike ACP | Bukti bahwa asumsi protokol benar | `OD-01` perlu direvisi bila gagal |
| 1 | Fondasi | Project, card, penyimpanan | `OD-03` |
| 2 | Walking skeleton | Satu card, satu agent, end-to-end | — |
| 3 | Review & merge | Diff beku, approve, reject | — |
| 4 | Paralel & isolasi penuh | Banyak agent, satu project | `OD-02`, `OD-05` |
| 5 | Multi-agent & multi-project | Pluggable harness, banyak board | `OD-06` |
| 6 | Hardening | Permission penuh, pemulihan, keandalan | `OD-01`, `OD-04`, `OD-08` |

---

## Fase 0 — Spike ACP

**Tujuan:** membuktikan atau membantah asumsi paling berbahaya **sebelum** menulis arsitektur. Seluruh rencana ini bertumpu pada klaim bahwa agent ACP bisa dijalankan headless, digerakkan dari aplikasi biasa, dan mau memakai filesystem yang kita sediakan. Kalau klaim itu salah, sebagian besar dokumen spec harus ditulis ulang.

**Yang diuji:**

1. Bisa spawn proses agent ACP dan menyelesaikan handshake tanpa editor.
2. Bisa membuka sesi dan mengirim prompt, lalu menerima `session/update` streaming.
3. Bisa menyediakan `fs/read_text_file`, `fs/write_text_file`, dan operasi terminal — dan agent **benar-benar memakainya**.
4. Bisa menerima dan membalas `session/request_permission`.
5. Bisa mematikan proses dengan bersih, dan bisa memuat ulang sesi bila didukung.
6. Bisa mengabaikan output non-protokol tanpa merusak parser.

**Deliverable:** CLI kecil yang menjalankan satu prompt di satu worktree, diuji dengan **minimal dua harness ACP berbeda**.

**Kriteria selesai:**

- Dua harness berbeda berhasil menjalankan prompt end-to-end dan menghasilkan perubahan file di worktree.
- Perbedaan capability antar harness terdokumentasi sebagai tabel nyata, bukan dugaan — khususnya: apakah permission request granular ada, apakah pemuatan sesi didukung, apakah instruksi tambahan dari client diikuti.
- Ambang waktu terukur: handshake, respons prompt, dead air.

**Hasil yang harus dipublikasikan:** tabel capability nyata per harness + catatan waktu. Ini yang mengisi [`agent-registry.md`](./spec/agent-registry.md) dan menjawab catatan target di [`non-functional.md`](./spec/non-functional.md).

**Risiko gate:** kalau permission request granular tidak ada di kedua harness, `OD-01` dan `OD-08` menjadi jauh lebih penting dan `PERM-07` harus dirancang ulang.

---

## Fase 1 — Fondasi

**Tujuan:** board yang bisa menyimpan sesuatu. Belum ada agent.

**Kebutuhan:** `PROJECT-01`–`PROJECT-06`, `CARD-01`, `CARD-02`, `CARD-06`, `PERSIST-01`–`PERSIST-04`, `PERSIST-09`

**Kriteria selesai:**

- Bisa menambahkan folder sebagai project, dengan seluruh enam validasi berjalan dan pesan kegagalan yang spesifik.
- Bisa membuat, mengubah, dan menghapus card di kolom Backlog.
- Data bertahan setelah aplikasi ditutup dan dibuka kembali.
- Instance kedua menolak dijalankan terhadap database yang sama.
- Thread card bisa dirender ulang dari event setelah restart.

**Gate:** `OD-03` harus dijawab sebelum fase ini dimulai.

---

## Fase 2 — Walking skeleton

**Tujuan:** satu card, satu agent, end-to-end. Ini fase terpenting: kalau satu card saja tidak bisa berjalan andal, menambah sepuluh card hanya memperbanyak kegagalan.

**Kebutuhan:** `BOARD-01`–`BOARD-05`, `WS-01`–`WS-05`, `ACP-01`–`ACP-07`, `ACP-09`, `ACP-10`, `AGENT-01`–`AGENT-04`, `DONE-01`–`DONE-04`, `DONE-07`, `DONE-08`, plus baseline permission: `PERM-02`, `PERM-06`, `PERM-08`, `PERM-09`

**Kriteria selesai:**

- Geser card dari Backlog ke In Progress → worktree dan branch dibuat → agent jalan → perubahan muncul di thread secara streaming.
- Agent melaporkan selesai → card pindah ke In Review.
- Agent mengajukan pertanyaan → card pindah ke Blocked dan pertanyaannya terlihat.
- Agent mengabaikan instruksi pelaporan → fallback `stopReason` bekerja dan card **tidak** menggantung.
- Kegagalan mana pun (crash, stop tanpa hasil, guard gagal) berakhir di Blocked atau kembali ke posisi semula — tidak pernah menggantung.
- Operasi keluar worktree dan operasi git remote sudah ditolak sejak fase ini, walaupun sistem policy lengkapnya belum ada.
- Log mentah tersimpan dan bisa dibuka saat run gagal.

**Catatan:** baseline permission tidak ditunda ke Fase 6. Tanpa penolakan keluar-worktree, menguji sistem ini di mesin nyata terlalu berbahaya.

---

## Fase 3 — Review & merge

**Tujuan:** menutup siklus. Sampai di sini, hasil agent belum bisa diterima.

**Kebutuhan:** `REVIEW-01`–`REVIEW-06`, `REVIEW-08`, `REVIEW-09`, `WS-05`, `WS-07`

**Kriteria selesai:**

- Masuk In Review → worktree dibekukan → diff dihitung dari pasangan SHA yang direkam.
- Branch utama bergerak (card lain di-merge) dan **diff yang sedang dibuka tidak berubah** — ini kriteria yang paling penting di fase ini, dan harus diuji secara eksplisit.
- Approve → merge `--no-ff` → card Done → worktree dan branch dibersihkan.
- Reject dengan alasan → alasan muncul sebagai pesan di thread → worktree bersih → card kembali ke Backlog.
- Approve saat branch utama kotor ditolak dengan pesan jelas.
- Diff besar tidak mematikan UI.

---

## Fase 4 — Paralel & isolasi penuh

**Tujuan:** janji utama produk. Banyak agent berjalan bersamaan tanpa saling merusak.

**Kebutuhan:** `WS-06`–`WS-09`, `SCHED-01`–`SCHED-08`, `CONFLICT-01`–`CONFLICT-09`, `BOARD-06`, edge case 4 dan 29

**Kriteria selesai:**

- Tiga card berjalan bersamaan di satu project, masing-masing di worktree sendiri, tanpa saling mengganggu.
- WIP limit ditegakkan pada tingkat global, project, dan agent; antrean terlihat di UI.
- Card yang masuk Blocked melepas slot, dan bisa mengantre saat dilanjutkan.
- Dua card mengubah file yang sama → satu di-approve → yang lain direbase; konflik diselesaikan agent maksimal satu kali; kalau gagal, card ke Blocked dengan diff konflik terlihat.
- Commit hasil penyelesaian konflik bisa dibedakan saat review.
- Worktree yatim tersapu saat aplikasi start.

**Gate:** `OD-02` dan `OD-05` harus dijawab sebelum fase ini dimulai. `OD-02` menentukan apakah worktree paralel realistis dari sisi waktu dan disk — kalau dependency harus di-install ulang setiap kali, tiga card paralel bisa berarti tiga kali instalasi penuh.

**Keputusan yang sangat mendesak di fase ini:** prioritas card `resolve-conflict` dibanding card baru (edge case 22). Kalau resolusi konflik mengantre di belakang card baru, board bisa mengunci diri sendiri saat banyak card menumpuk di In Review.

---

## Fase 5 — Multi-agent & multi-project

**Tujuan:** membuktikan klaim "agnostik" secara nyata.

**Kebutuhan:** `AGENT-05`–`AGENT-09`, `PROJECT-05`, `PROJECT-07`, `CARD-03`–`CARD-05`

**Kriteria selesai:**

- Minimal tiga harness ACP terdaftar, dengan capability map hasil handshake masing-masing.
- Fitur yang tidak didukung sebuah agent dimatikan dengan pesan jelas, bukan gagal diam-diam.
- Agent `needs_auth` tidak bisa dipakai, dan UI menjelaskan cara memperbaikinya.
- Agent bisa dinonaktifkan tanpa menghapus riwayat run yang memakainya.
- Dua project berjalan bersamaan dengan batas WIP masing-masing.
- Menghapus project membersihkan seluruh worktree-nya.
- Riwayat run menampilkan agent mana yang dipakai per percobaan.

**Gate:** `OD-06` harus dijawab.

---

## Fase 6 — Hardening

**Tujuan:** membuat sistem ini layak dipakai harian tanpa mengawasi setiap langkah.

**Kebutuhan:** `PERM-01`, `PERM-03`–`PERM-05`, `PERM-07`, `PERM-10`, `PERSIST-05`–`PERSIST-08`, `PERSIST-10`, `DONE-05`, `DONE-06`, `NFR-*` yang belum terpenuhi

**Kriteria selesai:**

- Sistem policy permission lengkap dengan urutan resolusi card → project → global → default, dan bisa diuji coba sebelum disimpan.
- Audit permission bisa ditelusuri per card.
- Aplikasi mati dengan tiga run aktif → setelah restart, ketiganya Blocked dengan alasan jelas, worktree utuh, diff masih bisa dilihat.
- Validasi integritas saat start mendeteksi card yang worktree-nya hilang.
- Log mentah punya rotasi dan retensi.
- Badge ketidakpatuhan protokol muncul untuk agent yang berulang kali mengabaikan pelaporan.
- Semua `NFR` yang bisa diukur punya test yang merujuk nomornya.

**Gate:** `OD-01`, `OD-04`, `OD-08` harus dijawab.

---

## Risk register

| Risiko | Dampak | Kemungkinan | Mitigasi | Terkait |
|---|---|---|---|---|
| Agent ACP tidak bisa headless / tidak menerima fs dari client | Fatal — arsitektur inti berubah | Sedang | Fase 0 dijalankan lebih dulu, dengan dua harness | `ACP-*` |
| Sinyal selesai diabaikan agent | Card menggantung permanen, board membeku | **Tinggi** | Jaring fallback `DONE-04`–`DONE-05` wajib ada di Fase 2 | `DONE-*` |
| Auto-resolve konflik menyuntik kode yang tak pernah direview | Kepercayaan pada review rusak | Tinggi | Batas satu percobaan, penanda commit, event audit, dan re-freeze | `CONFLICT-*` |
| Dependency per worktree membengkak | Paralel jadi lambat dan boros disk | Tinggi | Diputuskan di `OD-02` sebelum Fase 4 | `WS-09` |
| Tidak ada batas waktu/konsumsi karena stop hanya manual | Biaya provider meledak, board jadi sistem yang harus ditunggui | Tinggi | Diterima sadar; minimalkan dengan UI status yang jelas. Kandidat revisi pertama setelah MVP. | `overview.md` |
| Penegakan permission di level command bisa dilewati | Operasi berbahaya lolos | Sedang | Analisis struktur command, klasifikasi konservatif, penolakan default untuk operasi keluar worktree | `PERM-*` |
| Board mengunci diri karena antrean `resolve-conflict` | Semua card berhenti | Sedang | Prioritas antrean untuk `resolve-conflict` | edge case 22 |
| Freeze + rebase membuat branch basi menumpuk | Diff makin konflik, review makin berat | Sedang | WIP limit + WIP review limit + prioritas resolusi | `REVIEW-*`, `SCHED-*` |

---

## Non-goals

Tidak dikerjakan sampai MVP terbukti dipakai:

- Kolaborasi multi-user dan sinkronisasi antar mesin
- Runner remote atau cloud
- Integrasi CI/CD, PR, dan issue tracker
- Folder non-git
- Approve sebagian per file
- Sub-task di dalam card
- Aplikasi mobile

---

## Pertanyaan yang harus dijawab sebelum fase terkait dimulai

| Fase | Keputusan |
|---|---|
| 0 | Platform target (Linux/macOS/Windows) — mempengaruhi pemrosesan sinyal proses dan file lock |
| 1 | `OD-03` penyimpanan |
| 4 | `OD-02` dependency, `OD-05` WIP limit |
| 4 | Prioritas antrean `resolve-conflict` |
| 5 | `OD-06` pemilihan agent |
| 6 | `OD-01`, `OD-04`, `OD-08` |
| Kapan saja | `OD-07` batas percobaan run selain konflik |

Daftar lengkap keputusan terbuka ada di [`spec/README.md`](./spec/README.md#keputusan-terbuka).
