# agent-o — Overview

## Ringkasan

agent-o adalah **kanban board yang kolomnya adalah state eksekusi agent**, bukan sekadar status administratif.

Alurnya: kamu tulis card di **Backlog**, geser ke **In Progress**, dan sistem otomatis menugaskan sebuah agent untuk mengerjakannya di dalam **git worktree terisolasi**. Saat agent selesai, card pindah ke **In Review**, tempat kamu meninjau **git diff** dari perubahannya, lalu approve atau reject.

Agent tidak terikat pada satu harness. Selama harness tersebut bicara **ACP (Agent Client Protocol)**, dia bisa dipakai — OpenCode, Claude Code, Gemini CLI, Goose, atau harness ACP lain.

## Masalah yang diselesaikan

Harness agent hari ini sudah kuat, tapi model pakainya masih **satu terminal, satu sesi, satu task**:

- Tidak ada cara menjalankan dan memantau banyak task paralel dengan rapi.
- Tidak ada visibilitas progres — kamu hanya tahu agent "sedang jalan" atau "sudah berhenti".
- Tidak ada isolasi — dua agent yang menyentuh satu folder akan saling menimpa.
- Review hasil agent manual dan berantakan; tidak ada tempat untuk melihat "apa yang sebenarnya berubah" dan memutuskan terima/tolak.
- Tidak ada riwayat keputusan: task apa yang dikerjakan, oleh agent mana, dengan hasil apa.

agent-o memindahkan beban orkestrasi itu ke satu UI yang jelas.

## Konsep inti

| Konsep | Arti |
|---|---|
| **Card** | Satu unit kerja. Berisi judul, instruksi (prompt), thread percakapan, dan riwayat run. |
| **Kolom** | State eksekusi card. Berpindah kolom memicu aksi sistem, bukan cuma mengubah label. |
| **Project** | Folder lokal yang diikat ke satu card board. Wajib berupa git repo dengan working tree bersih. |
| **Run** | Satu percobaan pengerjaan card oleh satu agent. Satu card bisa punya banyak run. |
| **Worktree** | Checkout terpisah + branch khusus milik satu card. Ini yang bikin agent paralel tidak saling injak. |
| **Briefing** | Instruksi awal yang dikirim ke agent saat run dimulai — termasuk permintaan laporan status selesai. |
| **Sesi ACP** | Koneksi JSON-RPC antara agent-o (sebagai *client*) dan satu proses agent (sebagai *server*). |

## Prinsip desain

1. **Git adalah sumber kebenaran kode.** Database aplikasi menyimpan metadata dan riwayat, bukan isi kode. Diff, branch, dan status merge selalu dibaca dari git.
2. **Setiap perubahan agent harus bisa diaudit.** Idealnya tidak ada kode yang masuk ke branch utama tanpa pernah kamu lihat. (Lihat *Risiko* — auto-resolve konflik adalah pengecualian yang harus kamu terima sadar.)
3. **Isolasi dulu, paralel kemudian.** Fitur "spawn banyak agent" tidak dibangun sebelum isolasi worktree terbukti jalan.
4. **Protokol dulu, UI kemudian.** Integrasi ACP dan lifecycle git adalah inti sistem. UI adalah lapisan tipis di atasnya.
5. **Agnostik berarti pluggable, bukan seragam.** Setiap agent dideklarasikan kemampuannya, dan fitur yang tidak didukung dimatikan secara terang-terangan — bukan diasumsikan jalan.

## Alur utama (happy path)

1. **Tambah project** — pilih folder. Sistem memvalidasi: ini git repo, working tree bersih, ada branch default. Kalau gagal, project ditolak dengan alasan yang jelas.
2. **Tulis card di Backlog** — judul, instruksi, pilih agent (atau pakai default project).
3. **Geser ke In Progress** — sistem membuat worktree + branch, spawn proses agent, membuka sesi ACP, dan mengirim briefing.
4. **Agent bekerja** — update streaming (pesan, tool call, hasil) muncul di thread card secara real-time. Kalau agent butuh keputusan, dia mengajukan *permission request* atau pertanyaan.
5. **Agent selesai** — agent melaporkan status selesai. Card di-**freeze** (branch tidak boleh bergerak lagi) dan pindah ke **In Review**.
6. **Kamu review** — buka tab Diff. Sistem menampilkan diff **dari revisi yang dibekukan**, jadi apa yang kamu baca tidak berubah di tengah jalan.
7. **Approve atau Reject** — approve: branch di-merge ke branch utama, worktree dihapus, card ke Done. Reject: card balik ke Backlog/In Progress dengan catatan feedback sebagai instruksi tambahan.

## State card

```
Backlog ──geser──▶ In Progress ──selesai──▶ In Review ──approve──▶ Done
                        │                        │
                        │ butuh info/konflik     │ reject
                        ▼                        ▼
                     Blocked ◀──────────────── Backlog / In Progress
```

- **Backlog** — belum ada run aktif.
- **In Progress** — ada run berjalan atau dijeda sementara.
- **Blocked** — agent menunggu jawabanmu, atau gagal lanjut (konflik tak terselesaikan, run terhenti, batas tercapai).
- **In Review** — branch dibekukan, diff siap dibaca.
- **Done** — perubahan sudah di-merge.

## Keputusan yang sudah dikunci

1. **Isolasi** — git worktree + branch terpisah per card.
2. **Konflik** — agent auto-rebase dan menyelesaikan konflik sendiri; kalau gagal, card turun ke Blocked.
3. **Agent** — pluggable, apa pun harness yang mendukung ACP.
4. **Bentuk card** — prompt + thread percakapan. Agent boleh bertanya balik; card masuk Blocked sampai kamu menjawab.
5. **Review** — card dibekukan begitu masuk In Review (tidak ada rebase atau commit baru).
6. **Project** — wajib git repo dengan working tree bersih, divalidasi saat ditambahkan.
7. **Stop** — hanya tombol stop manual, tanpa budget atau timeout otomatis.
8. **Sinyal selesai** — agent diminta melaporkan status selesai lewat briefing di awal run.

## Ruang lingkup

**Termasuk:**
- Banyak project dalam satu instance aplikasi
- Banyak agent berjalan paralel dalam satu project
- Isolasi worktree dan penyelesaian konflik
- Klien ACP lengkap: sesi, streaming, permission request
- Review berbasis git diff dengan revisi yang dibekukan
- Thread percakapan per card

**Tidak termasuk (versi awal):**
- Aplikasi mobile
- Kolaborasi multi-user / real-time sync antar mesin
- Runner remote atau cloud — semua agent adalah subprocess lokal
- Integrasi CI/CD, PR, atau issue tracker eksternal
- Folder non-git
- Pelacakan waktu dan metrik produktivitas

## Asumsi dan batasan

- Setiap project adalah git repo dengan minimal satu branch dan working tree bersih.
- Satu card = satu worktree = satu branch = maksimal satu sesi ACP aktif.
- Semua agent yang didaftarkan mengimplementasikan ACP, tetapi **cakupan implementasinya berbeda-beda** — sebagian mungkin tidak mendukung permission request granular, tidak bisa memuat ulang sesi, atau tidak menerima instruksi tambahan dari client.
- Aplikasi berjalan lokal di mesin kamu dan punya akses penuh ke filesystem user. Ini adalah permukaan risiko keamanan yang nyata, bukan teoretis.
- Biaya model ditanggung kredensial milik masing-masing agent. agent-o tidak memproksikan permintaan model.

## Risiko yang harus diterima secara sadar

| Risiko | Konsekuensi |
|---|---|
| **Auto-resolve konflik** | Agent dapat menulis kode yang belum pernah kamu lihat, di luar niat asli card. Ini melubangi janji "In Review = aku lihat semua yang berubah". |
| **Stop hanya manual, tanpa batas** | Satu agent yang masuk loop akan membakar kuota provider tanpa pengaman. Board ini bukan sistem yang bisa ditinggal tidur. |
| **Sinyal selesai bergantung kepatuhan agent** | ACP tidak punya mekanisme "set system prompt". Instruksi pelaporan dikirim sebagai bagian dari prompt biasa, dan agent bebas mengabaikannya. Agent yang tidak melapor akan membuat card nyangkut di In Progress selamanya. |
| **Freeze + auto-rebase saling mengunci** | Makin banyak card menumpuk di In Review, makin lama card lain menunggu dan makin basi branch-nya. Wajib ada WIP limit. |
| **Akses filesystem penuh** | Satu permission policy yang salah bisa membuat agent menulis di luar folder project. |

## Pertanyaan terbuka

Pertanyaan-pertanyaan ini **belum punya jawaban** dan memblokir implementasi:

| ID | Pertanyaan |
|---|---|
| `OD-01` | **Default permission policy** sebelum user menyentuh setting apa pun — allow atau ask? |
| `OD-02` | **Strategi dependency per worktree** — dan apakah agent boleh mengubah manifest dependency? |
| `OD-03` | **Penyimpanan state** — SQLite, file JSON, atau embedded database lain? |
| `OD-04` | **Perilaku saat aplikasi mati** — semua run jadi Blocked, atau resume otomatis untuk agent yang mendukung pemuatan sesi? |
| `OD-05` | **WIP limit** — nilai default dan cakupannya (global, per project, atau keduanya)? |
| `OD-06` | **Pemilihan agent** — default di level project saja, atau bisa di-override per card? |
| `OD-07` | **Batas percobaan otomatis** — hanya konflik yang dibatasi, atau semua run? |
| `OD-08` | **Perilaku `ask` yang menggantung** — card ke Blocked, atau request di-deny setelah waktu tunggu? |

Spesifikasi teknis dipecah per fitur di [`spec/`](./spec/README.md), dan setiap keputusan di atas dilacak di [`spec/README.md`](./spec/README.md#keputusan-terbuka). Urutan pengerjaan ada di [`roadmap.md`](./roadmap.md).
