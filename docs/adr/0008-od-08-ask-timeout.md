# ADR 0008 — Perilaku `ask` tanpa user (`OD-08`)

**Status:** Diterima

## Konteks

Ketika policy menghasilkan `ask` (mis. agent meminta operasi yang tidak tercakup default), keputusan diteruskan ke user. Pertanyaannya: apa yang terjadi bila tidak ada user yang menonton? Pilihan di [`../spec/permissions.md`](../spec/permissions.md): card ke `blocked` (lepas slot) / tunggu lalu deny / tunggu tanpa batas.

"Tunggu tanpa batas" adalah mode kegagalan terburuk: card menggantung diam-diam, slot WIP tidak dilepas, dan tampak seperti "agent masih bekerja".

## Keputusan

- `ask` tanpa user → card berpindah ke **`blocked`**, melepas slot WIP (`BOARD-06`, `SCHED-03`).
- Request yang menggantung **tidak** di-deny otomatis dan **tidak** menunggu tanpa batas.
- Permintaan izin yang belum dijawab dirender di thread sebagai item yang menunggu keputusan; menjawabnya mengembalikan card ke `in_progress` (mengambil slot lagi, bisa mengantre).
- Ambang tunggu sebelum memindahkan ke `blocked` mengikuti dead-air timeout spike ACP, bukan timer terpisah.

## Konsekuensi

- Konsisten dengan filosofi "tidak ada card menggantung" (`EDGE-03`, `NFR-20`).
- Aman dan eksplisit: agent tidak menerima penolakan yang tidak pernah dilihat user, sehingga tidak bereaksi aneh.
- Card bisa sering macet di tengah bila default policy terlalu ketat — karena itu `OD-01` memilih allow-internal agar `ask` jarang terjadi di dalam worktree.
- Jawaban user tidak selalu langsung diproses: card harus mengambil slot lagi dan bisa mengantre; UI wajib menampilkan posisi antrean dengan jujur.

## Kebutuhan terkait

`PERM-04`, `PERM-07`, `BOARD-06`, `SCHED-03`, `SCHED-04`, `EDGE-03`, `NFR-20`.
