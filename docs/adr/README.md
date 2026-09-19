# Architecture Decision Records

Setiap keputusan terbuka (`OD-*`) di [`../spec/README.md`](../spec/README.md#keputusan-terbuka) dan keputusan arsitektur lain dicatat di sini sebagai ADR.

| ADR | Judul | Status |
|---|---|---|
| [0000](./0000-acp-spike.md) | Hasil spike ACP (Fase 0) | Selesai |
| [0001](./0001-od-01-default-permission-policy.md) | Default permission policy (`OD-01`) | Diterima |
| [0002](./0002-od-02-dependency-strategy.md) | Strategi dependency per worktree (`OD-02`) | Diterima |
| [0003](./0003-od-03-state-storage.md) | Teknologi penyimpanan state (`OD-03`) | Diterima |
| [0004](./0004-od-04-restart-behavior.md) | Perilaku saat aplikasi restart (`OD-04`) | Diterima |
| [0005](./0005-od-05-wip-limits.md) | WIP limit (`OD-05`) | Diterima |
| [0006](./0006-od-06-agent-selection.md) | Pemilihan agent (`OD-06`) | Diterima |
| [0007](./0007-od-07-retry-limits.md) | Batas percobaan otomatis (`OD-07`) | Diterima |
| [0008](./0008-od-08-ask-timeout.md) | Perilaku `ask` tanpa user (`OD-08`) | Diterima |

Format tiap ADR: Konteks → Keputusan → Konsekuensi → Kebutuhan terkait. Referensi silang ke [`../spec/`](../spec/README.md) dan [`../architecture.md`](../architecture.md).
